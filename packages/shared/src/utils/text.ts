/**
 * 文本处理工具函数
 */

/**
 * 统计文本中的中文字符数量
 * @param text 输入文本
 * @returns 中文字符数量（不包括标点、数字、字母、空格等）
 *
 * @example
 * countChineseCharacters("患者，男性，65岁") // 返回 7
 * countChineseCharacters("SpO₂ 95%") // 返回 0
 * countChineseCharacters("治疗方案：阿司匹林100mg") // 返回 5
 */
export function countChineseCharacters(text: string): number {
  if (!text) return 0;

  // 匹配所有汉字（包括扩展区）
  // \u4e00-\u9fff: 基本汉字
  // \u3400-\u4dbf: 扩展A区
  // \u{20000}-\u{2a6df}: 扩展B区（需要 u 标志）
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

  const matches = text.match(chineseRegex);
  return matches ? matches.length : 0;
}

/**
 * 统计文本中的总字符数（包括所有字符）
 * @param text 输入文本
 * @returns 总字符数
 */
export function countTotalCharacters(text: string): number {
  return text ? text.length : 0;
}

/**
 * 计算文本压缩率
 * @param originalLength 原始长度
 * @param compressedLength 压缩后长度
 * @returns 压缩率百分比（0-100）
 */
export function calculateCompressionRate(
  originalLength: number,
  compressedLength: number
): number {
  if (originalLength === 0) return 0;
  return Math.round((1 - compressedLength / originalLength) * 100);
}
