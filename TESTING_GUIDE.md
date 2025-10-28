# 测试指南：简化架构实施后的测试

## 架构变更总结

### 核心改动
1. **新增** `mainAgent` 节点 - 智能路由和对话处理
2. **恢复** `smartEditArtifact`, `clarifyIntent`, `updateArtifact`, `updateHighlightedText` - 精准编辑能力（old_string/new_string 替换）
3. **移除** `generatePath`, `replyToGeneralInput`, `rewriteCodeArtifactTheme` 等节点
4. **保留** `generateArtifact`, `rewriteArtifact`, `generateFollowup`, `cleanState`, `generateTitle`, `summarizer` 节点

### 新的图流程
```
START
  → mainAgent (路由决策)
    → [chat: 对话回复 → cleanState]
    → [generate: 生成新文档 → generateArtifact → generateFollowup → cleanState]
    → [update: 修改文档 → smartEditArtifact (分析编辑)]
      → [精准编辑 → updateHighlightedText/updateArtifact → 检查剩余编辑 → generateFollowup]
      → [模糊请求 → clarifyIntent → cleanState]
      → [需要全文重写 → rewriteArtifact → generateFollowup]
  → cleanState
    → [generateTitle | summarizer | END]
```

### Smart Edit 工作流程

**精准编辑（old_string/new_string 替换）**：
1. mainAgent 判断为 "update" → 路由到 smartEditArtifact
2. smartEditArtifact 使用 LLM 分析用户请求，提取具体编辑
3. 使用 `performSmartEdit()` 进行智能模糊匹配和替换
4. 支持多次编辑（通过 remainingSmartEdits 循环）
5. 流式输出更新结果

**智能 Fallback**：
- 如果请求太模糊 → clarifyIntent（生成确认问题）
- 如果需要全文重写 → rewriteArtifact（完整重写）
- 如果分析失败 → rewriteArtifact（保底方案）

## 测试环境设置

### 1. 启动 LangGraph 服务器

```bash
# 在项目根目录
cd apps/agents
yarn dev

# 服务器应该运行在 http://localhost:54367
```

### 2. 启动前端开发服务器

```bash
# 在新的终端窗口，从项目根目录
cd apps/web
yarn dev

# 前端应该运行在 http://localhost:3000
```

## 助手 Prompt 配置示例

### 医学病案助手

在前端的助手配置中（或通过 API），设置以下 system prompt：

```
你是医学病案报告助手。

**信息收集规则**：
生成报告前必须收集以下信息：
- 患者姓名
- 患者年龄和性别
- 所在医院
- 主诉
- 现病史

**路由决策规则**：
- 如果缺少任何必要信息 → 在对话中询问用户，不要生成报告
- 如果信息充足 → 生成完整的病案报告
- 如果用户要求修改现有报告 → 修改报告
- 其他情况（闲聊、咨询等）→ 正常对话回复

**报告格式要求**：
使用标准医学术语，包含以下部分：
1. 患者基本信息
2. 主诉
3. 现病史
4. 既往史
5. 体格检查
6. 诊断
7. 治疗方案
```

### 法律文书助手

```
你是法律文书撰写助手。

**信息收集规则**：
生成文书前必须收集：
- 案件类型（民事/刑事/行政）
- 当事人信息
- 案件事实
- 诉讼请求

**路由决策规则**：
- 信息不全 → 对话询问
- 信息充足 → 生成文书
- 修改请求 → 修改文书
- 其他 → 正常对话

**文书格式**：
遵循法律文书规范，使用专业术语。
```

### 通用写作助手

```
你是通用写作助手，可以帮助用户撰写各类文档。

**工作方式**：
- 用户明确要求生成内容时 → 直接生成
- 需求不明确时 → 询问具体要求
- 修改请求 → 修改现有内容
- 其他情况 → 友好对话
```

## 测试场景

### 场景 1: 信息收集流程（医学助手）

