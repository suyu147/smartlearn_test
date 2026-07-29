/**
 * LearnEvent → StreamEvent Mapper
 *
 * Bridges the learning-graph's 14 LearnEvent types to the DeepTutor
 * 17-type StreamEvent protocol. The mapper is called from within the
 * SmartLearnCapability to translate each LearnEvent emitted by the
 * graph's node writer callback into a StreamEvent emitted on the StreamBus.
 *
 * Mapping rationale (see migration-guide.md §2 Decision 8):
 *   phase_start/phase_end  → stage_start/stage_end  (semantic: phase = stage)
 *   text_delta             → content                (streaming text output)
 *   tutor_response         → content                (NOT result — it's streaming text)
 *   node_ready             → result                 (structured data: a learning node)
 *   resource_decision      → result                 (structured data: resource plan)
 *   resource_delta         → result                 (structured data: generated resource)
 *   ppt_ready              → result                 (structured data: PPT scenes)
 *   evaluation_result      → result                 (structured data: evaluation)
 *   profile_update         → result                 (structured data: profile dims)
 *   path_update            → result                 (structured data: learning path)
 *   agent_status           → progress               (agent running/completed/failed)
 *   error                  → error
 *   done                   → done
 *
 * Phase 2d: SmartLearn GraphCapability
 */

import type { StreamEvent, StreamEventType } from '@/lib/deeptutor/core/types';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import type { LearnEvent } from '@/lib/learning-graph/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SmartLearnEventMapper');

/**
 * Map a LearnEvent to a StreamEvent.
 *
 * @param event       — The LearnEvent emitted by a learning-graph node
 * @param sessionId   — Current session ID
 * @param turnId      — Current turn ID
 * @param source      — Event source (default: "smartlearn")
 * @returns StreamEvent ready for emission on the StreamBus
 */
export function mapLearnEventToStreamEvent(
  event: LearnEvent,
  sessionId: string,
  turnId: string,
  source: string = 'smartlearn',
): StreamEvent {
  const base = { sessionId, turnId, source };

  switch (event.type) {
    // -----------------------------------------------------------------------
    // Phase lifecycle → stage_start / stage_end
    // -----------------------------------------------------------------------
    case 'phase_start':
      return createStreamEvent('stage_start', {
        ...base,
        content: event.phase,
        stage: event.phase,
      });

    case 'phase_end':
      return createStreamEvent('stage_end', {
        ...base,
        content: event.phase,
        stage: event.phase,
      });

    // -----------------------------------------------------------------------
    // Streaming text → content
    // -----------------------------------------------------------------------
    case 'text_delta':
      return createStreamEvent('content', {
        ...base,
        content: event.text,
      });

    case 'tutor_response':
      return createStreamEvent('content', {
        ...base,
        content: event.text,
        stage: 'tutor',
      });

    // -----------------------------------------------------------------------
    // Structured results → result (with metadata)
    // -----------------------------------------------------------------------
    case 'node_ready':
      return createStreamEvent('result', {
        ...base,
        stage: 'plan',
        metadata: {
          learnEventType: 'node_ready',
          node: event.node,
        },
      });

    case 'resource_decision':
      return createStreamEvent('result', {
        ...base,
        stage: 'resource_plan',
        metadata: {
          learnEventType: 'resource_decision',
          nodeId: event.nodeId,
          decision: event.decision,
        },
      });

    case 'resource_delta':
      return createStreamEvent('result', {
        ...base,
        stage: 'generate',
        metadata: {
          learnEventType: 'resource_delta',
          resource: event.resource,
        },
      });

    case 'ppt_ready':
      return createStreamEvent('result', {
        ...base,
        stage: 'generate',
        metadata: {
          learnEventType: 'ppt_ready',
          scenes: event.scenes,
          nodeId: event.nodeId,
          userId: event.userId,
          knowledgePoints: event.knowledgePoints,
        },
      });

    case 'evaluation_result':
      return createStreamEvent('result', {
        ...base,
        stage: 'evaluate',
        metadata: {
          learnEventType: 'evaluation_result',
          evaluation: event.evaluation,
          score: event.score,
        },
      });

    case 'profile_update':
      return createStreamEvent('result', {
        ...base,
        stage: 'update_profile',
        metadata: {
          learnEventType: 'profile_update',
          dimensions: event.dimensions,
        },
      });

    case 'path_update':
      return createStreamEvent('result', {
        ...base,
        stage: 'generate',
        metadata: {
          learnEventType: 'path_update',
          path: event.path,
        },
      });

    // -----------------------------------------------------------------------
    // Agent status → progress
    // -----------------------------------------------------------------------
    case 'agent_status':
      return createStreamEvent('progress', {
        ...base,
        stage: 'generate',
        content: `${event.agentName}: ${event.status}`,
        metadata: {
          agentId: event.agentId,
          agentName: event.agentName,
          status: event.status,
          resourceType: event.resourceType,
        },
      });

    // -----------------------------------------------------------------------
    // Error → error
    // -----------------------------------------------------------------------
    case 'error':
      return createStreamEvent('error', {
        ...base,
        content: event.message,
      });

    // -----------------------------------------------------------------------
    // Done → done
    // -----------------------------------------------------------------------
    case 'done':
      return createStreamEvent('done', { ...base });

    default: {
      // Exhaustive check — if a new LearnEvent type is added, this will fail at compile time
      const _exhaustive: never = event;
      log.warn(`Unhandled LearnEvent type: ${JSON.stringify(_exhaustive)}`);
      return createStreamEvent('error', {
        ...base,
        content: `Unknown LearnEvent type`,
      });
    }
  }
}

/**
 * Create a writer callback that maps LearnEvents to StreamEvents
 * and emits them on the provided callback.
 *
 * This is designed to be passed as `config.configurable.writer` in the
 * learning-graph invocation.
 */
export function createLearnEventWriter(
  emit: (event: StreamEvent) => void,
  sessionId: string,
  turnId: string,
  source: string = 'smartlearn',
): (event: LearnEvent) => void {
  return (event: LearnEvent) => {
    const streamEvent = mapLearnEventToStreamEvent(event, sessionId, turnId, source);
    emit(streamEvent);
  };
}
