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
 * 病案报告助手的系统 Prompt（根据reportType动态生成）
 */
function getMedicalReportSystemPrompt(reportType?: string): string {
  const basePrompt = `你是一个专业的病案报告助手。

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

  if (reportType === "treatment") {
    return `${basePrompt}

**当前报告类型：治疗类病案报告**
- 重点关注：疾病诊断、治疗方案、治疗效果
- 包含内容：详细的诊疗决策分析、治疗过程记录
- 撰写视角：从治疗角度出发，展现医疗决策思路`;
  } else if (reportType === "nursing") {
    return `${basePrompt}

**当前报告类型：护理类病案报告**
- 重点关注：护理评估、护理措施、护理效果
- 包含内容：护理诊断、护理计划、护理实施记录
- 撰写视角：从护理角度出发，展现护理专业性`;
  }

  return basePrompt;
}

/**
 * 工具定义：让 AI 自主决策报告生成流程
 */
const tools = [
  {
    name: "set_report_type",
    description: `设置病案报告类型。

**使用时机**：
1. 用户明确提到报告类型（如"治疗类报告"、"护理类"）→ 直接调用设置
2. 需要生成报告但用户未提及类型 → 询问用户（不要调用直接询问）
3. 用户上传了病例文档但未说明用途 → 询问用户（不要调用直接询问）

**报告类型**：
- treatment（治疗类）：关注诊断、治疗方案和效果，医生视角
- nursing（护理类）：关注护理评估、措施和效果，护士视角

**重要**：相同病例可以写不同类型报告，取决于撰写视角。`,
    schema: z.object({
      reportType: z
        .enum(["treatment", "nursing"])
        .optional()
        .describe("如果用户明确说明类型，则传入；否则省略此参数（将询问用户）"),
    }),
  },
  {
    name: "process_material",
    description: `提取并压缩上传的病例材料中的关键信息。

**使用条件**（全部满足才能调用）：
- 检测到用户上传了病例文档（上下文中提到附件信息）
- reportType已设置（可先调用set_report_type）
- 尚未提取过材料（避免重复提取）

**功能**：
- 根据reportType使用对应模板提取关键信息
- 压缩长文档为结构化要点
- 提取的信息将在生成报告时自动使用

**注意**：
- 如果reportType未设置，应先调用set_report_type
- 提取过程需要一定时间，请告知用户正在处理`,
    schema: z.object({
      confirm: z.literal(true).describe("确认要提取材料（防止误触）"),
    }),
  },
  {
    name: "generate_report",
    description: `生成新的病案报告。

**前置条件**：
- 上下文中没有 <artifact> 标签（即没有现有报告）
- reportType必须已设置（可先调用set_report_type）
- 已收集到必要信息（医生、医院、标题等）

**使用条件**：
- 用户要求生成新报告
- 如果有上传的病例文档，应先调用process_material提取材料

**注意**：如果上下文中已有 <artifact> 标签包裹的报告内容，不要使用此工具！应该使用 update_report 工具。`,
    schema: z.object({}),
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
  // 构建上下文消息（使用动态生成的系统 prompt）
  const systemPrompt = getMedicalReportSystemPrompt(state.reportType);
  const contextMessages = await buildContextMessages(state, systemPrompt, config);

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
      case "set_report_type": {
        const { reportType } = toolCall.args as { reportType?: "treatment" | "nursing" };

        if (reportType) {
          // 用户明确说明了类型，直接设置
          const typeName = reportType === "treatment" ? "治疗类" : "护理类";
          const confirmMessage = new AIMessage(
            `好的，已设置报告类型为${typeName}。`
          );
          console.log(`[mainAgent] Report type set to: ${reportType}`);
          return {
            reportType,
            messages: [confirmMessage],
            _messages: [confirmMessage],
            next: undefined, // 继续对话，AI可以在下一轮继续调用其他工具
          };
        } else {
          // 用户未说明类型，询问用户
          const questionMessage = new AIMessage(`请问您需要撰写哪种类型的病案报告？

**1. 治疗类病案报告**
   - 关注疾病诊断、治疗方案、治疗效果
   - 从医生/治疗视角撰写

**2. 护理类病案报告**
   - 关注护理评估、护理措施、护理效果
   - 从护士/护理视角撰写

请告诉我"治疗类"或"护理类"。`);
          console.log("[mainAgent] Asking user for report type");
          return {
            messages: [questionMessage],
            _messages: [questionMessage],
            next: undefined,
          };
        }
      }

      case "process_material": {
        // 检查 reportType 是否已设置
        if (!state.reportType || state.reportType === "unknown") {
          const errorMessage = new AIMessage(
            "错误：提取材料前必须先设置报告类型，因为不同类型使用不同的提取模板。请先使用 set_report_type 工具。"
          );
          console.log("[mainAgent] process_material called but reportType not set");
          return {
            messages: [errorMessage],
            _messages: [errorMessage],
            next: undefined,
          };
        }

        // 路由到 processMaterial 节点（复用现有节点）
        console.log(`[mainAgent] Routing to processMaterial with reportType: ${state.reportType}`);
        return { next: "processMaterial" };
      }

      case "generate_report": {
        // 检查 reportType 是否已设置
        if (!state.reportType || state.reportType === "unknown") {
          const errorMessage = new AIMessage(
            "错误：生成报告前必须先设置报告类型。请使用 set_report_type 工具。"
          );
          console.log("[mainAgent] generate_report called but reportType not set");
          return {
            messages: [errorMessage],
            _messages: [errorMessage],
            next: undefined,
          };
        }

        // 生成报告：路由到 generateArtifact 节点
        console.log("[mainAgent] Routing to generateArtifact");
        return { next: "generateArtifact" };
      }

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
