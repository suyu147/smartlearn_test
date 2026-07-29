/**
 * 资源生成决策模块
 *
 * 第一阶段实现：
 * - 规则层结构化决策
 * - 对现有执行链路保持兼容
 * - 为后续 LLM / 反馈层预留统一数据结构
 */

import type { LearningPathNode } from '@/lib/types/learning-path';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { ResourceReference, ResourceType } from '@/lib/types/resource';

const CORE_RESOURCE_TYPES: ResourceType[] = ['document', 'mindmap', 'quiz', 'reading'];
const DECISION_RESOURCE_TYPES: ResourceType[] = ['document', 'mindmap', 'quiz', 'video', 'code', 'reading', 'ppt'];
const PRACTICE_KEYWORDS = ['作业', '练习', '复习'];
const INTRO_KEYWORDS = ['导论', '背景', '历史'];

const CODE_KEYWORDS = [
  '编程', '代码', '函数', '变量', '类', '对象', '算法', '数据结构',
  'python', 'java', 'javascript', 'typescript', 'c++', 'go', 'rust',
  'sql', 'html', 'css', 'react', 'vue', 'node', 'api', 'sdk',
  'git', 'docker', '命令行', '终端', 'shell', '调试', '测试',
  '框架', '库', '包', '模块', '依赖', '导入', '导出', '接口',
  '排序', '搜索', '递归', '迭代', '遍历', '图', '树', '哈希',
  '动态规划', '贪心', '回溯', '分治',
];

const VIDEO_KEYWORDS = [
  '操作', '演示', '实验', '安装', '配置', '部署', '搭建',
  '调试', '运行', '启动', '设置', '连接', '创建项目',
  '命令行', '终端', 'ide', '编辑器', '浏览器', '开发者工具',
  '实践', '动手', '实操', '项目实战', '案例', '示例',
  '流程', '步骤', '过程', '方法', '技巧',
];

export type DecisionLayer = 'rules' | 'llm' | 'feedback';
export type ResourceDecisionAction = 'generate' | 'skip' | 'replace' | 'keep';

export interface ResourceDecision {
  types: ResourceType[];
  reasoning: string[];
  skipped: { type: ResourceType; reason: string }[];
}

export interface DecisionInput {
  knowledgePoints: string[];
  nodeTitle: string;
  profile?: ProfileDimensions | null;
  existingTypes?: ResourceType[];
}

export interface NodeDecisionContext {
  nodeId: string;
  nodeTitle: string;
  knowledgePoints: string[];
  nodeIndex: number;
  totalNodes: number;
  estimatedMinutes?: number;
  prerequisites?: string[];
  previousNodeIds?: string[];
  nextNodeIds?: string[];
}

export interface PriorNodeFeedback {
  nodeId: string;
  acceptedTypes?: ResourceType[];
  rejectedTypes?: ResourceType[];
  skippedTypes?: ResourceType[];
  clickedTypes?: ResourceType[];
  viewedTypes?: ResourceType[];
  dwellMsByType?: Partial<Record<ResourceType, number>>;
  quizCompleted?: boolean;
  quizScore?: number;
}

export interface DecisionConstraints {
  allowLLM?: boolean;
  maxTypes?: number;
  allowPPT?: boolean;
  latencyBudgetMs?: number;
  llmTimeoutMs?: number;
  forceInclude?: ResourceType[];
  forceExclude?: ResourceType[];
  boostTypes?: ResourceType[];
  suppressTypes?: ResourceType[];
}

export interface DecisionInputV2 {
  node: NodeDecisionContext;
  profile?: ProfileDimensions | null;
  existingResources?: ResourceReference[];
  priorFeedback?: PriorNodeFeedback[];
  constraints?: DecisionConstraints;
}

export interface ResourceDecisionItem {
  type: ResourceType;
  action: ResourceDecisionAction;
  reason: string;
  sourceLayer: DecisionLayer;
  confidence?: number;
  replacesResourceId?: string;
}

export interface ResourceDecisionResultV2 {
  version: 2;
  items: ResourceDecisionItem[];
  execution: {
    resourceTypes: ResourceType[];
    shouldGeneratePPT: boolean;
  };
  summary: {
    reasoning: string[];
    skipped: { type: ResourceType; reason: string }[];
  };
  trace: {
    rulesApplied: string[];
    llmUsed: boolean;
    llmFallbackReason?: string;
    feedbackSignals: string[];
    durationMs: {
      rules: number;
      feedback: number;
      total: number;
      llm?: number;
    };
  };
}

