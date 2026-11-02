import ignore from "ignore";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeHtmlFile,
  compareSortTokens,
  type ComponentGroup,
} from "./html/index.ts";
import { analyzeCssFile, type CssInventory } from "./css/index.ts";
import buildComponentReport from "./report/index.ts";

type Report = {
  summary: {
    htmlFiles: number;
    cssFiles: number;
    repeatedStructures: number;
    htmlClasses: number;
    cssClasses: number;
  };
  components: ReturnType<typeof generateComponents>;
  classInventory: ReturnType<typeof generateClassInventory>;
};

/**
 * Runs the DOM Miner analysis pipeline.
 *
 * Retrieves the input directory, discovers HTML and CSS files, analyzes
 * their contents, generates component and class reports, writes the
 * resulting JSON file, and prints an execution summary.
 *
 * @returns A promise that resolves when the analysis is complete.
 */
export async function main(directory: string): Promise<void> {
  if (!directory) {
    console.error("Usage: dom-miner <directory>");
    process.exitCode = 1;

    return;
  }

  const { htmlFiles, cssFiles } = await getFiles(directory);
  const htmlGroups = new Map<string, ComponentGroup>();
  const htmlInventory = new Map<string, number>();
  const cssInventory: CssInventory = new Map();

  await analyzeHtmlFiles(htmlFiles, htmlGroups, htmlInventory);
  await analyzeCssFiles(cssFiles, cssInventory);

  const components = generateComponents(htmlGroups, cssInventory);
  const report: Report = {
    summary: {
      htmlFiles: htmlFiles.length,
      cssFiles: cssFiles.length,
      repeatedStructures: components.length,
      htmlClasses: htmlInventory.size,
      cssClasses: cssInventory.size,
    },
    components,
    classInventory: generateClassInventory(htmlInventory, cssInventory),
  };

  const output = await writeReport(report);

  console.log(`Analysis completed.
    HTML Files: ${report.summary.htmlFiles}
    CSS Files: ${report.summary.cssFiles}
    Repeated Structures: ${report.summary.repeatedStructures}
    HTML Classes: ${report.summary.htmlClasses}
    CSS Classes: ${report.summary.cssClasses}
    Report: ${output}
  `);
}

type IgnoreFilter = ReturnType<typeof ignore>;

/**
 * Collects HTML and CSS files from the input directory.
 *
 * @param directory - Root directory to scan.
 *
 * @returns Separate lists of HTML and CSS file paths.
 */
