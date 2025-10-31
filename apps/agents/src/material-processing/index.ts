import { StateGraph, START, END } from "@langchain/langgraph";
import { MaterialProcessingAnnotation } from "./state";
import { compressMaterial } from "./nodes/compressMaterial";

/**
 * 材料处理子图（简化版）
 *
 * 流程：
 * START → compressMaterial → END
 *
 * 职责：
 * - 根据已确定的报告类型（reportType）压缩病例材料
 * - 使用对应的模板（治疗类/护理类）提取关键信息
 *
 * 注意：
 * - 报告类型由主图询问用户后确定，不在此子图中分类
 * - 输入要求：state.reportType 必须是 "treatment" 或 "nursing"
 */

const workflow = new StateGraph(MaterialProcessingAnnotation)
  .addNode("compressMaterial", compressMaterial)
  .addEdge(START, "compressMaterial")
  .addEdge("compressMaterial", END);

/**
 * 编译后的子图
 */
export const materialProcessingGraph = workflow.compile();

// 导出类型供其他模块使用
export type { MaterialProcessingState, MaterialProcessingReturnType } from "./state";
