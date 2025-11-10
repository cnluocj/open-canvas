/**
 * 模板注入工具
 * 用于在生成报告时将模板内容注入到 system prompt 中
 */

import { SystemMessage } from "@langchain/core/messages";
import { getReportTemplate } from "@opencanvas/shared/templates/index";
import type { ReportType } from "@opencanvas/shared/types";

/**
 * 获取报告模板 system message
 * @param reportType 报告类型（"treatment" | "nursing" | "unknown"）
 * @returns 模板 SystemMessage，如果类型无效则返回 null
 */
export function getTemplateMessage(reportType: ReportType): SystemMessage | null {
  // 检查报告类型是否有效
  if (!reportType || reportType === "unknown") {
    return null;
  }

  // 读取完整模板
  const template = getReportTemplate(reportType);

  // 如果模板为空，返回 null
  if (!template || template.trim().length === 0) {
    console.warn(`[templateInjection] 未找到 ${reportType} 类型的模板`);
    return null;
  }

  const label =
    reportType === "treatment" ? "治疗类" :
    reportType === "nursing" ? "护理类" :
    "检验类";

  // 构建模板 system message
  return new SystemMessage(`## 📋 报告写作模板（${label}病案报告）

${template}

---

## ⚠️ 重要说明

1. **严格遵循结构**：请按照上述模板的章节顺序和结构组织报告内容
2. **参考写作风格**：模板中的示例展示了专业的医学表述方式和详略程度，请参考学习
3. **使用占位符说明**：模板中的 [年龄]、[数值]、[剂量] 等是占位符示例，实际写作时应使用具体的病例数据
4. **保持术语规范**：使用标准医学术语和缩写，保持专业性
5. **确保完整性**：覆盖模板要求的所有必需章节，不要遗漏关键内容`);
}
