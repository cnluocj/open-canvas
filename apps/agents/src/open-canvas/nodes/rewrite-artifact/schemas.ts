import { PROGRAMMING_LANGUAGES } from "@opencanvas/shared/constants";
import { z } from "zod";

export const OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA = z
  .object({
    type: z
      .enum(["text", "code"])
      .describe("The type of the artifact content."),
    title: z
      .string()
      .optional()
      .describe(
        "The new title to give the artifact. ONLY update this if the user is making a request which changes the subject/topic of the artifact."
      ),
    language: z
      .enum(
        PROGRAMMING_LANGUAGES.map((lang) => lang.language) as [
          string,
          ...string[],
        ]
      )
      .describe(
        "The language of the code artifact. This should be populated with the programming language if the user is requesting code to be written, or 'other', in all other cases."
      ),
  })
  .describe("Update the artifact meta information, if necessary.");

/**
 * Schema for a single edit operation.
 * Each edit represents one targeted replacement in the artifact.
 */
const SINGLE_EDIT_SCHEMA = z.object({
  oldString: z
    .string()
    .describe(
      "The EXACT literal text from the current artifact that should be replaced. Include at least 3 lines of context BEFORE and AFTER the target text for uniqueness. Must match whitespace and indentation precisely."
    ),
  newString: z
    .string()
    .describe(
      "The new text that should replace oldString. Must maintain the same structure and indentation style as the surrounding code."
    ),
  explanation: z
    .string()
    .describe(
      "Brief explanation of what this specific edit does (e.g., 'Rename variable X to Y', 'Add type annotation to function', 'Update summary section')."
    ),
});

/**
 * Schema for analyzing edit requests and extracting targeted edits.
 * The LLM should extract one or more specific edits from the user's request.
 * If the request is too vague or requires complete rewriting, return an empty array.
 */
export const ANALYZE_EDIT_SCHEMA = z
  .object({
    edits: z
      .array(SINGLE_EDIT_SCHEMA)
      .describe(
        "Array of targeted edits to apply. Each edit is applied sequentially. Return empty array if the request requires full regeneration (e.g., vague requests like 'make it better', structural changes affecting >50% of content, or when specific locations cannot be identified)."
      ),
    reasoning: z
      .string()
      .describe(
        "Explanation of your analysis: Why you extracted these specific edits, or why full regeneration is needed (if edits array is empty)."
      ),
  })
  .describe(
    "Analyze the user's edit request and extract specific, targeted edits. Return empty edits array if full regeneration is needed."
  );
