import { generateId } from '@/lib/utils';
import type { Resource, ResourceType } from '@/lib/types/resource';
import type { LearnEvent } from '../types';
import type { LearningStateType } from '../state';
import { generateResource } from '../helpers/resource-generators';
import { generatePptScenes } from '../helpers/ppt-generator';
import { useSettingsStore } from '@/lib/store/settings';
import type { Scene } from '@/lib/types/stage';

const AGENT_NAMES: Record<string, string> = {
  document: '文档Agent', mindmap: '思维导图Agent', quiz: '题库Agent',
  video: '视频Agent', code: '代码Agent', reading: '拓展阅读Agent', ppt: '课件Agent',
};

const MAX_CONCURRENCY = 3;

function getWriter(config: { configurable?: { writer?: (event: LearnEvent) => void } }) {
  return config.configurable?.writer ?? (() => undefined);
}

function getUserId(config: { configurable?: { userId?: string } }): string {
  return config.configurable?.userId ?? 'anonymous';
}

/**
 * 生成单个资源（含PPT）。
 * PPT 类型会调用 generatePptScenes，其他类型走 generateResource。
 * 返回 { resource, pptScenes? } —— pptScenes 仅 PPT 类型存在。
 */
async function generateSingleResource(
  type: string,
  knowledgePoints: string[],
  profile: LearningStateType['profile'],
  aiConfig: LearningStateType['aiConfig'],
  userId: string,
  write: (event: LearnEvent) => void,
  nodeId: string,
) {
  write({ type: 'agent_status', agentId: type, agentName: AGENT_NAMES[type] || type, status: 'running', resourceType: type as ResourceType });

  try {
    // PPT 走专用生成器
    if (type === 'ppt') {
      const pptScenes = await generatePptScenes(`讲解：${knowledgePoints.join('、')}`, aiConfig, true, true, knowledgePoints);
      if (pptScenes.length > 0) {
        write({ type: 'ppt_ready', scenes: pptScenes, nodeId, userId, knowledgePoints });
        const pptResource: Resource = {
          id: generateId(), userId, type: 'ppt', title: `${knowledgePoints.join('、')} - 动态课件`,
          content: `PPT课件：共${pptScenes.length}页`, sourceAgent: 'ppt', status: 'ready',
          createdAt: new Date().toISOString(),
          metadata: { knowledgePoints, profileUsed: true, pptData: pptScenes },
        };
        write({ type: 'resource_delta', resource: pptResource });
        write({ type: 'agent_status', agentId: 'ppt', agentName: AGENT_NAMES.ppt, status: 'completed', resourceType: 'ppt' as ResourceType });
        return { resource: pptResource, pptScenes };
      }
      // PPT 场景为空视为失败
      write({ type: 'agent_status', agentId: 'ppt', agentName: AGENT_NAMES.ppt, status: 'failed', resourceType: 'ppt' as ResourceType });
      const fallbackResource: Resource = {
        id: generateId(), userId, type: 'ppt', title: `${knowledgePoints.join('、')} - ppt（生成失败）`,
        content: '资源生成失败，请重试', sourceAgent: 'ppt', status: 'failed',
        createdAt: new Date().toISOString(), metadata: { knowledgePoints, error: true },
      };
      write({ type: 'resource_delta', resource: fallbackResource });
      return { resource: fallbackResource, pptScenes: null };
    }

    // 其他资源类型
    const generated = await generateResource(type as ResourceType, knowledgePoints, profile, aiConfig);
    const resource: Resource = {
      id: generateId(), userId, type: type as ResourceType, title: generated.title, content: generated.content,
      sourceAgent: type, status: 'ready', createdAt: new Date().toISOString(),
      metadata: { knowledgePoints, profileUsed: true, ...generated.metadata },
    };
    write({ type: 'resource_delta', resource });
    write({ type: 'agent_status', agentId: type, agentName: AGENT_NAMES[type] || type, status: 'completed', resourceType: type as ResourceType });
    return { resource, pptScenes: null };
  } catch (_err) {
    write({ type: 'agent_status', agentId: type, agentName: AGENT_NAMES[type] || type, status: 'failed', resourceType: type as ResourceType });
    const fallbackResource: Resource = {
      id: generateId(), userId, type: type as ResourceType, title: `${knowledgePoints.join('、')} - ${type}（生成失败）`,
      content: '资源生成失败，请重试', sourceAgent: type, status: 'failed',
      createdAt: new Date().toISOString(), metadata: { knowledgePoints, error: true },
    };
    write({ type: 'resource_delta', resource: fallbackResource });
    return { resource: fallbackResource, pptScenes: null };
  }
}

export async function generateResourcesNode(
  state: LearningStateType,
  config: { configurable?: { writer?: (event: LearnEvent) => void; userId?: string } },
) {
  const write = getWriter(config);
  const node = state.currentNode;
  const resourcePlan = state.resourcePlan;
  if (!node || !resourcePlan) return { phase: 'generate' };
  write({ type: 'phase_start', phase: 'generate' });

  try {
    // 收集所有启用的资源类型（含PPT），统一并行生成
    const types = resourcePlan.execution.resourceTypes;
    const disabledAgentIds = typeof window !== 'undefined' ? useSettingsStore.getState().disabledAgentIds ?? [] : [];
    const enabledTypes = types.filter((type) => !disabledAgentIds.includes(type));
    if (resourcePlan.execution.shouldGeneratePPT && !disabledAgentIds.includes('ppt') && !enabledTypes.includes('ppt')) {
      enabledTypes.push('ppt');
    }

    const generatedResources: Resource[] = [];
    let pptScenes: Scene[] | null = null;

    // 分批并行生成，每批最多 MAX_CONCURRENCY 个
    for (let i = 0; i < enabledTypes.length; i += MAX_CONCURRENCY) {
      const batch = enabledTypes.slice(i, i + MAX_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((type) =>
          generateSingleResource(type, node.knowledgePoints, state.profile, state.aiConfig, getUserId(config), write, node.id)
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          generatedResources.push(result.value.resource);
          if (result.value.pptScenes) pptScenes = result.value.pptScenes;
        }
      }
    }

    // Build the full node list: all completed nodes + the current node with resource refs
    const nodeWithResources = { ...node, resources: generatedResources.map((resource) => ({ resourceId: resource.id, type: resource.type, title: resource.title })) }
    const allNodes = [...state.completedNodes, nodeWithResources]

    // Build edges: link each completed node to its successor, plus edge from last completed to current
    const allEdges: { from: string; to: string }[] = []
    for (let i = 0; i < state.completedNodes.length - 1; i++) {
      allEdges.push({ from: state.completedNodes[i].id, to: state.completedNodes[i + 1].id })
    }
    if (state.completedNodes.length > 0) {
      allEdges.push({ from: state.completedNodes[state.completedNodes.length - 1].id, to: node.id })
    }

    const path = {
      id: state.sessionId,
      userId: getUserId(config),
      goal: state.goal,
      nodes: allNodes,
      edges: allEdges,
      estimatedDays: Math.max(1, allNodes.length),
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    write({ type: 'path_update', path });
    write({ type: 'phase_end', phase: 'generate' });
    return { generatedResources, pptScenes, phase: 'generate' };
  } catch (error) {
    write({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    write({ type: 'phase_end', phase: 'generate' });
    return { phase: 'generate' };
  }
}
