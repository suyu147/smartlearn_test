import type { StreamBuffer } from '@/lib/buffer/stream-buffer';
import { createLogger } from '@/lib/logger';

const log = createLogger('SSEStream');

type SSEEventData = Record<string, unknown>;

interface SSEEvent {
  type: string;
  data: SSEEventData;
}

export async function processSSEStream(
  response: Response,
  sessionId: string,
  buffer: StreamBuffer,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let sseBuffer = '';
  let currentMessageId: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      sseBuffer += chunk;

      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const eventStr of events) {
        const line = eventStr.trim();
        if (!line.startsWith('data: ')) continue;

        let sseError: Error | null = null;

        try {
          const event: SSEEvent = JSON.parse(line.slice(6));
          const data = event.data;

          switch (event.type) {
            case 'agent_start': {
              const d = data as { messageId: string; agentId: string; agentName: string; agentAvatar?: string; agentColor?: string };
              currentMessageId = d.messageId;
              buffer.pushAgentStart({
                messageId: d.messageId,
                agentId: d.agentId,
                agentName: d.agentName,
                avatar: d.agentAvatar,
                color: d.agentColor,
              });
              break;
            }

            case 'agent_end': {
              const d = data as { messageId: string; agentId: string };
              buffer.pushAgentEnd({
                messageId: d.messageId,
                agentId: d.agentId,
              });
              break;
            }

            case 'text_delta': {
              const d = data as { messageId?: string; content: string };
              const targetId = d.messageId ?? currentMessageId;
              if (!targetId) break;
              buffer.pushText(targetId, d.content);
              break;
            }

            case 'action': {
              const d = data as { messageId?: string; actionId: string; actionName: string; params: Record<string, unknown>; agentId: string };
              const targetId = d.messageId ?? currentMessageId;
              if (!targetId) break;
              if (signal?.aborted) break;
              buffer.pushAction({
                messageId: targetId,
                actionId: d.actionId,
                actionName: d.actionName,
                params: d.params,
                agentId: d.agentId,
              });
              break;
            }

            case 'thinking': {
              buffer.pushThinking(data as { stage: string; agentId?: string });
              break;
            }

            case 'cue_user': {
              buffer.pushCueUser(data as { fromAgentId?: string; prompt?: string });
              break;
            }

            case 'done': {
              const d = data as { totalActions: number; totalAgents: number; agentHadContent?: boolean };
              buffer.pushDone(d);
              break;
            }

            case 'error': {
              const d = data as { message: string };
              sseError = new Error(d.message);
              buffer.pushError(d.message);
              break;
            }
          }
        } catch (parseError) {
          log.warn('[SSE] Parse error:', parseError);
        }

        if (sseError) throw sseError;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
