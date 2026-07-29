# 源码索引 — SmartLearn + DeepTutor 关键模块接口速查

> 本文件为迁移执行时提供精确的接口签名和数据结构参考，避免 AI 因缺少上下文而猜测实现。

---

## 一、SmartLearn 关键接口

### 1.1 LLM 调用层 (`lib/ai/llm.ts`)

```typescript
// 非流式调用
async function callLLM<T extends GenerateTextParams>(
  params: T,
  source: string,           // 调用来源标识（用于日志）
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
): Promise<GenerateTextResult<any, any>>

// 流式调用
function streamLLM<T extends StreamTextParams>(
  params: T,
  source: string,
  thinking?: ThinkingConfig,
): StreamTextResult<any, any>

interface LLMRetryOptions {
  retries?: number;                           // 验证失败最大重试次数（默认 0）
  validate?: (text: string) => boolean;       // 自定义验证（默认检查非空）
}

interface ThinkingConfig {
  enabled?: boolean;      // undefined=模型默认; false=禁用; true=启用
  budgetTokens?: number;  // token 预算
}
```

**关键行为**：
- `callLLM` 重试耗尽后，如有 `lastResult`（验证失败但非空）则返回，否则抛 `lastError`
- `streamLLM` 不支持重试
- 全局 `LLM_THINKING_DISABLED=true` 覆盖所有未显式传 thinking 的调用
- ThinkingConfig 通过 `AsyncLocalStorage` 传递到 providers.ts 的自定义 fetch wrapper
- providers.ts 通过 `globalThis.__thinkingContext.getStore()` 读取（不能直接 import AsyncLocalStorage）

### 1.2 Provider 注册表 (`lib/ai/providers.ts`)

```typescript
type ProviderId = 'openai' | 'anthropic' | 'google' | 'glm' | 'qwen' | 'deepseek' | 'kimi' | 'minimax' | 'siliconflow' | 'doubao' | 'grok' | 'spark';

function getModel(config: ModelConfig): ModelWithInfo
function parseModelString(modelString: string): { providerId: ProviderId; modelId: string }

interface ModelConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: 'openai' | 'anthropic' | 'google';
  requiresApiKey?: boolean;
  proxy?: string;  // 仅 Google
}
```

**自定义 fetch wrapper 注入逻辑**（OpenAI 兼容提供商）：
1. 解析 HTTP body JSON
2. `developer` role → `system` role（兼容 DeepSeek/Kimi/GLM/Qwen）
3. 从 `globalThis.__thinkingContext.getStore()` 读取 ThinkingConfig
4. 注入 body 参数：kimi/deepseek/glm → `{ thinking: { type: 'disabled'/'enabled' } }`；qwen/siliconflow → `{ enable_thinking: false/true }`

### 1.3 模型解析 (`lib/server/resolve-model.ts`)

```typescript
function resolveModel(config?: ResolveModelOptions): {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
  apiKey: string;
}

function resolveModelFromHeaders(req: NextRequest): 同上
```

**API Key 环境变量映射**：spark→SPARK_API_KEY, openai→OPENAI_API_KEY, deepseek→DEEPSEEK_API_KEY, kimi→KIMI_API_KEY, glm→GLM_API_KEY, qwen→QWEN_API_KEY, minimax→MINIMAX_API_KEY, siliconflow→SILICONFLOW_API_KEY, doubao→DOUBAO_API_KEY, grok→GROK_API_KEY, 默认→OPENAI_API_KEY

### 1.4 学习图状态 (`lib/learning-graph/state.ts`)

