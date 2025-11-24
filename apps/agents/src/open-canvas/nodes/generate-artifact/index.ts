import {
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import { ArtifactV3 } from "@opencanvas/shared/types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { ARTIFACT_TOOL_SCHEMA } from "./schemas.js";
import { createArtifactContent, formatNewArtifactPrompt } from "./utils.js";
import { z } from "zod";
import { getTemplateMessage } from "../../utils/templateInjection.js";
import { shouldInjectMaterial } from "../../utils/materialInjection.js";
import { SOURCES_NAMESPACE } from "@opencanvas/shared/constants";
import { Source } from "@opencanvas/shared/types";

/**
 * Generate a new artifact based on the user's query.
 */
export const generateArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelName } = getModelConfig(config, {
    isToolCalling: true,
  });
  const smallModel = await getModelFromConfig(config, {
    temperature: 0.5,
    isToolCalling: true,
  });

  const modelWithArtifactTool = smallModel.bindTools(
    [
      {
        name: "generate_artifact",
        description: ARTIFACT_TOOL_SCHEMA.description,
        schema: ARTIFACT_TOOL_SCHEMA,
      },
    ],
    {
      tool_choice: "generate_artifact",
    }
  );

  const memoriesAsString = await getFormattedReflections(config);
  const formattedNewArtifactPrompt = formatNewArtifactPrompt(
    memoriesAsString,
    modelName
  );

  const userSystemPrompt = optionallyGetSystemPromptFromConfig(config);
  const fullSystemPrompt = userSystemPrompt
    ? `${userSystemPrompt}\n\n---\n\n${formattedNewArtifactPrompt}`
    : formattedNewArtifactPrompt;

  const isO1MiniModel = isUsingO1MiniModel(config);

  // Inject extracted material if configured (default: true for generate)
  const systemMessages = [];

  // Inject sources (persistent reference materials)
  if (config.store && config.configurable?.thread_id) {
    try {
      const sourcesResult = await config.store.get(SOURCES_NAMESPACE, config.configurable.thread_id);
      const sources = (sourcesResult?.value as any)?.sources || [];
      const enabledSources = sources.filter((s: Source) => s.enabled);

      if (enabledSources.length > 0) {
        console.log(`[generateArtifact] Found ${enabledSources.length} enabled sources`);

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
          content: `📚 **参考来源**（${enabledSources.length} 个）：\n\n${sourcesInfo}\n\n**说明**：这些是用户提供的持久参考资料，内容已完全准备就绪。生成报告时应参考这些来源（但不应直接复制，而应结合医学知识综合生成）。`
        });
      }
    } catch (error) {
      console.error("[generateArtifact] Error loading sources:", error);
    }
  }

  if (shouldInjectMaterial(state, "generate")) {
    const materialContent = `**已提取的病例材料（来自附件：${state.extractedMaterial!.originalDocumentName}）**：

${state.extractedMaterial!.compressedContent}

请基于以上提取的病例材料撰写报告。`;

    systemMessages.push({
      role: isO1MiniModel ? "user" : "system",
      content: materialContent,
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

  const response = await modelWithArtifactTool.invoke(
    [
      { role: isO1MiniModel ? "user" : "system", content: fullSystemPrompt },
      ...systemMessages,
      ...state._messages,
    ],
    { runName: "generate_artifact" }
  );
  const args = response.tool_calls?.[0].args as
    | z.infer<typeof ARTIFACT_TOOL_SCHEMA>
    | undefined;
  if (!args) {
    throw new Error("No args found in response");
  }

  const newArtifactContent = createArtifactContent(args);
  const newArtifact: ArtifactV3 = {
    currentIndex: 1,
    contents: [newArtifactContent],
  };

  return {
    artifact: newArtifact,
  };
};
