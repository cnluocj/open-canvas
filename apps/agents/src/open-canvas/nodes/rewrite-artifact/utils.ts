import {
  getArtifactContent,
  isArtifactCodeContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ProgrammingLanguageOptions,
} from "@opencanvas/shared/types";
import {
  OPTIONALLY_UPDATE_META_PROMPT,
  UPDATE_ENTIRE_ARTIFACT_PROMPT,
} from "../../prompts.js";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { z } from "zod";
import {
  OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA,
  ANALYZE_EDIT_SCHEMA,
} from "./schemas.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getModelFromConfig } from "../../../utils.js";
import { BaseMessage } from "@langchain/core/messages";

export const validateState = (
  state: typeof OpenCanvasGraphAnnotation.State
) => {
  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    throw new Error("No recent human message found");
  }

  return { currentArtifactContent, recentHumanMessage };
};

const buildMetaPrompt = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>
) => {
  const titleSection =
    artifactMetaToolCall?.title && artifactMetaToolCall?.type !== "code"
      ? `And its title is (do NOT include this in your response):\n${artifactMetaToolCall.title}`
      : "";

  return OPTIONALLY_UPDATE_META_PROMPT.replace(
    "{artifactType}",
    artifactMetaToolCall?.type
  ).replace("{artifactTitle}", titleSection);
};

interface BuildPromptArgs {
  artifactContent: string;
  memoriesAsString: string;
  isNewType: boolean;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
}

export const buildPrompt = ({
  artifactContent,
  memoriesAsString,
  isNewType,
  artifactMetaToolCall,
}: BuildPromptArgs) => {
  const metaPrompt = isNewType ? buildMetaPrompt(artifactMetaToolCall) : "";

  return UPDATE_ENTIRE_ARTIFACT_PROMPT.replace(
    "{artifactContent}",
    artifactContent
  )
    .replace("{reflections}", memoriesAsString)
    .replace("{updateMetaPrompt}", metaPrompt);
};

interface CreateNewArtifactContentArgs {
  artifactType: string;
  state: typeof OpenCanvasGraphAnnotation.State;
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
  newContent: string;
}

const getLanguage = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>,
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3 // Replace 'any' with proper type
) =>
  artifactMetaToolCall?.language ||
  (isArtifactCodeContent(currentArtifactContent)
    ? currentArtifactContent.language
    : "other");

export const createNewArtifactContent = ({
  artifactType,
  state,
  currentArtifactContent,
  artifactMetaToolCall,
  newContent,
}: CreateNewArtifactContentArgs): ArtifactCodeV3 | ArtifactMarkdownV3 => {
  const baseContent = {
    index: state.artifact.contents.length + 1,
    title: artifactMetaToolCall?.title || currentArtifactContent.title,
  };

  if (artifactType === "code") {
    return {
      ...baseContent,
      type: "code",
      language: getLanguage(
        artifactMetaToolCall,
        currentArtifactContent
      ) as ProgrammingLanguageOptions,
      code: newContent,
    };
  }

  return {
    ...baseContent,
    type: "text",
    fullMarkdown: newContent,
  };
};

/**
 * Analyze the user's edit request and extract specific, targeted edits.
 * Returns an array of edits that can be applied sequentially using smart editing.
 * If the request requires full regeneration, returns an empty edits array.
 */
export async function analyzeEditType({
  artifactContent,
  recentHumanMessage,
  config,
  contextDocumentMessages = [],
  conversationHistory = [],
}: {
  artifactContent: string;
  recentHumanMessage: BaseMessage;
  config: LangGraphRunnableConfig;
  contextDocumentMessages?: BaseMessage[];
  conversationHistory?: BaseMessage[];
}): Promise<z.infer<typeof ANALYZE_EDIT_SCHEMA> | null> {
  const model = await getModelFromConfig(config, {
    temperature: 0,
    isToolCalling: true,
  });

  // Show more context if the artifact is small enough
  const contentPreview = artifactContent.length <= 3000
    ? artifactContent
    : `${artifactContent.substring(0, 2000)}\n\n... (content truncated, ${artifactContent.length} chars total) ...\n\n${artifactContent.substring(artifactContent.length - 1000)}`;

  const analysisPrompt = `You are analyzing a user's request to edit an artifact (code or text document).

Current artifact content:
\`\`\`
${contentPreview}
\`\`\`

Your task: Extract specific, targeted edits from the user's request.

**Instructions:**

1. **Identify what needs to change**: Analyze the user's request and identify the specific parts of the artifact that need modification.

2. **Extract targeted edits**: For each modification:
   - Extract the EXACT literal text that exists in the current artifact (oldString)
   - Provide the replacement text (newString)
   - Include at least 3 lines of context BEFORE and AFTER the target text
   - Match whitespace and indentation PRECISELY
   - Ensure each oldString uniquely identifies a single location

3. **Multiple edits**: If the user's request requires changes in multiple locations:
   - Return one edit for each location
   - Order edits from top to bottom of the file (to maintain stability)
   - Each edit should be independent and non-overlapping

4. **When to return empty edits array**:
   - Vague requests without specific targets (e.g., "make it better", "improve this")
   - Structural changes affecting >50% of the content
   - Requests that require complete rewriting or reorganization
   - When you cannot identify specific locations in the artifact

**Examples:**

Good for targeted edits:
- "make the summary more detailed" → Extract summary section, provide enhanced version
- "rename variable userName to currentUser" → Multiple edits for each occurrence
- "add type annotation to the fetchData function" → Single edit for function signature
- "fix the bug in line 45" → Single edit for that specific line with context

Requires full regeneration (return empty edits):
- "rewrite this in a better way" (too vague)
- "completely restructure the code" (architectural change)
- "convert this from class-based to functional" (affects entire structure)`;

  const modelWithTool = model.bindTools(
    [
      {
        name: "extract_edits",
        description:
          "Extract specific, targeted edits from the user's request. Return empty array if full regeneration is needed.",
        schema: ANALYZE_EDIT_SCHEMA,
      },
    ],
    {
      tool_choice: "extract_edits",
    }
  );

  try {
    const result = await modelWithTool.invoke([
      ...contextDocumentMessages,
      { role: "user", content: analysisPrompt },
      ...conversationHistory,
      recentHumanMessage,
    ]);

    const analysis = result.tool_calls?.[0]
      ?.args as z.infer<typeof ANALYZE_EDIT_SCHEMA>;

    if (analysis) {
      console.log(
        `[Edit Analysis] Found ${analysis.edits.length} targeted edit(s). Reasoning: ${analysis.reasoning}`
      );
      analysis.edits.forEach((edit, index) => {
        console.log(`  Edit ${index + 1}: ${edit.explanation}`);
      });
    }

    return analysis || null;
  } catch (error) {
    console.warn("[Edit Analysis] Failed to analyze edit request:", error);
    return null;
  }
}
