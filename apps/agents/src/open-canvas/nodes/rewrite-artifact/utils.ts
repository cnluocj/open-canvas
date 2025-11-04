import {
  getArtifactContent,
  isArtifactCodeContent,
} from "@opencanvas/shared/utils/artifacts";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ProgrammingLanguageOptions,
  TextHighlight,
  CodeHighlight,
} from "@opencanvas/shared/types";
import {
  OPTIONALLY_UPDATE_META_PROMPT,
  UPDATE_ENTIRE_ARTIFACT_PROMPT,
} from "../../prompts.js";
import { OpenCanvasGraphAnnotation } from "../../state.js";
import { z } from "zod";
import {
  OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA,
  ANALYZE_EDIT_SCHEMA,
} from "./schemas.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getModelFromConfig } from "../../../utils.js";
import { BaseMessage } from "@langchain/core/messages";

export const validateState = (
  state: typeof OpenCanvasGraphAnnotation.State
) => {
  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    throw new Error("No recent human message found");
  }

  return { currentArtifactContent, recentHumanMessage };
};

const buildMetaPrompt = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>
) => {
  const titleSection =
    artifactMetaToolCall?.title && artifactMetaToolCall?.type !== "code"
      ? `And its title is (do NOT include this in your response):\n${artifactMetaToolCall.title}`
      : "";

  return OPTIONALLY_UPDATE_META_PROMPT.replace(
    "{artifactType}",
    artifactMetaToolCall?.type
  ).replace("{artifactTitle}", titleSection);
};

interface BuildPromptArgs {
  artifactContent: string;
  memoriesAsString: string;
  isNewType: boolean;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
}

export const buildPrompt = ({
  artifactContent,
  memoriesAsString,
  isNewType,
  artifactMetaToolCall,
}: BuildPromptArgs) => {
  const metaPrompt = isNewType ? buildMetaPrompt(artifactMetaToolCall) : "";

  return UPDATE_ENTIRE_ARTIFACT_PROMPT.replace(
    "{artifactContent}",
    artifactContent
  )
    .replace("{reflections}", memoriesAsString)
    .replace("{updateMetaPrompt}", metaPrompt);
};

interface CreateNewArtifactContentArgs {
  artifactType: string;
  state: typeof OpenCanvasGraphAnnotation.State;
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>;
  newContent: string;
}

const getLanguage = (
  artifactMetaToolCall: z.infer<typeof OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA>,
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3 // Replace 'any' with proper type
) =>
  artifactMetaToolCall?.language ||
  (isArtifactCodeContent(currentArtifactContent)
    ? currentArtifactContent.language
    : "other");

export const createNewArtifactContent = ({
  artifactType,
  state,
  currentArtifactContent,
  artifactMetaToolCall,
  newContent,
}: CreateNewArtifactContentArgs): ArtifactCodeV3 | ArtifactMarkdownV3 => {
  const baseContent = {
    index: state.artifact.contents.length + 1,
    title: artifactMetaToolCall?.title || currentArtifactContent.title,
  };

  if (artifactType === "code") {
    return {
      ...baseContent,
      type: "code",
      language: getLanguage(
        artifactMetaToolCall,
        currentArtifactContent
      ) as ProgrammingLanguageOptions,
      code: newContent,
    };
  }

  return {
    ...baseContent,
    type: "text",
    fullMarkdown: newContent,
  };
};

/**
 * Analyze the user's edit request and extract specific, targeted edits.
 * Returns an array of edits that can be applied sequentially using smart editing.
 * If the request requires full regeneration, returns an empty edits array.
 */
