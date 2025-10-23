/**
 * Types for smart editing functionality
 * Inspired by gemini-cli's editing tools
 */

/**
 * Matching strategy level used for edit
 */
export enum MatchLevel {
  EXACT = "exact",
  FLEXIBLE_LINE = "flexible_line",
  REGEX = "regex",
  NONE = "none",
}

/**
 * Error types for edit operations
 */
export enum EditErrorType {
  NO_MATCH = "no_match",
  MULTIPLE_MATCHES = "multiple_matches",
  NO_CHANGE = "no_change",
  INVALID_PARAMS = "invalid_params",
}

/**
 * Result of an edit operation
 */
export interface EditResult {
  success: boolean;
  newContent?: string;
  matchLevel?: MatchLevel;
  occurrences?: number;
  error?: {
    type: EditErrorType;
    message: string;
    details?: string;
  };
}

/**
 * Parameters for smart edit operation
 */
export interface SmartEditParams {
  content: string;
  oldString: string;
  newString: string;
  expectedReplacements?: number; // Default: 1
}

/**
 * Telemetry data for edit operations
 */
export interface EditTelemetry {
  matchLevel: MatchLevel;
  success: boolean;
  errorType?: EditErrorType;
  contentLength: number;
  searchLength: number;
  replacementLength: number;
}
