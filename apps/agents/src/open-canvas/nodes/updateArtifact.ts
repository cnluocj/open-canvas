import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  getArtifactContent,
  isArtifactCodeContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  ArtifactCodeV3,
  ArtifactV3,
  Reflections,
} from "@opencanvas/shared/types";
import { performSmartEdit } from "@opencanvas/shared/utils/editing";
import {
  ensureStoreInConfig,
  formatReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
} from "../../utils.js";
import { UPDATE_HIGHLIGHTED_ARTIFACT_PROMPT } from "../prompts.js";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import { getTemplateMessage } from "../utils/templateInjection.js";
import { shouldInjectMaterial } from "../utils/materialInjection.js";
import { SOURCES_NAMESPACE } from "@opencanvas/shared/constants";
import { Source } from "@opencanvas/shared/types";

/**
 * Update an existing artifact based on the user's query.
 */
export const updateArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelProvider, modelName } = getModelConfig(config);
  let smallModel: Awaited<ReturnType<typeof getModelFromConfig>>;
  if (modelProvider.includes("openai") || modelName.includes("3-5-sonnet")) {
    // Custom model is intelligent enough for updating artifacts
    smallModel = await getModelFromConfig(config, {
      temperature: 0,
    });
  } else {
    // Custom model is not intelligent enough for updating artifacts
    smallModel = await getModelFromConfig(
      {
        ...config,
        configurable: {
          customModelName: "gpt-4o",
        },
      },
      {
        temperature: 0,
      }
    );
  }

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

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }
  if (!isArtifactCodeContent(currentArtifactContent)) {
    throw new Error("Current artifact content is not markdown");
  }

  if (!state.highlightedCode) {
    throw new Error(
      "Can not partially regenerate an artifact without a highlight"
    );
  }

  // Highlighted text is present, so we need to update the highlighted text.
  const start = Math.max(0, state.highlightedCode.startCharIndex - 500);
  const end = Math.min(
    currentArtifactContent.code.length,
    state.highlightedCode.endCharIndex + 500
  );

  const beforeHighlight = currentArtifactContent.code.slice(
    start,
    state.highlightedCode.startCharIndex
  ) as string;
  const highlightedText = currentArtifactContent.code.slice(
    state.highlightedCode.startCharIndex,
    state.highlightedCode.endCharIndex
  ) as string;
  const afterHighlight = currentArtifactContent.code.slice(
    state.highlightedCode.endCharIndex,
    end
  ) as string;

  const formattedPrompt = UPDATE_HIGHLIGHTED_ARTIFACT_PROMPT.replace(
    "{highlightedText}",
    highlightedText
  )
    .replace("{beforeHighlight}", beforeHighlight)
    .replace("{afterHighlight}", afterHighlight)
    .replace("{reflections}", memoriesAsString);

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    throw new Error("No recent human message found");
  }

  const isO1MiniModel = isUsingO1MiniModel(config);

  // Inject extracted material if configured (default: false for update)
  const systemMessages = [];

  // Inject sources (persistent reference materials)
  if (config.store && config.configurable?.thread_id) {
    try {
      const sourcesResult = await config.store.get(SOURCES_NAMESPACE, config.configurable.thread_id);
      const sources = (sourcesResult?.value as any)?.sources || [];
      const enabledSources = sources.filter((s: Source) => s.enabled);

      if (enabledSources.length > 0) {
        console.log(`[updateArtifact] Found ${enabledSources.length} enabled sources`);

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
          content: `📚 **参考来源**（${enabledSources.length} 个）：\n\n${sourcesInfo}\n\n**说明**：这些是用户提供的持久参考资料，内容已完全准备就绪。更新报告时应参考这些来源（但不应直接复制，而应结合医学知识综合生成）。`
        });
      }
    } catch (error) {
      console.error("[updateArtifact] Error loading sources:", error);
    }
  }

  if (shouldInjectMaterial(state, "update")) {
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

  const updatedArtifact = await smallModel.invoke([
    { role: isO1MiniModel ? "user" : "system", content: formattedPrompt },
    ...systemMessages,
    recentHumanMessage,
  ]);

  // Use smart editing to replace the highlighted code
  // This handles indentation, whitespace, and special characters intelligently
  const editResult = performSmartEdit({
    content: currentArtifactContent.code,
    oldString: highlightedText,
    newString: updatedArtifact.content as string,
    expectedReplacements: 1,
  });

  let entireUpdatedContent: string;
  if (editResult.success && editResult.newContent) {
    // Smart edit succeeded - use the intelligently updated content
    entireUpdatedContent = editResult.newContent;

    // Log which matching strategy was used for telemetry
    console.log(`[Smart Edit] Used ${editResult.matchLevel} matching strategy`);
  } else {
    // Fallback to simple concatenation if smart edit fails
    console.warn(
      `[Smart Edit] Failed with error: ${editResult.error?.message}. Falling back to simple concatenation.`
    );
    const entireTextBefore = currentArtifactContent.code.slice(
      0,
      state.highlightedCode.startCharIndex
    );
    const entireTextAfter = currentArtifactContent.code.slice(
      state.highlightedCode.endCharIndex
    );
    entireUpdatedContent = `${entireTextBefore}${updatedArtifact.content}${entireTextAfter}`;
  }

  const newArtifactContent: ArtifactCodeV3 = {
    ...currentArtifactContent,
    index: state.artifact.contents.length + 1,
    code: entireUpdatedContent,
  };

  const newArtifact: ArtifactV3 = {
    ...state.artifact,
    currentIndex: state.artifact.contents.length + 1,
    contents: [...state.artifact.contents, newArtifactContent],
  };

  return {
    artifact: newArtifact,
  };
};