async function getFiles(directory: string) {
  const gitignore = ignore();
  const gitignorePath = path.join(directory, ".gitignore");

  try {
    gitignore.add(await readFile(gitignorePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const files = await walkDirectory(directory, directory, gitignore);

  return {
    htmlFiles: files.filter((file) => /\.html?$/i.test(file)),
    cssFiles: files.filter((file) => /\.css$/i.test(file)),
  };
}

/**
 * Recursively collects regular files from a directory tree.
 *
 * Directories and files in the ignore list are excluded from traversal.
 *
 * @param directory - Root directory to scan.
 *
 * @returns Absolute or resolved file paths collected from the directory
 * tree, depending on the path supplied by the caller.
 */
async function walkDirectory(
  directory: string,
  rootDirectory: string,
  gitignore: IgnoreFilter,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  const directories: string[] = [];

  entries.forEach((entry) =>
    collectEntry(
      entry,
      directory,
      rootDirectory,
      files,
      directories,
      gitignore,
    ),
  );

  const nestedFiles = await Promise.all(
    directories.map((dir) => walkDirectory(dir, rootDirectory, gitignore)),
  );

  return files.concat(...nestedFiles);
}

/**
 * Classifies a directory entry and adds its path to the corresponding list.
 *
 * Entries matching .gitignore rules are skipped. Regular files are collected
 * for later processing.
 *
 * @param entry - Directory entry returned by `readdir`.
 * @param directory - Parent directory containing the entry.
 * @param rootDirectory - Root directory of the analysis.
 * @param files - File paths collected during traversal.
 * @param directories - Non-ignored directory paths to traverse later.
 * @param gitignore - Filter containing the root .gitignore rules.
 *
 * @returns Nothing. Updates the provided arrays in place.
 */
function collectEntry(
  entry: import("node:fs").Dirent,
  directory: string,
  rootDirectory: string,
  files: string[],
  directories: string[],
  gitignore: IgnoreFilter,
): void {
  const fullPath = path.join(directory, entry.name);
  const relativePath = path
    .relative(rootDirectory, fullPath)
    .split(path.sep)
    .join("/");
  const ignorePath = entry.isDirectory() ? `${relativePath}/` : relativePath;

  if (gitignore.ignores(ignorePath)) return;
  if (entry.isDirectory()) directories.push(fullPath);
  if (entry.isFile()) files.push(fullPath);
}

/**
 * Reads and analyzes all HTML files.
 *
 * Files are read concurrently, then analyzed using shared structural
 * groups and class inventory collections.
 *
 * @param files - HTML file paths to analyze.
 * @param groups - Shared collection of structural component groups.
 * @param inventory - Shared HTML class occurrence inventory.
 *
 * @returns A promise that resolves when all files have been analyzed.
 * Updates both collections in place.
 */
async function analyzeHtmlFiles(
  files: string[],
  groups: Map<string, ComponentGroup>,
  inventory: Map<string, number>,
): Promise<void> {
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8")),
  );

  files.forEach((file, index) => {
    analyzeHtmlFile(contents[index], file, groups, inventory);
  });
}

/**
 * Reads and analyzes all CSS files.
 *
 * Files are read concurrently. Individual CSS parsing errors are caught
 * and reported as warnings so that the remaining files can be processed.
 *
 * @param files - CSS file paths to analyze.
 * @param inventory - Shared CSS class definition inventory.
 *
 * @returns A promise that resolves when all files have been processed.
 * Updates the inventory in place.
 */
async function analyzeCssFiles(
  files: string[],
  inventory: CssInventory,
): Promise<void> {
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8")),
  );

  files.forEach((file, index) => {
    try {
      analyzeCssFile(contents[index], file, inventory);
    } catch (error) {
      console.warn(`Ignored CSS: ${file}`, error);
    }
  });
}

/**
 * Builds reports for all repeated structural groups.
 *
 * Groups are filtered to exclude structures with only one occurrence,
 * sorted by their structural tokens, and converted into component reports.
 *
 * @param groups - Structural groups collected during HTML analysis.
 * @param inventory - CSS definitions used to resolve component classes.
 *
 * @returns Sorted component reports for repeated structures.
 */
function generateComponents(
  groups: Map<string, ComponentGroup>,
  inventory: CssInventory,
) {
  return [...groups.values()]
    .filter((group) => group.occurrences.length > 1)
    .sort(
      (a, b) =>
        compareSortTokens(a.sortTokens, b.sortTokens) ||
        a.signature.localeCompare(b.signature),
    )
    .map((group) => buildComponentReport(group, inventory));
}

/**
 * Writes the analysis report as formatted JSON.
 *
 * @param report - Complete report to serialize.
 *
 * @returns A promise resolving to the output file path.
 */
async function writeReport(report: Report): Promise<string> {
  const output = path.resolve("staticminer-report.json");

  await writeFile(output, JSON.stringify(report, null, 2), "utf8");

  return output;
}

/**
 * Builds the HTML/CSS class cross-reference.
 *
 * Includes the HTML class inventory with occurrence counts and matching
 * CSS definitions, as well as classes defined only in CSS or used only
 * in HTML.
 *
 * @param htmlInventory - HTML class names and their occurrence counts.
 * @param cssInventory - CSS class names and their definitions.
 *
 * @returns Class usage information and lists of unmatched class names.
 */
function generateClassInventory(
  htmlInventory: Map<string, number>,
  cssInventory: CssInventory,
) {
  const htmlClassNames = new Set(htmlInventory.keys());
  const cssClassNames = new Set(cssInventory.keys());

  const usedInHtml = [...htmlInventory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, occurrences]) => ({
      name,
      occurrences,
      cssDefinitions: cssInventory.get(name) ?? [],
    }));

  return {
    usedInHtml,
    definedButNotFoundInHtml: getNamesMissingFrom(
      cssClassNames,
      htmlClassNames,
    ),
    usedInHtmlWithoutCss: getNamesMissingFrom(htmlClassNames, cssClassNames),
  };
}

/**
 * Returns the names present in the source set but absent from the target set.
 *
 * @param source - Set of class names to inspect.
 * @param target - Set of class names to exclude.
 *
 * @returns Alphabetically sorted class names missing from the target set.
 */
function getNamesMissingFrom(
  source: Set<string>,
  target: Set<string>,
): string[] {
  return [...source]
    .filter((name) => !target.has(name))
    .sort((a, b) => a.localeCompare(b));
}
