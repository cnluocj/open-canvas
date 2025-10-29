import { StateGraph, START, END } from "@langchain/langgraph";
import { MaterialProcessingAnnotation } from "./state";
import { classifyMaterial } from "./nodes/classifyMaterial";
import { askReportType } from "./nodes/askReportType";
import { compressMaterial } from "./nodes/compressMaterial";

/**
 * 材料处理子图
 *
 * 流程：
 * 1. classifyMaterial - 分类材料，判断是否为病例及报告类型
 * 2. 条件分支：
 *    - 如果不是病例材料 → END
 *    - 如果需要用户确认 → askReportType (暂不实现，直接使用最高置信度的类型)
 *    - 否则 → compressMaterial
 * 3. compressMaterial - 压缩材料
 * 4. END
 *
 * 注意：askReportType 需要用户交互，在第一版实现中暂时跳过，
 * 如果置信度不足，直接使用模型给出的最高置信度类型。
 */

const workflow = new StateGraph(MaterialProcessingAnnotation)
  .addNode("classifyMaterial", classifyMaterial)
  .addNode("askReportType", askReportType)
  .addNode("compressMaterial", compressMaterial)
  .addEdge(START, "classifyMaterial");

// 添加条件边：从 classifyMaterial 路由
workflow.addConditionalEdges("classifyMaterial", (state) => {
  // 如果不是病例材料，直接结束
  if (!state.isMedicalCase) {
    return END;
  }

  // 如果需要用户确认且报告类型未知
  // 注意：在第一版中，我们暂时跳过用户确认环节
  // 后续可以启用这个分支
  // if (state.needUserConfirmation && state.reportType === "unknown") {
  //   return "askReportType";
  // }

  // 如果报告类型已确定（即使置信度较低），直接压缩
  if (state.reportType !== "unknown") {
    return "compressMaterial";
  }

  // 兜底：如果类型未知，结束流程
  return END;
});

// askReportType 之后进入压缩（为后续扩展预留）
workflow.addEdge("askReportType", "compressMaterial");

// 压缩完成后结束
workflow.addEdge("compressMaterial", END);

/**
 * 编译后的子图
 */
export const materialProcessingGraph = workflow.compile();

// 导出类型供其他模块使用
export type { MaterialProcessingState, MaterialProcessingReturnType } from "./state";
