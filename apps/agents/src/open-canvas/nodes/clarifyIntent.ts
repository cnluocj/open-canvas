import { AIMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import { getModelFromConfig } from "../../utils.js";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";

/**
 * When Smart Edit analysis returns empty edits (user intent is unclear),
 * this node generates a friendly clarification question to help the user
 * provide more specific instructions.
 */
export const clarifyIntent = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  // Get the reasoning from the previous analysis attempt
  const reasoning =
    state.smartEditAnalysisReasoning ||
    "The request was too vague to identify specific edits.";

  // Get current artifact outline for context
  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;

  let documentOutline = "";
  if (currentArtifactContent) {
    if (isArtifactMarkdownContent(currentArtifactContent)) {
      // Extract markdown headings for outline
      const markdown = currentArtifactContent.fullMarkdown;
      const headings = markdown.match(/^#{1,3}\s+.+$/gm) || [];
      documentOutline = headings.length
        ? `\n当前文档结构:\n${headings.slice(0, 10).join("\n")}`
        : "\n当前文档是纯文本格式。";
    } else {
      // For code artifacts
      documentOutline = `\n当前是代码文件,语言: ${currentArtifactContent.language}`;
    }
  }

  const clarificationPrompt = `你是一个智能编辑助手。用户刚才的编辑请求不够明确,你需要生成一个简短、友好的确认问题来帮助用户澄清意图。

分析结果:
${reasoning}
${documentOutline}

用户的原始请求在上下文中。

**你的任务:**
1. 基于分析结果,推测用户最可能想做什么
2. 生成一个自然、简短的确认问题(1-2句话)
3. 如果有多种理解,可以列出选项让用户选择

**风格要求:**
- 语气友好、自然
- 不要过于冗长或技术化
- 直接询问,不需要道歉或解释太多

**好的例子:**
- "我理解你想在文档末尾添加一个结论部分,是这样吗?"
- "你是想: 1) 在最后新增'结论'章节并总结前文内容 2) 还是修改现有某个部分?"
- "你希望在哪个位置添加讨论?是在结论之前,还是文档的最后?"

**不好的例子:**
- "抱歉,我无法理解你的请求,因为它太模糊了..." (太啰嗦,语气不好)
- "请提供更多细节" (太简短,没有帮助)

现在,请生成确认问题:`;

  const model = await getModelFromConfig(config, {
    temperature: 0.7, // Slightly higher for natural language generation
  });

  const recentUserMessage = state._messages[state._messages.length - 1];

  const response = await model.invoke([
    { role: "system", content: clarificationPrompt },
    recentUserMessage,
  ]);

  const clarificationMessage = new AIMessage({
    content: response.content as string,
  });

  console.log(
    `[Clarify Intent] Generated clarification: ${response.content}`
  );

  return {
    messages: [clarificationMessage],
    _messages: [clarificationMessage],
  };
};
