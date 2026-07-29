/**
 * DeepTutor Bootstrap — Initialize registries and capabilities
 *
 * Single-module initialization point for the DeepTutor migration.
 * Called once at first request (lazy singleton pattern).
 */

import { ToolRegistry } from '@/lib/deeptutor/tools/registry';
import { CapabilityRegistry } from '@/lib/deeptutor/capabilities/registry';
import { registerSimpleTools } from '@/lib/deeptutor/tools/register-simple';
import { ChatCapability } from '@/lib/deeptutor/capabilities/chat/chat-capability';
import { ChatOrchestrator } from '@/lib/deeptutor/core/orchestrator';
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
// Phase 2b — RAG + read_source
import { RAGTool, setRAGToolContext } from '@/lib/deeptutor/tools/rag';
import { ReadSourceTool } from '@/lib/deeptutor/tools/read-source';
import { createEmbeddingService } from '@/lib/deeptutor/services/embedding';
import { RAGServiceImpl } from '@/lib/deeptutor/services/rag';
import { RerankerServiceImpl } from '@/lib/deeptutor/services/reranker';
import { KBSeedService } from '@/lib/deeptutor/services/kb-seed';
// Phase 2c — Sandbox + Memory + Notebook + Deferred loader
import { SandboxServiceImpl } from '@/lib/deeptutor/services/sandbox';
import { MemoryServiceImpl } from '@/lib/deeptutor/services/memory';
import { registerMemorySubscriber } from '@/lib/deeptutor/services/memory-subscriber';
import { NotebookServiceImpl } from '@/lib/deeptutor/services/notebook';
import { CodeExecutionTool, setSandboxToolContext } from '@/lib/deeptutor/tools/code-execution';
import { ReadMemoryTool, setReadMemoryContext } from '@/lib/deeptutor/tools/read-memory';
import { WriteMemoryTool, setWriteMemoryContext } from '@/lib/deeptutor/tools/write-memory';
import { ListNotebookTool, setListNotebookContext } from '@/lib/deeptutor/tools/list-notebook';
import { WriteNoteTool, setWriteNoteContext } from '@/lib/deeptutor/tools/write-note';
import { PaperSearchTool } from '@/lib/deeptutor/tools/paper-search';
import { LoadToolsTool } from '@/lib/deeptutor/tools/deferred-loader';
// Phase 2d — SmartLearn GraphCapability
import { SmartLearnCapability } from '@/lib/deeptutor/capabilities/smartlearn';
// Phase 3a — Services
import { PersonaServiceImpl } from '@/lib/deeptutor/services/persona';
import { SkillServiceImpl } from '@/lib/deeptutor/services/skill';
import { LearningServiceImpl } from '@/lib/deeptutor/services/learning';
// Phase 3a — Tools
import { GithubTool, setGithubToolContext } from '@/lib/deeptutor/tools/github';
import { ReadSkillTool, setReadSkillContext } from '@/lib/deeptutor/tools/read-skill';
import { SolvePlanTool, setSolvePlanContext } from '@/lib/deeptutor/tools/solve-plan';
import { SolveFinishStepTool } from '@/lib/deeptutor/tools/solve-finish-step';
import { SolveReplanTool } from '@/lib/deeptutor/tools/solve-replan';
import {
  MasteryStatusTool,
  MasteryQuizTool,
  MasteryGradeTool,
  MasteryAssessTool,
  MasteryBuildTool,
  setMasteryToolsContext,
} from '@/lib/deeptutor/tools/mastery';
// Phase 3a — Capabilities
import { DeepSolveCapability } from '@/lib/deeptutor/capabilities/solve';
import { MasteryPathCapability } from '@/lib/deeptutor/capabilities/mastery';
import { ExploreContextCapability } from '@/lib/deeptutor/capabilities/explore';
// Phase 3b — Capabilities + MCP
import { DeepQuestionCapability } from '@/lib/deeptutor/capabilities/question';
import { DeepResearchCapability } from '@/lib/deeptutor/capabilities/research';
import { VisualizeCapability } from '@/lib/deeptutor/capabilities/visualize';
import { MCPService } from '@/lib/deeptutor/services/mcp';
// Phase 4a — Co-Writer
import { CoWriterStorage, EditAgent, OperationHistory } from '@/lib/deeptutor/services/co-writer';
// Phase 4b — Book Engine
import { BookEngine, BookStorage } from '@/lib/deeptutor/services/book';
import { resolveApiKey, resolveProviderId, resolveModelId, resolveBaseUrl } from '@/lib/server/resolve-model';
// Phase 5 — Obsidian
import { createObsidianTools, setObsidianToolContext } from '@/lib/deeptutor/tools/obsidian';
import { ObsidianCapability } from '@/lib/deeptutor/capabilities/obsidian';
// Phase 5 — Vision Solver
import { VisionSolverCapability } from '@/lib/deeptutor/capabilities/vision';
// Phase 5 — Math Animator
import { MathAnimatorCapability } from '@/lib/deeptutor/capabilities/math-animator';
// Phase 5 — Media tools
import { createMediaTools, setMediaToolContext } from '@/lib/deeptutor/tools/media';
// Phase 5 — Notebook Capability
import { NotebookCapability } from '@/lib/deeptutor/capabilities/notebook';
// Phase 5 — Skill Packs
import { getBuiltInSkills } from '@/lib/deeptutor/services/skill-packs';
// Phase 5 — Chat Import
import { ChatImportService } from '@/lib/deeptutor/services/chat-import';

