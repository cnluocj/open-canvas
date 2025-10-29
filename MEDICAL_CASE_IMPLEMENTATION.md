# 病例材料智能处理功能 - 实现总结

## 📋 项目概述

为 Open Canvas 添加了病例材料智能处理功能，支持用户上传病例文档（特别是 Word 文档），自动识别报告类型（治疗类/护理类），并根据模版压缩提取关键信息。

## ✅ 已完成的工作

### 1. 前端 Word 文档支持 ✅

**文件**: `apps/web/src/lib/attachments.tsx`

- 安装并集成 `mammoth.js` 库
- 实现 `extractWordText()` 函数提取 Word 文档文本
- 在 `convertDocuments()` 中添加 Word 文档处理逻辑
- 支持 `.doc` 和 `.docx` 格式
- 提供用户友好的 toast 提示

### 2. 模版管理系统 ✅

**目录**: `packages/shared/src/templates/`

创建了完整的模版管理系统：

- `treatment-report.ts` - 治疗类病案报告模版
- `nursing-report.ts` - 护理类病案报告模版
- `index.ts` - 统一导出和工具函数

每个模版包含：
- 完整的报告结构说明
- 所需材料字段定义
- 字数要求配置

### 3. 类型定义 ✅

**文件**: `packages/shared/src/types.ts`

新增类型：

```typescript
// 报告类型
export type ReportType = "treatment" | "nursing" | "unknown";

// 压缩后的材料
export interface ExtractedMaterial {
  type: ReportType;
  compressedContent: string;
  template: string;
  originalDocumentName: string;
  confidence?: number;
  isUserConfirmed?: boolean;
}
```

### 4. Material-Processing 子图 ✅

**目录**: `apps/agents/src/material-processing/`

完整的材料处理子图实现：

#### 节点 (Nodes)

1. **classifyMaterial** - 智能分类
   - 分析文档前 1000 字符
   - 判断是否为病例材料
   - 识别报告类型（治疗类/护理类）
   - 返回置信度评分

2. **askReportType** - 用户交互
   - 当置信度 < 0.7 时询问用户
   - 生成友好的询问消息
   - 解析用户回复

3. **compressMaterial** - 材料压缩
   - 根据报告类型加载模版
   - 使用 LLM 提取关键信息
   - 按模版结构组织内容
   - 控制压缩后字数在 2000-4000 字

#### Prompts

- **classify.ts** - 专业的分类 prompt
  - 详细的判断标准
  - 置信度评估指南
  - 类型区分说明

- **compress.ts** - 结构化压缩 prompt
  - 压缩原则（完整性、结构化、数据优先）
  - 输出格式规范
  - 字数控制要求

#### 状态管理

`state.ts` 定义了完整的子图状态：
- documents: 原始文档
- reportType: 识别的类型
- confidence: 置信度
- needUserConfirmation: 是否需要确认
- isMedicalCase: 是否为病例
- extractedMaterial: 压缩结果
- messages: 交互消息
- error: 错误信息

#### Graph 流程

```
START → classifyMaterial → [条件分支]
                           ├─ 不是病例 → END
                           ├─ 需要确认 → askReportType → compressMaterial → END
                           └─ 已确定 → compressMaterial → END
```

### 5. 主 Graph 集成 ✅ (部分)

**文件**: `apps/agents/src/open-canvas/state.ts`

扩展了主 Graph 状态：
- `extractedMaterial`: 存储压缩后的材料
- `materialProcessingEnabled`: 启用材料处理标志

**文件**: `apps/agents/src/open-canvas/nodes/processMaterial.ts`

创建了材料处理调用节点（框架实现）

### 6. 配置注册 ✅

**文件**: `langgraph.json`

注册了新的子图：
```json
{
  "material_processing": "./apps/agents/src/material-processing/index.ts:materialProcessingGraph"
}
```

### 7. 构建验证 ✅

- 所有代码通过 TypeScript 编译
- Next.js 构建成功
- 没有引入新的错误

## 🔄 待完成的工作

### 1. 完整的主 Graph 集成 ⏳

**需要做的**：

1. 在 `mainAgent` 中添加材料处理检测逻辑
   - 检测是否有新上传的 Word/PDF 文档
   - 判断是否需要触发材料处理

2. 完善 `processMaterial` 节点
   - 使用 LangGraph SDK 或直接导入调用子图
   - 处理子图返回结果
   - 用压缩材料替换 Store 中的原始文档

3. 更新主 Graph 路由
   - 在 `apps/agents/src/open-canvas/index.ts` 中添加节点和边
   - 实现条件路由逻辑

**参考文件**：
- `apps/agents/src/open-canvas/nodes/mainAgent.ts` - 路由逻辑
- `apps/agents/src/open-canvas/index.ts` - Graph 定义

### 2. 附件存储优化 ⏳

**建议改进**：

当前附件使用 `assistantId` 作为 Store key，导致同一 Assistant 下的所有对话共享附件。

**推荐方案**：改为使用 `threadId` 作为 key，实现"附件跟着对话"。

**需要修改的文件**：
- `apps/agents/src/utils.ts`:
  - `createContextDocumentMessages()` 函数
  - `getContextDocuments()` 函数
  - 将 `assistantId` 改为 `threadId`

- `apps/web/src/contexts/AssistantContext.tsx`:
  - 上传文档时传递 `threadId`

### 3. 测试与验证 ⏳

**测试场景**：

