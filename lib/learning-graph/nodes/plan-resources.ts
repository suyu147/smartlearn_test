import { buildNodeDecisionContext, decideNodeResourcePlan, type PriorNodeFeedback } from '@/lib/generation/resource-decision';
import type { ResourceType } from '@/lib/types/resource';
import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function buildFeedback(state: LearningStateType): PriorNodeFeedback[] {
  const currentNodeId = state.currentNode?.id;
  return state.resourceFeedback.filter((item) => item.nodeId !== currentNodeId);
}

import { initializeLearningTopics } from '../persistence';

function getUserId(config: { configurable?: { userId?: string } }): string {
  return config.configurable?.userId ?? 'anonymous';
}

function applyOverrides(selectedTypes: ResourceType[] | undefined, decision: ReturnType<typeof decideNodeResourcePlan>) {
  if (!selectedTypes) return decision;
  const selectedSet = new Set(selectedTypes);
  const items = decision.items.map((item) => selectedSet.has(item.type)
    ? { ...item, action: 'generate' as const, reason: item.action === 'generate' ? item.reason : '用户手动选择保留该资源类型', sourceLayer: item.action === 'generate' ? item.sourceLayer : 'feedback' as const }
    : { ...item, action: 'skip' as const, reason: item.action === 'skip' ? item.reason : '用户手动取消该资源类型' });
  const resourceTypes = items.filter((item) => item.type !== 'ppt' && item.action === 'generate').map((item) => item.type);
  const shouldGeneratePPT = items.some((item) => item.type === 'ppt' && item.action === 'generate');
  return {
    ...decision,
    items,
    execution: {
      resourceTypes,
      shouldGeneratePPT,
    },
    summary: {
      reasoning: items.map((item) => `[${item.action === 'generate' ? item.type : `跳过 ${item.type}`}] ${item.reason}`),
      skipped: items.filter((item) => item.action !== 'generate').map((item) => ({ type: item.type, reason: item.reason })),
    },
    trace: {
      ...decision.trace,
      feedbackSignals: [...decision.trace.feedbackSignals, 'override:manual-selection'],
    },
  };
}

export async function planResourcesNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void; userId?: string } },
) {
  const write = getWriter(config);
  const node = state.currentNode;
  if (!node) return { phase: 'resource_plan' };
  await initializeLearningTopics(getUserId(config), node.knowledgePoints);
  write({ type: 'phase_start', phase: 'resource_plan' });

  try {
    const priorFeedback = buildFeedback(state);
    const overrideTypes = state.nodeDecisionOverrides[node.id];
    const evaluationFeedback = state.evaluationFeedback;
    const boostTypes: ResourceType[] = evaluationFeedback?.weakPoints?.length
      ? ['quiz', 'code']
      : [];
    const suppressTypes: ResourceType[] = evaluationFeedback?.strongPoints?.length
      ? ['document']
      : [];
    const decision = applyOverrides(overrideTypes, decideNodeResourcePlan({
      node: buildNodeDecisionContext(node, Math.max(state.completedNodes.length, 0), Math.max(state.completedNodes.length + 1, 1)),
      profile: state.profile,
      existingResources: node.resources,
      priorFeedback,
      constraints: {
        allowLLM: false,
        // Allow PPT for all stages except 'practice' — PPT is valuable for both overview and concept learning
        allowPPT: state.learnerSnapshot?.currentStage !== 'practice',
        latencyBudgetMs: 200,
        maxTypes: state.learnerSnapshot?.currentStage === 'practice' ? 3 : 4,
        boostTypes,
        suppressTypes,
      },
    }));

    write({ type: 'resource_decision', nodeId: node.id, decision });
    write({ type: 'phase_end', phase: 'resource_plan' });
    return { resourcePlan: decision, phase: 'resource_plan' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'resource_plan' });
    return { phase: 'resource_plan' };
  }
}