const log = createLogger('Bootstrap');

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _toolRegistry: ToolRegistry | null = null;
let _capabilityRegistry: CapabilityRegistry | null = null;
let _orchestrator: ChatOrchestrator | null = null;
// Phase 2b services
let _embeddingService: ReturnType<typeof createEmbeddingService> | null = null;
let _ragService: RAGServiceImpl | null = null;
let _kbSeedService: KBSeedService | null = null;
// Phase 2c services
let _sandboxService: SandboxServiceImpl | null = null;
let _memoryService: MemoryServiceImpl | null = null;
let _notebookService: NotebookServiceImpl | null = null;
// Phase 3a services
let _personaService: PersonaServiceImpl | null = null;
let _skillService: SkillServiceImpl | null = null;
let _learningService: LearningServiceImpl | null = null;
// Phase 3b services
let _mcpService: MCPService | null = null;
// Phase 4a services
let _coWriterStorage: CoWriterStorage | null = null;
let _editAgent: EditAgent | null = null;
let _operationHistory: OperationHistory | null = null;
// Phase 4b services
let _bookStorage: BookStorage | null = null;
let _bookEngine: BookEngine | null = null;
// Phase 5 services
let _chatImportService: ChatImportService | null = null;

/** Guard: prevents re-entry during bootstrap (defense-in-depth for future async refactor) */
let _bootstrapping = false;

/** Create an LLM call function for tools (brainstorm, reason) */
function createToolLLMCall() {
  return async (params: {
    system: string;
    prompt: string;
    temperature: number;
    maxTokens: number;
  }): Promise<string> => {
    // Default to OpenAI gpt-4o-mini for tool LLM calls
    const providerId = (process.env.DT_TOOL_PROVIDER ?? 'openai') as ProviderId;
    const modelId = process.env.DT_TOOL_MODEL ?? 'gpt-4o-mini';
    const apiKey = process.env.DT_TOOL_API_KEY ?? process.env.OPENAI_API_KEY ?? '';

    if (!apiKey) {
      log.warn('No API key configured for tool LLM calls, returning placeholder');
      return '[LLM not configured — set DT_TOOL_API_KEY or OPENAI_API_KEY]';
    }

    try {
      const { model } = getModel({
        providerId,
        modelId,
        apiKey,
      });

      const result = await callLLM(
        {
          model,
          system: params.system,
          prompt: params.prompt,
          temperature: params.temperature,
          maxOutputTokens: params.maxTokens,
        },
        'tool-llm',
      );

      return result.text;
    } catch (err) {
      log.error('Tool LLM call failed:', err);
      return `[LLM error: ${err instanceof Error ? err.message : String(err)}]`;
    }
  };
}

