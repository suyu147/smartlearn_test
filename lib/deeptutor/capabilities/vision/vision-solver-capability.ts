/**
 * VisionSolverCapability — Geometry image analysis with GeoGebra output.
 *
 * Four-stage pipeline (matching DeepTutor's VisionSolverAgent):
 * 1. BBox: Detect geometric elements in image with pixel coordinates
 * 2. Analysis: Semantic analysis of geometric constraints and relations
 * 3. GGBScript: Generate GeoGebra command sequence
 * 4. Reflection: Validate and fix commands
 *
 * Uses LLM vision capabilities for image analysis.
 *
 * Migrated from: deeptutor/agents/vision_solver/vision_solver_agent.py
 */

import {
  PipelineCapability,
  createCapabilityManifest,
} from '@/lib/deeptutor/core/capability-protocol';
import type { StreamBus } from '@/lib/deeptutor/core/capability-protocol';
import type { UnifiedContext } from '@/lib/deeptutor/core/types';
import { createStreamEvent } from '@/lib/deeptutor/core/types';
import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import { createLogger } from '@/lib/logger';
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';

const log = createLogger('VisionSolverCapability');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BBoxOutput {
  imageDimensions: { width: number; height: number };
  elements: Array<{ type: string; label?: string; coords: number[] }>;
}

