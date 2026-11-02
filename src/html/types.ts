// * Represents an HTML node parsed by parse5.
export type HtmlNode = {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  sourceCodeLocation?: {
    startLine?: number; // * One-based line number.
    startCol?: number; // * One-based column number.
  };
};

/**
 * Represents an ancestor element of a candidate HTML structure.
 *
 * Stores the ancestor's tag name and CSS classes to provide
 * context about where a structure appears in the document.
 *
 * @example
 * {
 *   tag: "section",
 *   classes: ["catalog", "featured"]
 * }
 */
export type Ancestor = {
  tag: string;
  classes: string[];
};

/**
 * Maps element positions within an HTML structure to their CSS classes.
 *
 * Positions use "$" for the root element and dot-separated indexes
 * for descendants.
 *
 * @example
 * {
 *   "$": ["card"],
 *   "0": ["card-image"],
 *   "1": ["card-content"],
 *   "1.0": ["card-title"]
 * }
 */
export type ClassPosition = Record<string, string[]>;

/**
 * Represents a single occurrence of a structural component candidate.
 *
 * Records its source location, ancestor context, and CSS classes
 * associated with each position in its HTML subtree.
 */
export type Occurrence = {
  file: string;
  line: number | null; // * Starting line, if available.
  column: number | null; // * Starting column, if available.
  ancestors: Ancestor[];
  classes: ClassPosition;
};

// * Groups occurrences sharing the same HTML structural signature.
export type ComponentGroup = {
  signature: string;
  sortTokens: string[]; // * Tokens representing the structure for sorting.
  tag: string;
  depth: number; // * Root element's depth in the HTML document.
  occurrences: Occurrence[];
};

// * Holds shared state during HTML file analysis.
export type AnalysisContext = {
  file: string;
  groups: Map<string, ComponentGroup>;
  classes: Map<string, number>; // * Number of HTML elements containing each CSS class.
};
