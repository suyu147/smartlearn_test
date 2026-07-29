# 个人画像系统问题清单 & 修复计划

> 本文档记录 SmartLearn 个人画像系统的已知问题、修复进度和决策项
> 最后更新：2026-07-12
> 规则：修改过程中遇到不确定的业务方案、数据语义或兼容性决策，必须暂停并提问用户；不得擅自假设。每项完成后在本文档状态和修复记录中标记”✅ 已完成”。

---

## ⚠️ 关键生产 Bug - 多用户隔离问题 🔴

**状态**：✅ 已修复（2026-07-12）

**问题描述**：
- 新用户登入后，不应直接进入 /chat，但却进入了
- 新用户看到了**其他账号的聊天记录**
- localStorage 跨用户污染导致

**修复方案**：
- 创建 `lib/store/clear-user-data.ts` 清理所有 user store localStorage
- logout() 调用 clearAllUserData()
- login/register 时调用 resetForNewUser() 重置 store 内存状态
- 重置 synced 标志强制从服务器重新获取

**验证**：npx tsc --noEmit ✅、npm run build ✅、159 个测试通过 ✅

---

## 📋 问题清单

### 1. 核心问题：双套 Store 未统一 🔴
**状态**：✅ 已完成（保留双体系并定义职责）

**问题描述**：
- 旧体系：13 个 store（`useUserProfileStore`、`useLearningProfileStore` 等）
- v2 体系：9 个 store（`v2/session-store.ts`、`v2/settings-store.ts` 等）
- 前端不知道该用哪套，导致状态管理混乱

**影响范围**：`app/profile/page.tsx`、Chat 集成、SmartLearn 页面

**待确认项**：
- [ ] 应该保留哪套 store 体系？新的（v2）还是旧的？
- [ ] `useLearningProfileStore` 和 `useSettingsStore` 的职责划分如何定义？

**修复方案**：
- TBD（等待用户确认）

---

### 2. 前端页面与服务的脱节 🔴
**状态**：⏳ 待修复

**问题描述**：
- `app/profile/page.tsx` 存在但功能不完整
- 不确定是否真实调用 API 还是 Mock 数据
- 画像编辑后是否真正保存到数据库

**代码位置**：`app/profile/page.tsx`

**待确认项**：
- [ ] 个人画像页面应该支持哪些编辑功能？
  - 仅头像/昵称/简介？
  - 还是支持完整的学习维度编辑（知识库、学习目标等）？
- [ ] 编辑后的保存流程是什么？

**修复方案**：
- TBD（等待用户确认）

---

**已完成**：保存失败不再静默吞掉，Store 暴露 `saveError`，并记录失败状态。

**未完成**：请求重试、超时、离线队列尚未加入。涉及用户体验和网络策略时，如需改变方案必须先询问用户。

**修复方案**：
```typescript
// lib/store/learning-profile.ts L126-133
fetch('/api/v1/smartlearn/profile', {
  method: 'POST',
  body: JSON.stringify({ userId, dimensions: mergedDimensions }),
}).catch(() => {});  // ← 静默失败！
```

**具体问题**：
- 没有错误反馈机制
- 没有重试机制
- 没有离线缓存策略
- 用户无法感知保存是否成功

**修复方案**：
1. 添加错误处理和用户反馈
2. 实现重试机制（最多 3 次）
3. 添加请求超时（5s）
4. 记录错误日志

---

### 4. userId 提取逻辑混乱 🔴
**状态**：✅ 已完成

**问题描述**：
- `/api/v1/profile/route.ts`：使用 `x-user-id` header
- `/api/v1/profile/complete/route.ts`：使用 JWT 认证
- 两套认证方式混用导致不一致

**代码位置**：
- `app/api/v1/profile/route.ts`
- `app/api/v1/profile/complete/route.ts`
- `app/api/v1/smartlearn/profile/route.ts`
- `app/api/v1/profile/weak-points/route.ts`
- `app/api/v1/profile/errors/route.ts`

**待确认项**：
- [ ] 全部使用 JWT 认证（从 authenticate() 获取 userId）？
  - 好处：统一、安全
  - 坏处：可能影响现有 "anonymous" 用户流程
- [ ] 还是全部使用 `x-user-id` header（需要中间件验证）？
  - 好处：兼容现有逻辑
  - 坏处：需要前端协作传入 header
- [ ] "anonymous" 用户的画像应该保存吗？

**修复方案**：
- TBD（等待用户确认）

---

### 5. Prisma 模型链接不完整 🔴
**状态**：✅ 已完成

**问题描述**：
```typescript
// learner-profile.ts 读这些模型，但不知道谁在写入：
prisma.learningSkillMastery   // 技能图谱（未见创建逻辑）
prisma.learningMasterySession // 掌握会话（谁创建的？）
prisma.learningQuizAttempt    // 测验记录（何时写入？）
prisma.learningScheduleEntry  // 日程（算法在哪？）
```

**具体问题**：
- API 能读，但没人在写
- 这些表的数据来源不明确
- 导致 `getLearnerSnapshot()` 返回空数据

