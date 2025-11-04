import {
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

  const { markdownBlock, selectedText, replacementText } =
    state.highlightedText;

  // Use the backend artifact content as the source of truth for fullMarkdown
  // instead of the frontend-extracted version, which may have inconsistent
  // list formatting from BlockNote's blocksToMarkdownLossy()
  const fullMarkdown = currentArtifactContent.fullMarkdown;

  const recentUserMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentUserMessage) {
    throw new Error("No recent human message found");
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

    const isO1MiniModel = isUsingO1MiniModel(config);

    // 只使用压缩后的材料，不使用原始文档
    const extractedMaterialMessages = [];
    if (state.extractedMaterial) {
      extractedMaterialMessages.push({
        role: isO1MiniModel ? "user" : "system",
        content: `**已提取的病例材料（来自附件：${state.extractedMaterial.originalDocumentName}）**：

${state.extractedMaterial.compressedContent}`,
      });
    }

    const response = await model.invoke([
      {
        role: isO1MiniModel ? "user" : "system",
        content: formattedPrompt,
      },
      ...extractedMaterialMessages,
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

  // BlockNote renumbers selected list items starting from 1, even if they're item 4, 5, etc.
  // We need to match content while ignoring the list number difference
  const stripListNumber = (text: string) => text.replace(/^(\s*)\d+\.\s+/, '$1');

  // First try exact match
  let blockIndex = fullMarkdown.indexOf(markdownBlock);
  let matchedBlock = markdownBlock;

  // If exact match fails, try matching content while ignoring list numbers
  if (blockIndex === -1) {
    const contentOnly = stripListNumber(markdownBlock).trim();

    if (contentOnly) {
      // Escape special regex characters in the content
      const escapedContent = contentOnly.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match: optional whitespace + any number + dot + spaces + our content
      const listItemPattern = new RegExp(
        `^(\\s*)(\\d+\\.\\s+)(${escapedContent})`,
        'm'
      );

      const match = fullMarkdown.match(listItemPattern);
      if (match && match.index !== undefined) {
        blockIndex = match.index;
        matchedBlock = match[0];
        console.log(
          `[updateHighlightedText] Found content at index ${blockIndex} (list number differs: BlockNote="${markdownBlock.match(/^\d+/)}" vs Document="${match[2].match(/^\d+/)}")`
        );
      }
    }
  }

  let newFullMarkdown: string;
  if (blockIndex !== -1) {
    // Match succeeded - replace while preserving the document's original list number
    const docListPrefix = matchedBlock.match(/^(\s*\d+\.\s+)/)?.[1] || '';
    const updatedContentOnly = stripListNumber(processedResponse);
    const updatedBlock = docListPrefix + updatedContentOnly;

    newFullMarkdown =
      fullMarkdown.slice(0, blockIndex) +
      updatedBlock +
      fullMarkdown.slice(blockIndex + matchedBlock.length);

    console.log(
      `[updateHighlightedText] Content match succeeded, preserved document list number`
    );
  } else {
    // Content match failed - try smart edit as fallback
    console.warn(
      `[updateHighlightedText] Content match failed, trying smart edit fallback`
    );
    console.warn(`  markdownBlock length: ${markdownBlock.length} chars`);
    console.warn(`  fullMarkdown length: ${fullMarkdown.length} chars`);

    const editResult = performSmartEdit({
      content: fullMarkdown,
      oldString: markdownBlock,
      newString: processedResponse,
      expectedReplacements: 1,
    });

    if (editResult.success && editResult.newContent) {
      newFullMarkdown = editResult.newContent;
      console.log(
        `[updateHighlightedText] Smart edit succeeded with ${editResult.matchLevel} matching`
      );
    } else {
      // Both methods failed - log detailed diagnostics and throw error
      console.error(`[updateHighlightedText] All matching strategies failed`);
      console.error(`  Smart edit error: ${editResult.error?.message}`);
      console.error(`  markdownBlock (first 300): ${JSON.stringify(markdownBlock.substring(0, 300))}`);
      console.error(`  fullMarkdown (first 300): ${JSON.stringify(fullMarkdown.substring(0, 300))}`);

      throw new Error(
        `Could not locate selected text in document. ` +
        `This may indicate editor state desynchronization. ` +
        `Smart edit error: ${editResult.error?.message}`
      );
    }
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
