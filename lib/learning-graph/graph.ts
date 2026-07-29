import { END, START, StateGraph } from '@langchain/langgraph';
import { LearningState, type LearningStateType } from './state';
import { routeByAction } from './nodes/router';
import { planNode } from './nodes/plan-node';
import { analyzeLearnerNode } from './nodes/analyze-learner';
import { planResourcesNode } from './nodes/plan-resources';
import { generateResourcesNode } from './nodes/generate-resources';
import { evaluateNode } from './nodes/evaluate';
import { updateProfileNode } from './nodes/update-profile';
import { tutorRespondNode } from './nodes/tutor-respond';

function afterEvaluate(state: LearningStateType) {
  return state.action === 'node_complete' ? 'update_profile' : 'update_profile_end';
}

function afterUpdateProfile(state: LearningStateType) {
  return state.action === 'node_complete' ? 'plan_node' : END;
}

export function compileLearningGraph() {
  return new StateGraph(LearningState)
    .addNode('plan_node', planNode)
    .addNode('analyze_learner', analyzeLearnerNode)
    .addNode('plan_resources', planResourcesNode)
    .addNode('generate_resources', generateResourcesNode)
    .addNode('evaluate', evaluateNode)
    .addNode('update_profile', updateProfileNode)
    .addNode('update_profile_end', updateProfileNode)
    .addNode('tutor_respond', tutorRespondNode)
    .addConditionalEdges(START, routeByAction as never, {
      plan_node: 'plan_node',
      analyze_learner: 'analyze_learner',
      evaluate: 'evaluate',
      tutor_respond: 'tutor_respond',
      [END]: END,
    })
    .addEdge('plan_node', 'analyze_learner')
    .addEdge('analyze_learner', 'plan_resources')
    .addEdge('plan_resources', 'generate_resources')
    .addEdge('generate_resources', END)
    .addConditionalEdges('evaluate', afterEvaluate as never, {
      update_profile: 'update_profile',
      update_profile_end: 'update_profile_end',
    })
    .addConditionalEdges('update_profile', afterUpdateProfile as never, {
      plan_node: 'plan_node',
      [END]: END,
    })
    .addEdge('update_profile_end', END)
    .addEdge('tutor_respond', END)
    .compile();
}
