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

  // 3. 添加最近的对话历史（最多 10 条，避免上下文过长）
  const recentMessages = state._messages.slice(-10);
  messages.push(...recentMessages);

  return messages;
}
