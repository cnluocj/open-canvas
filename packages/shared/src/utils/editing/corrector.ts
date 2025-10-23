/**
 * Correction utilities for handling common LLM output issues
 * Focuses on unescape correction and whitespace handling
 */

import { EditResult, EditErrorType, SmartEditParams } from "./types";
import { executeSmartEdit } from "./matchers";
import {
  detectLineEnding,
  convertLineEndings,
  restoreTrailingNewline,
} from "./stringUtils";

/**
 * Unescape over-escaped strings from LLM output
 * LLMs sometimes double-escape characters like \n → \\n
 *
 * @param str - The potentially over-escaped string
 * @returns Unescaped string
 */
export function unescapeString(str: string): string {
  // Handle common over-escaping patterns
  return str
    .replace(/\\\\n/g, "\\n") // \\n → \n
    .replace(/\\\\t/g, "\\t") // \\t → \t
    .replace(/\\\\r/g, "\\r") // \\r → \r
    .replace(/\\\\"/g, '\\"') // \\" → "
    .replace(/\\\\'/g, "\\'") // \\' → '
    .replace(/\\\\`/g, "\\`") // \\` → `
    .replace(/\\\\\\\\/g, "\\\\"); // \\\\ → \\
}

/**
 * Apply basic correction to search and replacement strings
 *
 * @param oldString - The search string
 * @param newString - The replacement string
 * @returns Corrected strings
 */
export function applyBasicCorrection(
  oldString: string,
  newString: string
): { correctedOld: string; correctedNew: string } {
  return {
    correctedOld: unescapeString(oldString),
    correctedNew: unescapeString(newString),
  };
}

/**
 * Perform smart edit with automatic correction
 *
 * @param params - Edit parameters
 * @returns EditResult with success/failure details
 */
export function performSmartEdit(params: SmartEditParams): EditResult {
  const { content, oldString, newString, expectedReplacements = 1 } = params;

  // Validate inputs
  if (!content || !oldString) {
    return {
      success: false,
      error: {
        type: EditErrorType.INVALID_PARAMS,
        message: "Content and oldString are required",
      },
    };
  }

  // Preserve line ending style
  const lineEnding = detectLineEnding(content);

  // Try with original strings first
  let result = executeSmartEdit(content, oldString, newString);

  // If failed, try with unescaped strings
  if (!result.success) {
    const { correctedOld, correctedNew } = applyBasicCorrection(
      oldString,
      newString
    );

    result = executeSmartEdit(content, correctedOld, correctedNew);
  }

  // Check if successful
  if (!result.success) {
    return {
      success: false,
      matchLevel: result.matchLevel,
      error: {
        type: EditErrorType.NO_MATCH,
        message: "Could not find matching text in content",
        details: `Tried exact, flexible, and regex matching strategies. Search string: "${oldString.substring(0, 100)}..."`,
      },
    };
  }

  // Check occurrence count
  if (result.occurrences !== expectedReplacements) {
    return {
      success: false,
      matchLevel: result.matchLevel,
      occurrences: result.occurrences,
      error: {
        type: EditErrorType.MULTIPLE_MATCHES,
        message: `Expected ${expectedReplacements} replacement(s) but found ${result.occurrences}`,
        details: `Consider providing more context in oldString to make it unique`,
      },
    };
  }

  // Check if content actually changed
  if (result.newContent === content) {
    return {
      success: false,
      matchLevel: result.matchLevel,
      error: {
        type: EditErrorType.NO_CHANGE,
        message: "Edit resulted in no change to content",
      },
    };
  }

  // Restore line ending style and trailing newline
  let finalContent = result.newContent!;
  finalContent = convertLineEndings(finalContent, lineEnding);
  finalContent = restoreTrailingNewline(content, finalContent);

  return {
    success: true,
    newContent: finalContent,
    matchLevel: result.matchLevel,
    occurrences: result.occurrences,
  };
}
