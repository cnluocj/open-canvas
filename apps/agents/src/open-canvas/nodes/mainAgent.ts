import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import {
  getModelFromConfig,
  optionallyGetSystemPromptFromConfig,
} from "../../utils.js";
import { buildContextMessages } from "./utils/contextBuilder.js";

/**
 * 路由决策的 schema
 */
const RoutingDecisionSchema = z.object({
  action: z
    .enum(["chat", "generate", "update"])
    .describe(
      `路由决策规则：

- chat:
  1) 用户只是聊天、询问问题，不需要生成或修改文档
  2) 用户要求生成文档，但助手规则要求先收集信息，且当前信息不足（需要询问用户）

- generate:
  用户要求生成新文档，且满足以下所有条件：
  1) 当前没有文档（上下文中没有 <artifact> 标签），或要求生成全新内容
  2) 如果助手 prompt 规定了生成前的必要信息，这些信息已经在对话历史中出现

- update:
  当前已有文档（上下文中有 <artifact> 标签），且用户要求修改、更新、补充现有文档

**关键**:
1. 先查看第一条 SystemMessage（助手 prompt），检查是否有"必须先收集信息"的要求
2. 如果有此要求，检查对话历史中是否已包含这些信息
3. 信息不足时选择 chat，不要急于 generate`
    ),
  reasoning: z
    .string()
    .optional()
    .describe("决策的简短理由（可选，用于调试）"),
});

/**
 * 主 Agent 节点：智能路由和对话处理
 *
 * 功能：
 * 1. 分析用户意图
 * 2. 判断是对话、生成还是修改
 * 3. 对话情况直接返回，生成/修改情况路由到对应节点
 */
export const mainAgent = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  // 获取助手的 system prompt（从前端配置）
  const assistantPrompt = optionallyGetSystemPromptFromConfig(config);

  // 构建上下文消息
  const contextMessages = buildContextMessages(state, assistantPrompt);

  // 添加路由指令
  const hasArtifact = state.artifact?.contents?.length > 0;
  const routingInstruction = new SystemMessage(
    `你现在需要做路由决策。请按以下步骤仔细分析：

**第一步：检查助手规则**
- 上下文中的第一条 SystemMessage 是助手的 prompt
- 查看是否有"生成前必须收集某些信息"的要求
- 例如："生成报告前必须收集：患者姓名、年龄..."

**第二步：检查当前状态**
- 是否已有文档：${hasArtifact ? "是（有 <artifact> 标签）" : "否"}
- 如果助手要求收集信息，检查对话历史中是否已包含这些信息

**第三步：做出路由决策**

1. **chat** - 选择此路由当：
   - 用户只是聊天、询问问题，或
   - 用户要求生成，但助手规则要求的必要信息还未收集完整

2. **generate** - 选择此路由当：
   - 用户要求生成新文档，且
   - 没有现有文档（或要求全新内容），且
   - 满足助手规则的所有前置条件（如果有信息收集要求，信息已充足）

3. **update** - 选择此路由当：
   - 已有文档（有 <artifact> 标签），且
   - 用户要求"修改"、"更新"、"补充"、"调整"现有内容

**关键提醒**：
- 不要因为用户说"写"、"生成"就立即选择 generate
- 先检查助手是否规定了必须先收集的信息
- 信息不足时，应该选择 chat 去询问，而不是 generate

请仔细分析后给出决策和理由。`
  );

  // 获取模型并配置结构化输出
  const model = await getModelFromConfig(config, {
    temperature: 0.3, // 较低的温度以获得更一致的路由决策
  });

  const modelWithStructuredOutput =
    model.withStructuredOutput(RoutingDecisionSchema);

  // 调用模型进行路由决策（将路由指令放在最前面）
  const decision = await modelWithStructuredOutput.invoke([
    routingInstruction,
    ...contextMessages,
  ]);

  console.log(
    `[mainAgent] Has artifact: ${hasArtifact}, Routing decision: ${decision.action}${decision.reasoning ? `, Reasoning: ${decision.reasoning}` : ""}`
  );

  // 根据决策进行路由
  switch (decision.action) {
    case "chat": {
      // 对话场景：重新调用模型生成回复（不使用结构化输出）
      const chatModel = await getModelFromConfig(config, { temperature: 0.7 });
      const response = await chatModel.invoke(contextMessages);

      return {
        messages: [response],
        _messages: [response],
        next: undefined, // 不路由，流程结束
      };
    }

    case "generate": {
      // 生成新文档：路由到 generateArtifact 节点
      return {
        next: "generateArtifact",
      };
    }

    case "update": {
      // 修改现有文档：路由到 smartEditArtifact 节点进行智能编辑分析
      if (!state.artifact?.contents?.length) {
        // 如果没有 artifact 却要求修改，返回提示消息
        const errorMessage = new AIMessage(
          "目前还没有生成任何文档，无法进行修改。请先让我生成一份文档。"
        );
        return {
          messages: [errorMessage],
          _messages: [errorMessage],
          next: undefined,
        };
      }

      return {
        next: "smartEditArtifact",
      };
    }

    default: {
      // 理论上不应该到达这里
      console.error(`[mainAgent] Unknown action: ${decision.action}`);
      const fallbackMessage = new AIMessage(
        "抱歉，我无法理解你的请求，请重新表述。"
      );
      return {
        messages: [fallbackMessage],
        _messages: [fallbackMessage],
        next: undefined,
      };
    }
  }
};