1. 选择"医学病案助手"
2. 输入：`帮我写一份病案报告`
3. **预期**：mainAgent 返回对话询问："请问患者姓名？"
4. 输入：`张三`
5. **预期**：继续询问其他信息（年龄、性别、医院等）
6. 输入：`45岁，男性，主诉胸痛3天，XX市人民医院`
7. **预期**：
   - mainAgent 判断信息充足
   - 路由到 generateArtifact
   - 流式生成完整病案报告到右侧 artifact 区
   - generateFollowup 生成友好的跟进消息

### 场景 2: 直接生成（信息充足）

1. 输入：`帮我写一份病案报告，患者张三，45岁男性，XX市人民医院，主诉胸痛3天，现病史：患者3天前无明显诱因出现胸痛...`
2. **预期**：
   - mainAgent 判断信息已足够
   - 直接路由到 generateArtifact
   - 生成报告

### 场景 3: 精准编辑（Smart Edit）

1. （前提：已有生成的报告）
2. 输入：`补充一下既往史部分，添加：患者既往有高血压病史5年`
3. **预期**：
   - mainAgent 判断为修改操作
   - 路由到 smartEditArtifact
   - LLM 分析并提取编辑：找到"既往史"部分，添加内容
   - 使用 smart edit 进行精准替换
   - 流式输出更新后的报告
   - 只修改"既往史"部分，其他部分保持不变

### 场景 3.1: 多处编辑

1. 输入：`把患者姓名改为李四，年龄改为50岁`
2. **预期**：
   - smartEditArtifact 提取两个编辑
   - 第一次编辑：替换姓名
   - 循环回到 smartEditArtifact
   - 第二次编辑：替换年龄
   - 生成 followup 消息

### 场景 3.2: 模糊编辑请求

1. 输入：`改得更好一点`
2. **预期**：
   - mainAgent 判断为修改操作
   - 路由到 smartEditArtifact
   - LLM 分析：请求太模糊，无法提取具体编辑
   - 路由到 clarifyIntent
   - 生成确认问题："你希望改进哪个部分？是主诉、现病史还是其他？"

### 场景 3.3: 需要全文重写

1. 输入：`完全重新组织这个报告的结构，按照国际标准格式`
2. **预期**：
   - mainAgent 判断为修改操作
   - 路由到 smartEditArtifact
   - LLM 分析：需要结构性改变，reasoning 包含 "restructure"
   - 检测到需要全文重写
   - 路由到 rewriteArtifact（而不是 clarifyIntent）
   - 完整重写报告

### 场景 4: 普通对话

1. 输入：`什么是高血压？`
2. **预期**：
   - mainAgent 判断为普通对话
   - 返回对话回复（不生成 artifact）

### 场景 5: 切换助手

1. 切换到"通用写作助手"
2. 输入：`帮我写一篇关于春天的散文`
3. **预期**：
   - 使用新助手的 prompt
   - 直接生成散文（无需信息收集）

## 验证要点

### 功能验证

- [ ] mainAgent 正确判断路由（chat/generate/update）
- [ ] 信息收集流程正确（多轮对话）
- [ ] 生成的 artifact 内容完整且格式正确
- [ ] **Smart Edit 精准编辑**：
  - [ ] 只修改目标部分，其他部分保持不变
  - [ ] 使用 old_string/new_string 模式进行替换
  - [ ] 支持多处编辑（循环处理 remainingSmartEdits）
  - [ ] 模糊匹配正常工作（处理空格、缩进差异）
- [ ] **Smart Edit Fallback**：
  - [ ] 模糊请求路由到 clarifyIntent
  - [ ] 全文重写请求路由到 rewriteArtifact
  - [ ] 分析失败时有合理的 fallback
- [ ] 助手 prompt 正确应用
- [ ] 流式输出正常工作（包括 clarifyIntent 节点）
- [ ] 跟进消息生成正确

### 性能验证

- [ ] 对话历史只保留最近 10 条（检查发送给 LLM 的消息）
- [ ] Artifact 完整内容正确发送给 mainAgent
- [ ] 长对话触发 summarizer（超过 30 万字符）
- [ ] 首次对话生成标题