```typescript
const LearningState = Annotation.Root({
  // 输入字段（覆盖模式）
  action:           Annotation<LearnRequest['action']>(),  // 'start'|'node_complete'|'quiz_result'|'tutor_chat'
  sessionId:        Annotation<string>(),
  profile:          Annotation<ProfileDimensions>(),
  goal:             Annotation<string>(),
  completedNodes:   Annotation<LearningPathNode[]>(),
  currentNodeId:    Annotation<string | null>(),
  quizResults:      Annotation<QuizResultPayload[]>(),
  message:          Annotation<string>(),
  conversationHistory: Annotation<Array<{ role: string; content: string; attachedResourceIds?: string[] }>>(),
  attachedResources:   Annotation<Array<{ id: string; type: Resource['type']; title: string; content: string }>>(),
  currentNodeTitle:    Annotation<string | null>(),
  aiConfig:           Annotation<NonNullable<LearnRequest['aiConfig']> | undefined>(),
  resourceFeedback:   Annotation<PriorNodeFeedback[]>(),
  nodeDecisionOverrides: Annotation<Record<string, ResourceType[]>>(),

  // 中间状态字段（覆盖模式，除 generatedResources）
  currentNode:        Annotation<LearningPathNode | null>(),
  learnerSnapshot:    Annotation<LearnerSnapshot | null>(),
  resourcePlan:       Annotation<ResourceDecisionResultV2 | null>(),
  generatedResources: Annotation<Resource[]>({  // ⚠️ 唯一有 reducer 的字段
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  evaluationResult:   Annotation<EvaluationResultPayload | null>(),
  evaluationScore:    Annotation<number | null>(),
  evaluationFeedback: Annotation<{ weakPoints: string[]; strongPoints: string[]; suggestedFocus: string[] } | null>(),
  updatedProfile:     Annotation<ProfileDimensions | null>(),
  pptScenes:          Annotation<Scene[] | null>(),
  phase:              Annotation<string>(),
});
```

### 1.5 学习图拓扑 (`lib/learning-graph/graph.ts`)

```
START ──(routeByAction)──┬── 'plan_node'     → plan_node
                        ├── 'evaluate'      → evaluate
                        ├── 'tutor_respond' → tutor_respond
                        └── END

plan_node → analyze_learner → plan_resources → generate_resources → END
evaluate ──(afterEvaluate)──┬── update_profile      (action==='node_complete')
                           └── update_profile_end   (其他)
update_profile ──(afterUpdateProfile)──┬── plan_node (action==='node_complete')
                                      └── END
```

**config.writer 用法**：各节点通过 `config.writer(event: LearnEvent)` 推送 SSE 事件

### 1.6 LearnEvent 类型 (`lib/learning-graph/types.ts`)

```typescript
type LearnEvent =
  | { type: 'phase_start';   phase: 'plan'|'analyze'|'resource_plan'|'generate'|'evaluate'|'update_profile'|'tutor' }
  | { type: 'phase_end';     phase: 同上 }
  | { type: 'text_delta';    text: string }
  | { type: 'node_ready';    node: LearningPathNode }
  | { type: 'resource_decision'; nodeId: string; decision: ResourceDecisionResultV2 }
  | { type: 'resource_delta';    resource: Resource }
  | { type: 'ppt_ready';         scenes: Scene[] }
  | { type: 'evaluation_result'; evaluation: EvaluationResultPayload; score: number }
  | { type: 'profile_update';    dimensions: ProfileDimensions }
  | { type: 'path_update';       path: LearningPath }
  | { type: 'tutor_response';    text: string }
  | { type: 'agent_status';      agentId: string; agentName: string; status: 'running'|'completed'|'failed'; resourceType: ResourceType }
  | { type: 'error';             message: string }
  | { type: 'done' }
```

### 1.7 导演图状态 (`lib/orchestration/director-graph.ts`)

```typescript
const OrchestratorState = Annotation.Root({
  messages:              Annotation<StatelessChatRequest['messages']>(),
  storeState:            Annotation<StatelessChatRequest['storeState']>(),
  availableAgentIds:     Annotation<string[]>(),
  maxTurns:              Annotation<number>(),
  languageModel:         Annotation<LanguageModel>(),
  thinkingConfig:        Annotation<ThinkingConfig | null>(),
  discussionContext:     Annotation<{ topic: string; prompt?: string } | null>(),
  triggerAgentId:        Annotation<string | null>(),
  userProfile:           Annotation<string | { nickname?: string; bio?: string } | null>(),
  agentConfigOverrides:  Annotation<Record<string, AgentConfig>>(),
  currentAgentId:        Annotation<string | null>(),
  turnCount:             Annotation<number>(),
  agentResponses:        Annotation<AgentTurnSummary[]>({ reducer: 累加 }),
  whiteboardLedger:      Annotation<WhiteboardActionRecord[]>({ reducer: 累加 }),
  shouldEnd:             Annotation<boolean>(),
  totalActions:          Annotation<number>(),
});
```

