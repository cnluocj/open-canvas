import { PROGRAMMING_LANGUAGES } from "@opencanvas/shared/constants";
import { z } from "zod";

export const OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA = z
  .object({
    type: z
      .enum(["text", "code"])
      .describe("The type of the artifact content."),
    title: z
      .string()
      .optional()
      .describe(
        "The new title to give the artifact. ONLY update this if the user is making a request which changes the subject/topic of the artifact."
      ),
    language: z
      .enum(
        PROGRAMMING_LANGUAGES.map((lang) => lang.language) as [
          string,
          ...string[],
        ]
      )
      .describe(
        "The language of the code artifact. This should be populated with the programming language if the user is requesting code to be written, or 'other', in all other cases."
      ),
  })
  .describe("Update the artifact meta information, if necessary.");

/**
 * Schema for a single edit operation.
 * Each edit represents one targeted replacement in the artifact.
 */
const SINGLE_EDIT_SCHEMA = z.object({
  oldString: z
    .string()
    .describe(
      "文档中需要被替换的确切原始文本。为了确保唯一性，在目标文本前后至少包含 3 行上下文。必须精确匹配空格和缩进。"
    ),
  newString: z
    .string()
    .describe(
      "替换 oldString 的新文本。必须保持与周围代码相同的结构和缩进风格。"
    ),
  explanation: z
    .string()
    .describe(
      "简要说明这个编辑的作用（例如：'将变量 X 重命名为 Y'、'给函数添加类型注解'、'更新摘要部分'）。"
    ),
});

/**
 * Schema for analyzing edit requests and extracting targeted edits.
 * The LLM should extract one or more specific edits from the user's request.
 * If the request is too vague or requires complete rewriting, return an empty array.
 */
export const ANALYZE_EDIT_SCHEMA = z
  .object({
    edits: z
      .array(SINGLE_EDIT_SCHEMA)
      .describe(
        "要应用的有针对性的编辑数组。每个编辑按顺序应用。如果请求需要全文重写（例如：模糊请求如'改得更好'、影响超过 50% 内容的结构性修改、或无法识别具体位置时），则返回空数组。"
      ),
    reasoning: z
      .string()
      .describe(
        "分析说明：为什么提取了这些特定的编辑，或者为什么需要全文重写（如果 edits 数组为空）。"
      ),
  })
  .describe(
    "分析用户的编辑请求并提取具体的、有针对性的编辑。如果需要全文重写，返回空的 edits 数组。"
  );
