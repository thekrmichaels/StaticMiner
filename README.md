# StaticMiner

StaticMiner is a command-line tool for statically analyzing HTML structures and CSS class selectors in legacy frontend projects.

It identifies repeated HTML structures and compares class usage across HTML and CSS files, helping developers discover potential refactoring opportunities during manual modernization.

StaticMiner is an inspection tool: it does not modify source files, generate components, or determine how the code should be refactored.

## What It Does

- **Detects repeated HTML structures** by comparing element hierarchy and order.
- **Reports source locations** for each occurrence of a detected structure.
- **Tracks class usage by element position** within repeated structures.
- **Extracts CSS class selectors** and records their source locations.
- **Compares HTML and CSS class usage**, highlighting classes found in CSS but not used in the analyzed HTML.

## Usage

Run StaticMiner against the directory containing the HTML and CSS files you want to inspect:

```powershell
.\exec\staticminer.exe .\path\to\project
```
