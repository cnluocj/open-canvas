import { LangGraphRunnableConfig } from "@langchain/langgraph";
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
import type { ExtractedMaterial } from "@opencanvas/shared/types";
import { countChineseCharacters } from "@opencanvas/shared/utils/text";

/**
 * 中文字数阈值：小于此值时无需调用 LLM 压缩
 */
const CHINESE_CHAR_THRESHOLD = 50000;

/**
 * 压缩材料节点
 * 智能压缩：中文字数 < CHINESE_CHAR_THRESHOLD 直接返回，≥ CHINESE_CHAR_THRESHOLD 调用 LLM 进行噪声过滤和关键信息提取
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
    const firstDocument = documents[0];
    const materialContent = firstDocument.data;

    // 统计中文字数
    const chineseCharCount = countChineseCharacters(materialContent);

    // 如果中文字数少于阈值，直接返回原内容
    if (chineseCharCount < CHINESE_CHAR_THRESHOLD) {
      const extractedMaterial: ExtractedMaterial = {
        type: reportType,
        compressedContent: materialContent, // 直接使用原内容
        template: reportType === "treatment" ? "治疗类" : "护理类",
        originalDocumentName: firstDocument.name,
        confidence: state.confidence,
        isUserConfirmed: state.needUserConfirmation
          ? false
          : state.confidence >= 0.7,
      };

      const skipMessage = new AIMessage({
        content: `✅ 已处理病例材料！

**文档名称**: ${firstDocument.name}
**报告类型**: ${reportType === "treatment" ? "治疗类" : "护理类"}
**中文字数**: ${chineseCharCount} 字
**处理方式**: 内容较短，无需压缩，直接使用

材料已准备就绪，现在您可以开始撰写病案报告了。`,
      });

      return {
        extractedMaterial,
        messages: [skipMessage],
      };
    }

    // 中文字数 >= 5000，调用 LLM 进行压缩
    console.log(`[compressMaterial] 中文字数 ${chineseCharCount} 字，开始调用 LLM 压缩...`);

    // 准备 prompts（不再使用模板）
    const systemMessage = new SystemMessage(COMPRESS_MATERIAL_SYSTEM_PROMPT);
    const userMessage = new HumanMessage(
      getCompressMaterialUserPrompt(reportType, materialContent)
    );

    // 获取模型
    const model = await getModelFromConfig(config);

    // 直接调用模型，不使用工具绑定
    const response = await model.invoke([systemMessage, userMessage]);

    // 获取压缩后的内容
    const compressedContent = response.content as string;

    // 验证返回内容
    if (!compressedContent || compressedContent.trim().length === 0) {
      return {
        error: "模型未返回有效的压缩结果",
      };
    }

    // 统计压缩后的中文字数
    const compressedChineseCharCount = countChineseCharacters(compressedContent);

    // 构建 ExtractedMaterial 对象
    const extractedMaterial: ExtractedMaterial = {
      type: reportType,
      compressedContent,
      template: reportType === "treatment" ? "治疗类" : "护理类",
      originalDocumentName: firstDocument.name,
      confidence: state.confidence,
      isUserConfirmed: state.needUserConfirmation
        ? false
        : state.confidence >= 0.7,
    };

    // 计算压缩率（基于中文字数）
    const compressionRate = Math.round(
      (1 - compressedChineseCharCount / chineseCharCount) * 100
    );

    // 生成成功消息
    const successMessage = new AIMessage({
      content: `✅ 已成功压缩病例材料！

**文档名称**: ${firstDocument.name}
**报告类型**: ${reportType === "treatment" ? "治疗类" : "护理类"}
**原始字数**: ${chineseCharCount} 字（中文）
**压缩后**: ${compressedChineseCharCount} 字（中文）
**压缩率**: ${compressionRate}%

已完成噪声过滤和关键信息提取，现在您可以开始撰写病案报告了。`,
    });

    return {
      extractedMaterial,
      messages: [successMessage],
    };
  } catch (error) {
    console.error("Error in compressMaterial:", error);
    return {
      error: `压缩过程出错: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
