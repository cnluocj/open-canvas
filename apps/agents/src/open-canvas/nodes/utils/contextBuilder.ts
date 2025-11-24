import { BaseMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { ContextDocument, Source } from "@opencanvas/shared/types";
import { CONTEXT_DOCUMENTS_NAMESPACE, SOURCES_NAMESPACE } from "@opencanvas/shared/constants";

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

        // 将附件写入 Store，保证后续轮次仍能访问
        const store = config.store;
        const threadId = config.configurable?.thread_id;
        if (store && threadId) {
          await store.put(CONTEXT_DOCUMENTS_NAMESPACE, threadId, {
            documents,
          });
          console.log(
            `[contextBuilder] Stored ${documents.length} documents to store for thread ${threadId}`
          );
        }
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

  // 4. 获取并注入"来源"数据（持久化参考资料）
  let sources: Source[] = [];

  if (config.store && config.configurable?.thread_id) {
    try {
      console.log(`[contextBuilder] Attempting to load sources from namespace:`, SOURCES_NAMESPACE, `threadId:`, config.configurable.thread_id);
      const sourcesResult = await config.store.get(SOURCES_NAMESPACE, config.configurable.thread_id);
      sources = (sourcesResult?.value as any)?.sources || [];

      // 只使用启用的来源
      const enabledSources = sources.filter((s: Source) => s.enabled);

      if (enabledSources.length > 0) {
        console.log(`[contextBuilder] Found ${enabledSources.length} enabled sources`);

        const sourcesInfo = enabledSources
          .map((source: Source, idx: number) => {
            // 智能预览：根据内容长度决定展示策略
            const contentLength = source.content.length;
            let preview: string;

            if (contentLength <= 500) {
              // 短文本，全部展示
              preview = source.content;
            } else if (contentLength <= 5000) {
              // 中等长度，展示首尾
              preview = `${source.content.slice(0, 300)}\n... [省略约 ${Math.round((contentLength - 600) / 2)} 字] ...\n${source.content.slice(-300)}`;
            } else {
              // 长文本，只展示开头
              preview = `${source.content.slice(0, 500)}\n... [该来源共约 ${Math.round(contentLength / 2)} 字，此处仅显示预览。生成报告时完整内容会自动提供，无需额外操作] ...`;
            }

            let typeLabel = "";
            if (source.type === "file") {
              typeLabel = `文件（${source.metadata?.fileType || "未知类型"}）`;
            } else if (source.type === "link") {
              typeLabel = `网页（${source.metadata?.url || ""}）`;
            } else {
              typeLabel = "文本";
            }

            return `**来源 ${idx + 1}**: ${source.name}
- 类型：${typeLabel}
- 内容预览：
${preview}`;
          })
          .join("\n\n");

        const sourcesMessage = new SystemMessage(`📚 **用户提供的参考来源**（${enabledSources.length} 个）：

${sourcesInfo}

**重要说明**：
- 这些来源是用户添加的**持久参考资料**（可能包含病例、文献、指南、教材等）
- ✅ **内容已完全准备就绪，无需调用 process_material 或任何提取工具**
- ✅ **如果预览显示省略，完整内容会在生成报告时自动提供，无需额外操作**
- 可以直接在生成报告时参考这些来源（但不应直接复制，而应结合医学知识综合生成）
- 如果用户明确要求基于某个来源生成内容，应优先使用该来源
- 如果有多个来源冲突，应向用户说明并询问偏好
- **注意**：这些来源与"检测到用户上传的病例文档"不同——病例文档需要通过 process_material 提取，而来源已可直接使用`);

        messages.push(sourcesMessage);
      }
    } catch (error) {
      console.error("[contextBuilder] Error loading sources:", error);
    }
  }

  // 5. 如果材料已经提取并压缩，注入简短提示（节省 token）
  if (state.extractedMaterial) {
    const materialTypeName = state.extractedMaterial.type === "treatment" ? "治疗类" : "护理类";
    const charCount = state.extractedMaterial.compressedContent.length;

    const materialContext = `📎 **已提取病例材料**
- 文档：${state.extractedMaterial.originalDocumentName}
- 类型：${materialTypeName}病案
- 字数：约 ${Math.round(charCount / 1000)}k 字

*注：完整材料已在系统中，生成报告时会自动使用，无需重复提取或询问。*`;

    messages.push(new SystemMessage(materialContext));
    console.log("[contextBuilder] Injected brief material summary into context");
  }

  // 6. 如果用户选中了文字，添加选中信息
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

  // 7. 添加最近的对话历史（最多 10 条，避免上下文过长）
  const recentMessages = state._messages.slice(-10);
  messages.push(...recentMessages);

  return messages;
}
