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
import { CLARIFY_INTENT_PROMPT } from "../prompts.js";

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

  const clarificationPrompt = CLARIFY_INTENT_PROMPT.replace(
    "{reasoning}",
    reasoning
  ).replace("{documentOutline}", documentOutline);

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
