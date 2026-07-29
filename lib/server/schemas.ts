/**
 * Zod schemas for all active API route request bodies.
 *
 * Each schema is named by route path and HTTP method.
 * Import in route handlers and use with validatedBody().
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Book routes
// ---------------------------------------------------------------------------

export const BookCreateSchema = z.object({
  userIntent: z.string().min(1, 'userIntent is required'),
  chatSelections: z.array(z.string()).optional(),
  notebookRefs: z.array(z.string()).optional(),
  knowledgeBases: z.array(z.string()).optional(),
});

export const BookIdBodySchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
});

export const BookCompilePageSchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
  pageId: z.string().min(1, 'pageId is required'),
});

export const BookRegenerateBlockSchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
  pageId: z.string().min(1, 'pageId is required'),
  blockIndex: z.number().int().min(0, 'blockIndex is required'),
});

export const BookInsertBlockSchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
  pageId: z.string().min(1, 'pageId is required'),
  index: z.number().int().min(0).optional(),
  type: z.string().min(1, 'type is required'),
  params: z.record(z.unknown()).optional(),
});

export const BookDeleteBlockSchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
  pageId: z.string().min(1, 'pageId is required'),
  blockIndex: z.number().int().min(0, 'blockIndex is required'),
});

export const BookMoveBlockSchema = z.object({
  bookId: z.string().min(1, 'bookId is required'),
  pageId: z.string().min(1, 'pageId is required'),
  fromIndex: z.number().int().min(0, 'fromIndex is required'),
  toIndex: z.number().int().min(0, 'toIndex is required'),
});

// ---------------------------------------------------------------------------
// Co-Writer routes
// ---------------------------------------------------------------------------

export const CoWriterCreateSchema = z.object({
  title: z.string().optional().default(''),
  content: z.string().optional().default(''),
}).refine(
  (data) => data.title.length > 0 || data.content.length > 0,
  { message: 'title or content is required' },
);

export const CoWriterUpdateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
}).refine(
  (data) => data.title !== undefined || data.content !== undefined,
  { message: 'title or content is required' },
);

export const CoWriterEditSchema = z.object({
  text: z.string().min(1, 'text is required'),
  instruction: z.string().optional().default(''),
  action: z.enum(['rewrite', 'shorten', 'expand', 'summarize']),
  source: z.enum(['rag', 'web']).nullable().optional(),
  kbName: z.string().optional(),
  language: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Turns (chat SSE)
// ---------------------------------------------------------------------------

export const TurnCreateSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  message: z.string().min(1, 'message is required'),
  capability: z.string().optional(),
  enabledTools: z.array(z.string()).optional(),
  knowledgeBases: z.array(z.string()).optional(),
  attachments: z.array(z.unknown()).optional(),
  language: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  conversationHistory: z.array(z.record(z.unknown())).optional(),
});

// ---------------------------------------------------------------------------
// SmartLearn
// ---------------------------------------------------------------------------

export const SmartLearnRequestSchema = z.object({
  action: z.string().min(1, 'action is required'),
  sessionId: z.string().min(1, 'sessionId is required'),
  profile: z.unknown(),
  goal: z.string().min(1, 'goal is required'),
  completedNodes: z.unknown().optional(),
  currentNodeId: z.string().nullable().optional(),
  quizResults: z.unknown().optional(),
  message: z.string().optional(),
  conversationHistory: z.unknown().optional(),
  attachedResources: z.unknown().optional(),
  currentNodeTitle: z.string().nullable().optional(),
  aiConfig: z.unknown().optional(),
  resourceFeedback: z.unknown().optional(),
  nodeDecisionOverrides: z.unknown().optional(),
});

export const SmartLearnEvaluateSchema = z.object({
  sessionId: z.string().optional(),
  quizResults: z.unknown(),
  profile: z.unknown(),
  goal: z.string().min(1, 'goal is required'),
  completedNodes: z.unknown().optional(),
  currentNodeId: z.string().nullable().optional(),
  currentNodeTitle: z.string().optional(),
  aiConfig: z.unknown().optional(),
}).refine(
  (data) => Array.isArray(data.quizResults) && data.quizResults.length > 0,
  { message: 'quizResults must be a non-empty array' },
).refine(
  (data) => data.profile != null && typeof data.profile === 'object',
  { message: 'profile is required and must be an object' },
);

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const KnowledgeCreateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Query param schemas (for GET routes)
// ---------------------------------------------------------------------------

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const SessionCreateSchema = z.object({
  title: z.string().optional(),
  capability: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const SessionUpdateSchema = z.object({
  title: z.string().min(1, 'title is required'),
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const MemoryReadSchema = z.object({
  userId: z.string().optional(),
  surface: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const MemoryWriteSchema = z.object({
  userId: z.string().optional(),
  surface: z.string().optional(),
  slot: z.string().optional(),
  content: z.string().min(1, 'content is required'),
  event: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Notebook
// ---------------------------------------------------------------------------

export const NotebookCreateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
});

export const NotebookUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

export const NoteCreateSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'content is required'),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export const PersonaCreateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().min(1, 'description is required'),
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  tags: z.array(z.string()).optional(),
});

export const PersonaUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Code execution
// ---------------------------------------------------------------------------

export const CodeExecuteSchema = z.object({
  code: z.string().min(1, 'code is required'),
  language: z.string().optional().default('python'),
  version: z.string().optional(),
  timeout: z.number().int().min(1).max(60).optional(),
  stdin: z.string().optional(),
  args: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

export const MCPServerCreateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  command: z.string().min(1, 'command is required'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const SettingsUpdateSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  theme: z.string().optional(),
  language: z.string().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'at least one setting field is required' },
);

// ---------------------------------------------------------------------------
// Verify model
// ---------------------------------------------------------------------------

export const VerifyModelSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  model: z.string().min(1, 'model is required'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export const ApiKeyCreateSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  apiKey: z.string().min(1, 'apiKey is required'),
  label: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const ProfileUpdateSchema = z.object({
  dimensions: z.record(z.unknown()).optional(),
  preferences: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.dimensions !== undefined || data.preferences !== undefined,
  { message: 'dimensions or preferences is required' },
);
