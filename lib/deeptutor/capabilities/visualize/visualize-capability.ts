/**
 * VisualizeCapability — Visualization code generation pipeline.
 *
 * Three-phase approach (matching DeepTutor's VisualizePipeline):
 * 1. Analyze: Determine render type and produce structured brief
 * 2. Generate: Produce visualization code (SVG/Chart.js/Mermaid/HTML)
 * 3. Review: Validate and optimize
 *
 * Render types: svg, chartjs, mermaid, html
 * (Manim excluded — requires Python subprocess)
 *
 * Migrated from: deeptutor/capabilities/visualize.py (725 lines)
 * + deeptutor/agents/visualize/pipeline.py (90 lines)
 */

import {
  PipelineCapability,
  createCapabilityManifest,
} from '@/lib/deeptutor/core/capability-protocol';
import type { StreamBus } from '@/lib/deeptutor/core/capability-protocol';
import type { UnifiedContext } from '@/lib/deeptutor/core/types';
import { generateText } from 'ai';
import { StreamBusImpl } from '@/lib/deeptutor/core/stream-bus';
import { assembleVisualizePrompt } from './prompt-assembler';
import { augmentUserMessageText } from '../shared/vision-helper';

import type { ProviderId } from '@/lib/types/provider';

export class VisualizeCapability extends PipelineCapability {
  readonly manifest = createCapabilityManifest({
    name: 'visualize',
    description: '可视化代码生成 — SVG、Chart.js、Mermaid、HTML',
    stages: ['analyzing', 'generating', 'reviewing'],
    toolsUsed: [],
    cliAliases: ['visualize', 'viz', 'visualise'],
  });

  async executeStages(context: UnifiedContext, stream: StreamBus): Promise<void> {
    const bus = stream as StreamBusImpl;

    const renderMode = (context.metadata.renderMode as string) ?? 'auto';
    const quality = (context.metadata.quality as string) ?? 'medium';
    const styleHint = context.metadata.styleHint as string | undefined;

    // Augment user message with image descriptions from vision proxy (if any)
    const userMessage = await augmentUserMessageText(context);

    // ------------------------------------------------------------------
    // Stage 1: Analyze — determine visualization approach
    // ------------------------------------------------------------------
    const endAnalyzing = bus.enterStage('analyzing', 'visualize');

    const systemPrompt = assembleVisualizePrompt({
      language: context.language || 'en',
      renderMode: renderMode as 'auto' | 'svg' | 'chartjs' | 'mermaid' | 'html',
      quality: quality as 'low' | 'medium' | 'high',
      styleHint,
    });

    const model = await this.resolveModel(context);

    let analysis: string;
    try {
      const analysisResult = await generateText({
        model,
        system: systemPrompt,
        prompt: `Analyze the following visualization request and determine the best approach. Respond with a brief analysis of: 1) What type of visualization to use, 2) Key elements to include, 3) Recommended format.\n\nRequest: ${userMessage}`,
        temperature: 0.1,
        maxOutputTokens: 1024,
      });
      analysis = analysisResult.text;
    } catch (error) {
      endAnalyzing();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`可视化分析失败: ${errorMsg}`, 'visualize');
      return;
    }

    endAnalyzing();

    // Stream feedback: tell user what format was chosen
    const detectedFormat = this.detectFormat(analysis, renderMode);
    bus.emitContent(`${this.getFormatMessage(detectedFormat)}\n\n`, 'visualize');
    bus.emitContent(`\`\`\`${detectedFormat}\n`, 'visualize');

    // ------------------------------------------------------------------
    // Stage 2: Generate — produce visualization code
    // ------------------------------------------------------------------
    const endGenerating = bus.enterStage('generating', 'visualize');

    let code: string;
    try {
      const codeResult = await generateText({
        model,
        system: systemPrompt,
        prompt: `Based on this analysis, generate the complete visualization code.\n\nAnalysis:\n${analysis}\n\nOriginal request: ${userMessage}\n\nReturn ONLY the visualization code. No markdown fences, no explanation.`,
        temperature: 0.2,
        maxOutputTokens: 8192,
      });
      code = codeResult.text;
    } catch (error) {
      endGenerating();
      const errorMsg = error instanceof Error ? error.message : String(error);
      bus.emitError(`可视化生成失败: ${errorMsg}`, 'visualize');
      return;
    }

