/**
 * 病案报告模版导出
 */

import type { ReportType } from "../types";
import {
  TREATMENT_REPORT_TEMPLATE,
  TREATMENT_REPORT_REQUIRED_FIELDS,
  TREATMENT_REPORT_WORD_COUNT,
} from "./treatment-report";
import {
  NURSING_REPORT_TEMPLATE,
  NURSING_REPORT_REQUIRED_FIELDS,
  NURSING_REPORT_WORD_COUNT,
} from "./nursing-report";

export {
  TREATMENT_REPORT_TEMPLATE,
  TREATMENT_REPORT_REQUIRED_FIELDS,
  TREATMENT_REPORT_WORD_COUNT,
  NURSING_REPORT_TEMPLATE,
  NURSING_REPORT_REQUIRED_FIELDS,
  NURSING_REPORT_WORD_COUNT,
};

export type { ReportType };

/**
 * 获取指定类型的报告模版
 */
export function getReportTemplate(type: ReportType): string {
  switch (type) {
    case "treatment":
      return TREATMENT_REPORT_TEMPLATE;
    case "nursing":
      return NURSING_REPORT_TEMPLATE;
    default:
      return "";
  }
}

/**
 * 获取指定类型的报告字数要求
 */
export function getReportWordCount(type: ReportType) {
  switch (type) {
    case "treatment":
      return TREATMENT_REPORT_WORD_COUNT;
    case "nursing":
      return NURSING_REPORT_WORD_COUNT;
    default:
      return { total: { min: 3000, max: 6000 } };
  }
}
