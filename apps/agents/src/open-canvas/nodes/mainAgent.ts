import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import { getModelFromConfig } from "../../utils.js";
import { buildContextMessages } from "./utils/contextBuilder.js";

/**
 * 病案报告助手的系统 Prompt（硬编码）
 */
const MEDICAL_REPORT_SYSTEM_PROMPT = `你是一个专业的病案报告助手。

**核心职责**：
1. 收集撰写报告所需的基础信息：
   - 报告医生姓名
   - 所在医院
   - 报告标题
   - 患者相关信息

2. 如果信息不完整，必须主动询问用户补充

3. 信息完整后，生成专业、规范的病案报告

**工作原则**：
- 保持专业、严谨的态度
- 确保报告内容准确、完整
- 使用规范的医疗术语`;

/**
 * 工具定义：只定义需要操作 artifact 的动作
 */
const tools = [
  {
    name: "generate_report",
    description: `生成新的病案报告。

**使用条件**：
- 上下文中没有 <artifact> 标签（即没有现有报告）
- 用户要求生成新报告
- 已收集到必要信息（医生、医院、标题等）

**注意**：如果上下文中已有 <artifact> 标签包裹的报告内容，不要使用此工具！应该使用 update_report 工具。`,
    schema: z.object({
      reportType: z
        .string()
        .optional()
        .describe("报告类型（如果用户指定了具体类型）"),
    }),
  },
  {
    name: "update_report",
    description: `修改现有的病案报告内容。

**使用条件**：
- 上下文中有 <artifact> 标签包裹的报告内容
- 用户要求"修改"、"更新"、"改写"、"调整"、"补充"报告

**注意**：如果上下文中没有 <artifact> 标签（没有现有报告），不要使用此工具！应该询问用户信息或使用 generate_report 工具。`,
    schema: z.object({
      updateIntent: z.string().describe("用户想如何修改报告的简要描述"),
    }),
  },
];

/**
 * 主 Agent 节点：智能对话和工具调用
 *
 * 功能：
 * 1. 与用户对话，收集报告所需信息
 * 2. 信息充足时调用 generate_report 工具生成报告
 * 3. 有报告后可调用 update_report 工具修改报告
 * 4. 没有工具调用时直接返回对话内容（一次 LLM 调用完成）
 */
export const mainAgent = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  // 构建上下文消息（使用硬编码的系统 prompt）
  const contextMessages = buildContextMessages(state, MEDICAL_REPORT_SYSTEM_PROMPT);

  // 添加当前状态提示，帮助模型选择正确的工具
  const hasArtifact = state.artifact?.contents?.length > 0;
  const statusMessage = new SystemMessage(
    hasArtifact
      ? `**当前状态**：已有病案报告（上下文中的 <artifact> 内容）。如果用户要求修改、更新、调整报告，请使用 update_report 工具。`
      : `**当前状态**：尚未生成报告。如果用户提供了完整信息并要求生成报告，请使用 generate_report 工具。`
  );
  contextMessages.push(statusMessage);

  console.log(
    `[mainAgent] Current state: ${hasArtifact ? "Has report" : "No report"}`
  );

  // 快速路径：如果用户选中了文本/代码，直接路由到对应的更新节点
  if (state.highlightedText) {
    console.log(
      "[mainAgent] User has selected text, routing directly to updateHighlightedText"
    );
    return { next: "updateHighlightedText" };
  }

  if (state.highlightedCode) {
    console.log(
      "[mainAgent] User has selected code, routing directly to updateArtifact"
    );
    return { next: "updateArtifact" };
  }

  // 获取模型并绑定工具
  const model = await getModelFromConfig(config, {
    temperature: 0.7, // 使用适合对话的温度
  });

  const modelWithTools = model.bindTools(tools, {
    tool_choice: "auto", // 让模型自主决定是否调用工具
  });

  // 调用模型（一次调用完成决策或生成回复）
  const response = await modelWithTools.invoke(contextMessages);

  // 判断是否有工具调用
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolCall = response.tool_calls[0];
    const hasArtifact = state.artifact?.contents?.length > 0;

    console.log(
      `[mainAgent] Tool called: ${toolCall.name}, Has artifact: ${hasArtifact}`
    );

    switch (toolCall.name) {
      case "generate_report":
        // 生成报告：路由到 generateArtifact 节点
        return { next: "generateArtifact" };

      case "update_report":
        // 更新报告
        if (!hasArtifact) {
          // 如果没有 artifact 却要求修改，返回提示
          const errorMessage = new AIMessage(
            "目前还没有生成报告，无法进行修改。请先让我生成一份报告。"
          );
          return {
            messages: [errorMessage],
            _messages: [errorMessage],
            next: undefined,
          };
        }

        // 路由到智能编辑节点分析修改意图
        console.log(
          "[mainAgent] Routing to smartEditArtifact for update analysis"
        );
        return { next: "smartEditArtifact" };

      default:
        console.error(`[mainAgent] Unknown tool: ${toolCall.name}`);
        const fallbackMessage = new AIMessage(
          "抱歉，我无法理解你的请求，请重新表述。"
        );
        return {
          messages: [fallbackMessage],
          _messages: [fallbackMessage],
          next: undefined,
        };
    }
  } else {
    // 没有工具调用 = 普通对话
    // response.content 包含模型的回复，直接返回
    console.log("[mainAgent] Chat response (no tool call)");
    return {
      messages: [response],
      _messages: [response],
      next: undefined, // 流程结束
    };
  }
};
