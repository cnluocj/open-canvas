import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { AIMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import {
  MaterialProcessingReturnType,
  MaterialProcessingState,
} from "../state";
import {
  COMPRESS_MATERIAL_SYSTEM_PROMPT,
  getCompressMaterialUserPrompt,
} from "../prompts/compress";
import { getModelFromConfig } from "../../utils";
import { getReportTemplate } from "@opencanvas/shared/templates/index";
import type { ExtractedMaterial } from "@opencanvas/shared/types";

/**
 * 压缩工具的 schema
 */
const compressMaterialSchema = z.object({
  compressedContent: z
    .string()
    .describe("按照模版结构组织的压缩后的病例材料，使用 Markdown 格式"),
  extractedSections: z
    .record(z.string())
    .describe("按章节提取的关键信息，key为章节名称，value为该章节的提取内容"),
});

/**
 * 压缩材料节点
 * 根据报告类型和模版，从原始材料中提取和压缩关键信息
 */
export const compressMaterial = async (
  state: MaterialProcessingState,
  config: LangGraphRunnableConfig
): Promise<MaterialProcessingReturnType> => {
  try {
    const { documents, reportType } = state;

    // 检查报告类型
    if (reportType === "unknown") {
      return {
        error: "报告类型未确定，无法压缩材料",
      };
    }

    if (!documents || documents.length === 0) {
      return {
        error: "没有提供文档",
      };
    }

    // 获取文档内容
    const document = documents[0];
    const materialContent = document.data;

    // 获取对应的模版
    const template = getReportTemplate(reportType);

    if (!template) {
      return {
        error: `未找到 ${reportType} 类型的报告模版`,
      };
    }

    // 准备 prompts
    const systemMessage = new SystemMessage(COMPRESS_MATERIAL_SYSTEM_PROMPT);
    const userMessage = new HumanMessage(
      getCompressMaterialUserPrompt(reportType, template, materialContent)
    );

    // 获取模型
    const model = await getModelFromConfig(config);

    // 绑定工具
    const modelWithTools = model.bindTools([
      {
        name: "compress_material",
        description:
          "压缩病例材料，提取关键信息并按照模版结构组织",
        schema: compressMaterialSchema,
      },
    ]);

    // 调用模型
    const response = await modelWithTools.invoke([
      systemMessage,
      userMessage,
    ]);

    // 解析工具调用
    if (
      response instanceof AIMessage &&
      response.tool_calls &&
      response.tool_calls.length > 0
    ) {
      const toolCall = response.tool_calls[0];
      const { compressedContent } = toolCall.args as z.infer<
        typeof compressMaterialSchema
      >;

      // 构建 ExtractedMaterial 对象
      const extractedMaterial: ExtractedMaterial = {
        type: reportType,
        compressedContent,
        template: reportType === "treatment" ? "治疗类" : "护理类",
        originalDocumentName: document.name,
        confidence: state.confidence,
        isUserConfirmed: state.needUserConfirmation
          ? false
          : state.confidence >= 0.7,
      };

      // 生成成功消息
      const successMessage = new AIMessage({
        content: `✅ 已成功处理病例材料！

**文档名称**: ${document.name}
**报告类型**: ${reportType === "treatment" ? "治疗类" : "护理类"}
**原始材料**: ${materialContent.length} 字
**压缩后**: ${compressedContent.length} 字
**压缩率**: ${Math.round((1 - compressedContent.length / materialContent.length) * 100)}%

材料已经提取并压缩完毕，现在您可以开始撰写病案报告了。`,
      });

      return {
        extractedMaterial,
        messages: [successMessage],
      };
    }

    // 如果没有工具调用，返回错误
    return {
      error: "模型未返回有效的压缩结果",
    };
  } catch (error) {
    console.error("Error in compressMaterial:", error);
    return {
      error: `压缩过程出错: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