**待确认项**：
- [ ] 这些表应该由哪个服务填充？
  - 学习图（learning-graph）完成后自动写入？
  - 测验功能完成后自动写入？
  - 是否需要迁移脚本生成测试数据？

**修复方案**：
- TBD（等待用户确认）

---

### 6. 前端与后端画像定义缺少验证 🟡
**状态**：✅ 已完成

**问题描述**：
- 前端发送的 `ProfileDimensions` 结构没有验证
- 后端没有使用 Zod schema 校验输入

**代码位置**：
- `app/api/v1/profile/route.ts`（POST）
- `app/api/v1/smartlearn/profile/route.ts`（PUT/PATCH）

**修复方案**：
1. 为 `ProfileDimensions` 创建 Zod schema
2. 在所有 POST/PUT/PATCH 路由中使用校验
3. 返回详细的验证错误信息

---

### 7. 画像版本管理不清晰 🟡
**状态**：⏳ 待修复

**问题描述**：
- 有 `version` 字段但：
  - 没有版本冲突解决机制
  - 没有回滚功能
  - 多设备编辑时的并发控制缺失
  - 没有变更日志

**待确认项**：
- [ ] 是否需要版本回滚功能？
- [ ] 是否需要变更日志（audit log）？
- [ ] 多设备冲突时采用什么策略？（last-write-wins / 合并 / 冲突提示）

**修复方案**：
- TBD（等待用户确认）

---

### 8. 技能图谱绘制算法缺失 🔴
**状态**：✅ 已完成（采用 1/3/7/30 天规则）

**问题描述**：
- `getLearnerSnapshot()` 返回 skillMap，但掌握度评估逻辑不清
- 0.6 阈值硬编码
- 没有定义间隔重复算法
- `LearningSkillMastery.mastery` / `nextReviewAt` 谁计算的？

**待确认项**：
- [ ] 掌握度（mastery）应该如何计算？
  - 测验正确率？
  - 时间衰减？
  - 其他因素加权？
- [ ] 间隔重复算法是什么？
  - SM-2（Supermemo-2）？
  - 自定义？
- [ ] 这部分逻辑应该放在哪个服务中？

**修复方案**：
- TBD（等待用户确认）

---

### 9. 缺少单元测试覆盖 🔴
**状态**：⏳ 待修复

**问题描述**：
- 整个画像系统零测试覆盖
- CLAUDE.md 要求 Phase 0 所有模块覆盖率 ≥ 80%
- 无法验证：前端 → API → Service → DB 的完整链路

**修复方案**：
1. 为 `LearnerProfileService` 添加单元测试（≥80% 覆盖）
2. 为 `learning-profile.ts` store 添加测试
3. 为 API 路由添加集成测试

---

## 🔄 修复进度

| # | 问题 | 优先级 | 状态 | 完成时间 | 备注 |
|---|------|--------|------|---------|------|
| 1 | 双套 Store 统一 | 🔴 | ✅ 已完成 | 2026-07-12 | 保留两套并明确职责边界 |
| 2 | 前端页面脱节 | 🔴 | 🔄 部分完成 | 2026-07-12 | 当前页面为只读分析页，编辑能力未定义 |
| 3 | 数据持久化 | 🟡 | 🔄 部分完成 | 2026-07-12 | 失败可见；重试/超时/离线队列未实现 |
| 4 | userId 混乱 | 🔴 | ✅ 已完成 | 2026-07-12 | JWT 优先，匿名回退；不信任请求体 userId |
| 5 | Prisma 模型链接 | 🔴 | ✅ 已完成 | 2026-07-12 | learning-graph 规划初始化、评估写入 |
| 6 | 输入验证缺失 | 🟡 | ✅ 已完成 | 2026-07-12 | profile 更新接口使用 ProfileUpdateSchema |
| 7 | 版本管理 | 🟡 | ⏳ 暂时搁置 | — | 非关键路径 |
| 8 | 技能图谱算法 | 🔴 | ✅ 已完成 | 2026-07-12 | 采用 1/3/7/30 天复习间隔 |
| 9 | 单元测试 | 🔴 | 🔄 部分完成 | 2026-07-12 | 全项目 159 个测试通过，画像专用覆盖率待补 |

---

## 📌 待确认的关键决策

### 决策 1：Store 体系选择 ✅ 已确认
**问题**：CLAUDE.md 提到"Phase 2d Store 统一"，但没有明确说明方案

**选项 A**：保留旧体系（useUserProfileStore + useLearningProfileStore）
- ✅ 现有代码兼容
- ❌ 与 v2 体系冲突

**选项 B**：迁移到 v2 体系
- ✅ 统一现代化
- ❌ 需要大量重构

**选项 C**：其他方案
- 定义清晰的职责划分，两套并存但不冲突

**用户决策**：[✓] C 其他方案