1. **Word 文档上传测试**
   - 上传 `.docx` 文件
   - 验证文本提取是否正确
   - 检查 toast 提示

2. **材料分类测试**
   - 上传治疗类病例 → 识别为 treatment
   - 上传护理类病例 → 识别为 nursing
   - 上传非病例文档 → 识别为非医疗材料

3. **材料压缩测试**
   - 检查压缩后材料是否包含关键信息
   - 验证字数是否符合要求（2000-4000字）
   - 检查是否按模版结构组织

4. **端到端测试**
   - 上传病例 → 自动处理 → 基于压缩材料生成报告
   - 验证整个流程是否流畅

### 4. 用户交互优化 (可选) ⏳

当前实现在置信度不足时跳过了用户确认环节。如需启用：

1. 在子图中启用 `askReportType` 路由分支
2. 实现 interrupt 机制等待用户回复
3. 解析用户回复并更新 reportType

**参考**：LangGraph 的 interrupt/resume 模式

## 📁 文件清单

### 新增文件

```
packages/shared/src/
├── templates/
│   ├── treatment-report.ts     ✅ 治疗类模版
│   ├── nursing-report.ts        ✅ 护理类模版
│   └── index.ts                 ✅ 模版导出

apps/web/src/
└── components/ui/assistant-ui/attachment-adapters/
    └── word.ts                  ✅ Word 文档附件适配器

apps/agents/src/
├── material-processing/
│   ├── state.ts                 ✅ 子图状态
│   ├── index.ts                 ✅ 子图定义
│   ├── nodes/
│   │   ├── classifyMaterial.ts ✅ 分类节点
│   │   ├── askReportType.ts    ✅ 询问节点
│   │   └── compressMaterial.ts ✅ 压缩节点
│   └── prompts/
│       ├── classify.ts          ✅ 分类 prompt
│       └── compress.ts          ✅ 压缩 prompt
└── open-canvas/
    └── nodes/
        └── processMaterial.ts   ✅ 主 graph 调用节点 (框架)
```

### 修改文件

```
packages/shared/src/
└── types.ts                                    ✅ 添加 ReportType 和 ExtractedMaterial

apps/web/src/
├── lib/attachments.tsx                         ✅ 添加 Word 文档支持
├── contexts/GraphContext.tsx                   ✅ 移除未使用的导入
└── components/canvas/content-composer.tsx      ✅ 添加 Word 附件适配器

apps/agents/src/
└── open-canvas/state.ts                        ✅ 扩展状态字段

langgraph.json                                  ✅ 注册子图

package.json (apps/web)                         ✅ 添加 mammoth 依赖
```

## 🚀 下一步行动计划

### 立即行动（核心功能）

1. **完成主 Graph 集成** (2-3 小时)
   - 实现 `processMaterial` 节点的完整逻辑
   - 更新 `mainAgent` 路由检测
   - 集成到主 Graph 流程

2. **测试基本流程** (1-2 小时)
   - Word 文档上传和文本提取
   - 材料分类准确性
   - 压缩质量验证

### 后续优化（改进体验）

3. **附件存储优化** (1-2 小时)
   - 改为按 threadId 存储
   - 避免不同对话的材料混淆

4. **用户交互完善** (2-3 小时)
   - 启用低置信度时的用户确认
   - 优化 UI 提示和反馈

5. **质量提升** (持续)
   - 收集实际病例测试
   - 优化 prompt 提高分类和压缩质量
   - 根据用户反馈迭代

## 💡 技术亮点

1. **模块化设计**
   - 独立的子图设计，职责清晰
   - 可复用的模版管理系统
   - 灵活的类型定义

2. **智能处理**
   - LLM 驱动的材料分类
   - 结构化的信息提取
   - 自适应的置信度评估

3. **用户友好**
   - 自动化的材料处理流程
   - 清晰的进度反馈
   - 智能的类型识别

4. **可扩展性**
   - 易于添加新的报告类型
   - 模版系统支持自定义
   - 预留用户交互扩展点

## 🔧 开发注意事项

1. **模型选择**
   - 分类节点：建议使用快速模型（如 GPT-4-mini）
   - 压缩节点：建议使用高质量模型（如 GPT-4 或 Claude）

2. **Token 优化**
   - 压缩材料后替换原始文档可大幅节省 token
   - 压缩目标字数设置为 2000-4000 字较为合理

3. **错误处理**
   - 所有节点都实现了 try-catch 错误捕获
   - 错误信息会存储在 state.error 中
   - 建议在前端也添加相应的错误提示

4. **性能考虑**
   - Word 文档提取在前端完成，避免服务器压力
   - 大文档只读取前 1000 字符用于分类，提高速度
   - 压缩过程使用流式输出（如果模型支持）

## 📚 参考文档

- LangGraph 文档：https://langchain-ai.github.io/langgraph/
- Open Canvas 架构：`CLAUDE.md`
- Mammoth.js 文档：https://github.com/mwilliamson/mammoth.js

## 🎯 预期效果

用户体验流程：

1. 用户上传病例 Word 文档
2. 系统自动提取文本（前端 toast 提示）
3. 后台自动分类（治疗类/护理类）
4. 根据模版压缩材料（2000-4000字）
5. 用户可以直接请求："帮我写一份XX病案报告"
6. Agent 基于压缩材料快速生成结构化报告

## 👨‍💻 开发者

实现日期：2025-10-29
技术栈：TypeScript, LangGraph, LangChain, Next.js, Mammoth.js