    endGenerating();

    // ------------------------------------------------------------------
    // Stage 3: Review — validate and optimize
    // ------------------------------------------------------------------
    const endReviewing = bus.enterStage('reviewing', 'visualize');

    let reviewedCode: string;
    try {
      const reviewResult = await generateText({
        model,
        system: `You are a code reviewer specializing in data visualizations. Review the following visualization code for correctness, accessibility, and visual quality. If you find issues, return the corrected code. If the code is good, return it unchanged.\n\nReturn ONLY the code. No markdown fences, no explanation.`,
        prompt: `Review and optimize this visualization code:\n\n${code}`,
        temperature: 0.1,
        maxOutputTokens: 8192,
      });
      reviewedCode = reviewResult.text;
    } catch {
      // Review is best-effort — fall back to original code
      reviewedCode = code;
    }

    endReviewing();

    // Finalize: emit the closing fence and the result
    const finalCode = this.stripFences(reviewedCode, detectedFormat);
    bus.emitContent(`${finalCode}\n\`\`\`\n`, 'visualize');

    // Emit the final visualization result
    const wrappedContent = `\`\`\`${detectedFormat}\n${finalCode}\n\`\`\``;
    bus.emitResult({
      text: wrappedContent,
      renderMode: detectedFormat,
      quality,
    });
  }

  /**
   * Detect which format was chosen from the analysis text.
   */
  private detectFormat(analysis: string, renderMode: string): string {
    if (renderMode !== 'auto') return renderMode;
    const lower = analysis.toLowerCase();
    if (lower.includes('mermaid')) return 'mermaid';
    if (lower.includes('chart.js') || lower.includes('chartjs')) return 'html';
    if (lower.includes('html') || lower.includes('dashboard') || lower.includes('interactive')) return 'html';
    return 'svg';
  }

  /**
   * Get a human-readable message about the chosen format.
   */
  private getFormatMessage(format: string): string {
    const messages: Record<string, string> = {
      svg: '正在为您创建 **SVG 图表**...',
      mermaid: '正在为您创建 **Mermaid 流程图**...',
      html: '正在为您创建 **交互式 HTML** 可视化（Chart.js）...',
      chartjs: '正在为您创建 **Chart.js 数据图表**...',
    };
    return messages[format] ?? `正在使用 **${format}** 格式创建可视化...`;
  }

  /**
   * Strip markdown code fences if the LLM included them despite instructions.
   */
  private stripFences(code: string, format: string): string {
    let cleaned = code.trim();
    // Remove opening fence like ```svg or ```html or ```mermaid
    const openFence = new RegExp(`^\`\`\`(?:${format})?\\s*\\n?`, 'i');
    cleaned = cleaned.replace(openFence, '');
    // Remove closing fence
    cleaned = cleaned.replace(/\n?\`\`\`\s*$/, '');
    return cleaned.trim();
  }

  private async resolveModel(context: UnifiedContext): Promise<import('ai').LanguageModel> {
    const { getModel } = await import('@/lib/ai/providers');
    const overrides = context.configOverrides ?? {};
    const meta = context.metadata ?? {};
    const providerId =
      (overrides.providerId as string) ||
      (meta.providerId as string) ||
      process.env.AI_PROVIDER ||
      'openai';
    const modelId =
      (overrides.modelId as string) ||
      (meta.modelId as string) ||
      process.env.AI_MODEL ||
      'gpt-4o';
    const apiKey =
      (overrides.apiKey as string) ||
      (meta.apiKey as string) ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '';
    const baseUrl =
      (overrides.baseUrl as string) ||
      (meta.baseUrl as string) ||
      process.env.AI_BASE_URL ||
      undefined;
    const { model } = getModel({ providerId: providerId as ProviderId, modelId, apiKey, baseUrl });
    return model;
  }
}
