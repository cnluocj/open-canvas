import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type {
  ContextDocument,
  ReportType,
  ExtractedMaterial,
} from "@opencanvas/shared/types";

/**
 * 材料处理子图状态
 */
export const MaterialProcessingAnnotation = Annotation.Root({
  /**
   * 原始文档列表
   */
  documents: Annotation<ContextDocument[]>({
    reducer: (_, newValue) => newValue,
    default: () => [],
  }),

  /**
   * 识别的报告类型
   */
  reportType: Annotation<ReportType>({
    reducer: (_, newValue) => newValue,
    default: () => "unknown" as ReportType,
  }),

  /**
   * 分类置信度 (0-1)
   */
  confidence: Annotation<number>({
    reducer: (_, newValue) => newValue,
    default: () => 0,
  }),

  /**
   * 是否需要用户确认报告类型
   */
  needUserConfirmation: Annotation<boolean>({
    reducer: (_, newValue) => newValue,
    default: () => false,
  }),

  /**
   * 是否为病例材料
   */
  isMedicalCase: Annotation<boolean>({
    reducer: (_, newValue) => newValue,
    default: () => false,
  }),

  /**
   * 分类推理过程
   */
  classificationReasoning: Annotation<string>({
    reducer: (_, newValue) => newValue,
    default: () => "",
  }),

  /**
   * 压缩后的材料
   */
  extractedMaterial: Annotation<ExtractedMaterial | undefined>({
    reducer: (_, newValue) => newValue,
    default: () => undefined,
  }),

  /**
   * 消息列表（用于与用户交互）
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, newValue) => prev.concat(newValue),
    default: () => [],
  }),

  /**
   * 错误信息
   */
  error: Annotation<string | undefined>({
    reducer: (_, newValue) => newValue,
    default: () => undefined,
  }),
});

export type MaterialProcessingState =
  typeof MaterialProcessingAnnotation.State;
export type MaterialProcessingReturnType = Partial<MaterialProcessingState>;
