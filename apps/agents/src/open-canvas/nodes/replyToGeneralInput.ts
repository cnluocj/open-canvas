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

  // Use brief summary instead of full content in main agent to save tokens
  const extractedMaterialMessages = [];
  if (state.extractedMaterial) {
    const { originalDocumentName, type, compressedContent } = state.extractedMaterial;
    const charCount = compressedContent.length;

    extractedMaterialMessages.push({
      role: isO1MiniModel ? "user" : "system",
      content: `📎 **已提取病例材料**
- 文档：${originalDocumentName}
- 类型：${type === 'treatment' ? '治疗类' : '护理类'}病案
- 字数：约 ${Math.round(charCount / 1000)}k 字

*注：完整材料已在系统中，生成报告时会自动使用，无需重复提取或询问。*`,
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
