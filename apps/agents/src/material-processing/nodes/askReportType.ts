import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import {
  MaterialProcessingReturnType,
  MaterialProcessingState,
} from "../state";

/**
 * 询问报告类型节点
 * 当无法确定报告类型时，生成消息询问用户
 *
 * 注意：这个节点会生成一条消息并中断流程，等待用户回复。
 * 在 LangGraph 中，需要配合 interrupt 机制使用。
 */
export const askReportType = async (
  state: MaterialProcessingState,
  _config: LangGraphRunnableConfig
): Promise<MaterialProcessingReturnType> => {
  try {
    const { classificationReasoning, confidence } = state;

    // 生成询问消息
    const questionMessage = new AIMessage({
      content: `我检测到您上传的文档是病例材料，但无法确定具体的报告类型（置信度：${Math.round(confidence * 100)}%）。

分析过程：
${classificationReasoning}

请问您需要撰写以下哪种类型的病案报告？

**1. 治疗类病案报告**
   - 关注疾病诊断、治疗方案、治疗效果
   - 包含详细的诊疗决策分析

**2. 护理类病案报告**
   - 关注护理评估、护理措施、护理效果
   - 包含护理诊断和护理计划

请回复"治疗类"或"护理类"。`,
    });

    return {
      messages: [questionMessage],
      // 注意：这里不设置 reportType，等待用户回复后再设置
    };
  } catch (error) {
    console.error("Error in askReportType:", error);
    return {
      error: `询问过程出错: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/**
 * 解析用户回复，更新报告类型
 * 这个函数在主 graph 中处理用户回复时调用
 */
export function parseUserReportTypeResponse(userResponse: string): {
  reportType: "treatment" | "nursing" | "unknown";
  isUserConfirmed: boolean;
} {
  const normalized = userResponse.trim().toLowerCase();

  if (
    normalized.includes("治疗") ||
    normalized.includes("treatment") ||
    normalized === "1"
  ) {
    return { reportType: "treatment", isUserConfirmed: true };
  }

  if (
    normalized.includes("护理") ||
    normalized.includes("nursing") ||
    normalized === "2"
  ) {
    return { reportType: "nursing", isUserConfirmed: true };
  }

  return { reportType: "unknown", isUserConfirmed: false };
}
