/**
 * Smart editing utilities for Open Canvas
 * Provides intelligent text replacement with multi-level matching strategies
 */

// Export types
export type {
  EditResult,
  SmartEditParams,
  EditTelemetry,
} from "./types";

export {
  MatchLevel,
  EditErrorType,
} from "./types";

// Export string utilities
export {
  safeLiteralReplace,
  detectLineEnding,
  normalizeLineEndings,
  convertLineEndings,
  restoreTrailingNewline,
  countOccurrences,
  getIndentation,
  applyIndentation,
} from "./stringUtils";

// Export matchers
export type { MatchResult } from "./matchers";

export {
  calculateExactReplacement,
  calculateFlexibleReplacement,
  calculateRegexReplacement,
  executeSmartEdit,
} from "./matchers";

// Export correctors
export {
  unescapeString,
  applyBasicCorrection,
  performSmartEdit,
} from "./corrector";