/** Initialize all registries and capabilities */
function bootstrap(): {
  toolRegistry: ToolRegistry;
  capabilityRegistry: CapabilityRegistry;
  orchestrator: ChatOrchestrator;
  embeddingService: ReturnType<typeof createEmbeddingService>;
  ragService: RAGServiceImpl;
  kbSeedService: KBSeedService;
  sandboxService: SandboxServiceImpl;
  memoryService: MemoryServiceImpl;
  notebookService: NotebookServiceImpl;
  personaService: PersonaServiceImpl;
  skillService: SkillServiceImpl;
  learningService: LearningServiceImpl;
  mcpService: MCPService;
  coWriterStorage: CoWriterStorage;
  editAgent: EditAgent;
  operationHistory: OperationHistory;
  bookStorage: BookStorage;
  bookEngine: BookEngine;
  chatImportService: ChatImportService;
  builtInSkills: ReturnType<typeof getBuiltInSkills>;
} {
  if (_bootstrapping && _orchestrator) {
    return {
      toolRegistry: _toolRegistry!,
      capabilityRegistry: _capabilityRegistry!,
      orchestrator: _orchestrator,
      embeddingService: _embeddingService!,
      ragService: _ragService!,
      kbSeedService: _kbSeedService!,
      sandboxService: _sandboxService!,
      memoryService: _memoryService!,
      notebookService: _notebookService!,
      personaService: _personaService!,
      skillService: _skillService!,
      learningService: _learningService!,
      mcpService: _mcpService!,
      coWriterStorage: _coWriterStorage!,
      editAgent: _editAgent!,
      operationHistory: _operationHistory!,
      bookStorage: _bookStorage!,
      bookEngine: _bookEngine!,
      chatImportService: _chatImportService!,
      builtInSkills: getBuiltInSkills(),
    };
  }

  log.info('Bootstrapping DeepTutor services...');
  _bootstrapping = true;

  // -----------------------------------------------------------------------
  // 1. Create tool registry and register simple tools
  // -----------------------------------------------------------------------
  const toolRegistry = new ToolRegistry();
  const llmCall = createToolLLMCall();
  registerSimpleTools(toolRegistry, { llmCall });
  log.info(`Registered ${toolRegistry.getAll().length} simple tools`);

  // -----------------------------------------------------------------------
  // 1b. Phase 2b — RAG + read_source + KB seed
  // -----------------------------------------------------------------------
  const embeddingService = createEmbeddingService();
  const rerankerService = new RerankerServiceImpl();
  const ragService = new RAGServiceImpl(embeddingService, rerankerService);
  const kbSeedService = new KBSeedService(ragService);

  setRAGToolContext(ragService, 'anonymous');

  const ragTool = new RAGTool();
  const readSourceTool = new ReadSourceTool();
  toolRegistry.register(ragTool);
  toolRegistry.register(readSourceTool);

  log.info(`Phase 2b: registered RAG + read_source tools`);

  // -----------------------------------------------------------------------
  // 1c. Phase 2c — Sandbox + Memory + Notebook + Deferred tools
  // -----------------------------------------------------------------------
  const sandboxService = new SandboxServiceImpl();
  const memoryService = new MemoryServiceImpl();
  const notebookService = new NotebookServiceImpl();

  // Register memory consolidation subscriber (CAPABILITY_COMPLETE → consolidate)
  registerMemorySubscriber(memoryService);

  // Set tool contexts (userId is now provided per-request via AsyncLocalStorage,
  // so we no longer pass a defaultUserId here)
  setSandboxToolContext(sandboxService);
  setReadMemoryContext(memoryService);
  setWriteMemoryContext(memoryService);
  setListNotebookContext(notebookService);
  setWriteNoteContext(notebookService);

  // Register Phase 2c tools
  const codeExecutionTool = new CodeExecutionTool();
  const readMemoryTool = new ReadMemoryTool();
  const writeMemoryTool = new WriteMemoryTool();
  const listNotebookTool = new ListNotebookTool();
  const writeNoteTool = new WriteNoteTool();
  const paperSearchTool = new PaperSearchTool();
  const loadToolsTool = new LoadToolsTool(toolRegistry);

  toolRegistry.register(codeExecutionTool);
  toolRegistry.register(readMemoryTool);
  toolRegistry.register(writeMemoryTool);
  toolRegistry.register(listNotebookTool);
  toolRegistry.register(writeNoteTool);
  toolRegistry.register(paperSearchTool);
  toolRegistry.register(loadToolsTool);

  log.info(`Phase 2c: registered code_execution, read/write_memory, list_notebook, write_note, paper_search, load_tools`);
  log.info(`Total registered tools: ${toolRegistry.getAll().length}`);

  // -----------------------------------------------------------------------
  // 1d. Phase 3a — Persona + Skill + Learning services + tools
  // -----------------------------------------------------------------------
  const personaService = new PersonaServiceImpl();
  const skillService = new SkillServiceImpl();
  const learningService = new LearningServiceImpl();

  // Set tool contexts
  setGithubToolContext();
  setReadSkillContext(skillService);
  setSolvePlanContext(llmCall);
  setMasteryToolsContext(learningService, 'anonymous', llmCall);

  // Register Phase 3a tools
  const githubTool = new GithubTool();
  const readSkillTool = new ReadSkillTool();
  const solvePlanTool = new SolvePlanTool();
  const solveFinishStepTool = new SolveFinishStepTool();
  const solveReplanTool = new SolveReplanTool();
  const masteryStatusTool = new MasteryStatusTool();
  const masteryQuizTool = new MasteryQuizTool();
  const masteryGradeTool = new MasteryGradeTool();
  const masteryAssessTool = new MasteryAssessTool();
  const masteryBuildTool = new MasteryBuildTool();

  toolRegistry.register(githubTool);
  toolRegistry.register(readSkillTool);
  toolRegistry.register(solvePlanTool);
  toolRegistry.register(solveFinishStepTool);
  toolRegistry.register(solveReplanTool);
  toolRegistry.register(masteryStatusTool);
  toolRegistry.register(masteryQuizTool);
  toolRegistry.register(masteryGradeTool);
  toolRegistry.register(masteryAssessTool);
  toolRegistry.register(masteryBuildTool);

  log.info(`Phase 3a: registered github, read_skill, solve_plan/finish_step/replan, 5 mastery tools`);
  log.info(`Total registered tools: ${toolRegistry.getAll().length}`);

  // -----------------------------------------------------------------------
  // 2. Create capability registry and register capabilities
  // -----------------------------------------------------------------------
  const capabilityRegistry = new CapabilityRegistry();
  const chatCapability = new ChatCapability(toolRegistry);
  capabilityRegistry.register(chatCapability);

  // Phase 2d: SmartLearn GraphCapability
  const smartLearnCapability = new SmartLearnCapability();
  capabilityRegistry.register(smartLearnCapability);

  // Phase 3a: Loop Capabilities
  const deepSolveCapability = new DeepSolveCapability(toolRegistry);
  capabilityRegistry.register(deepSolveCapability);

  const masteryPathCapability = new MasteryPathCapability(toolRegistry);
  capabilityRegistry.register(masteryPathCapability);

  const exploreContextCapability = new ExploreContextCapability(toolRegistry);
  capabilityRegistry.register(exploreContextCapability);

  // Phase 3b: Agent Capabilities
  const deepQuestionCapability = new DeepQuestionCapability(toolRegistry);
  capabilityRegistry.register(deepQuestionCapability);

  const deepResearchCapability = new DeepResearchCapability(toolRegistry);
  capabilityRegistry.register(deepResearchCapability);

  const visualizeCapability = new VisualizeCapability();
  capabilityRegistry.register(visualizeCapability);

  log.info(`Registered ${capabilityRegistry.getAll().length} capabilities (chat, smartlearn, deep_solve, mastery_path, explore_context, deep_question, deep_research, visualize)`);

  // -----------------------------------------------------------------------
  // 3. Create orchestrator
  // -----------------------------------------------------------------------
  const orchestrator = new ChatOrchestrator({
    capabilityRegistry,
    toolRegistry,
  });

  // -----------------------------------------------------------------------
  // 4. Phase 3b — MCP Service
  // -----------------------------------------------------------------------
  const mcpService = new MCPService();

  // Connect any pre-configured MCP servers from environment
  const mcpServersEnv = process.env.DT_MCP_SERVERS;
  if (mcpServersEnv) {
    try {
      const serverConfigs = JSON.parse(mcpServersEnv);
      if (Array.isArray(serverConfigs)) {
        for (const config of serverConfigs) {
          mcpService.addServer(config);
        }
        log.info(`Configured ${serverConfigs.length} MCP server(s) from DT_MCP_SERVERS`);
      }
    } catch (err) {
      log.error('Failed to parse DT_MCP_SERVERS env var:', err);
    }
  }

  // Register MCP tools into the ToolRegistry so they're available in agent loops
  if (mcpService.listServers().length > 0) {
    // Fire-and-forget: connectAll is async but bootstrap() is sync.
    // MCP tools will register themselves once connections complete.
    mcpService.connectAll(toolRegistry).then(() => {
      log.info(`Connected ${mcpService.listServers().length} MCP server(s) and registered tools`);
    }).catch((err: unknown) => {
      log.warn('Failed to connect MCP servers (non-fatal):', err);
    });
  }

  // -----------------------------------------------------------------------
  // 5. Phase 4a — Co-Writer
  // -----------------------------------------------------------------------
  const coWriterStorage = new CoWriterStorage();
  // Use the main AI provider for the EditAgent (same as the rest of the app)
  const editProviderId = resolveProviderId();
  const editAgent = new EditAgent({
    providerId: editProviderId,
    modelId: resolveModelId(),
    apiKey: resolveApiKey(editProviderId),
    baseUrl: resolveBaseUrl(),
  });
  const operationHistory = new OperationHistory();

  log.info('Phase 4a: initialized CoWriterStorage, EditAgent, OperationHistory');

  // -----------------------------------------------------------------------
  // 6. Phase 4b — Book Engine
  // -----------------------------------------------------------------------
  const bookStorage = new BookStorage();
  const pid = resolveProviderId();
  const bookEngine = new BookEngine(bookStorage, {
    providerId: pid,
    modelId: resolveModelId(),
    apiKey: resolveApiKey(pid),
    baseUrl: resolveBaseUrl(),
    language: 'zh',
  });

  log.info('Phase 4b: initialized BookEngine + BookStorage');

  // -----------------------------------------------------------------------
  // 7. Phase 5 — Obsidian Tools + Capability
  // -----------------------------------------------------------------------
  const obsidianVaultPath = process.env.DT_OBSIDIAN_VAULT ?? '';
  if (obsidianVaultPath) {
    setObsidianToolContext(obsidianVaultPath);
  }
  const obsidianTools = createObsidianTools();
  for (const tool of obsidianTools) {
    toolRegistry.register(tool);
  }
  log.info(`Phase 5: registered ${obsidianTools.length} obsidian tools`);

  // -----------------------------------------------------------------------
  // 8. Phase 5 — Media Tools
  // -----------------------------------------------------------------------
  setMediaToolContext({
    imageProvider: (process.env.IMAGE_GEN_PROVIDER as 'openai' | 'siliconflow' | 'doubao' | 'tongyi' | 'none') ?? 'none',
    videoProvider: (process.env.DT_VIDEO_PROVIDER as 'runwayml' | 'pika' | 'none') ?? 'none',
    voiceProvider: (process.env.DT_VOICE_PROVIDER as 'openai' | 'elevenlabs' | 'edge' | 'none') ?? 'none',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY ?? '',
      runwayml: process.env.RUNWAYML_API_SECRET ?? '',
    },
    outputDir: process.env.DT_MEDIA_OUTPUT_DIR ?? 'data/media',
  });
  const mediaTools = createMediaTools();
  for (const tool of mediaTools) {
    toolRegistry.register(tool);
  }
  log.info(`Phase 5: registered ${mediaTools.length} media tools (imagegen, videogen, voice)`);

  log.info(`Total registered tools: ${toolRegistry.getAll().length}`);

  // -----------------------------------------------------------------------
  // 9. Phase 5 — New Capabilities
  // -----------------------------------------------------------------------
  const notebookCapability = new NotebookCapability();
  capabilityRegistry.register(notebookCapability);

  const obsidianCapability = new ObsidianCapability(toolRegistry);
  capabilityRegistry.register(obsidianCapability);

  const visionSolverCapability = new VisionSolverCapability();
  capabilityRegistry.register(visionSolverCapability);

  const mathAnimatorCapability = new MathAnimatorCapability();
  capabilityRegistry.register(mathAnimatorCapability);

  log.info(`Phase 5: registered notebook, obsidian, vision_solver, math_animator capabilities`);
  log.info(`Total registered capabilities: ${capabilityRegistry.getAll().length}`);

  // -----------------------------------------------------------------------
  // 10. Phase 5 — Skill Packs
  // -----------------------------------------------------------------------
  const builtInSkills = getBuiltInSkills();
  log.info(`Phase 5: loaded ${builtInSkills.size} built-in skill packs (${[...builtInSkills.keys()].join(', ')})`);

  // -----------------------------------------------------------------------
  // 11. Phase 5 — Chat Import Service
  // -----------------------------------------------------------------------
  const chatImportService = new ChatImportService();
  log.info('Phase 5: initialized ChatImportService');

  // Persist singleton state
  _toolRegistry = toolRegistry;
  _capabilityRegistry = capabilityRegistry;
  _orchestrator = orchestrator;
  _embeddingService = embeddingService;
  _ragService = ragService;
  _kbSeedService = kbSeedService;
  _sandboxService = sandboxService;
  _memoryService = memoryService;
  _notebookService = notebookService;
  _personaService = personaService;
  _skillService = skillService;
  _learningService = learningService;
  _mcpService = mcpService;
  _coWriterStorage = coWriterStorage;
  _editAgent = editAgent;
  _operationHistory = operationHistory;
  _bookStorage = bookStorage;
  _bookEngine = bookEngine;
  _chatImportService = chatImportService;

  log.info('DeepTutor bootstrap complete (Phase 5)');
  return {
    toolRegistry, capabilityRegistry, orchestrator,
    embeddingService, ragService, kbSeedService,
    sandboxService, memoryService, notebookService,
    personaService, skillService, learningService,
    mcpService,
    coWriterStorage, editAgent, operationHistory,
    bookStorage, bookEngine,
    chatImportService, builtInSkills,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getToolRegistry(): ToolRegistry {
  return bootstrap().toolRegistry;
}

export function getCapabilityRegistry(): CapabilityRegistry {
  return bootstrap().capabilityRegistry;
}

export function getOrchestrator(): ChatOrchestrator {
  return bootstrap().orchestrator;
}

export function getEmbeddingService() {
  return bootstrap().embeddingService;
}

export function getRAGService() {
  return bootstrap().ragService;
}

export function getKBSeedService() {
  return bootstrap().kbSeedService;
}

// Phase 2c service accessors
export function getSandboxService() {
  return bootstrap().sandboxService;
}

export function getMemoryService() {
  return bootstrap().memoryService;
}

export function getNotebookService() {
  return bootstrap().notebookService;
}

// Phase 3a service accessors
export function getPersonaService() {
  return bootstrap().personaService;
}

export function getSkillService() {
  return bootstrap().skillService;
}

export function getLearningService() {
  return bootstrap().learningService;
}

// Phase 3b service accessors
export function getMCPService() {
  return bootstrap().mcpService;
}

// Phase 4a service accessors
export function getCoWriterStorage() {
  return bootstrap().coWriterStorage;
}

export function getEditAgent() {
  return bootstrap().editAgent;
}

export function getOperationHistory() {
  return bootstrap().operationHistory;
}

// Phase 4b service accessors
export function getBookStorage() {
  return bootstrap().bookStorage;
}

export function getBookEngine() {
  return bootstrap().bookEngine;
}

/**
 * Create a BookEngine with per-request config overrides.
 * Reuses the singleton BookStorage but applies the given provider/model/apiKey/baseUrl.
 * This allows Book API routes to use the user's configured API key from the request
 * instead of relying solely on environment variables.
 */
export function createBookEngineWithConfig(config?: {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  language?: string;
}): BookEngine {
  const storage = bootstrap().bookStorage;
  const pid = resolveProviderId(config?.providerId);
  return new BookEngine(storage, {
    providerId: pid,
    modelId: resolveModelId(config?.modelId),
    apiKey: resolveApiKey(pid, config?.apiKey),
    baseUrl: config?.baseUrl || resolveBaseUrl(),
    language: config?.language || 'zh',
  });
}

// Phase 5 service accessors
export function getChatImportService() {
  return bootstrap().chatImportService;
}

export function getBuiltInSkillPacks() {
  return bootstrap().builtInSkills;
}
