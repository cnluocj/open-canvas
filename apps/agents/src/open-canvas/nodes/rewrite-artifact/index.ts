import { v4 as uuidv4 } from "uuid";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { optionallyUpdateArtifactMeta } from "./update-meta.js";
import {
  buildPrompt,
  createNewArtifactContent,
  validateState,
} from "./utils.js";
import {
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import { isArtifactMarkdownContent } from "@opencanvas/shared/utils/artifacts";
import { AIMessage } from "@langchain/core/messages";
import {
  extractThinkingAndResponseTokens,
  isThinkingModel,
} from "@opencanvas/shared/utils/thinking";
import { getTemplateMessage } from "../../utils/templateInjection.js";
import { shouldInjectMaterial } from "../../utils/materialInjection.js";
import { SOURCES_NAMESPACE } from "@opencanvas/shared/constants";
import { Source } from "@opencanvas/shared/types";

export const rewriteArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelName } = getModelConfig(config);
  const smallModelWithConfig = (await getModelFromConfig(config)).withConfig({
    runName: "rewrite_artifact_model_call",
  });
  const memoriesAsString = await getFormattedReflections(config);
  const { currentArtifactContent, recentHumanMessage } = validateState(state);

  const artifactMetaToolCall = await optionallyUpdateArtifactMeta(
    state,
    config
  );
  const artifactType = artifactMetaToolCall.type;
  const isNewType = artifactType !== currentArtifactContent.type;

  const artifactContent = isArtifactMarkdownContent(currentArtifactContent)
    ? currentArtifactContent.fullMarkdown
    : currentArtifactContent.code;

  // Generate the full rewritten artifact
  const formattedPrompt = buildPrompt({
    artifactContent,
    memoriesAsString,
    isNewType,
    artifactMetaToolCall,
  });

  const userSystemPrompt = optionallyGetSystemPromptFromConfig(config);
  const fullSystemPrompt = userSystemPrompt
    ? `${userSystemPrompt}\n\n---\n\n${formattedPrompt}`
    : formattedPrompt;

  const isO1MiniModel = isUsingO1MiniModel(config);

  // Inject extracted material if configured (default: true for rewrite)
  const systemMessages = [];

  // Inject sources (persistent reference materials)
  if (config.store && config.configurable?.thread_id) {
    try {
      const sourcesResult = await config.store.get(SOURCES_NAMESPACE, config.configurable.thread_id);
      const sources = (sourcesResult?.value as any)?.sources || [];
      const enabledSources = sources.filter((s: Source) => s.enabled);

      if (enabledSources.length > 0) {
        console.log(`[rewriteArtifact] Found ${enabledSources.length} enabled sources`);

        // Use full content with 50000 char limit
        const sourcesInfo = enabledSources.map((source: Source, idx: number) => {
          const MAX_CONTENT_LENGTH = 50000;
          let content = source.content;
          let truncated = false;

          if (content.length > MAX_CONTENT_LENGTH) {
            content = content.slice(0, MAX_CONTENT_LENGTH);
            truncated = true;
          }

          let typeLabel = "";
          if (source.type === "file") {
            typeLabel = `文件（${source.metadata?.fileType || "未知类型"}）`;
          } else if (source.type === "link") {
            typeLabel = `网页（${source.metadata?.url || ""}）`;
          } else {
            typeLabel = "文本";
          }

          return `**来源 ${idx + 1}**: ${source.name}\n- 类型：${typeLabel}\n- 内容${truncated ? `（原文 ${source.content.length} 字，已截取前 ${MAX_CONTENT_LENGTH} 字）` : ""}：\n${content}`;
        }).join("\n\n");

        systemMessages.push({
          role: isO1MiniModel ? "user" : "system",
          content: `📚 **参考来源**（${enabledSources.length} 个）：\n\n${sourcesInfo}\n\n**说明**：这些是用户提供的持久参考资料，内容已完全准备就绪。重写报告时应参考这些来源（但不应直接复制，而应结合医学知识综合生成）。`
        });
      }
    } catch (error) {
      console.error("[rewriteArtifact] Error loading sources:", error);
    }
  }

  if (shouldInjectMaterial(state, "rewrite")) {
    systemMessages.push({
      role: isO1MiniModel ? "user" : "system",
      content: `**已提取的病例材料（来自附件：${state.extractedMaterial!.originalDocumentName}）**：

${state.extractedMaterial!.compressedContent}`,
    });
  }

  // Inject report template for medical reports
  if (state.reportType && state.reportType !== "unknown") {
    const templateMessage = getTemplateMessage(state.reportType);
    if (templateMessage) {
      systemMessages.push({
        role: isO1MiniModel ? "user" : "system",
        content: templateMessage.content as string,
      });
    }
  }

  const newArtifactResponse = await smallModelWithConfig.invoke([
    { role: isO1MiniModel ? "user" : "system", content: fullSystemPrompt },
    ...systemMessages,
    recentHumanMessage,
  ]);

  let thinkingMessage: AIMessage | undefined;
  let artifactContentText = newArtifactResponse.content as string;

  if (isThinkingModel(modelName)) {
    const { thinking, response } =
      extractThinkingAndResponseTokens(artifactContentText);
    thinkingMessage = new AIMessage({
      id: `thinking-${uuidv4()}`,
      content: thinking,
    });
    artifactContentText = response;
  }

  const newArtifactContent = createNewArtifactContent({
    artifactType,
    state,
    currentArtifactContent,
    artifactMetaToolCall,
    newContent: artifactContentText as string,
  });

  return {
    artifact: {
      ...state.artifact,
      currentIndex: state.artifact.contents.length + 1,
      contents: [...state.artifact.contents, newArtifactContent],
    },
    messages: [...(thinkingMessage ? [thinkingMessage] : [])],
    _messages: [...(thinkingMessage ? [thinkingMessage] : [])],
  };
};
