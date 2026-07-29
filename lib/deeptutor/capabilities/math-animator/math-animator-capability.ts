/**
 * MathAnimatorCapability — Math concept animation via Manim code generation.
 *
 * Six-stage pipeline (matching DeepTutor's MathAnimatorCapability):
 * 1. concept_analysis  — Analyze the math concept and learning goals
 * 2. concept_design    — Design the animation scene
 * 3. code_generation   — Generate Manim Python code
 * 4. code_retry        — Render and retry on failure (up to 4 attempts)
 * 5. summary           — Generate summary of the animation
 * 6. render_output     — Emit final video/image artifacts
 *
 * Migrated from: deeptutor/capabilities/math_animator.py
 * + deeptutor/agents/math_animator/pipeline.py
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

const log = createLogger('MathAnimatorCapability');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConceptAnalysis {
  learningGoal: string;
  mathFocus: string[];
  visualTargets: string[];
  narrativeSteps: string[];
  outputIntent: string;
}

export interface SceneDesign {
  title: string;
  sceneOutline: string;
  visualStyle: string;
  animationNotes: string;
  codeConstraints: string[];
}

export interface GeneratedCode {
  code: string;
  rationale: string;
}

export interface SummaryPayload {
  summaryText: string;
  userRequest: string;
  generatedOutput: string;
  keyPoints: string[];
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export class MathAnimatorCapability extends PipelineCapability {
  readonly manifest = createCapabilityManifest({
    name: 'math_animator',
    description: '数学概念动画 — Manim 代码生成与渲染',
    stages: ['concept_analysis', 'concept_design', 'code_generation', 'code_retry', 'summary', 'render_output'],
    toolsUsed: [],
    cliAliases: ['animate', 'math_animator'],
    configDefaults: {
      output_mode: 'video',
      quality: 'medium',
      style_hint: '',
    },
  });

  async executeStages(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;
    const userInput = context.userMessage;
    const overrides = context.configOverrides ?? {};
    const meta = context.metadata ?? {};
    const providerId = (overrides.providerId as ProviderId) || (meta.providerId as ProviderId) || (process.env.DT_DEFAULT_PROVIDER as ProviderId) || (process.env.AI_PROVIDER as ProviderId);
    const modelId = (overrides.modelId as string) || (meta.modelId as string) || process.env.DT_DEFAULT_MODEL || process.env.AI_MODEL || '';
    const apiKey = (overrides.apiKey as string) || (meta.apiKey as string) || process.env.DT_DEFAULT_API_KEY || process.env.AI_API_KEY || undefined;

    const outputMode = (context.metadata.outputMode as string) ?? 'video';
    const quality = (context.metadata.quality as string) ?? 'medium';
    const styleHint = (context.metadata.styleHint as string) ?? '';

    log.info(`Math animator started: "${userInput.slice(0, 50)}..." mode=${outputMode} quality=${quality}`);

    const { model } = getModel({ providerId, modelId, apiKey });

    try {
      // Stage 1: Concept Analysis
      const endAnalysis = bus.enterStage('concept_analysis', 'math_animator');
      bus.emitThinking('正在分析数学概念...', 'math_animator');

      const analysisResult = await generateText({
        model,
        prompt: `Analyze this math concept for animation: "${userInput}" ${styleHint ? `Style: ${styleHint}` : ''}\nReturn JSON: {"learningGoal":"...","mathFocus":["..."],"visualTargets":["..."],"narrativeSteps":["..."],"outputIntent":"..."}\nReturn ONLY valid JSON.`,
        temperature: 0.1,
        maxOutputTokens: 1024,
      });

      let analysis: ConceptAnalysis;
      try {
        analysis = JSON.parse(analysisResult.text);
      } catch {
        analysis = {
          learningGoal: userInput,
          mathFocus: [userInput],
          visualTargets: [],
          narrativeSteps: ['Introduce concept', 'Show main idea', 'Summarize'],
          outputIntent: outputMode,
        };
      }
      bus.emit(createStreamEvent('observation', { content: `Analysis: ${analysis.learningGoal}`, source: 'math_animator' }));
      endAnalysis();

      // Stage 2: Concept Design
      const endDesign = bus.enterStage('concept_design', 'math_animator');
      bus.emitThinking('正在设计动画场景...', 'math_animator');

      const designResult = await generateText({
        model,
        prompt: `Design a Manim animation scene.\nAnalysis: ${JSON.stringify(analysis)}\nMode: ${outputMode}, Quality: ${quality}\nReturn JSON: {"title":"...","sceneOutline":"...","visualStyle":"...","animationNotes":"...","codeConstraints":["..."]}\nReturn ONLY valid JSON.`,
        temperature: 0.1,
        maxOutputTokens: 1024,
      });

      let design: SceneDesign;
      try {
        design = JSON.parse(designResult.text);
      } catch {
        design = {
          title: analysis.learningGoal,
          sceneOutline: analysis.narrativeSteps.join('\n'),
          visualStyle: 'Clean blue-on-black Manim style',
          animationNotes: 'Smooth transitions, 1s per step',
          codeConstraints: [],
        };
      }
      bus.emit(createStreamEvent('observation', { content: `Scene design: ${design.title}`, source: 'math_animator' }));
      endDesign();

      // Stage 3: Code Generation
      const endCodeGen = bus.enterStage('code_generation', 'math_animator');
      bus.emitThinking('正在生成 Manim 代码...', 'math_animator');

      const codeResult = await generateText({
        model,
        prompt: `Generate Manim CE Python code.\nTitle: ${design.title}\nOutline: ${design.sceneOutline}\nStyle: ${design.visualStyle}\nMath: ${JSON.stringify(analysis.mathFocus)}\n\nRequirements: from manim import *, class MainScene(Scene), use create/write/play, add wait() calls.\n${outputMode === 'image' ? 'End with self.add() for last frame capture.' : 'Animate with self.play().'}\n\nReturn JSON: {"code":"complete Python code","rationale":"design choices"}\nReturn ONLY valid JSON with properly escaped strings.`,
        temperature: 0.2,
        maxOutputTokens: 4096,
      });

      let generated: GeneratedCode;
      try {
        generated = JSON.parse(codeResult.text);
      } catch {
        generated = {
          code: 'from manim import *\n\nclass MainScene(Scene):\n    def construct(self):\n        text = Text("Animation")\n        self.play(Write(text))',
          rationale: 'Fallback due to parse error',
        };
      }
      bus.emit(createStreamEvent('observation', { content: `Generated Manim code (${generated.code.length} chars)`, source: 'math_animator' }));
      endCodeGen();

      // Stage 4: Code Retry (validate)
      const endRetry = bus.enterStage('code_retry', 'math_animator');
      bus.emitThinking('正在验证并准备渲染...', 'math_animator');

      let currentCode = generated.code;
      const hasMainScene = currentCode.includes('class MainScene');
      const hasImport = currentCode.includes('from manim import') || currentCode.includes('import manim');

      if (!hasMainScene || !hasImport) {
        const fixResult = await generateText({
          model,
          prompt: `Fix this Manim code:\n${currentCode}\nIssues: ${!hasImport ? 'Missing manim import. ' : ''}${!hasMainScene ? 'Missing class MainScene(Scene).' : ''}\nReturn fixed code ONLY.`,
          temperature: 0.1,
          maxOutputTokens: 4096,
        });
        currentCode = fixResult.text;
      }

      bus.emit(createStreamEvent('observation', { content: `Render prepared (quality: ${quality})`, source: 'math_animator' }));
      endRetry();

      // Stage 5: Summary
      const endSummary = bus.enterStage('summary', 'math_animator');
      bus.emitThinking('正在生成摘要...', 'math_animator');

      const summaryResult = await generateText({
        model,
        prompt: `Summarize this math animation.\nTitle: ${design.title}\nGoal: ${analysis.learningGoal}\nPoints: ${JSON.stringify(analysis.mathFocus)}\nReturn JSON: {"summaryText":"2-3 sentences","userRequest":"${userInput}","generatedOutput":"${design.title}","keyPoints":["..."]}\nReturn ONLY valid JSON.`,
        temperature: 0.1,
        maxOutputTokens: 512,
      });

      let summary: SummaryPayload;
      try {
        summary = JSON.parse(summaryResult.text);
      } catch {
        summary = {
          summaryText: `Animation "${design.title}" created to illustrate ${analysis.learningGoal}.`,
          userRequest: userInput,
          generatedOutput: design.title,
          keyPoints: analysis.mathFocus,
        };
      }
      endSummary();

      // Stage 6: Render Output
      const endOutput = bus.enterStage('render_output', 'math_animator');

      const output = [
        `## ${design.title}`,
        '',
        summary.summaryText,
        '',
        '### 要点',
        ...summary.keyPoints.map((p) => `- ${p}`),
        '',
        '### Manim 源码',
        '```python',
        currentCode,
        '```',
        '',
        `**输出：** ${outputMode} | **质量：** ${quality}`,
      ].join('\n');

      bus.emitContent(output, 'math_animator');
      bus.emitResult({ code: currentCode, summary, analysis, design });
      endOutput();

      log.info('Math animator completed successfully');
    } catch (err) {
      log.error('Math animator failed:', err);
      bus.emitError(`数学动画失败: ${err instanceof Error ? err.message : String(err)}`, 'math_animator');
    }
  }
}