export async function analyzeEditType({
  artifactContent,
  recentHumanMessage,
  config,
  contextDocumentMessages = [],
  conversationHistory = [],
  highlightedText,
  highlightedCode,
}: {
  artifactContent: string;
  recentHumanMessage: BaseMessage;
  config: LangGraphRunnableConfig;
  contextDocumentMessages?: BaseMessage[];
  conversationHistory?: BaseMessage[];
  highlightedText?: TextHighlight;
  highlightedCode?: CodeHighlight;
}): Promise<z.infer<typeof ANALYZE_EDIT_SCHEMA> | null> {
  const model = await getModelFromConfig(config, {
    temperature: 0,
    isToolCalling: true,
  });

  // Always provide full content to LLM to ensure extracted oldString can be matched
  // Modern LLMs can handle large contexts, and accuracy is more important than token cost
  const contentPreview = artifactContent;

  // Build highlighted content info if present
  let highlightedInfo = "";
  if (highlightedText) {
    highlightedInfo = `

**重要 - 用户选中了特定文字：**

用户在文档中选中了以下文字：
<selected-text>
${highlightedText.selectedText}
</selected-text>

选中的文字属于以下 markdown 块：
<markdown-block>
${highlightedText.markdownBlock}
</markdown-block>

**关键理解**：
用户选中了这段文字，说明他们的请求几乎肯定是要编辑这个特定部分。无论他们说"改得更好"、"详细点"、"润色"、"重写"还是其他任何指令，他们指的都是这段选中的文字，而不是整个文档。

你的 oldString 应该包含选中的文字（或包含它的 markdown 块）。只有当用户的请求明确提到要操作其他部分时（如"在这后面添加一段"），才提取其他部分的编辑。`;
  } else if (highlightedCode) {
    const selectedCode = artifactContent.slice(
      highlightedCode.startCharIndex,
      highlightedCode.endCharIndex
    );
    highlightedInfo = `

**重要 - 用户选中了特定代码：**

用户在代码中选中了以下内容（第 ${highlightedCode.startCharIndex}-${highlightedCode.endCharIndex} 字符）：
<selected-code>
${selectedCode}
</selected-code>

**关键理解**：
用户选中了这段代码，说明他们的请求几乎肯定是要编辑这个特定部分。无论他们说"优化"、"修复"、"添加注释"、"重构"还是其他任何指令，他们指的都是这段选中的代码，而不是整个文件。

你的 oldString 应该是（或包含）选中的代码。只有当用户的请求明确提到要操作其他部分时，才提取其他部分的编辑。`;
  }

  const analysisPrompt = `你正在分析用户的编辑请求，目标是从文档（代码或文本）中提取具体的、有针对性的编辑操作。

当前文档内容：
\`\`\`
${contentPreview}
\`\`\`${highlightedInfo}

你的任务：从用户的请求中提取具体的、有针对性的编辑。

**操作指南：**

1. **识别需要修改的内容**：分析用户的请求，识别文档中需要修改的具体部分。

2. **提取有针对性的编辑**：对于每个修改：
   - 提取文档中确切存在的原始文本（oldString）
   - 提供替换后的文本（newString）
   - 在目标文本前后至少包含 3 行上下文
   - 精确匹配空格和缩进
   - 确保每个 oldString 能唯一标识一个位置

3. **多处编辑**：如果用户的请求需要在多个位置进行修改：
   - 为每个位置返回一个编辑
   - 按文件中从上到下的顺序排列编辑（保持稳定性）
   - 每个编辑应该是独立的、不重叠的

4. **何时返回空编辑数组**：
   - 模糊的请求，没有具体目标（如"改得更好"、"优化一下"）
   - 影响超过 50% 内容的结构性修改
   - 需要完全重写或重组的请求
   - 无法在文档中识别具体位置时

**示例：**

适合有针对性编辑的：
- "让摘要部分更详细" → 提取摘要部分，提供增强版本
- "把变量 userName 改名为 currentUser" → 为每个出现位置提供一个编辑
- "给 fetchData 函数添加类型注解" → 为函数签名提供一个编辑
- "修复第 45 行的 bug" → 为该行及其上下文提供一个编辑

需要全文重写的（返回空编辑数组）：
- "用更好的方式重写"（太模糊）
- "完全重组代码结构" （架构性改变）
- "从基于类的方式转换为函数式" （影响整体结构）`;

  const modelWithTool = model.bindTools(
    [
      {
        name: "extract_edits",
        description:
          "从用户的请求中提取具体的、有针对性的编辑。如果需要全文重写，返回空数组。",
        schema: ANALYZE_EDIT_SCHEMA,
      },
    ],
    {
      tool_choice: "extract_edits",
    }
  );

  try {
    const result = await modelWithTool.invoke([
      ...contextDocumentMessages,
      { role: "user", content: analysisPrompt },
      ...conversationHistory,
      recentHumanMessage,
    ]);

    const analysis = result.tool_calls?.[0]
      ?.args as z.infer<typeof ANALYZE_EDIT_SCHEMA>;

    if (analysis) {
      console.log(
        `[Edit Analysis] Found ${analysis.edits.length} targeted edit(s). Reasoning: ${analysis.reasoning}`
      );
      analysis.edits.forEach((edit, index) => {
        console.log(`  Edit ${index + 1}: ${edit.explanation}`);
      });
    }

    return analysis || null;
  } catch (error) {
    console.warn("[Edit Analysis] Failed to analyze edit request:", error);
    return null;
  }
}