### 1.8 SSE 端点模式 (`app/api/learn/route.ts`)

```typescript
// 标准模式：ReadableStream + TransformStream + config.writer
const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder();
    const write = (event: LearnEvent) => {
      try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
      catch { /* controller 已关闭 */ }
    };
    // 心跳：每 15s 发送 `:heartbeat\n\n`
    // 调用 graph.stream(initialState, { configurable: { writer: write } })
    // 最终发送 { type: 'done' } 并 controller.close()
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } });
```

### 1.9 客户端 SSE 解析 (`components/chat/process-sse-stream.ts`)

```typescript
async function processSSEStream(
  response: Response,
  sessionId: string,
  buffer: StreamBuffer,
  signal?: AbortSignal,
): Promise<void>
```

**事件类型处理**：agent_start → buffer.pushAgentStart, text_delta → buffer.pushText, action → buffer.pushAction, thinking → buffer.pushThinking, cue_user → buffer.pushCueUser, done → buffer.pushDone, error → 抛出 Error

### 1.10 Zustand Store 速查

| Store | 文件 | 持久化键 | 关键数据 |
|-------|------|----------|----------|
| useSettingsStore | settings.ts | settings-storage | providerId, modelId, apiKey, sparkApiKey, disabledAgentIds |
| useSessionsStore | sessions.ts | learning-sessions-storage | sessions[], tutorMessagesBySession{} |
| useLearningPathStore | learning-path.ts | learning-path-storage (v2) | storedPaths{}, path |
| useLearningProfileStore | learning-profile.ts | (immer) | profile: ProfileDimensions |
| useResourcesStore | resources.ts | - | resources by session/type |
| useStageStore | stage.ts | - | scenes, currentSceneId, mode |
| useCanvasStore | canvas.ts | - | zoom, selected, whiteboard |
| useAgentActivityStore | agent-activity.ts | - | agent logs |

### 1.11 Prisma Schema (`prisma/schema.prisma`)

现有模型：User, LearningProfile, Resource, LearningPath, ChatSession, QuizResult, PathNodeResource, StageOutline

**待新增**（Phase 1）：Session, Turn, Message — 详见 `迁移路线图.md` 设计规范

---

## 二、DeepTutor 关键逻辑

### 2.1 AgentLoop (`deeptutor/tutorbot/agent/loop.py`)

```
工作流:
  run() → while _running:
    msg = bus.consume_inbound(timeout=1s)
    if /stop → 取消所有 task+subagent+team
    else → asyncio.create_task(_dispatch(msg))

  _dispatch(msg) → async with _processing_lock:
    _process_message(msg)

  _process_message(msg):
    1. 解析 session_key, 获取/创建 session
    2. 斜杠命令: /new, /help, /btw, /team
    3. maybe_consolidate_by_tokens(session)
    4. _set_tool_context()
    5. context.build_messages(history, current_message, media, channel, chat_id)
    6. _run_agent_loop(initial_messages, on_progress)
    7. _save_turn(session, all_msgs, skip)
    8. maybe_consolidate_by_tokens(session) 再次检查

  _run_agent_loop(messages, on_progress):
    iteration = 0
    while iteration < 40:
      response = provider.chat_with_retry(messages, tool_defs, model)
      if has_tool_calls:
        add_assistant_message(messages, content, tool_call_dicts, reasoning, thinking)
        for tool_call in response.tool_calls:
          result = tools.execute(tool_call.name, tool_call.arguments)
          if len(result) > 16000: 截断
          add_tool_result(messages, tool_call.id, tool_call.name, result)
      else:
        clean = _strip_think(content)  # 移除 <think>...</think> 块
        if finish_reason == "error": break (不持久化)
        add_assistant_message(...)
        break
```