export interface GGBCommand {
  sequence: number;
  command: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_GGB_COMMANDS = new Set([
  'Point', 'Segment', 'Line', 'Circle', 'Polygon', 'Arc',
  'Angle', 'Midpoint', 'PerpendicularLine', 'ParallelLine',
  'Intersect', 'Distance', 'Rotate', 'Reflect', 'Translate',
  'Text', 'SetLabel', 'SetColor', 'SetPointSize', 'SetLineThickness',
  'ShowLabel', 'ShowObject', 'ZoomIn', 'ZoomOut', 'CenterView',
]);

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export class VisionSolverCapability extends PipelineCapability {
  readonly manifest = createCapabilityManifest({
    name: 'vision_solver',
    description: '几何图像分析与 GeoGebra 脚本生成',
    stages: ['bbox', 'analysis', 'ggbscript', 'reflection'],
    toolsUsed: [],
    cliAliases: ['vision', 'geogebra', 'solve_image'],
  });

  async executeStages(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const userQuery = context.userMessage;
    const imageBase64 = context.metadata.imageBase64 as string | undefined;
    const imageUrl = context.metadata.imageUrl as string | undefined;
    const overrides = context.configOverrides ?? {};
    const meta = context.metadata ?? {};
    const providerId = (overrides.providerId as ProviderId) || (meta.providerId as ProviderId) || (process.env.DT_DEFAULT_PROVIDER as ProviderId) || (process.env.AI_PROVIDER as ProviderId);
    const modelId = (overrides.modelId as string) || (meta.modelId as string) || process.env.DT_DEFAULT_MODEL || process.env.AI_MODEL || '';
    const apiKey = (overrides.apiKey as string) || (meta.apiKey as string) || process.env.DT_DEFAULT_API_KEY || process.env.AI_API_KEY || undefined;

    if (!imageBase64 && !imageUrl) {
      bus.emitError('未提供图片。请附上图片以使用视觉求解器。', 'vision_solver');
      return;
    }

    log.info(`Vision solver started: query="${userQuery.slice(0, 50)}..."`);

    const { model } = getModel({ providerId, modelId, apiKey });

    const imageContent = imageBase64
      ? { type: 'image' as const, image: imageBase64 }
      : { type: 'image' as const, image: imageUrl! };

    try {
      // Stage 1: BBox
      const endBbox = bus.enterStage('bbox', 'vision_solver');
      bus.emitThinking('正在检测图像中的几何元素...', 'vision_solver');

      const bboxResult = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: `Analyze this geometry image and identify all geometric elements. Return JSON: {"imageDimensions":{"width":N,"height":N},"elements":[{"type":"point|segment|polygon|circle|arc|angle","label":"X","coords":[x1,y1,...]}]}. User question: ${userQuery}. Return ONLY valid JSON.`,
              },
            ],
          },
        ],
      });

      let bboxOutput: BBoxOutput;
      try {
        bboxOutput = JSON.parse(bboxResult.text);
      } catch {
        bboxOutput = { imageDimensions: { width: 800, height: 600 }, elements: [] };
      }
      bus.emit(createStreamEvent('observation', { content: `检测到 ${bboxOutput.elements.length} 个几何元素。`, source: 'vision_solver' }));
      endBbox();

      // Stage 2: Analysis
      const endAnalysis = bus.enterStage('analysis', 'vision_solver');
      bus.emitThinking('正在分析几何关系与约束...', 'vision_solver');

      const analysisResult = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: `Based on this geometry image and detected elements: ${JSON.stringify(bboxOutput.elements)}. Analyze geometric relationships. Return JSON: {"keyElements":[...], "constraints":[...], "geometricRelations":[{"type":"...","elements":[...],"description":"..."}], "imageIsReference":false}. User question: ${userQuery}. Return ONLY valid JSON.`,
              },
            ],
          },
        ],
      });

      let analysisOutput: Record<string, unknown>;
      try {
        analysisOutput = JSON.parse(analysisResult.text);
      } catch {
        analysisOutput = { keyElements: [], constraints: [], geometricRelations: [], imageIsReference: false };
      }
      const relCount = Array.isArray(analysisOutput.geometricRelations) ? analysisOutput.geometricRelations.length : 0;
      bus.emit(createStreamEvent('observation', { content: `发现 ${relCount} 个几何关系。`, source: 'vision_solver' }));
      endAnalysis();

      // Stage 3: GGBScript
      const endGGB = bus.enterStage('ggbscript', 'vision_solver');
      bus.emitThinking('正在生成 GeoGebra 命令...', 'vision_solver');

      const ggbResult = await generateText({
        model,
        prompt: `Generate GeoGebra commands to recreate this geometry figure.\nElements: ${JSON.stringify(bboxOutput.elements)}\nAnalysis: ${JSON.stringify(analysisOutput)}\nDims: ${JSON.stringify(bboxOutput.imageDimensions)}\n\nReturn JSON: {"commands":[{"sequence":1,"command":"A = Point((2, 3))","description":"Create point A"}]}\nValid commands: ${[...VALID_GGB_COMMANDS].join(', ')}\nReturn ONLY valid JSON.`,
      });

      let ggbCommands: GGBCommand[] = [];
      try {
        const parsed = JSON.parse(ggbResult.text);
        ggbCommands = parsed.commands ?? parsed;
      } catch {
        // Fallback
      }
      bus.emit(createStreamEvent('observation', { content: `生成了 ${ggbCommands.length} 条 GeoGebra 命令。`, source: 'vision_solver' }));
      endGGB();

      // Stage 4: Reflection
      const endReflection = bus.enterStage('reflection', 'vision_solver');
      bus.emitThinking('正在验证 GeoGebra 命令...', 'vision_solver');

      let correctedCommands = ggbCommands;
      const issues: string[] = [];
      for (const cmd of ggbCommands) {
        const funcMatch = cmd.command.match(/=\s*(\w+)\s*\(/);
        const funcName = funcMatch?.[1] ?? '';
        if (funcName && !VALID_GGB_COMMANDS.has(funcName) && !/^[A-Z][a-zA-Z]+$/.test(funcName)) {
          issues.push(`Unknown command: ${funcName}`);
        }
      }

      if (issues.length > 0) {
        const fixResult = await generateText({
          model,
          prompt: `Fix these GeoGebra commands:\n${JSON.stringify(ggbCommands)}\nIssues: ${issues.join('; ')}\nReturn corrected commands as JSON: {"commands":[...]}`,
        });
        try {
          const parsed = JSON.parse(fixResult.text);
          correctedCommands = parsed.commands ?? parsed;
        } catch {
          // Keep original
        }
      }
      endReflection();

      // Emit final result
      const commandText = correctedCommands.map((c) => `# ${c.description}\n${c.command}`).join('\n\n');

      const summary = [
        '## 视觉求解结果',
        '',
        `**检测到的元素：** ${bboxOutput.elements.length}`,
        `**GeoGebra 命令：** ${correctedCommands.length}`,
        '',
        '### GeoGebra 脚本',
        '```geogebra',
        commandText,
        '```',
      ].join('\n');

      bus.emitContent(summary, 'vision_solver');
      bus.emitResult({ ggbCommands: correctedCommands, bboxOutput, analysisOutput });

      log.info('Vision solver completed successfully');
    } catch (err) {
      log.error('Vision solver failed:', err);
      bus.emitError(`视觉求解失败: ${err instanceof Error ? err.message : String(err)}`, 'vision_solver');
    }
  }
}
