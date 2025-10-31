import {
  createContextDocumentMessages,
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
} from "../../utils.js";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { RunnableBinding } from "@langchain/core/runnables";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ConfigurableChatModelCallOptions } from "langchain/chat_models/universal";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import { ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { performSmartEdit } from "@opencanvas/shared/utils/editing";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

const PROMPT = `You are an expert AI writing assistant, tasked with updating a specific part of an artifact.

Here is the FULL artifact for context:
<full-artifact>
{fullMarkdown}
</full-artifact>

The user has selected this specific part to update:
<selected-text>
{selectedText}
</selected-text>

<markdown-block>
{markdownBlock}
</markdown-block>

You also have the following reflections on style guidelines and memories about the user:
<reflections>
{reflections}
</reflections>

Your task: Update ONLY the markdown block based on the user's request below.

Rules:
- Respond with the FULL updated markdown block (not just the changed part)
- Use the full artifact as context to understand what content to generate
- Do NOT change anything outside the selected markdown block
- Maintain the formatting and structure of the block you are updating
- NEVER wrap in additional markdown syntax unless it was in the original block
- Do NOT include triple backtick wrapping unless it was present in the original block
- If you observe partial markdown, this is OKAY because you are only updating a partial piece of the text
- You should NOT change anything EXCEPT the selected text, unless it is necessary to make the selected text make sense

Ensure you reply with the FULL text block, including the updated selected text. NEVER include only the updated selected text, or additional prefixes or suffixes.`;

/**
 * Update an existing artifact based on the user's query.
 */
export const updateHighlightedText = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelProvider, modelName } = getModelConfig(config);
  let model: RunnableBinding<
    BaseLanguageModelInput,
    AIMessageChunk,
    ConfigurableChatModelCallOptions
  >;
  if (modelProvider.includes("openai") || modelName.includes("3-5-sonnet")) {
    // Custom model is intelligent enough for updating artifacts
    model = (
      await getModelFromConfig(config, {
        temperature: 0,
      })
    ).withConfig({ runName: "update_highlighted_markdown" });
  } else {
    // Custom model is not intelligent enough for updating artifacts
    model = (
      await getModelFromConfig(
        {
          ...config,
          configurable: {
            customModelName: "gpt-4o",
          },
        },
        {
          temperature: 0,
        }
      )
    ).withConfig({ runName: "update_highlighted_markdown" });
  }

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }
  if (!isArtifactMarkdownContent(currentArtifactContent)) {
    throw new Error("Artifact is not markdown content");
  }

  if (!state.highlightedText) {
    throw new Error(
      "Can not partially regenerate an artifact without a highlight"
    );
  }

  const { markdownBlock, selectedText, fullMarkdown, replacementText } =
    state.highlightedText;

  const recentUserMessage = state._messages[state._messages.length - 1];
  if (recentUserMessage.getType() !== "human") {
    throw new Error("Expected a human message");
  }

  let responseContent: string;
  if (replacementText !== undefined) {
    responseContent = replacementText;
  } else {
    // Get reflections for user preferences and style guidelines only when needed
    const memoriesAsString = await getFormattedReflections(config);

    const formattedPrompt = PROMPT.replace("{fullMarkdown}", fullMarkdown)
      .replace("{selectedText}", selectedText)
      .replace("{markdownBlock}", markdownBlock)
      .replace("{reflections}", memoriesAsString);

    const contextDocumentMessages =
      await createContextDocumentMessages(config);
    const isO1MiniModel = isUsingO1MiniModel(config);
    const response = await model.invoke([
      {
        role: isO1MiniModel ? "user" : "system",
        content: formattedPrompt,
      },
      ...contextDocumentMessages,
      recentUserMessage,
    ]);
    responseContent = response.content as string;
  }

  // Preserve leading and trailing newlines from the original markdown block
  // This prevents losing blank lines between blocks when updating
  const leadingNewlines = markdownBlock.match(/^\n*/)?.[0] || '';
  const trailingNewlines = markdownBlock.match(/\n*$/)?.[0] || '';

  // Ensure the LLM response has the same boundary newlines as the original
  let processedResponse = responseContent.trim(); // Remove LLM's whitespace first
  processedResponse = leadingNewlines + processedResponse + trailingNewlines;

  console.log(
    `[updateHighlightedText] Preserving boundaries - leading: ${leadingNewlines.length} trailing: ${trailingNewlines.length} newlines`
  );

  const newCurrIndex = state.artifact.contents.length + 1;
  const prevContent = state.artifact.contents.find(
    (c) => c.index === state.artifact.currentIndex && c.type === "text"
  ) as ArtifactMarkdownV3 | undefined;
  if (!prevContent) {
    throw new Error("Previous content not found");
  }

  // Use smart editing to replace the markdown block
  // This handles whitespace variations and special characters intelligently
  const editResult = performSmartEdit({
    content: fullMarkdown,
    oldString: markdownBlock,
    newString: processedResponse, // Use processed response with preserved newlines
    expectedReplacements: 1,
  });

  let newFullMarkdown: string;
  if (editResult.success && editResult.newContent) {
    // Smart edit succeeded
    newFullMarkdown = editResult.newContent;

    // Log which matching strategy was used for telemetry
    console.log(`[Smart Edit Markdown] Used ${editResult.matchLevel} matching strategy`);
  } else {
    // Fallback to simple replacement if smart edit fails
    console.warn(
      `[Smart Edit Markdown] Failed with error: ${editResult.error?.message}. Falling back to simple replacement.`
    );
    if (!fullMarkdown.includes(markdownBlock)) {
      throw new Error("Selected text not found in current content");
    }
    newFullMarkdown = fullMarkdown.replace(markdownBlock, responseContent);
  }

  const updatedArtifactContent: ArtifactMarkdownV3 = {
    ...prevContent,
    index: newCurrIndex,
    fullMarkdown: newFullMarkdown,
  };

  return {
    artifact: {
      ...state.artifact,
      currentIndex: newCurrIndex,
      contents: [...state.artifact.contents, updatedArtifactContent],
    },
  };
};