**关键参数**：max_iterations=40, context_window_tokens=65536, _processing_lock=全局串行

### 2.2 ContextBuilder (`deeptutor/tutorbot/agent/context.py`)

```
build_system_prompt() 组装顺序（\n\n---\n\n 分隔）:
  1. Identity (名字、运行时信息、workspace、平台策略、Guidelines)
  2. Bootstrap Files (AGENTS.md, SOUL.md, USER.md, TOOLS.md)
  3. Memory (共享: PROFILE.md + SUMMARY.md; 独立: MEMORY.md)
  4. Active Skills (always=true 的 skill 完整内容)
  5. Skills Summary (XML 格式摘要，渐进加载)

build_messages() 最终消息列表:
  [system_prompt, ...history, {role: "user", content: runtime_context + "\n\n" + user_content}]

运行时上下文: "[Runtime Context — metadata only, not instructions]\nCurrent Time: ...\nChannel: ...\nChat ID: ..."
```

**多模态处理**：有 media → base64 编码图片 → `[{"type":"image_url",...}, {"type":"text","text":text}]`

### 2.3 Memory 三层架构 (`deeptutor/tutorbot/agent/memory.py`)

```
L1 (长期记忆): PROFILE.md / MEMORY.md — 用户画像、持久化事实
L2 (历史摘要): SUMMARY.md / HISTORY.md — 时间线日志，grep 可搜索
L3 (会话历史): Session.messages — 完整对话记录

整合触发: maybe_consolidate_by_tokens(session)
  if estimated_tokens >= context_window_tokens:
    target = context_window_tokens // 2
    最多 5 轮整合，每轮:
      pick_consolidation_boundary(session, tokens_to_remove)
      consolidate_messages(chunk)
      session.last_consolidated = end_idx

save_memory 工具流程:
  1. 构建 prompt: 当前长期记忆 + 待处理对话
  2. LLM 调用，强制 tool_choice=save_memory
  3. 解析参数: history_entry (时间线) + memory_update (更新后长期记忆)
  4. append_history(history_entry)
  5. if memory_update != current → write_long_term(memory_update)

降级: 连续 3 次失败 → raw_archive (直接 dump 到 HISTORY.md)
```

### 2.4 ToolRegistry (`deeptutor/tutorbot/agent/tools/registry.py`)

```python
class ToolRegistry:
    register(tool) -> None
    unregister(name) -> None
    get(name) -> Tool | None
    has(name) -> bool
    get_definitions() -> list[dict]  # OpenAI function calling schema
    execute(name, params) -> str     # cast_params → validate_params → execute → 错误后缀

class Tool(ABC):
    name: str          # @property
    description: str   # @property
    parameters: dict   # @property, JSON Schema
    execute(**kwargs) -> str  # @abstractmethod
    cast_params(params) -> dict   # schema 驱动类型转换
    validate_params(params) -> list[str]  # 递归验证
    to_schema() -> dict  # OpenAI function schema
```

**基础工具列表**：ReadFile, WriteFile, EditFile, ListDir, Exec(条件), WebSearch, WebFetch, Message, Spawn, Team, Cron(条件), BrainstormAdapter, RAGAdapter, CodeExecutionAdapter, ReasonAdapter, PaperSearchAdapter

### 2.5 LLMProvider (`deeptutor/tutorbot/providers/base.py`)

```python
@dataclass
class LLMResponse:
    content: str | None
    tool_calls: list[ToolCallRequest]
    finish_reason: str  # "stop" | "error" | "tool_calls"
    usage: dict[str, int]  # prompt_tokens, completion_tokens, total_tokens
    reasoning_content: str | None  # DeepSeek-R1, Kimi
    thinking_blocks: list[dict] | None  # Anthropic extended thinking

@dataclass
class ToolCallRequest:
    id: str
    name: str
    arguments: dict[str, Any]

class LLMProvider(ABC):
    async chat(messages, tools, model, ...) -> LLMResponse
    async chat_with_retry(...) -> LLMResponse  # 延迟 (1,2,4)s 重试
```