export function buildNodeDecisionContext(node: LearningPathNode, nodeIndex: number, totalNodes: number): NodeDecisionContext {
  return {
    nodeId: node.id,
    nodeTitle: node.title,
    knowledgePoints: node.knowledgePoints,
    nodeIndex,
    totalNodes,
    estimatedMinutes: node.estimatedMinutes,
    prerequisites: node.prerequisites,
    previousNodeIds: nodeIndex > 0 ? [String(nodeIndex - 1)] : [],
    nextNodeIds: nodeIndex < totalNodes - 1 ? [String(nodeIndex + 1)] : [],
  };
}

export function decideNodeResourcePlan(input: DecisionInputV2): ResourceDecisionResultV2 {
  const startedAt = Date.now();
  const { node, profile, constraints, priorFeedback = [], existingResources = [] } = input;
  const rulesApplied: string[] = [];
  const feedbackSignals: string[] = [];
  const existingTypes = new Set(existingResources.map((resource) => resource.type));
  const userPreferredFormats = profile?.interests?.preferredFormats ?? [];
  const forceInclude = constraints?.forceInclude ?? [];
  const forceExclude = new Set(constraints?.forceExclude ?? []);
  const boostTypes = new Set(constraints?.boostTypes ?? []);
  const suppressTypes = new Set(constraints?.suppressTypes ?? []);
  const allowPPT = constraints?.allowPPT ?? true;
  const maxTypes = constraints?.maxTypes;
  const text = normalizeText(`${node.nodeTitle} ${node.knowledgePoints.join(' ')}`);
  const items = new Map<ResourceType, ResourceDecisionItem>();
  const feedbackScores = createFeedbackScores(priorFeedback, feedbackSignals);

  const rulesStartedAt = Date.now();
  const isPracticeNode = matchesAny(text, PRACTICE_KEYWORDS);
  const isIntroNode = isIntroductoryNode(node.knowledgePoints);
  const needsCode = matchesAny(text, CODE_KEYWORDS);
  const needsVideoByContent = matchesAny(text, VIDEO_KEYWORDS);
  const prefersVideo = userPreferredFormats.includes('video');
  const isFirstNode = node.nodeIndex === 0;

  if (isPracticeNode) {
    rulesApplied.push('practice_only_quiz');
    markSkip('document', '练习/复习类节点优先通过测验巩固');
    markSkip('mindmap', '练习/复习类节点不优先生成思维导图');
    markGenerate('quiz', '标题命中练习/复习规则，仅生成测验', 0.96);
    markSkip('reading', '练习/复习类节点不优先生成拓展阅读');
    markSkip('video', '练习/复习类节点排除视频');
    markSkip('code', needsCode ? '虽然涉及代码，但练习/复习规则优先，仅保留测验' : '练习/复习类节点不优先生成代码');
    markSkip('ppt', '练习/复习类节点排除动态课件');
  } else if (isIntroNode) {
    rulesApplied.push('intro_document_reading_only');
    markGenerate('document', '导论/背景/历史类内容适合讲解文档', 0.9);
    markSkip('mindmap', isFirstNode ? '该节点命中导论规则，优先保持内容轻量' : '导论/背景/历史类内容不优先生成思维导图');
    markSkip('quiz', '导论/背景/历史类内容不优先生成测验');
    markGenerate('reading', '导论/背景/历史类内容适合拓展阅读', 0.9);
    markSkip('video', '导论/背景/历史类内容不优先生成视频');
    markSkip('code', '导论/背景/历史类内容不优先生成代码');
    markSkip('ppt', '导论/背景/历史类内容不优先生成动态课件');
  } else {
    rulesApplied.push('default_core_resources');
    for (const type of CORE_RESOURCE_TYPES) {
      markGenerate(type, coreReason(type), 0.8);
    }

    if (isFirstNode) {
      rulesApplied.push('first_node_force_mindmap');
      markGenerate('mindmap', '首个节点强制生成思维导图帮助建立整体框架', 0.95);
    }

    if (needsCode) {
      rulesApplied.push('code_keyword_force_code');
      markGenerate('code', '知识点命中代码/函数/API 等编程关键词', 0.92);
    } else {
      markSkip('code', '节点不涉及明显编程内容，跳过代码案例');
    }

    if (needsVideoByContent || prefersVideo) {
      const reason = needsVideoByContent
        ? '节点包含操作演示或步骤类内容'
        : '用户偏好视频格式';
      if (prefersVideo) {
        rulesApplied.push('preferred_video');
      }
      markGenerate('video', reason, prefersVideo ? 0.86 : 0.8);
    } else {
      markSkip('video', '节点无明显演示需求且用户未偏好视频');
    }

    if (allowPPT && node.knowledgePoints.length > 0) {
      markGenerate('ppt', '该节点存在明确知识点，适合生成动态课件', 0.78);
    } else if (!allowPPT) {
      markSkip('ppt', '当前系统约束禁止生成动态课件');
    } else {
      markSkip('ppt', '节点缺少知识点，跳过动态课件');
    }
  }

  for (const type of forceInclude) {
    rulesApplied.push(`force_include_${type}`);
    markGenerate(type, '系统约束要求强制包含该资源类型', 1);
  }

  for (const type of DECISION_RESOURCE_TYPES) {
    if (forceExclude.has(type)) {
      rulesApplied.push(`force_exclude_${type}`);
      markSkip(type, '系统约束要求排除该资源类型');
      continue;
    }

    if (boostTypes.has(type) && items.get(type)?.action === 'skip') {
      const item = items.get(type);
      if (item && !forceExclude.has(type)) {
        items.set(type, { ...item, action: 'generate', reason: `评估反馈：薄弱知识点需要${type}资源强化`, sourceLayer: 'feedback' as const });
      }
    }
    if (suppressTypes.has(type) && items.get(type)?.action === 'generate') {
      const item = items.get(type);
      if (item && !forceInclude.includes(type)) {
        items.set(type, { ...item, action: 'skip', reason: `评估反馈：已掌握内容跳过${type}资源` });
      }
    }

    const item = items.get(type);
    if (!item) continue;

    if (existingTypes.has(type) && item.action === 'generate') {
      markSkip(type, '已存在同类型资源，跳过重复生成');
      continue;
    }

    const feedbackScore = feedbackScores[type] ?? 0;
    if (feedbackScore <= -2 && item.action === 'generate') {
      markSkip(type, '历史反馈持续不偏好该资源类型，当前轮次跳过');
    } else if (feedbackScore >= 2 && item.action === 'skip' && type !== 'ppt') {
      markGenerate(type, '历史反馈显示该资源类型有效，重新纳入建议', 0.7, 'feedback');
    }
  }

  let resourceTypes = DECISION_RESOURCE_TYPES
    .filter((type) => type !== 'ppt')
    .filter((type) => items.get(type)?.action === 'generate');

  if (typeof maxTypes === 'number' && maxTypes >= 0 && resourceTypes.length > maxTypes) {
    rulesApplied.push('max_types_limit');
    const limitedTypes = resourceTypes.slice(0, maxTypes);
    for (const type of resourceTypes.slice(maxTypes)) {
      markSkip(type, '受系统资源数量上限约束，本轮暂不生成');
    }
    resourceTypes = limitedTypes;
  }

  const shouldGeneratePPT = items.get('ppt')?.action === 'generate';
  const reasoning = Array.from(items.values()).map((item) => {
    const prefix = item.action === 'generate' ? item.type : `跳过 ${item.type}`;
    return `[${prefix}] ${item.reason}`;
  });
  const skipped = Array.from(items.values())
    .filter((item) => item.action !== 'generate')
    .map((item) => ({ type: item.type, reason: item.reason }));

  const rulesDuration = Date.now() - rulesStartedAt;
  const totalDuration = Date.now() - startedAt;

  return {
    version: 2,
    items: DECISION_RESOURCE_TYPES
      .filter((type) => items.has(type))
      .map((type) => items.get(type)!),
    execution: {
      resourceTypes,
      shouldGeneratePPT,
    },
    summary: {
      reasoning,
      skipped,
    },
    trace: {
      rulesApplied,
      llmUsed: false,
      feedbackSignals,
      durationMs: {
        rules: rulesDuration,
        feedback: 0,
        total: totalDuration,
      },
    },
  };

  function markGenerate(type: ResourceType, reason: string, confidence = 0.8, sourceLayer: DecisionLayer = 'rules') {
    items.set(type, {
      type,
      action: 'generate',
      reason,
      sourceLayer,
      confidence,
    });
  }

  function markSkip(type: ResourceType, reason: string, sourceLayer: DecisionLayer = 'rules') {
    items.set(type, {
      type,
      action: 'skip',
      reason,
      sourceLayer,
    });
  }
}

