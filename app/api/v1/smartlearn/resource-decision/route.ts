import { NextRequest, NextResponse } from 'next/server';
import {
  decideNodeResourcePlan,
  type DecisionInputV2,
  type DecisionConstraints,
  type NodeDecisionContext,
  type PriorNodeFeedback,
} from '@/lib/generation/resource-decision';
import type { ProfileDimensions } from '@/lib/types/profile';
import type { ResourceReference, ResourceType } from '@/lib/types/resource';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:smartlearn:resource-decision');

interface ResourceDecisionRequest {
  node: NodeDecisionContext;
  profile?: ProfileDimensions | null;
  feedback?: PriorNodeFeedback[];
  existingResources?: ResourceReference[];
  overrides?: {
    forceInclude?: ResourceType[];
    forceExclude?: ResourceType[];
    boostTypes?: ResourceType[];
    suppressTypes?: ResourceType[];
    maxTypes?: number;
    allowPPT?: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResourceDecisionRequest;

    // Validate required fields
    if (!body.node) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: node' },
        { status: 400 },
      );
    }

    if (!body.node.nodeId || !body.node.nodeTitle) {
      return NextResponse.json(
        { success: false, error: 'node must include nodeId and nodeTitle' },
        { status: 400 },
      );
    }

    log.info(
      `ResourceDecision POST: nodeId=${body.node.nodeId}, title="${body.node.nodeTitle}", ` +
      `knowledgePoints=${body.node.knowledgePoints?.length ?? 0}`,
    );

    // Build constraints from overrides
    const constraints: DecisionConstraints = {
      allowLLM: false,
      allowPPT: body.overrides?.allowPPT ?? true,
      maxTypes: body.overrides?.maxTypes,
      forceInclude: body.overrides?.forceInclude ?? [],
      forceExclude: body.overrides?.forceExclude ?? [],
      boostTypes: body.overrides?.boostTypes ?? [],
      suppressTypes: body.overrides?.suppressTypes ?? [],
    };

    // Build the decision input
    const input: DecisionInputV2 = {
      node: body.node,
      profile: body.profile ?? null,
      existingResources: body.existingResources ?? [],
      priorFeedback: body.feedback ?? [],
      constraints,
    };

    // Execute the decision engine
    const result = decideNodeResourcePlan(input);

    log.info(
      `ResourceDecision result: nodeId=${body.node.nodeId}, ` +
      `types=${result.execution.resourceTypes.join(',')}, ` +
      `ppt=${result.execution.shouldGeneratePPT}`,
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('ResourceDecision POST handler error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
}
