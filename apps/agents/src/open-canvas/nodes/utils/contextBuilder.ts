import { BaseMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";

/**
 * 构建发送给 mainAgent 的上下文消息
 *
 * @param state - 图状态
 * @param assistantPrompt - 从前端选择的助手的 system prompt
 * @returns 完整的上下文消息数组
 */
export function buildContextMessages(
  state: typeof OpenCanvasGraphAnnotation.State,
  assistantPrompt?: string
): BaseMessage[] {
  const messages: BaseMessage[] = [];

  // 1. 添加助手的 system prompt（如果有）
  if (assistantPrompt) {
    messages.push(new SystemMessage(assistantPrompt));
  }

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

  // 3. 如果用户选中了文字，添加选中信息
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

  // 4. 添加最近的对话历史（最多 10 条，避免上下文过长）
  const recentMessages = state._messages.slice(-10);
  messages.push(...recentMessages);

  return messages;
}