export function decideResourceTypes(input: DecisionInput): ResourceDecision {
  const plan = decideNodeResourcePlan({
    node: {
      nodeId: 'legacy-node',
      nodeTitle: input.nodeTitle,
      knowledgePoints: input.knowledgePoints,
      nodeIndex: 0,
      totalNodes: 1,
    },
    profile: input.profile,
    existingResources: (input.existingTypes ?? []).map((type) => ({
      resourceId: `${type}-existing`,
      type,
      title: type,
    })),
    constraints: {
      allowLLM: false,
      allowPPT: true,
    },
  });

  return {
    types: plan.execution.resourceTypes,
    reasoning: plan.summary.reasoning,
    skipped: plan.summary.skipped.filter((item) => item.type !== 'ppt'),
  };
}

export function shouldGeneratePPT(knowledgePoints: string[], existingPPT: boolean): boolean {
  const plan = decideNodeResourcePlan({
    node: {
      nodeId: 'legacy-ppt',
      nodeTitle: knowledgePoints.join(' '),
      knowledgePoints,
      nodeIndex: 0,
      totalNodes: 1,
    },
    existingResources: existingPPT
      ? [{ resourceId: 'ppt-existing', type: 'ppt', title: 'ppt' }]
      : [],
    constraints: {
      allowLLM: false,
      allowPPT: true,
    },
  });

  return plan.execution.shouldGeneratePPT;
}

