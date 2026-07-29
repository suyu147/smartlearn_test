/**
 * AgentLoop Subgraph — LangGraph StateGraph for the core LLM → Tool → LLM loop
 *
 * TypeScript equivalent of DeepTutor's `run_agentic_loop` + `run_labeled_step`
 * + `dispatch_tool_calls`, adapted for Vercel AI SDK v5 + LangGraph JS.
 *
 * Key design decisions:
 * - Uses Vercel AI SDK `streamText` / `generateText` for LLM calls with native tool support
 * - Uses LangGraph JS `StateGraph` for the loop structure (agent ↔ tools conditional edges)
 * - No label protocol — uses AI SDK's native tool calling instead.
 *   "FINISH" = no tool calls; "TOOL" = has tool calls.
 * - Streaming through StreamBus — each LLM text chunk forwarded for SSE delivery
 *
 * Migrated from: deeptutor/core/agentic/loop.py
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { streamText, generateText } from 'ai';
import type { LanguageModel, ToolSet, ModelMessage, Tool } from 'ai';
import { z } from 'zod';

import { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import type { StreamEvent } from '@/lib/deeptutor/core/types';
import { InputHandler, getInputHandler } from '@/lib/deeptutor/core/input-handler';
import { resetLoadedDeferredTools } from '@/lib/deeptutor/tools/deferred-loader';
import type { ToolDefinition, ToolParameter, ToolResult } from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AgentLoop');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_TEMPERATURE = 0.1;
/** Context window budget in tokens (conservative default) */
const DEFAULT_CONTEXT_WINDOW = 65536;
/** Snip threshold — start trimming when usage exceeds this fraction */
const CONTEXT_SNIP_RATIO = 0.9;
/** Placeholder text inserted when old tool results are snipped */
const SNIPPED_PLACEHOLDER =
  '[Earlier tool results have been trimmed to fit the context window.]';

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

const AgentLoopState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev: BaseMessage[], update: BaseMessage[]) => [...prev, ...update],
    default: () => [],
  }),
  iterationCount: Annotation<number>({
    reducer: (_prev: number, update: number) => update,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_prev: number, update: number) => update,
    default: () => DEFAULT_MAX_ITERATIONS,
  }),
  /** Whether a tool requested the turn be terminated */
  terminateTurn: Annotation<boolean>({
    reducer: (_prev: boolean, update: boolean) => update,
    default: () => false,
  }),
  /** Metadata — session / turn IDs for event correlation */
  sessionId: Annotation<string>({
    reducer: (_prev: string, update: string) => update,
    default: () => '',
  }),
  turnId: Annotation<string>({
    reducer: (_prev: string, update: string) => update,
    default: () => '',
  }),
});

type AgentLoopStateType = typeof AgentLoopState.State;

// ---------------------------------------------------------------------------
// Public config interface
// ---------------------------------------------------------------------------

