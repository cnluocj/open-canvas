import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphReturnType } from "../state";
import type { OpenCanvasGraphAnnotation } from "../state";
import { ContextDocument } from "@opencanvas/shared/types";
import { AIMessage } from "@langchain/core/messages";
import { CONTEXT_DOCUMENTS_NAMESPACE } from "@opencanvas/shared/constants";

/**
 * 处理病例材料节点
 *
 * 该节点的职责：
 * 1. 从 Store 获取用户上传的文档
 * 2. 调用 material-processing 子图进行材料分类和压缩
 * 3. 将压缩后的材料存储到状态中
 * 4. 用压缩后的材料替换 Store 中的原始文档（节省 token）
 *
 * 注意：这是一个简化实现，实际应该：
 * - 使用 LangGraph SDK 调用子图
 * - 或者直接导入子图并在此处调用
 * 由于时间限制，这里提供基本框架
 */
export const processMaterial = async (
  _state: typeof OpenCanvasGraphAnnotation.State,
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
      };
    }

    // TODO: 调用 material-processing 子图
    // 这里需要使用 LangGraph SDK 或直接导入子图
    // 由于架构复杂性，暂时返回提示信息

    // 临时实现：生成提示信息
    const infoMessage = new AIMessage({
      content: `检测到您上传了 ${documents.length} 个文档：
${documents.map((doc, i) => `${i + 1}. ${doc.name} (${doc.type === "text" ? "文本" : "二进制"})`).join("\n")}

材料处理子图已配置，但需要完整的集成才能自动处理。

**下一步**：
1. 系统将自动分析文档是否为病例材料
2. 识别需要的报告类型（治疗类或护理类）
3. 根据模版提取和压缩关键信息

您现在可以开始描述您想要撰写的病案报告了。`,
    });

    return {
      messages: [infoMessage],
      materialProcessingEnabled: true,
    };
  } catch (error) {
    console.error("Error in processMaterial:", error);
    return {
      messages: [
        new AIMessage({
          content: `处理材料时出错：${error instanceof Error ? error.message : String(error)}`,
        }),
      ],
    };
  }
};
