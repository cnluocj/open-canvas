import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphReturnType } from "../state";
import type { OpenCanvasGraphAnnotation } from "../state";
import { ContextDocument } from "@opencanvas/shared/types";
import { AIMessage } from "@langchain/core/messages";
import { CONTEXT_DOCUMENTS_NAMESPACE } from "@opencanvas/shared/constants";
import { materialProcessingGraph } from "../../material-processing/index.js";

/**
 * 处理病例材料节点
 *
 * 该节点的职责：
 * 1. 从 Store 获取用户上传的文档
 * 2. 调用 material-processing 子图进行材料压缩
 * 3. 将压缩后的材料存储到状态中
 */
export const processMaterial = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  try {
    const store = config.store;
    if (!store) {
      return {
        messages: [
          new AIMessage({
            content: "错误：无法访问文档存储",
          }),
        ],
      };
    }

    // 获取 threadId（用于按对话存储文档）
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      return {
        messages: [
          new AIMessage({
            content: "错误：缺少 thread_id",
          }),
        ],
      };
    }

    // 确保 reportType 已设置
    if (!state.reportType || state.reportType === "unknown") {
      console.log("[processMaterial] No report type set, routing to askReportType");
      return { next: "askReportType" };
    }

    // 从 Store 获取文档
    const documentsResult = await store.get(
      CONTEXT_DOCUMENTS_NAMESPACE,
      threadId
    );
    const documents: ContextDocument[] =
      (documentsResult?.value as any)?.documents || [];

    if (documents.length === 0) {
      return {
        messages: [
          new AIMessage({
            content: "没有找到上传的文档。",
          }),
        ],
        next: "mainAgent",
      };
    }

    console.log(
      `[processMaterial] Processing ${documents.length} documents with report type: ${state.reportType}`
    );

    // 调用 material-processing 子图进行压缩
    const result = await materialProcessingGraph.invoke(
      {
        documents,
        reportType: state.reportType,
      },
      config
    );

    if (result.error) {
      return {
        messages: [
          new AIMessage({
            content: `处理材料时出错：${result.error}`,
          }),
        ],
        next: "mainAgent",
      };
    }

    if (!result.extractedMaterial) {
      return {
        messages: [
          new AIMessage({
            content: "材料处理完成，但未能提取到有效信息。请检查上传的文档格式。",
          }),
        ],
        next: "mainAgent",
      };
    }

    // 成功提取材料
    const successMessage = new AIMessage({
      content: `已成功处理您的病例材料（${state.reportType === "treatment" ? "治疗类" : "护理类"}报告）。

现在可以开始撰写报告了。请告诉我：
- 报告医生姓名
- 所在医院
- 报告标题（可选）`,
    });

    return {
      messages: [successMessage],
      _messages: [successMessage],
      extractedMaterial: result.extractedMaterial,
      materialProcessingEnabled: true,
      next: "mainAgent", // 返回 mainAgent 继续对话
    };
  } catch (error) {
    console.error("Error in processMaterial:", error);
    return {
      messages: [
        new AIMessage({
          content: `处理材料时出错：${error instanceof Error ? error.message : String(error)}`,
        }),
      ],
      next: "mainAgent",
    };
  }
};
