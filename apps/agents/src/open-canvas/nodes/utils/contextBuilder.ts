import { BaseMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { ContextDocument } from "@opencanvas/shared/types";
import { CONTEXT_DOCUMENTS_NAMESPACE } from "@opencanvas/shared/constants";

/**
 * 构建发送给 mainAgent 的上下文消息
 *
 * @param state - 图状态
 * @param systemPrompt - 系统 prompt
 * @param config - LangGraph 运行配置（用于访问 store）
 * @returns 完整的上下文消息数组
 */
export async function buildContextMessages(
  state: typeof OpenCanvasGraphAnnotation.State,
  systemPrompt: string,
  config: LangGraphRunnableConfig
): Promise<BaseMessage[]> {
  const messages: BaseMessage[] = [];

  // 1. 添加系统 prompt
  messages.push(new SystemMessage(systemPrompt));

  // 2. 如果有 artifact，发送完整内容
  if (state.artifact?.contents?.length) {
    const currentContent = getArtifactContent(state.artifact);

    // 构建 artifact 上下文
    let artifactContext = "";
    if (currentContent.type === "text") {
      artifactContext = `当前文档:
<artifact type="text" title="${currentContent.title}">
${currentContent.fullMarkdown}
</artifact>`;
    } else if (currentContent.type === "code") {
      // 虽然当前项目主要是文本，但保留代码处理以防万一
      artifactContext = `当前代码:
<artifact type="code" language="${currentContent.language}" title="${currentContent.title}">
${currentContent.code}
</artifact>`;
    }

    messages.push(
      new AIMessage({
        content: artifactContext,
        additional_kwargs: { artifact_context: true },
      })
    );
  }

  // 3. 获取文档并注入附件元数据（双重检查：优先从消息，回退到 store）
  let documents: ContextDocument[] = [];

  // 3.1 优先从最新消息的 additional_kwargs 获取（第一轮上传时可用）
  if (state._messages.length > 0) {
    const recentUserMessage = state._messages[state._messages.length - 1];
    if (recentUserMessage.getType() === "human") {
      const messageDocuments = (recentUserMessage.additional_kwargs as any)?.documents as ContextDocument[] | undefined;
      if (messageDocuments && messageDocuments.length > 0) {
        documents = messageDocuments;
        console.log(`[contextBuilder] Found ${documents.length} documents in message additional_kwargs`);
      }
    }
  }

  // 3.2 回退到从 store 获取（后续轮次可用）
  if (documents.length === 0) {
    const store = config.store;
    const threadId = config.configurable?.thread_id;

    if (store && threadId) {
      const documentsResult = await store.get(
        CONTEXT_DOCUMENTS_NAMESPACE,
        threadId
      );
      documents = (documentsResult?.value as any)?.documents || [];
      if (documents.length > 0) {
        console.log(`[contextBuilder] Found ${documents.length} documents in store`);
      }
    }
  }

  // 3.3 如果找到文档，注入附件元数据
  if (documents.length > 0) {
    const attachmentInfo = documents
      .map((doc: ContextDocument, idx: number) => {
        const preview = doc.data.slice(0, 200); // 前 200 字符
        const wordCount = doc.data.split(/\s+/).length;
        const sizeKB = Math.round(doc.data.length / 1024);

        return `**附件 ${idx + 1}**: ${doc.name}
- 文件大小：${sizeKB} KB
- 字数：约 ${wordCount} 字
- 内容预览：${preview}...`;
      })
      .join("\n\n");

    const attachmentMessage = new SystemMessage(`检测到用户上传了 ${documents.length} 个病例文档：

${attachmentInfo}

**提示**：如需生成报告，请确保：
1. 已设置报告类型（set_report_type 工具）
2. 已提取材料（process_material 工具）
3. 调用 generate_report 工具生成`);

    messages.push(attachmentMessage);
  }

  // 4. 如果用户选中了文字，添加选中信息
  if (state.highlightedText) {
    const highlightInfo = `**重要**：用户在文档中选中了以下内容。

选中的文字：
<selected>
${state.highlightedText.selectedText}
</selected>

完整的 markdown 块（包含选中文字的上下文）：
<markdown-block>
${state.highlightedText.markdownBlock}
</markdown-block>

**关键理解**：用户选中了这部分文字，说明他们接下来的请求极大概率是针对这部分内容的操作（无论他们说"改一下"、"详细点"、"润色"、"补充"等等）。除非用户明确说明是要操作其他部分（如"在这后面添加一段"），否则应该默认操作选中的部分。`;

    messages.push(new SystemMessage(highlightInfo));
  } else if (state.highlightedCode && state.artifact?.contents?.length) {
    const currentContent = getArtifactContent(state.artifact);
    if (currentContent.type === "code") {
      const selectedCode = currentContent.code.slice(
        state.highlightedCode.startCharIndex,
        state.highlightedCode.endCharIndex
      );
      const highlightInfo = `**重要**：用户在代码中选中了以下内容。

选中的代码：
<selected>
${selectedCode}
</selected>

选中位置：第 ${state.highlightedCode.startCharIndex} 到 ${state.highlightedCode.endCharIndex} 字符

**关键理解**：用户选中了这部分代码，说明他们接下来的请求极大概率是针对这部分代码的操作（无论他们说"改一下"、"优化"、"重构"、"添加注释"等等）。除非用户明确说明是要操作其他部分，否则应该默认操作选中的部分。`;

      messages.push(new SystemMessage(highlightInfo));
    }
  }

  // 5. 添加最近的对话历史（最多 10 条，避免上下文过长）
  const recentMessages = state._messages.slice(-10);
  messages.push(...recentMessages);

  return messages;
}
