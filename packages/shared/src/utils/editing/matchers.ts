/**
 * Multi-level matching strategies for smart editing
 * Implements 3-level fallback: exact → flexible line → regex
 */

import {
  safeLiteralReplace,
  normalizeLineEndings,
  getIndentation,
  countOccurrences,
} from "./stringUtils";
import { MatchLevel } from "./types";

export interface MatchResult {
  success: boolean;
  newContent?: string;
  matchLevel: MatchLevel;
  occurrences: number;
}

/**
 * Level 1: Exact match with safe literal replacement
 * Handles special characters like $ correctly
 */
export function calculateExactReplacement(
  content: string,
  oldString: string,
  newString: string
): MatchResult {
  // Normalize line endings for consistent matching
  const normalizedContent = normalizeLineEndings(content);
  const normalizedOld = normalizeLineEndings(oldString);
  const normalizedNew = normalizeLineEndings(newString);

  const occurrences = countOccurrences(normalizedContent, normalizedOld);

  if (occurrences === 0) {
    return {
      success: false,
      matchLevel: MatchLevel.EXACT,
      occurrences: 0,
    };
  }

  // Use safe replacement that handles $ characters
  const newContent = safeLiteralReplace(
    normalizedContent,
    normalizedOld,
    normalizedNew
  );

  return {
    success: true,
    newContent,
    matchLevel: MatchLevel.EXACT,
    occurrences,
  };
}

/**
 * Level 2: Flexible line matching
 * Matches content while ignoring indentation differences
 * Preserves the original indentation from the file
 */
export function calculateFlexibleReplacement(
  content: string,
  oldString: string,
  newString: string
): MatchResult {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedOld = normalizeLineEndings(oldString);
  const normalizedNew = normalizeLineEndings(newString);

  const contentLines = normalizedContent.split("\n");
  const searchLines = normalizedOld.split("\n");
  const replacementLines = normalizedNew.split("\n");

  // Strip whitespace from search lines for comparison
  const strippedSearchLines = searchLines.map((line) => line.trim());

  let occurrences = 0;
  let resultLines = [...contentLines];

  // Find all matches
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const potentialMatch = contentLines.slice(i, i + searchLines.length);
    const strippedMatch = potentialMatch.map((line) => line.trim());

    // Check if content matches (ignoring whitespace)
    const matches = strippedSearchLines.every(
      (searchLine, idx) => searchLine === strippedMatch[idx]
    );

    if (matches) {
      occurrences++;

      // Capture the original indentation from the first line of the match
      const originalIndentation = getIndentation(contentLines[i]);

      // Apply the same indentation to replacement lines
      const indentedReplacement = replacementLines.map((line, idx) => {
        // First line: use original indentation
        if (idx === 0) {
          return originalIndentation + line.trim();
        }
        // Subsequent lines: preserve relative indentation
        const relativeIndent = getIndentation(line);
        return originalIndentation + relativeIndent + line.trim();
      });

      // Replace the matched lines
      resultLines.splice(i, searchLines.length, ...indentedReplacement);

      // Adjust index to continue after replacement
      i += indentedReplacement.length - 1;
    }
  }

  if (occurrences === 0) {
    return {
      success: false,
      matchLevel: MatchLevel.FLEXIBLE_LINE,
      occurrences: 0,
    };
  }

  return {
    success: true,
    newContent: resultLines.join("\n"),
    matchLevel: MatchLevel.FLEXIBLE_LINE,
    occurrences,
  };
}

/**
 * Level 3: Regex-based flexible matching
 * Tokenizes the search string and builds a regex that allows flexible whitespace
 */
export function calculateRegexReplacement(
  content: string,
  oldString: string,
  newString: string
): MatchResult {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedOld = normalizeLineEndings(oldString);
  const normalizedNew = normalizeLineEndings(newString);

  try {
    // Tokenize by common delimiters
    const delimiters = /([():\[\]{}<>=,;])/g;
    const tokens = normalizedOld
      .split(delimiters)
      .filter((token) => token.length > 0);

    // Build regex pattern with flexible whitespace
    let pattern = "";
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Escape special regex characters
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      pattern += escapedToken;

      // Add flexible whitespace between tokens (except at the end)
      if (i < tokens.length - 1) {
        pattern += "\\s*";
      }
    }

    const regex = new RegExp(pattern, "m"); // multiline mode
    const match = normalizedContent.match(regex);

    if (!match) {
      return {
        success: false,
        matchLevel: MatchLevel.REGEX,
        occurrences: 0,
      };
    }

    // Only replace the first occurrence for safety
    const newContent = normalizedContent.replace(regex, normalizedNew);

    return {
      success: true,
      newContent,
      matchLevel: MatchLevel.REGEX,
      occurrences: 1,
    };
  } catch (error) {
    // Regex building failed
    return {
      success: false,
      matchLevel: MatchLevel.REGEX,
      occurrences: 0,
    };
  }
}

/**
 * Execute smart edit with 3-level fallback strategy
 *
 * @param content - The original content
 * @param oldString - The string to find
 * @param newString - The replacement string
 * @returns MatchResult with the best matching strategy
 */
export function executeSmartEdit(
  content: string,
  oldString: string,
  newString: string
): MatchResult {
  // Level 1: Try exact match first
  const exactResult = calculateExactReplacement(content, oldString, newString);
  if (exactResult.success) {
    return exactResult;
  }

  // Level 2: Try flexible line matching
  const flexibleResult = calculateFlexibleReplacement(
    content,
    oldString,
    newString
  );
  if (flexibleResult.success) {
    return flexibleResult;
  }

  // Level 3: Try regex-based matching
  const regexResult = calculateRegexReplacement(content, oldString, newString);
  if (regexResult.success) {
    return regexResult;
  }

  // All strategies failed
  return {
    success: false,
    matchLevel: MatchLevel.NONE,
    occurrences: 0,
  };
}
