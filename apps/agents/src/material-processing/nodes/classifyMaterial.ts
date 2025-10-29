import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { AIMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import {
  MaterialProcessingReturnType,
  MaterialProcessingState,
} from "../state";
import {
  CLASSIFY_MATERIAL_SYSTEM_PROMPT,
  CLASSIFY_MATERIAL_USER_PROMPT,
} from "../prompts/classify";
import { getModelFromConfig } from "../../utils";

/**
 * 分类工具的 schema
 */
const classifyMaterialSchema = z.object({
  isMedicalCase: z
    .boolean()
    .describe("是否为病例材料（包含患者医疗相关信息）"),
  reportType: z
    .enum(["treatment", "nursing", "unknown"])
    .describe(
      "报告类型：treatment-治疗类，nursing-护理类，unknown-无法判断"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("判断的置信度，0-1之间，1表示最高置信度"),
  reasoning: z
    .string()
    .describe("分类的推理过程，解释为什么做出这样的判断"),
});

/**
 * 分类材料节点
 * 分析上传的文档是否为病例材料，如果是则判断报告类型
 */
export const classifyMaterial = async (
  state: MaterialProcessingState,
  config: LangGraphRunnableConfig
): Promise<MaterialProcessingReturnType> => {
  try {
    // 获取文档
    const { documents } = state;

    if (!documents || documents.length === 0) {
      return {
        error: "没有提供文档",
        isMedicalCase: false,
      };
    }

    // 获取第一个文档（假设一次只处理一个病例文档）
    const document = documents[0];

    // 获取文档内容的前1000字符
    let content = document.data;
    if (content.length > 1000) {
      content = content.substring(0, 1000);
    }

    // 准备 prompts
    const systemMessage = new SystemMessage(CLASSIFY_MATERIAL_SYSTEM_PROMPT);
    const userMessage = new HumanMessage(
      CLASSIFY_MATERIAL_USER_PROMPT.replace(
        "{documentName}",
        document.name
      ).replace("{documentContent}", content)
    );

    // 获取模型
    const model = await getModelFromConfig(config);

    // 绑定工具
    const modelWithTools = model.bindTools([
      {
        name: "classify_medical_material",
        description: "分类病例材料，判断是否为病例以及报告类型",
        schema: classifyMaterialSchema,
      },
    ]);

    // 调用模型
    const response = await modelWithTools.invoke([
      systemMessage,
      userMessage,
    ]);

    // 解析工具调用
    if (
      response instanceof AIMessage &&
      response.tool_calls &&
      response.tool_calls.length > 0
    ) {
      const toolCall = response.tool_calls[0];
      const {
        isMedicalCase,
        reportType,
        confidence,
        reasoning,
      } = toolCall.args as z.infer<typeof classifyMaterialSchema>;

      // 判断是否需要用户确认（置信度 < 0.7）
      const needUserConfirmation = confidence < 0.7 && isMedicalCase;

      return {
        isMedicalCase,
        reportType,
        confidence,
        classificationReasoning: reasoning,
        needUserConfirmation,
      };
    }

    // 如果没有工具调用，返回未知
    return {
      isMedicalCase: false,
      reportType: "unknown",
      confidence: 0,
      classificationReasoning: "模型未返回有效的分类结果",
      error: "模型未返回有效的分类结果",
    };
  } catch (error) {
    console.error("Error in classifyMaterial:", error);
    return {
      error: `分类过程出错: ${error instanceof Error ? error.message : String(error)}`,
      isMedicalCase: false,
      reportType: "unknown",
      confidence: 0,
    };
  }
};
