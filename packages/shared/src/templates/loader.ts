import * as fs from "fs";
import * as path from "path";
import type { ReportType } from "../types";

/**
 * 模板文件名映射
 * 将 ReportType 映射到实际的 .md 文件名
 */
const TEMPLATE_FILE_MAP: Record<ReportType, string> = {
  treatment: "治疗类病案报告通用模版.md",
  nursing: "护理类病案报告通用模版.md",
  unknown: "", // unknown 类型不对应任何文件
};

/**
 * 模板缓存
 * 启动时懒加载，加载后缓存到内存中
 */
const templateCache = new Map<ReportType, string>();

/**
 * 从文件系统加载模板内容
 * @param type 报告类型
 * @returns 模板内容字符串
 */
function loadTemplateFromFile(type: ReportType): string {
  const fileName = TEMPLATE_FILE_MAP[type];

  if (!fileName) {
    console.warn(`[Template Loader] No template file defined for type: ${type}`);
    return "";
  }

  try {
    // 从项目根目录的 template 文件夹读取
    // 当前文件位于: packages/shared/src/templates/loader.ts
    // 项目根目录位于: ../../../.. (向上4级)
    const templateDir = path.resolve(__dirname, "../../../../template");
    const templatePath = path.join(templateDir, fileName);

    // 同步读取文件（仅在首次调用时执行）
    const content = fs.readFileSync(templatePath, "utf-8");

    console.log(`[Template Loader] Successfully loaded template: ${fileName} (${content.length} chars)`);

    return content;
  } catch (error) {
    console.error(`[Template Loader] Failed to load template file: ${fileName}`, error);
    return "";
  }
}

/**
 * 获取模板内容（带缓存）
 * 首次调用时从文件加载，后续调用直接返回缓存
 * @param type 报告类型
 * @returns 模板内容字符串
 */
export function getTemplateContent(type: ReportType): string {
  // 如果已缓存，直接返回
  if (templateCache.has(type)) {
    return templateCache.get(type)!;
  }

  // 否则从文件加载
  const content = loadTemplateFromFile(type);

  // 缓存结果（包括空字符串，避免重复尝试加载失败的文件）
  templateCache.set(type, content);

  return content;
}

/**
 * 清除模板缓存（用于测试或热重载）
 * 生产环境通常不需要调用
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  console.log("[Template Loader] Template cache cleared");
}