export interface AgentLoopConfig {
  /** The language model to use for LLM calls */
  model: LanguageModel;
  /** AI SDK–format tools (pre-built with zod schemas & execute functions) */
  tools: ToolSet;
  /** Our internal ToolRegistry for executing tools by name */
  toolRegistry: ToolRegistry;
  /** Maximum agent iterations before forced final response (default 20) */
  maxIterations?: number;
  /** Temperature for LLM calls (default 0.1) */
  temperature?: number;
  /** Context window token budget for the context guard (default 65536) */
  contextWindowTokens?: number;
  /** Optional callback that receives every StreamEvent */
  streamCallback?: (event: StreamEvent) => void;
  /** Session ID for event correlation */
  sessionId?: string;
  /** Turn ID for event correlation */
  turnId?: string;
  /** Optional InputHandler override (defaults to the global singleton) */
  inputHandler?: InputHandler;
  /** Optional system prompt override */
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Tool format conversion helpers
// ---------------------------------------------------------------------------

/**
 * Build a Zod schema object from an array of ToolParameter descriptors.
 *
 * Handles: string, integer, boolean, number, array, object.
 * Falls back to `z.any()` for unrecognised types.
 *
 * Design notes for LLM compatibility:
 * - Uses z.coerce for numeric types (LLMs sometimes send "5" instead of 5)
 * - Uses .passthrough() on the top-level object (LLMs sometimes add extra fields)
 * - Boolean fields accept "true"/"false" strings via coerce
 */
function parametersToZodSchema(parameters: ToolParameter[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const param of parameters) {
    let fieldSchema: z.ZodTypeAny;

    switch (param.type) {
      case 'string':
        if (param.enum && param.enum.length > 0) {
          const [first, ...rest] = param.enum;
          fieldSchema = z.enum([first, ...rest] as [string, ...string[]]);
        } else {
          // Coerce non-string values to string (LLMs sometimes send numbers/booleans)
          fieldSchema = z.coerce.string();
        }
        break;

      case 'integer':
        // LLMs may send "5" or 5.0 — coerce then validate as int
        fieldSchema = z.preprocess(
          (val) => {
            if (typeof val === 'string') {
              const n = Number(val);
              return Number.isNaN(n) ? val : n;
            }
            return val;
          },
          z.number().int(),
        );
        break;

      case 'number':
        // LLMs may send "3.14" — coerce string to number
        fieldSchema = z.preprocess(
          (val) => {
            if (typeof val === 'string') {
              const n = Number(val);
              return Number.isNaN(n) ? val : n;
            }
            return val;
          },
          z.number(),
        );
        break;

      case 'boolean':
        // LLMs may send "true"/"false" — handle gracefully
        fieldSchema = z.preprocess(
          (val) => {
            if (val === 'true') return true;
            if (val === 'false') return false;
            return val;
          },
          z.boolean(),
        );
        break;

      case 'array':
        if (param.items) {
          const itemType = (param.items as Record<string, unknown>).type;
          if (itemType === 'string') {
            fieldSchema = z.array(z.coerce.string());
          } else if (itemType === 'integer' || itemType === 'number') {
            fieldSchema = z.array(z.coerce.number());
          } else if (itemType === 'boolean') {
            fieldSchema = z.array(z.coerce.boolean());
          } else {
            fieldSchema = z.array(z.any());
          }
        } else {
          fieldSchema = z.array(z.coerce.string());
        }
        break;

      case 'object':
        fieldSchema = z.record(z.string(), z.any());
        break;

      default:
        fieldSchema = z.any();
        break;
    }

    // Apply optionality
    if (!param.required) {
      fieldSchema = fieldSchema.optional();
      if (param.default !== null && param.default !== undefined) {
        fieldSchema = fieldSchema.default(param.default as z.input<typeof fieldSchema>);
      }
    }

    // Apply description
    if (param.description) {
      fieldSchema = fieldSchema.describe(param.description);
    }

    shape[param.name] = fieldSchema;
  }

  // Use .passthrough() to allow extra fields from LLM (don't reject unknown keys)
  return z.object(shape).passthrough();
}

/**
 * Convert an array of our `ToolDefinition` to AI SDK's `ToolSet` format.
 *
 * Each entry gets a zod parameter schema and a stub `execute` function.
 * The real execution happens in our tool node via ToolRegistry.
 */
export function toAISDKTools(definitions: ToolDefinition[]): ToolSet {
  const result: Record<string, Tool<unknown, unknown>> = {};

  for (const def of definitions) {
    const zodParams = parametersToZodSchema(def.parameters);

    result[def.name] = {
      description: def.description,
      // AI SDK v5 uses `inputSchema` (FlexibleSchema) instead of `parameters`
      inputSchema: zodParams as unknown as Tool<unknown, unknown>['inputSchema'],
      // Stub execute — real dispatch goes through ToolRegistry in the tool_node.
      // The stub satisfies ToolSet's requirement that `execute` be present.
      execute: async () => ({}) as unknown,
      onInputAvailable: () => {},
      onInputStart: () => {},
      onInputDelta: () => {},
    };
  }

  return result as ToolSet;
}

// ---------------------------------------------------------------------------
// Message conversion helpers
// ---------------------------------------------------------------------------

/**
 * Type-safe helpers for message identification.
 * Falls back to _getType() / constructor.name when instanceof fails
 * (e.g. across module instances, ESM hoisting).
 */
function getMessageType(msg: BaseMessage): string {
  return (
    (msg as unknown as Record<string, unknown>)._getType as (() => string) | undefined
  )?.() ?? msg.constructor?.name ?? 'unknown';
}

function isToolMessageLike(msg: BaseMessage): boolean {
  if (msg instanceof ToolMessage) return true;
  return getMessageType(msg) === 'tool';
}

function isAIMessageLike(msg: BaseMessage): boolean {
  if (msg instanceof AIMessage) return true;
  return getMessageType(msg) === 'ai';
}

function isSystemMessageLike(msg: BaseMessage): boolean {
  if (msg instanceof SystemMessage) return true;
  return getMessageType(msg) === 'system';
}

function isHumanMessageLike(msg: BaseMessage): boolean {
  if (msg instanceof HumanMessage) return true;
  return getMessageType(msg) === 'human';
}

/**
 * Convert LangChain BaseMessage[] to AI SDK ModelMessage[] for the LLM call.
 *
 * AI SDK v5 requires ModelMessage (CoreMessage) format, NOT UIMessage format:
 * - Assistant tool calls go in `toolCalls` array (type: 'tool-call'), not `content` parts
 * - Tool results use `output`, with `{ type: 'tool-result', toolCallId, toolName, output }` parts
 *
 * Mapping:
 * - SystemMessage → { role: 'system', content }
 * - HumanMessage  → { role: 'user', content }
 * - AIMessage     → { role: 'assistant', content: [...textPart, ...toolCallParts] }
 * - ToolMessage   → { role: 'tool', content: [{ type: 'tool-result', ... }] }
 *
 * NOTE: AI SDK v5 AssistantModelMessage does NOT have a top-level `toolCalls`
 * field. Tool calls go inside the `content` array as ToolCallPart objects.
 */

/**
 * Convert LangChain message content to AI SDK v5 compatible format.
 * LangChain uses {type:'image_url', image_url:{url:'...'}} — AI SDK v5 uses {type:'image', image:'...'}.
 */
function convertContentToAISDK(
  content: string | Array<Record<string, unknown>>,
): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'image_url') {
      const imageUrl = (part as { image_url?: { url?: string } }).image_url;
      return { type: 'image', image: imageUrl?.url || '' };
    }
    return part;
  });
}

