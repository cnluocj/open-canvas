/**
 * 病案报告模版导出
 * 模板内容从项目根目录的 /template 文件夹动态加载
 */

import type { ReportType } from "../types";
import { getTemplateContent, clearTemplateCache } from "./loader";

export type { ReportType };

/**
 * 获取指定类型的报告模版
 * 首次调用时从 .md 文件加载，后续调用返回缓存
 */
export function getReportTemplate(type: ReportType): string {
  return getTemplateContent(type);
}

/**
 * 清除模板缓存（用于测试或开发环境热重载）
 * 生产环境通常不需要调用
 */
export function clearTemplateCache_() {
  return clearTemplateCache();
}
