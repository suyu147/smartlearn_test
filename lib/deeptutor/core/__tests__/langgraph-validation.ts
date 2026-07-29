/**
 * LangGraph JS 技术验证 — Phase 0 DoD
 *
 * 最简 AgentLoop：agent_node ↔ tool_node 循环
 * 验证：Annotation.Root, reducer, conditional edges, compile, invoke
 *
 * 运行：npx tsx lib/deeptutor/core/__tests__/langgraph-validation.ts
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';

// ─── 1. State 定义 ───────────────────────────────────────────────

const AgentLoopState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev: BaseMessage[], update: BaseMessage[]) => [...prev, ...update],
    default: () => [],
  }),
  iterationCount: Annotation<number>(),
  toolNames: Annotation<string[]>({
    reducer: (prev: string[], update: string[]) => [...prev, ...update],
    default: () => [],
  }),
});

type AgentLoopStateType = typeof AgentLoopState.State;

// ─── 2. Mock Tool ────────────────────────────────────────────────

interface MockToolCall {
  id: string;
  function: { name: string; arguments: string };
  type: string;
}

function executeBrainstormTool(query: string): string {
  const ideas = [
    `${query} — 方向1: 量子计算在药物发现中的应用`,
    `${query} — 方向2: 量子纠错码的拓扑方法`,
    `${query} — 方向3: 变分量子算法优化`,
  ];
  return JSON.stringify({ success: true, ideas });
}

// ─── 3. 节点函数 ─────────────────────────────────────────────────

/**
 * agent_node：模拟 LLM 决策
 * - 第 1 轮：调用 brainstorm 工具
 * - 第 2 轮：直接生成回复
 */
async function agentNode(
  state: AgentLoopStateType,
): Promise<Partial<AgentLoopStateType>> {
  const iteration = (state.iterationCount ?? 0) + 1;
  console.log(`[agent_node] iteration ${iteration}, messages: ${state.messages.length}`);

  if (iteration === 1) {
    // 第一轮：决定调用工具
    const aiMessage = new AIMessage({
      content: '',
      additional_kwargs: {
        tool_calls: [
          {
            id: 'call_001',
            function: {
              name: 'brainstorm',
              arguments: JSON.stringify({ query: '量子计算的前沿研究方向' }),
            },
            type: 'function',
          },
        ],
      },
    });

    return {
      messages: [aiMessage],
      iterationCount: iteration,
    };
  }

  // 第二轮：基于工具结果生成最终回复
  const lastToolMessage = state.messages[state.messages.length - 1];
  const toolContent = lastToolMessage?.content ?? '(no tool result)';

  const finalMessage = new AIMessage({
    content: `基于工具分析，以下是量子计算前沿研究方向的总结：\n\n原始数据: ${String(toolContent).slice(0, 100)}...`,
  });

  return {
    messages: [finalMessage],
    iterationCount: iteration,
  };
}

/**
 * tool_node：执行工具调用，返回 ToolMessage
 */
async function toolNode(
  state: AgentLoopStateType,
): Promise<Partial<AgentLoopStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls: MockToolCall[] =
    (lastMessage?.additional_kwargs?.tool_calls as MockToolCall[]) ?? [];

  console.log(`[tool_node] executing ${toolCalls.length} tool call(s)`);

  const toolMessages: BaseMessage[] = [];
  const executedNames: string[] = [];

  for (const call of toolCalls) {
    const toolName = call.function.name;
    const toolArgs = call.function.arguments;
    let result: string;
    if (toolName === 'brainstorm') {
      const args = JSON.parse(toolArgs) as { query: string };
      result = executeBrainstormTool(args.query);
    } else {
      result = `Error executing ${toolName}: unknown tool\n[Analyze the error above and try a different approach.]`;
    }

    toolMessages.push(
      new AIMessage({
        content: result,
        additional_kwargs: { tool_call_id: call.id, name: toolName },
      }),
    );
    executedNames.push(toolName);
  }

  return {
    messages: toolMessages,
    toolNames: executedNames,
  };
}

// ─── 4. 条件边 ───────────────────────────────────────────────────

function shouldContinue(state: AgentLoopStateType): string {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = lastMessage?.additional_kwargs?.tool_calls;
  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    return 'tools';
  }
  return END;
}

// ─── 5. 构建 & 编译图 ────────────────────────────────────────────

function buildAgentLoop() {
  return new StateGraph(AgentLoopState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue as never, {
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent')
    .compile();
}

// ─── 6. 运行验证 ─────────────────────────────────────────────────

async function main() {
  console.log('═══ LangGraph JS 技术验证 ═══\n');

  const graph = buildAgentLoop();
  console.log('✓ 图编译成功\n');

  // 构造输入
  const inputMessages: BaseMessage[] = [
    new SystemMessage('你是一个智能助手，可以使用 brainstorm 工具帮助用户探索研究方向。'),
    new HumanMessage('帮我分析量子计算的前沿研究方向'),
  ];

  console.log('── 开始执行 AgentLoop ──\n');

  const result = await graph.invoke({
    messages: inputMessages,
    iterationCount: 0,
    toolNames: [],
  });

  console.log('\n── 执行完成 ──\n');

  // 验证结果
  const assertions = [
    {
      name: 'messages 数量 >= 4 (system + human + ai_tool + tool_result + ai_final)',
      pass: result.messages.length >= 4,
      actual: result.messages.length,
    },
    {
      name: 'iterationCount === 2 (两轮循环)',
      pass: result.iterationCount === 2,
      actual: result.iterationCount,
    },
    {
      name: 'toolNames 包含 brainstorm',
      pass: result.toolNames.includes('brainstorm'),
      actual: result.toolNames,
    },
    {
      name: '最终消息是 AIMessage',
      pass: result.messages[result.messages.length - 1] instanceof AIMessage,
      actual: result.messages[result.messages.length - 1]?.constructor.name,
    },
    {
      name: '最终消息有实质内容',
      pass:
        typeof result.messages[result.messages.length - 1]?.content === 'string' &&
        (result.messages[result.messages.length - 1]?.content as string).length > 20,
      actual: (result.messages[result.messages.length - 1]?.content as string)?.slice(0, 80),
    },
  ];

  console.log('── 验证结果 ──\n');
  let allPassed = true;
  for (const a of assertions) {
    const icon = a.pass ? '✓' : '✗';
    console.log(`  ${icon} ${a.name}`);
    console.log(`    actual: ${JSON.stringify(a.actual)}`);
    if (!a.pass) allPassed = false;
  }

  console.log(`\n═══ ${allPassed ? '全部通过 ✓' : '存在失败 ✗'} ═══`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('验证失败:', err);
  process.exit(1);
});