function createFeedbackScores(priorFeedback: PriorNodeFeedback[], feedbackSignals: string[]): Partial<Record<ResourceType, number>> {
  const scores: Partial<Record<ResourceType, number>> = {};

  for (const feedback of priorFeedback) {
    for (const type of feedback.acceptedTypes ?? []) {
      scores[type] = (scores[type] ?? 0) + 1;
      feedbackSignals.push(`accepted:${type}`);
    }
    for (const type of feedback.rejectedTypes ?? []) {
      scores[type] = (scores[type] ?? 0) - 1;
      feedbackSignals.push(`rejected:${type}`);
    }
    for (const type of feedback.clickedTypes ?? []) {
      scores[type] = (scores[type] ?? 0) + 0.5;
      feedbackSignals.push(`clicked:${type}`);
    }
    for (const type of feedback.viewedTypes ?? []) {
      scores[type] = (scores[type] ?? 0) + 0.25;
      feedbackSignals.push(`viewed:${type}`);
      const dwellMs = feedback.dwellMsByType?.[type] ?? 0;
      if (dwellMs >= 30_000) {
        scores[type] = (scores[type] ?? 0) + 0.75;
        feedbackSignals.push(`dwell:${type}:${dwellMs}`);
      }
    }
    for (const type of feedback.skippedTypes ?? []) {
      scores[type] = (scores[type] ?? 0) - 0.5;
      feedbackSignals.push(`skipped:${type}`);
    }
    if (feedback.quizCompleted) {
      scores.quiz = (scores.quiz ?? 0) + 0.5;
      feedbackSignals.push('quiz:completed');
    }
    if (typeof feedback.quizScore === 'number') {
      feedbackSignals.push(`quiz:score:${feedback.quizScore}`);
      if (feedback.quizScore < 60) {
        scores.document = (scores.document ?? 0) + 0.5;
        scores.reading = (scores.reading ?? 0) + 0.5;
      } else if (feedback.quizScore >= 85) {
        scores.quiz = (scores.quiz ?? 0) + 0.5;
      }
    }
  }

  return scores;
}

function isIntroductoryNode(knowledgePoints: string[]): boolean {
  if (knowledgePoints.length === 0) return false;
  return knowledgePoints.every((point) => matchesAny(normalizeText(point), INTRO_KEYWORDS));
}

function coreReason(type: ResourceType): string {
  switch (type) {
    case 'document':
      return '文档有助于系统讲解核心内容';
    case 'mindmap':
      return '思维导图有助于建立知识结构';
    case 'quiz':
      return '测验有助于检验学习效果';
    case 'reading':
      return '拓展阅读有助于补充背景与案例';
    default:
      return '该资源类型适合当前节点';
  }
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeText(text: string): string {
  return text.toLowerCase();
}