### 错误处理

- [ ] 没有 artifact 时请求修改 → 返回提示消息
- [ ] 结构化输出失败 → fallback 处理
- [ ] LLM 调用失败 → 错误消息

## 调试技巧

### 查看 Console 日志

mainAgent 会输出路由决策：
```
[mainAgent] Routing decision: chat
[mainAgent] Routing decision: generate
[mainAgent] Routing decision: update (reason: ...)
```

### 检查发送给 LLM 的上下文

在 `contextBuilder.ts` 中添加日志：
```typescript
console.log("[contextBuilder] Messages count:", messages.length);
console.log("[contextBuilder] Has artifact:", !!state.artifact?.contents?.length);
```

### 使用 LangSmith 追踪

确保设置了 `LANGSMITH_API_KEY`，然后在 LangSmith Dashboard 查看：
- 每个节点的输入输出
- 路由决策的 reasoning
- LLM 调用的 tokens 使用

## 常见问题

### Q: mainAgent 总是返回 chat，不生成 artifact
**A**: 检查助手 prompt 是否明确说明何时调用 generate。可能需要调整 prompt 的措辞。

### Q: 生成的报告不符合格式要求
**A**:
1. 检查助手 prompt 中的格式要求是否清晰
2. 检查 `generateArtifact` 节点中的 prompt 组合是否正确

### Q: 修改功能不工作
**A**:
1. 确认有现有的 artifact
2. 检查 mainAgent 的路由决策（Console 日志）
3. 确认 `rewriteArtifact` 节点接收到正确的状态

### Q: 信息收集时 LLM 总是想生成，而不是询问
**A**: 在助手 prompt 中更明确地说明：
```
**重要**：如果缺少以下任何一项信息，你必须在对话中询问用户，千万不要尝试生成报告：
- 患者姓名
- 年龄性别
...
```

## 后续优化建议

1. **添加更多路由选项**：如果需要更细粒度的控制（如局部更新 vs 全文重写）
2. **动态上下文长度**：根据 artifact 大小动态调整保留的对话历史数量
3. **助手模板库**：在前端提供预设的助手 prompt 模板
4. **性能监控**：记录每次调用的 token 使用情况

## 文件修改清单

### 新增文件
- `apps/agents/src/open-canvas/nodes/mainAgent.ts`
- `apps/agents/src/open-canvas/nodes/utils/contextBuilder.ts`
- 本文件 (`TESTING_GUIDE.md`)

### 修改文件
- `apps/agents/src/open-canvas/index.ts` - 恢复 smart edit 节点到图结构
- `apps/agents/src/open-canvas/nodes/mainAgent.ts` - update 路由改为 smartEditArtifact
- `apps/agents/src/open-canvas/nodes/smartEditArtifact.ts` - 添加 fallback 逻辑
- `apps/agents/src/open-canvas/nodes/generate-artifact/index.ts` - 支持助手 prompt
- `apps/agents/src/open-canvas/nodes/rewrite-artifact/index.ts` - 支持助手 prompt
- `apps/web/src/contexts/GraphContext.tsx` - 已支持 clarifyIntent 和 mainAgent 流式输出
- `packages/evals/src/agent.int.test.ts` - 更新测试
- `packages/evals/src/highlights.ts` - 更新测试
- `TESTING_GUIDE.md` - 更新架构说明和测试场景

### 恢复的节点（重新加入图中）
- `smartEditArtifact.ts` - 分析用户编辑请求，提取 old_string/new_string 对
- `clarifyIntent.ts` - 当请求模糊时生成确认问题
- `updateArtifact.ts` - 使用 smart edit 更新代码 artifacts
- `updateHighlightedText.ts` - 使用 smart edit 更新文本 artifacts

### 移除的节点（未删除文件，但不再使用）
- `generate-path/` 目录及相关文件
- `replyToGeneralInput.ts`
- `rewriteCodeArtifactTheme.ts`
- `customAction.ts` （如不需要可移除）
