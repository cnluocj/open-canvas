import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { Reflections } from "@opencanvas/shared/types";
import {
  ensureStoreInConfig,
  formatArtifactContentWithTemplate,
  formatReflections,
  getModelFromConfig,
  isUsingO1MiniModel,
} from "../../utils.js";
import {
  CURRENT_ARTIFACT_PROMPT,
  GENERAL_INPUT_RESPONSE_PROMPT,
  NO_ARTIFACT_PROMPT,
} from "../prompts.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";

/**
 * Generate responses to questions. Does not generate artifacts.
 */
export const replyToGeneralInput = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const smallModel = await getModelFromConfig(config);

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;

  const store = ensureStoreInConfig(config);
  const assistantId = config.configurable?.assistant_id;
  if (!assistantId) {
    throw new Error("`assistant_id` not found in configurable");
  }
  const memoryNamespace = ["memories", assistantId];
  const memoryKey = "reflection";
  const memories = await store.get(memoryNamespace, memoryKey);
  const memoriesAsString = memories?.value
    ? formatReflections(memories.value as Reflections)
    : "No reflections found.";

  const formattedPrompt = GENERAL_INPUT_RESPONSE_PROMPT
    .replace("{reflections}", memoriesAsString)
    .replace(
      "{currentArtifactPrompt}",
      currentArtifactContent
        ? formatArtifactContentWithTemplate(
            CURRENT_ARTIFACT_PROMPT,
            currentArtifactContent
          )
        : NO_ARTIFACT_PROMPT
    );

  const isO1MiniModel = isUsingO1MiniModel(config);

  // Only use compressed extracted material, not raw documents
  const extractedMaterialMessages = [];
  if (state.extractedMaterial) {
    extractedMaterialMessages.push({
      role: isO1MiniModel ? "user" : "system",
      content: `**已提取的病例材料（来自附件：${state.extractedMaterial.originalDocumentName}）**：

${state.extractedMaterial.compressedContent}`,
    });
  }

  const response = await smallModel.invoke([
    { role: isO1MiniModel ? "user" : "system", content: formattedPrompt },
    ...extractedMaterialMessages,
    ...state._messages,
  ]);

  return {
    messages: [response],
    _messages: [response],
  };
};