function toModelMessages(messages: BaseMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  /**
   * Check if the last message in result has role 'assistant' containing
   * tool-call parts in its content array.
   * AI SDK v5 requires every role:'tool' message to be preceded by an
   * assistant message that carries matching tool-call content parts.
   */
  function lastMsgHasToolCalls(): boolean {
    const last = result[result.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const c = (last as Record<string, unknown>).content;
    if (!Array.isArray(c)) return false;
    return (c as Array<Record<string, unknown>>).some(
      (part) => part.type === 'tool-call',
    );
  }

  for (const msg of messages) {
    // Extract string content for logging and for orphaned-tool / unknown-type fallbacks
    const content =
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const logContent = content;

    const msgType = getMessageType(msg);
    const toolCallInfo =
      msgType === 'ai'
        ? ` tc=[${((msg as unknown as Record<string, unknown>).tool_calls as unknown[] | undefined)?.length ?? 0}] kw=[${Array.isArray(((msg as unknown as Record<string, unknown>).additional_kwargs as Record<string, unknown> | undefined)?.tool_calls) ? 'Y' : 'N'}]`
        : msgType === 'tool'
        ? ` tcid=${(msg as unknown as Record<string, unknown>).tool_call_id}`
        : '';
    logger.warn(`[toModelMessages] #${messages.indexOf(msg)} type="${msgType}"${toolCallInfo} preview="${logContent.slice(0, 80)}"`);

    if (isSystemMessageLike(msg)) {
      result.push({ role: 'system', content: logContent });
    } else if (isHumanMessageLike(msg)) {
      // Convert LangChain content format to AI SDK format.
      // LangChain uses {type:'image_url', image_url:{url}} — AI SDK v5 uses {type:'image', image}.
      const sdkContent = convertContentToAISDK(msg.content);
      result.push({ role: 'user', content: sdkContent } as unknown as ModelMessage);
    } else if (isAIMessageLike(msg)) {
      // Read tool_calls from LangChain standard property first,
      // then fall back to additional_kwargs.tool_calls (OpenAI format)
      const lcCalls = (msg as unknown as Record<string, unknown>).tool_calls;
      let toolCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown>; type?: string }> =
        Array.isArray(lcCalls) ? lcCalls as typeof toolCalls : [];

      if (toolCalls.length === 0) {
        const kwCalls = (msg as unknown as Record<string, unknown>).additional_kwargs as Record<string, unknown> | undefined;
        const kwToolCalls = kwCalls?.tool_calls;
        if (Array.isArray(kwToolCalls)) {
          toolCalls = (kwToolCalls as Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string | Record<string, unknown> };
          }>)
            .filter((tc) => tc.function?.name)
            .map((tc) => {
              let args: Record<string, unknown> = {};
              const raw = tc.function!.arguments;
              if (raw) {
                if (typeof raw === 'object') {
                  args = raw as Record<string, unknown>;
                } else {
                  try {
                    args = JSON.parse(raw) as Record<string, unknown>;
                  } catch {
                    args = {};
                  }
                }
              }
              return {
                id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
                name: tc.function!.name!,
                args,
                type: 'tool_call' as const,
              };
            });
        }
      }

      logger.warn(`[toModelMessages] AIMessage resolved toolCalls=${toolCalls.length}, names=[${toolCalls.map(t => t.name).join(',')}]`);

      if (toolCalls.length > 0) {
        // AI SDK v5: tool calls go inside content array as ToolCallPart,
        // NOT as a top-level `toolCalls` field (which is stripped by Zod).
        const parts: Array<{
          type: string;
          text?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
        }> = [];
        const aiTextContent = typeof msg.content === 'string' ? msg.content : '';
        if (aiTextContent) {
          parts.push({ type: 'text', text: aiTextContent });
        }
        for (const tc of toolCalls) {
          parts.push({
            type: 'tool-call' as const,
            toolCallId: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
            toolName: tc.name ?? 'unknown_tool',
            input: tc.args ?? {},
          });
        }
        result.push({
          role: 'assistant',
          content: parts,
        } as ModelMessage);
      } else {
        result.push({ role: 'assistant', content: msg.content } as unknown as ModelMessage);
      }
    } else if (isToolMessageLike(msg)) {
      const hasPrev = lastMsgHasToolCalls();
      logger.warn(`[toModelMessages] ToolMessage tcid="${(msg as unknown as Record<string, unknown>).tool_call_id}", lastMsgHasToolCalls=${hasPrev}`);

      if (!hasPrev) {
        // Orphaned tool result — convert to user message to preserve context
        logger.warn('toModelMessages: Skipping orphaned ToolMessage (no preceding assistant with toolCalls)');
        result.push({ role: 'user', content: `[Tool result: ${content.slice(0, 500)}]` });
        continue;
      }

      const toolCallId =
        (msg as unknown as Record<string, unknown>).tool_call_id as string | undefined ??
        `call_${Math.random().toString(36).slice(2, 10)}`;

      result.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result' as const,
            toolCallId,
            toolName: ((msg as unknown as Record<string, unknown>).name as string) ?? 'unknown',
            output: { type: 'text' as const, value: content },
          },
        ],
      } satisfies ModelMessage);
    } else {
      logger.debug(`toModelMessages: Unknown msg type, treating as user`);
      result.push({ role: 'user', content });
    }
  }

  // Post-process: sanitize orphaned tool-call assistant messages.
  // AI SDK v5 requires every tool-call content part to have a matching
  // tool-result content part in a subsequent message. If tool execution
  // partially fails (some tools succeed, some don't), the orphaned
  // tool-calls will cause "insufficient tool messages" errors.
  // We remove orphaned tool-call parts, and convert the assistant
  // message to plain text if all tool-calls are orphaned.
  for (let i = 0; i < result.length; i++) {
    const msg = result[i] as Record<string, unknown>;
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

    const contentParts = msg.content as Array<Record<string, unknown>>;
    const toolCallParts = contentParts.filter((p) => p.type === 'tool-call');
    if (toolCallParts.length === 0) continue;

    // Collect all tool-call IDs from this assistant message
    const toolCallIds = toolCallParts.map((p) => p.toolCallId as string).filter(Boolean);

    // Check subsequent messages for matching tool-result parts
    const matched = new Set<string>();
    for (let j = i + 1; j < result.length; j++) {
      const next = result[j] as Record<string, unknown>;
      if (next.role !== 'tool' || !Array.isArray(next.content)) break; // non-tool message ends the chain

      const nextParts = next.content as Array<Record<string, unknown>>;
      for (const np of nextParts) {
        if (np.type === 'tool-result') {
          matched.add(np.toolCallId as string);
        }
      }
    }

    const orphaned = toolCallIds.filter((id) => !matched.has(id));
    if (orphaned.length === 0) continue;

    logger.warn(`[toModelMessages] Removing ${orphaned.length} orphaned tool-call(s): [${orphaned.join(',')}]`);

    if (orphaned.length === toolCallParts.length) {
      // All tool-calls are orphaned — convert to plain user message
      const textParts = contentParts.filter((p) => p.type === 'text');
      const fallbackText = textParts.length > 0
        ? textParts.map((p) => p.text).join('')
        : '[工具调用结果不可用]';
      result[i] = { role: 'user', content: fallbackText } as unknown as ModelMessage;
    } else {
      // Some tool-calls matched, some orphaned — keep only matched
      msg.content = contentParts.filter(
        (p) => p.type !== 'tool-call' || !orphaned.includes(p.toolCallId as string),
      );
    }
  }

  // Summary: log roles + tool-call content parts of produced messages
  const summary = result.map((m) => {
    const r = m as Record<string, unknown>;
    let tcInfo = '';
    if (Array.isArray(r.content)) {
      const tcParts = (r.content as Array<Record<string, unknown>>).filter(
        (p) => p.type === 'tool-call',
      );
      if (tcParts.length > 0) {
        tcInfo = `(tc:${tcParts.map((p) => p.toolName).join(',')})`;
      }
    }
    return `${r.role}${tcInfo}`;
  }).join(' → ');
  logger.warn(`[toModelMessages] OUTPUT (${result.length} msgs): ${summary}`);
  return result;
}

