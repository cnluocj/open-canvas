import { OpenCanvasGraphAnnotation } from "../state.js";

/**
 * 材料注入的默认配置
 * Default configuration for material injection
 */
const DEFAULT_MATERIAL_INJECTION = {
  generate: true,  // 生成新文章时默认注入材料
  rewrite: true,   // 重写整篇时默认注入材料
  update: false,   // 更新部分时默认不注入（避免 token 浪费）
} as const;

/**
 * 判断在特定节点是否应该注入病例材料
 * Determines whether to inject extracted material content for a specific node type
 *
 * @param state - Graph state containing configuration
 * @param nodeType - The type of node ('generate', 'rewrite', 'update')
 * @returns true if material should be injected, false otherwise
 *
 * @example
 * ```typescript
 * if (shouldInjectMaterial(state, 'generate')) {
 *   systemMessages.push({
 *     role: "system",
 *     content: state.extractedMaterial.compressedContent
 *   });
 * }
 * ```
 */
export function shouldInjectMaterial(
  state: typeof OpenCanvasGraphAnnotation.State,
  nodeType: "generate" | "rewrite" | "update"
): boolean {
  // 如果没有提取的材料，则不注入
  if (!state.extractedMaterial) {
    return false;
  }

  // 根据节点类型读取对应的配置
  let configValue: boolean | undefined;
  switch (nodeType) {
    case "generate":
      configValue = state.injectMaterialOnGenerate;
      break;
    case "rewrite":
      configValue = state.injectMaterialOnRewrite;
      break;
    case "update":
      configValue = state.injectMaterialOnUpdate;
      break;
  }

  // 如果配置中有明确的值，使用配置值；否则使用默认值
  if (configValue !== undefined) {
    return configValue;
  }

  return DEFAULT_MATERIAL_INJECTION[nodeType];
}