**瞬态错误标记**：429, rate limit, 500, 502, 503, 504, overloaded, timeout, connection, server error

### 2.6 MessageBus (`deeptutor/tutorbot/bus/`)

```python
@dataclass
class InboundMessage:
    channel: str; sender_id: str; chat_id: str; content: str
    media: list[str]; metadata: dict; session_key_override: str | None
    session_key -> str  # 属性: override or "{channel}:{chat_id}"

@dataclass
class OutboundMessage:
    channel: str; chat_id: str; content: str; reply_to: str | None
    media: list[str]; metadata: dict  # 可含 _progress, _tool_hint

class MessageBus:
    inbound: asyncio.Queue[InboundMessage]
    outbound: asyncio.Queue[OutboundMessage]
```

**Next.js 中的替代方案**：asyncio.Queue 不存在，需用 SSE + HTTP POST 回传替代

### 2.7 配置 Schema (`deeptutor/tutorbot/config/schema.py`)

```python
class AgentDefaults:
    workspace: str = "~/.deeptutor/tutorbot/workspace"
    model: str = "anthropic/claude-opus-4-5"
    provider: str = "auto"
    max_tokens: int = 8192
    context_window_tokens: int = 65536
    temperature: float = 0.1
    max_tool_iterations: int = 40
    reasoning_effort: str | None = None
    team_max_workers: int = 5
    team_worker_max_iterations: int = 25

class ProvidersConfig:
    # 20+ 提供商: custom, anthropic, openai, openrouter, deepseek, groq, zhipu, dashscope, vllm, ollama, gemini, moonshot, minimax, aihubmix, siliconflow, volcengine, byteplus, openai_codex, github_copilot, nvidia_nim
```

---

## 三、两项目对应关系表

| DeepTutor 模块 | SmartLearn 对应 | 迁移方式 |
|----------------|-----------------|----------|
| `tutorbot/agent/loop.py` AgentLoop | 无 | 🆕 新建 LangGraph AgentLoop 子图 |
| `tutorbot/agent/context.py` ContextBuilder | 无 | 🆕 新建 ChatPromptAssembler |
| `tutorbot/agent/memory.py` MemoryStore | `store/learning-profile.ts` | 🔧 扩展为三层记忆 |
| `tutorbot/agent/tools/registry.py` ToolRegistry | 无 | 🆕 新建 |
| `tutorbot/agent/skills.py` SkillsLoader | 无 | 🆕 Phase 3a 新建 |
| `tutorbot/providers/` LLMProvider | `lib/ai/llm.ts` + `providers.ts` | ✅ 复用 SmartLearn |
| `tutorbot/bus/` MessageBus | SSE 流式 | 🔧 SSE + HTTP POST 替代 |
| `tutorbot/channels/` 渠道系统 | 无 | ⏳ 推迟 |
| `tutorbot/config/schema.py` | `store/settings.ts` | 🔧 扩展为服务端设置 |
| `services/session/` SessionManager | `store/sessions.ts` | 🔧 扩展为 Prisma 持久化 |
| `services/rag/` RAGService | 无 | 🆕 Phase 2b 新建 pgvector 版 |
| `services/search/` SearchProviders | `lib/web-search/tavily.ts` | ✅ 复用 Tavily |
| `tools/reason.py` | 无 | 🆕 新建（薄 LLM 调用包装） |
| `tools/brainstorm.py` | 无 | 🆕 新建（薄 LLM 调用包装） |
| `tools/code_executor.py` | `app/api/code/execute/route.ts` | ✅ 复用 Piston API |
| `tools/rag_tool.py` | 无 | 🆕 Phase 2b 新建 |
| `learning-graph/` | `lib/learning-graph/` | 🔧 包装为 GraphCapability |
| `director-graph/` | `lib/orchestration/director-graph.ts` | ✅ 保留为 PPT 编排 |
