# 实现真实学习统计数据 API + 前端对接

## Context

首页 `app/home/page.tsx` 的"本周学习进度"卡片目前使用硬编码公式拼凑数据（如 `chatMessages.length * 2 + 6`），不反映真实学习情况。数据库中 `LearningQuizAttempt`、`LearningMasterySession`、`DtSession` 等表有真实数据，但从未被聚合查询过。需要新建 API 端点从数据库聚合真实统计，并更新前端使用。

## 变更文件

| 操作 | 文件                                         | 说明                      |
| -- | ------------------------------------------ | ----------------------- |
| 新建 | `lib/deeptutor/services/learning-stats.ts` | 服务层：封装所有 Prisma 聚合查询    |
| 新建 | `app/api/v1/stats/learning/route.ts`       | API 端点：GET 返回学习统计       |
| 修改 | `app/home/page.tsx`                        | 前端：调用真实 API，保留 fallback |

## Step 1: 新建 LearningStatsService

**文件**: `lib/deeptutor/services/learning-stats.ts`

* 定义 `LearningStatsResponse` 接口（minutes/answered/accuracy/days/sessions/activeSessions/knowledgeBases/totalDocs/memoryEntries/weeklyChange）

* 核心查询逻辑（全部按 userId 过滤，`Promise.all` 并行执行）：

  * **学习时长**: `$queryRaw` 查 `LearningMasterySession` 的 `SUM(completedAt - startedAt)`，转分钟；无数据时用 DtSession 数 × 5 估算

  * **答题数量**: `prisma.learningQuizAttempt.count()`

  * **正确率**: `count(correct=true) / count(all) * 100`，无答题记录时返回 0

  * **学习天数**: `$queryRaw` 查 `COUNT(DISTINCT DATE(createdAt))` from `learning_quiz_attempts`

  * **会话数/活跃会话**: `dtSession.count()` / 查有 running turn 的 distinct session

  * **知识库/文档数**: `dtKnowledgeBase.count()` / `_sum.documentCount`

  * **记忆条目**: `memoryEntry.count()`

  * **周变化**: 本周 vs 上周正确率差值（1位小数），上周无数据返回 0

* 单例模式 `getLearningStatsService()`，与项目现有 `getLearnerProfileService()` 模式一致

## Step 2: 新建 API 路由

**文件**: `app/api/v1/stats/learning/route.ts`

* 复用 `getUserId(request)` 模式（`x-user-id` header → fallback 'anonymous'）

* 返回 `{ success: true, data: stats }` 信封格式，`apiGet<T>()` 自动解包

* 错误处理与 `sessions/route.ts` 一致

## Step 3: 修改首页

**文件**: `app/home/page.tsx`

* 新增 `useState<LearningStats | null>(null)` + `useEffect` 调用 `apiGet<LearningStats>('/api/v1/stats/learning')`

* 保留原 mock 计算作为 fallback：`const stats = apiStats ?? fallbackStats`

* 周变化提示从硬编码改为使用 `stats.weeklyChange`，正负号分别显示"提升"/"下降"

* 移除不再需要的 `useChatStore`、`useMemoryStore` 导入（若其他位置也不使用）

## 验证

1. 启动 dev server，`curl http://localhost:3000/api/v1/stats/learning` 确认返回格式
2. 打开首页，检查进度卡片数字是否为数据库真实值
3. 无数据的新用户应显示 0（而非 mock 假数据）
4. API 不可用时，页面 fallback 到当前 mock 值，不会白屏

