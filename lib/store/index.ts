// Existing stores
export { useStageStore, PENDING_SCENE_ID } from './stage';
export { useCanvasStore } from './canvas';
export { useKeyboardStore } from './keyboard';
export { useLearningPathStore } from './learning-path';
export { useResourcesStore } from './resources';
export { useLearningProfileStore } from './learning-profile';
export { useSettingsStore } from './settings';
export { useSessionsStore } from './sessions';
export type { LearningSession, TutorChatMessage } from './sessions';
export { useUIStore } from './ui-store';
export { useAgentActivityStore } from './agent-activity';
export type { AgentActivityEntry } from './agent-activity';
export { useMediaGenerationStore, isMediaPlaceholder } from './media-generation';
export type { MediaGenerationTask } from './media-generation';
export { useResourceDecisionsStore } from './resource-decisions';
export type { ResourceDecisionLog, NodeDecisionOverride, NodeDecisionFeedback } from './resource-decisions';
export { useUserProfileStore } from './user-profile';
export type { UserProfileState } from './user-profile';
export { useWhiteboardHistoryStore } from './whiteboard-history';

// New v2 stores
export { useChatStore } from './chat-store';
export { useSessionStore } from './session-store';
export type { Session } from './session-store';
export { useKnowledgeStore } from './knowledge-store';
export type { KnowledgeBase } from './knowledge-store';
export { useMemoryStore } from './memory-store';
export type { MemoryEntry } from './memory-store';
export { useBookStore } from './book-store';
export type { Book } from './book-store';
export { useCowriterStore } from './cowriter-store';
export type { CowriterDoc } from './cowriter-store';
export { useSettingsStoreV2 } from './settings-store';