// ---------------------------------------------------------------------------
// Context window guard
// ---------------------------------------------------------------------------

/**
 * Rough token estimator. Counts ~4 chars per token for English / code
 * and ~2 chars per token for CJK-heavy text. This is intentionally
 * conservative — it's a safety net, not a billing instrument.
 */
function estimateTokens(messages: BaseMessage[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    const content =
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    totalChars += content.length;
  }
  // Blend: assume ~3 chars per token on average
  return Math.ceil(totalChars / 3);
}

/**
 * If the conversation exceeds CONTEXT_SNIP_RATIO of the budget, replace
 * the oldest ToolMessage contents with a placeholder. Returns the
 * trimmed message array (does not mutate the input).
 */
function snipOldToolResults(
  messages: BaseMessage[],
  contextWindowTokens: number,
): BaseMessage[] {
  const estimated = estimateTokens(messages);
  const threshold = Math.floor(contextWindowTokens * CONTEXT_SNIP_RATIO);

  if (estimated <= threshold) {
    return messages;
  }

  logger.info(
    `Context guard triggered: ~${estimated} tokens > ${threshold} threshold. ` +
      'Snipping old tool results.',
  );

  // Find tool messages from the oldest end and replace content until we're under budget
  const result = [...messages];
  let snipped = false;

  for (let i = 0; i < result.length; i++) {
    if (result[i] instanceof ToolMessage) {
      const original = result[i] as ToolMessage;
      const originalContent =
        typeof original.content === 'string'
          ? original.content
          : JSON.stringify(original.content);

      // Only snip if the content is substantial
      if (originalContent.length > 200) {
        result[i] = new ToolMessage({
          content: SNIPPED_PLACEHOLDER,
          tool_call_id: original.tool_call_id,
          name: original.name,
        });
        snipped = true;
      }
    }

    // Re-check if we're under budget
    if (snipped && estimateTokens(result) <= threshold) {
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

/** Result of executing a single tool call */
interface ToolCallResult {
  /** The ToolMessage to append to the conversation */
  message: ToolMessage;
  /** The ToolResult from the registry (for pauseForUser / terminateTurn checks) */
  result: ToolResult;
}

/**
 * Execute tool calls sequentially via the ToolRegistry.
 * Each tool call is wrapped in try/catch — errors become error tool messages.
 */
async function dispatchToolCalls(
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  registry: ToolRegistry,
  streamBus: StreamBusImpl | null,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const tc of toolCalls) {
    const callId = tc.id || `call_${Math.random().toString(36).slice(2, 10)}`;

    logger.debug(`Dispatching tool call: ${tc.name} (id=${callId})`);

    // Emit tool_call event
    if (streamBus) {
      streamBus.emitToolCall(tc.name, tc.args);
    }

    let toolResult: ToolResult;

    try {
      if (!registry.has(tc.name)) {
        throw new Error(
          `Tool "${tc.name}" not found in registry. ` +
            'Analyze the error and try a different approach.',
        );
      }
      toolResult = await registry.execute(tc.name, tc.args);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Tool "${tc.name}" failed: ${errorMsg}`);

      // Return error as a tool result so the LLM can recover
      toolResult = {
        content: `Error executing tool "${tc.name}": ${errorMsg}\n[Analyze the error above and try a different approach.]`,
        sources: [],
        metadata: { error: true },
        success: false,
        terminateTurn: false,
        pauseForUser: null,
      };
    }

    // Emit tool_result event
    if (streamBus) {
      streamBus.emitToolResult(tc.name, toolResult.content);
    }

    const toolMsg = new ToolMessage({
      content: toolResult.content,
      tool_call_id: callId,
      name: tc.name,
      status: toolResult.success ? 'success' : 'error',
    });

    results.push({ message: toolMsg, result: toolResult });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Agent node
// ---------------------------------------------------------------------------

/**
 * The agent node calls the LLM via AI SDK's `streamText`, collects the full
 * result (text + tool calls), and streams text deltas through the callback.
 *
 * Returns updated messages with the AI response appended and iterationCount + 1.
 */
function createAgentNode(config: AgentLoopConfig) {
  return async function agentNode(
    state: AgentLoopStateType,
  ): Promise<Partial<AgentLoopStateType>> {
    const iteration = (state.iterationCount ?? 0) + 1;
    const maxIter = state.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const sessionId = state.sessionId || config.sessionId || '';
    const turnId = state.turnId || config.turnId || '';

    logger.debug(`agent_node: iteration ${iteration}/${maxIter}`);

    // Create StreamBus for this node invocation
    const streamBus = config.streamCallback
      ? new StreamBusImpl(config.streamCallback, sessionId, turnId)
      : null;

    // Context window guard — trim old tool results if needed
    const contextBudget = config.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW;
    const safeMessages = snipOldToolResults(state.messages, contextBudget);

    // Convert messages for AI SDK
    const modelMessages = toModelMessages(safeMessages);

    // Check if we should force a no-tools final call (max iterations exhausted)
    const forceNoTools = iteration > maxIter;

    try {
      if (forceNoTools) {
        logger.info(
          `Max iterations (${maxIter}) reached. Forcing final response without tools.`,
        );

        // Force a final response without tools
        const finalResult = await generateText({
          model: config.model,
          messages: modelMessages,
          temperature: config.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: 4096,
        });

        const finalText = finalResult.text;

        if (streamBus) {
          streamBus.emitContent(finalText);
        }

        const aiMessage = new AIMessage({
          content: finalText,
        });

        return {
          messages: [aiMessage],
          iterationCount: iteration,
        };
      }

      // Normal LLM call with streaming
      const result = streamText({
        model: config.model,
        messages: modelMessages,
        tools: config.tools,
        temperature: config.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: 4096,
        // Auto-repair tool calls that fail Zod validation (common with DeepSeek, etc.)
        experimental_repairToolCall: async ({ toolCall, tools, inputSchema, error }) => {
          logger.warn(
            `Repairing tool call "${toolCall.toolName}": ${error.message}`,
          );

          // Strategy 1: Try to fix the raw JSON by re-parsing with the schema
          try {
            const rawInput = typeof toolCall.input === 'string'
              ? toolCall.input
              : JSON.stringify(toolCall.input);
            const parsed = JSON.parse(rawInput);

            // Strip extra fields not in the schema, coerce types where possible
            const toolDef = tools[toolCall.toolName];
            if (toolDef?.inputSchema) {
              const schema = toolDef.inputSchema as z.ZodTypeAny;
              const result = schema.safeParse(parsed);
              if (result.success) {
                logger.info(`Tool call repair succeeded for "${toolCall.toolName}"`);
                return { ...toolCall, input: JSON.stringify(result.data) };
              }
            }
          } catch {
            // Fall through to strategy 2
          }

          // Strategy 2: Use generateText to ask the LLM to fix its own tool call
          try {
            const { text } = await generateText({
              model: config.model,
              prompt:
                `The following tool call to "${toolCall.toolName}" has invalid arguments.\n` +
                `Error: ${error.message}\n` +
                `Raw input: ${typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input)}\n` +
                `Please output ONLY a valid JSON object with the corrected arguments. No explanation.`,
              temperature: 0,
              maxOutputTokens: 1024,
            });

            const fixed = JSON.parse(text.trim());
            logger.info(`Tool call repair via LLM succeeded for "${toolCall.toolName}"`);
            return { ...toolCall, input: JSON.stringify(fixed) };
          } catch (repairError) {
            logger.warn(
              `Tool call repair failed for "${toolCall.toolName}": ${repairError instanceof Error ? repairError.message : String(repairError)}`,
            );
            return null; // Cannot repair — return null to signal failure
          }
        },
      });

      // Collect text deltas and stream them
      let fullText = '';

      // Iterate text stream for real-time streaming
      for await (const textDelta of result.textStream) {
        fullText += textDelta;
        if (streamBus) {
          streamBus.emitContent(textDelta);
        }
      }

      // After stream completes, extract tool calls and usage
      const toolCalls = await result.toolCalls;
      const usage = await result.usage;

      // Filter out invalid tool calls (failed Zod validation + repair failed)
      const validToolCalls = toolCalls.filter((tc) => {
        if ((tc as { invalid?: boolean }).invalid) {
          logger.warn(
            `Skipping invalid tool call "${tc.toolName}" (id=${tc.toolCallId}): ` +
              'validation failed and repair was unsuccessful.',
          );
          return false;
        }
        return true;
      });

      logger.debug(
        `LLM call complete: ${fullText.length} chars, ` +
          `${validToolCalls.length}/${toolCalls.length} valid tool call(s), ` +
          `usage: ${usage.inputTokens ?? 0}p/${usage.outputTokens ?? 0}c`,
      );

      if (validToolCalls.length > 0) {
        // Build an AIMessage with tool_calls in the LangChain format
        const langChainToolCalls = validToolCalls.map((tc) => ({
          name: tc.toolName,
          args: typeof tc.input === 'string'
            ? (JSON.parse(tc.input) as Record<string, unknown>)
            : ((tc.input ?? {}) as Record<string, unknown>),
          id: tc.toolCallId,
          type: 'tool_call' as const,
        }));

        const aiMessage = new AIMessage({
          content: fullText || '',
          tool_calls: langChainToolCalls,
        });

        return {
          messages: [aiMessage],
          iterationCount: iteration,
        };
      }

      // All tool calls were filtered as invalid, or no tool calls were produced.
      // If we have text content, return it as the final response.
      if (fullText) {
        const aiMessage = new AIMessage({ content: fullText });
        return { messages: [aiMessage], iterationCount: iteration };
      }

      // No valid tool calls AND no text — LLM produced only invalid tool calls with no text.
      // Retry without tools to force a meaningful text response.
      if (toolCalls.length > 0) {
        logger.warn(
          `All ${toolCalls.length} tool call(s) were invalid and no text was produced. ` +
            'Retrying without tools to force a text response.',
        );
      }

      try {
        const freshMessages = toModelMessages(safeMessages);
        const noToolsResult = await generateText({
          model: config.model,
          messages: freshMessages,
          temperature: config.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: 4096,
        });

        const noToolsText = noToolsResult.text;
        if (streamBus && noToolsText) {
          streamBus.emitContent(noToolsText);
        }

        const aiMessage = new AIMessage({ content: noToolsText });
        return { messages: [aiMessage], iterationCount: iteration };
      } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        logger.error(`No-tools retry also failed: ${retryMsg}`);

        if (streamBus) {
          streamBus.emitError(`LLM call failed: ${retryMsg}`);
        }

        const aiMessage = new AIMessage({
          content: `处理请求时遇到了问题，请稍后重试。`,
        });
        return { messages: [aiMessage], iterationCount: iteration };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`agent_node LLM call with tools failed: ${errorMsg}. Retrying without tools.`);

      // Fallback: retry without tools to force a text response.
      // This handles cases like NoOutputGeneratedError where the LLM generates
      // only invalid tool calls. Without tools, the LLM must respond with text.
      try {
        if (streamBus) {
          streamBus.emitContent(''); // Clear any partial content from failed stream
        }

        const fallbackResult = await generateText({
          model: config.model,
          messages: toModelMessages(safeMessages),
          temperature: config.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: 4096,
          // Deliberately no tools — force the LLM to produce a text answer
        });

        const fallbackText = fallbackResult.text;

        logger.info(
          `Fallback (no-tools) call succeeded: ${fallbackText.length} chars`,
        );

        if (streamBus) {
          streamBus.emitContent(fallbackText);
        }

        const aiMessage = new AIMessage({
          content: fallbackText,
        });

        return {
          messages: [aiMessage],
          iterationCount: iteration,
        };
      } catch (fallbackError) {
        // Both attempts failed — report error gracefully
        const fallbackMsg = fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
        logger.error(`agent_node fallback LLM call also failed: ${fallbackMsg}`);

        if (streamBus) {
          streamBus.emitError(`LLM call failed: ${fallbackMsg}`);
        }

        const aiMessage = new AIMessage({
          content: `处理请求时遇到了问题（${fallbackMsg}）。请稍后重试，或换一种方式提问。`,
        });

        return {
          messages: [aiMessage],
          iterationCount: iteration,
        };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Tool node
// ---------------------------------------------------------------------------

/**
 * The tool node reads the last AIMessage's tool_calls, dispatches each through
 * the ToolRegistry, and handles pauseForUser / terminateTurn signals.
 */
function createToolNode(config: AgentLoopConfig) {
  return async function toolNode(
    state: AgentLoopStateType,
  ): Promise<Partial<AgentLoopStateType>> {
    const sessionId = state.sessionId || config.sessionId || '';
    const turnId = state.turnId || config.turnId || '';

    // Create StreamBus
    const streamBus = config.streamCallback
      ? new StreamBusImpl(config.streamCallback, sessionId, turnId)
      : null;

    // Extract tool calls from the last AI message
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage || !(lastMessage instanceof AIMessage)) {
      logger.warn('tool_node: last message is not an AIMessage, skipping');
      return { messages: [] };
    }

    const toolCalls = lastMessage.tool_calls ?? [];

    if (toolCalls.length === 0) {
      logger.warn('tool_node: no tool_calls found on last AIMessage, skipping');
      return { messages: [] };
    }

    logger.debug(`tool_node: dispatching ${toolCalls.length} tool call(s)`);

    // Prepare tool calls for dispatch
    const preparedCalls = toolCalls.map((tc) => ({
      id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
      name: tc.name,
      args: (tc.args ?? {}) as Record<string, unknown>,
    }));

    // Execute sequentially
    const results = await dispatchToolCalls(
      preparedCalls,
      config.toolRegistry,
      streamBus,
    );

    // Collect tool messages and check for special signals
    const toolMessages: BaseMessage[] = [];
    let shouldTerminate = false;

    for (const { message, result: toolResult } of results) {
      toolMessages.push(message);

      // Handle pauseForUser — emit wait_for_input and await user reply
      if (toolResult.pauseForUser) {
        const inputHandler = config.inputHandler ?? getInputHandler();
        const prompt =
          (toolResult.pauseForUser.prompt as string) ??
          toolResult.content ??
          'Please provide more information.';

        logger.info(`Tool requested pauseForUser: ${prompt}`);

        if (streamBus) {
          streamBus.emitWaitForInput(turnId, prompt);
        }

        try {
          const userReply = await inputHandler.waitForInput(turnId);

          logger.info(`Received user reply during pauseForUser: ${userReply.slice(0, 100)}...`);

          // Append user reply as a HumanMessage so the LLM sees it
          toolMessages.push(new HumanMessage(userReply));
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`pauseForUser failed: ${errorMsg}`);

          // Append a system-level note about the timeout
          toolMessages.push(
            new HumanMessage(
              '[The user did not respond within the timeout period. Please proceed with available information.]',
            ),
          );
        }
      }

      // Handle terminateTurn
      if (toolResult.terminateTurn) {
        logger.info(`Tool "${message.name}" requested turn termination`);
        shouldTerminate = true;
      }

      // Emit sources if the tool produced any
      if (toolResult.sources && toolResult.sources.length > 0 && streamBus) {
        streamBus.emitSources(
          toolResult.sources.map((s: Record<string, unknown>) => ({
            name: (s.name as string) ?? (s.title as string) ?? 'Source',
            url: s.url as string | undefined,
            kind: s.kind as string | undefined,
          })),
        );
      }
    }

    return {
      messages: toolMessages,
      terminateTurn: shouldTerminate,
    };
  };
}

// ---------------------------------------------------------------------------
// Conditional edge
// ---------------------------------------------------------------------------

/**
 * Decide whether to continue to tools or end the loop.
 *
 * Routes to 'tools' when:
 * - The last message is an AIMessage with tool_calls
 * - iterationCount < maxIterations
 * - terminateTurn is not set
 *
 * Routes to END otherwise.
 */
function shouldContinue(state: AgentLoopStateType): string {
  // Check terminateTurn flag (set by tools)
  if (state.terminateTurn) {
    logger.debug('shouldContinue: terminateTurn is set → END');
    return END;
  }

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage) {
    return END;
  }

  // Check if the last message has tool calls
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const maxIter = state.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const iteration = state.iterationCount ?? 0;

    if (iteration >= maxIter) {
      logger.warn(
        `shouldContinue: max iterations (${maxIter}) reached, forcing END`,
      );
      return END;
    }

    logger.debug(
      `shouldContinue: ${lastMessage.tool_calls.length} tool call(s) → tools`,
    );
    return 'tools';
  }

  logger.debug('shouldContinue: no tool calls → END');
  return END;
}

// ---------------------------------------------------------------------------
// Graph compilation
// ---------------------------------------------------------------------------

/**
 * Compile the agent loop as a LangGraph StateGraph.
 *
 * Graph structure:
 * ```
 *   START → agent ──conditional──→ tools → agent (loop)
 *                 ╲
 *                  └──→ END
 * ```
 */
export function compileAgentLoop(
  config: AgentLoopConfig,
) {
  const agentNodeFn = createAgentNode(config);
  const toolNodeFn = createToolNode(config);

  const graph = new StateGraph(AgentLoopState)
    .addNode('agent', agentNodeFn)
    .addNode('tools', toolNodeFn)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue as never, {
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent');

  return graph.compile();
}

// ---------------------------------------------------------------------------
// High-level runner
// ---------------------------------------------------------------------------

/** Result returned by `runAgentLoop` */
export interface AgentLoopResult {
  /** Full message history after the loop */
  messages: BaseMessage[];
  /** The text content of the final AI response */
  text: string;
  /** Number of LLM iterations executed */
  iterationCount: number;
}

/**
 * Run the complete agent loop from initial messages to completion.
 *
 * This is the primary entry point for executing a turn. It compiles the
 * graph, invokes it with the provided messages, and extracts the final
 * text response.
 *
 * @param config          — AgentLoop configuration (model, tools, registry, etc.)
 * @param initialMessages — Starting messages (typically system + user)
 * @returns The final messages, extracted text, and iteration count
 */
export async function runAgentLoop(
  config: AgentLoopConfig,
  initialMessages: BaseMessage[],
): Promise<AgentLoopResult> {
  const sessionId = config.sessionId ?? '';
  const turnId = config.turnId ?? '';
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  logger.info(
    `Starting agent loop: session=${sessionId}, turn=${turnId}, ` +
      `maxIterations=${maxIterations}, initialMessages=${initialMessages.length}`,
  );

  // Reset deferred tool state so tools loaded in a previous turn don't leak
  resetLoadedDeferredTools();

  const graph = compileAgentLoop(config);

  // Invoke the compiled graph
  const result = await graph.invoke({
    messages: initialMessages,
    iterationCount: 0,
    maxIterations,
    terminateTurn: false,
    sessionId,
    turnId,
  });

  // Extract the final text from the last AI message
  const finalMessages = result.messages as BaseMessage[];
  let finalText = '';

  // Walk backwards to find the last AIMessage with content
  for (let i = finalMessages.length - 1; i >= 0; i--) {
    const msg = finalMessages[i];
    if (msg instanceof AIMessage) {
      const content =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (content) {
        finalText = content;
        break;
      }
    }
  }

  const iterationCount = (result.iterationCount as number) ?? 0;

  logger.info(
    `Agent loop complete: iterations=${iterationCount}, ` +
      `messages=${finalMessages.length}, text=${finalText.length} chars`,
  );

  return {
    messages: finalMessages,
    text: finalText,
    iterationCount,
  };
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { AgentLoopState, type AgentLoopStateType };
export type { ToolCallResult };
