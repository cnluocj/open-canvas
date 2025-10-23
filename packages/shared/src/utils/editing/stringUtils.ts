/**
 * String utility functions for safe editing operations
 * Handles edge cases like $ characters and line endings
 */

/**
 * Safely replace a literal string, handling $ characters that would normally
 * be interpreted as backreferences in JavaScript replace()
 *
 * @param str - The string to search in
 * @param oldString - The literal string to find
 * @param newString - The literal replacement string
 * @returns The string with replacements made
 */
export function safeLiteralReplace(
  str: string,
  oldString: string,
  newString: string
): string {
  if (!newString.includes("$")) {
    // Fast path: no $ characters, can use simple replaceAll
    return str.replaceAll(oldString, newString);
  }

  // Escape $ characters to prevent JavaScript template substitution
  // $1, $2, $&, etc. have special meaning in replacement strings
  // We need to escape each $ as $$$$ to get a literal $
  const escapedNewString = newString.replaceAll("$", "$$$$");
  return str.replaceAll(oldString, escapedNewString);
}

/**
 * Detect the line ending style used in content
 *
 * @param content - The content to analyze
 * @returns The detected line ending (\r\n for Windows, \n for Unix)
 */
export function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Normalize all line endings to \n (LF)
 *
 * @param content - The content to normalize
 * @returns Content with all line endings as \n
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

/**
 * Convert line endings in content to match the target style
 *
 * @param content - The content to convert
 * @param targetEnding - The desired line ending style
 * @returns Content with converted line endings
 */
export function convertLineEndings(
  content: string,
  targetEnding: "\r\n" | "\n"
): string {
  if (targetEnding === "\r\n") {
    return content.replace(/\n/g, "\r\n");
  }
  return content; // Already \n
}

/**
 * Restore the trailing newline behavior from original content
 * Preserves whether the file ends with a newline or not
 *
 * @param originalContent - The original content
 * @param modifiedContent - The modified content
 * @returns Modified content with correct trailing newline behavior
 */
export function restoreTrailingNewline(
  originalContent: string,
  modifiedContent: string
): string {
  const hadTrailingNewline = originalContent.endsWith("\n");
  const hasTrailingNewline = modifiedContent.endsWith("\n");

  if (hadTrailingNewline && !hasTrailingNewline) {
    return modifiedContent + "\n";
  } else if (!hadTrailingNewline && hasTrailingNewline) {
    return modifiedContent.replace(/\n$/, "");
  }

  return modifiedContent;
}

/**
 * Count occurrences of a substring in a string
 *
 * @param str - The string to search in
 * @param searchString - The substring to count
 * @returns Number of occurrences
 */
export function countOccurrences(str: string, searchString: string): number {
  if (searchString.length === 0) return 0;

  let count = 0;
  let position = 0;

  while ((position = str.indexOf(searchString, position)) !== -1) {
    count++;
    position += searchString.length;
  }

  return count;
}

/**
 * Extract the indentation (leading whitespace) from a line
 *
 * @param line - The line to analyze
 * @returns The leading whitespace
 */
export function getIndentation(line: string): string {
  const match = line.match(/^[\t ]*/);
  return match ? match[0] : "";
}

/**
 * Apply indentation to each line in a multi-line string
 *
 * @param text - The text to indent
 * @param indentation - The indentation string to apply
 * @returns Indented text
 */
export function applyIndentation(text: string, indentation: string): string {
  if (!indentation) return text;

  return text
    .split("\n")
    .map((line, index) => {
      // Don't indent empty lines or the first line (preserve original)
      if (index === 0 || line.trim().length === 0) return line;
      return indentation + line;
    })
    .join("\n");
}