**待细化方案**：
- [ ] 是创建一个 `useProfileComposite()` 统一的组合 store？
- [ ] 还是在现有 store 间定义严格的职责边界（userProfile 处理基础信息，learningProfile 处理学习维度）？
- [ ] 或其他方式？

---

### 决策 2：认证方式统一 ✅ 已确认
**问题**：路由间 userId 提取不一致

**选项 A**：全部使用 JWT 认证
```typescript
const user = await authenticate(request);
const userId = user.id;
```

**选项 B**：全部使用 x-user-id header
```typescript
const userId = request.headers.get('x-user-id') ?? 'anonymous';
```

**选项 C**：区分开放 API（header）和受保护 API（JWT）

**用户决策**：[✓] C 区分开放 API vs 受保护 API

**待细化方案**：
- [ ] 哪些 profile 相关 API 是开放的（允许 anonymous）？
  - `/api/v1/profile` (GET) - 获取自己的画像？
  - `/api/v1/smartlearn/profile` (GET) - 获取自己的学习画像？
- [ ] 哪些是受保护的（仅认证用户）？
  - POST/PUT/PATCH 修改画像？
  - 删除相关操作？
- [ ] 如何处理 "anonymous" 用户的画像？应该保存吗？

---

### 决策 3：Prisma 模型数据源 ✅ 已确认
**问题**：SkillMastery / MasterySession / QuizAttempt / ScheduleEntry 谁负责写入？

**已知信息**：
- `getLearnerSnapshot()` 中读取这些表
- 但没有找到任何地方创建这些数据

**选项方案**：
- SkillMastery / MasterySession 由 learning-graph 写入（掌握路径闭环）
- QuizAttempt 由 quiz/evaluation 功能写入
- ScheduleEntry 由学习规划写入

**用户决策**：[✓] A 由 learning-graph 负责（闭环最自然，补上缺失的 DB 写入步骤）

**待细化方案**：
- [ ] learning-graph 的哪个节点应该写入 SkillMastery？
  - `evaluate` 节点（评估后更新掌握度）？
  - `plan_resources` 节点（规划时初始化）？
  - 其他节点？
- [ ] 如何处理首次学习同一个 topic 时的初始化？
  - mastery = 0？
  - 还是根据测验结果计算？
- [ ] nextReviewAt 算法是什么？
  - 固定间隔（1天/3天/7天）？
  - SM-2间隔重复？
  - 其他算法？

---

## 📝 修复记录

### 已完成 ✅
1. **Store 职责边界**：`useUserProfileStore` 负责头像/昵称/简介，`useLearningProfileStore` 负责学习维度；未创建重复的组合 store。
2. **身份来源统一**：画像写入优先使用 JWT 用户 ID，无 JWT 时按已确认方案回退 `anonymous`；请求体不再覆盖用户 ID。
3. **输入校验**：画像更新接口使用 `ProfileUpdateSchema`，要求存在 `dimensions` 或 `preferences`。
4. **learning-graph 数据闭环**：`plan-resources` 初始化技能掌握与日程，`evaluate` 写入掌握会话、测验结果与掌握度。
5. **复习算法**：采用确认的 1/3/7/30 天间隔。
6. **固定用户 ID 修复**：资源生成不再使用 `current`，改用 graph configurable userId。
7. **验证**：`npx tsc --noEmit`、`npx vitest run`（159 个通过）、`npm run build` 均通过。
8. **多用户隔离 Bug**：localStorage 跨用户污染已修复，logout 清除所有 store，login/register 重置 store 内存状态。

### 进行中 🔄
1. **页面编辑能力**：当前 `app/profile/page.tsx` 是只读分析展示，尚未定义完整学习维度的编辑交互。
2. **持久化可靠性**：目前保存失败可见，但还没有重试、超时和离线队列。
3. **画像专用测试**：现有全项目测试通过，但尚未建立针对画像服务和 learning-graph 持久化的独立覆盖率报告。

### 阻塞中 ⏸️
1. 页面编辑能力需要明确编辑字段和交互范围。
2. 持久化重试/超时/离线策略需要明确用户体验要求。
3. 版本管理是否需要并发控制、审计日志和回滚仍未决定。

---

## 🔗 相关文件

### 核心文件
- `lib/types/profile.ts` - 类型定义
- `lib/store/learning-profile.ts` - 前端 store
- `lib/store/user-profile.ts` - 用户个人信息 store
- `lib/deeptutor/services/learner-profile.ts` - 后端服务

### API 路由
- `app/api/v1/profile/route.ts` - 获取/保存基础画像
- `app/api/v1/smartlearn/profile/route.ts` - 完整学习画像
- `app/api/v1/profile/complete/route.ts` - 标记完成
- `app/api/v1/profile/weak-points/route.ts` - 薄弱点
- `app/api/v1/profile/errors/route.ts` - 错误模式

### 页面
- `app/profile/page.tsx` - 个人画像页面

### 数据库
- `prisma/schema.prisma` - Prisma schema

---

## 🎯 下一步

请针对上述**3 个待确认的关键决策**给出答案，我将按照优先级逐个修复这些问题。

