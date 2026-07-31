/**
 * 讯飞数字人视频大模型 — VMS Provider
 *
 * 异步 RESTful API 实现 (generate → query)
 *
 * API 流程:
 *   1. POST /api/v1/video/generate  — 提交文本 Prompt，异步创建视频生成任务，返回 task_id
 *   2. POST /api/v1/video/query     — 轮询 task_id，获取任务状态和视频产物 URL
 *
 * 视频产物: MP4 格式，前端直接 <video> 播放
 *
 * API 文档: https://www.xfyun.cn/doc/spark/videoGenerate.html
 */

import { createLogger } from '@/lib/logger';
import { resolveVmsConfig, generateVmsAuthUrl, isVmsConfigured } from './auth';
import {
  PROMPT_MAX_LENGTH,
  WORD_COUNT_MIN,
  WORD_COUNT_MAX,
} from './types';
import type {
  VideoGenerateRequest,
  VideoGenerateResponse,
  VideoQueryRequest,
  VideoQueryResponse,
  XfyunVideoGenerateRequest,
  XfyunVideoGenerateResponse,
  XfyunVideoQueryRequest,
  XfyunVideoQueryResponse,
} from './types';

const log = createLogger('vms-provider');

// ── API 路径 ────────────────────────────────────────────
// 实际请求路径和签名路径完全一致（经实测验证）

const API_PATHS = {
  generate: '/v1/private/video/generate',
  query: '/v1/private/video/query',
} as const;

// ── 通用请求方法 ────────────────────────────────────────

async function vmsPost<TResponse>(
  path: string,
  body: XfyunVideoGenerateRequest | XfyunVideoQueryRequest,
): Promise<{ ok: true; data: TResponse } | { ok: false; status: number; error: string }> {
  const config = resolveVmsConfig();
  const authUrl = generateVmsAuthUrl(config.apiKey, config.apiSecret, 'POST', config.baseUrl, path);

  log.info(`VMS POST ${path}`);

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      log.error(`VMS ${path} failed: HTTP ${response.status}, body: ${errorText}`);
      return { ok: false, status: response.status, error: `VMS API error (${response.status}): ${errorText}` };
    }

    const data = await response.json() as TResponse;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`VMS ${path} exception:`, err);
    return { ok: false, status: 0, error: `VMS ${path} failed: ${message}` };
  }
}

// ── 核心方法 ────────────────────────────────────────────

/**
 * 创建视频生成任务
 *
 * 提交文本 Prompt，异步创建视频生成任务，返回 task_id
 */
export async function generateVideo(request: VideoGenerateRequest): Promise<VideoGenerateResponse> {
  if (!isVmsConfigured()) {
    return { success: false, error: 'VMS not configured. Set XFYUN_VMS_APP_ID, XFYUN_VMS_API_KEY, XFYUN_VMS_API_SECRET in .env' };
  }

  const config = resolveVmsConfig();

  // 服务端硬性校验 & 截断（防止 10163 schema 错误）
  let prompt = request.prompt.trim();
  if (!prompt) {
    return { success: false, error: 'Prompt cannot be empty' };
  }

  // ═══════════════════════════════════════════════════
  // TEST MODE: 测试期间只取前 5 个字符，避免消耗额度
  // 测试完成后，删除以下 2 行即可恢复正常
  // ═══════════════════════════════════════════════════
  prompt = prompt.slice(0, 5);
  log.warn(`TEST MODE: prompt 被截断为前 5 字 → "${prompt}"`);

  const truncatedPrompt =
    prompt.length > PROMPT_MAX_LENGTH
      ? prompt.slice(0, PROMPT_MAX_LENGTH - 1) + '…'
      : prompt;

  // TEST MODE: 使用最小字数
  const wordCount: number = WORD_COUNT_MIN;

  const body: XfyunVideoGenerateRequest = {
    header: {
      app_id: config.appId,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
    },
    parameter: {
      avatar: {
        prompt: truncatedPrompt,
        ...(wordCount ? { word_count: wordCount } : {}),
      },
    },
  };

  log.info(`VMS generate: promptLen=${truncatedPrompt.length}${prompt !== truncatedPrompt ? ' (truncated)' : ''}, wordCount=${wordCount ?? 'default'}`);

  const result = await vmsPost<XfyunVideoGenerateResponse>(API_PATHS.generate, body);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  const data = result.data;
  log.info(`VMS generate response: code=${data.header.code}, taskId=${data.header.task_id}`);

  if (data.header.code !== 0) {
    return { success: false, error: `VMS error (${data.header.code}): ${data.header.message}` };
  }

  const taskId = data.header.task_id;
  if (!taskId) {
    return { success: false, error: 'VMS returned no task_id' };
  }

  return {
    success: true,
    taskId,
  };
}

/**
 * 查询视频生成任务状态
 *
 * 通过 task_id 查询任务处理状态，任务完成后返回视频等产物 URL
 */
export async function queryVideoTask(request: VideoQueryRequest): Promise<VideoQueryResponse> {
  if (!isVmsConfigured()) {
    return { success: false, error: 'VMS not configured' };
  }

  const config = resolveVmsConfig();

  const body: XfyunVideoQueryRequest = {
    header: {
      app_id: config.appId,
      task_id: request.taskId,
    },
  };

  const result = await vmsPost<XfyunVideoQueryResponse>(API_PATHS.query, body);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  const data = result.data;
  log.info(`VMS query response: code=${data.header.code}, taskId=${data.header.task_id}, taskStatus=${data.header.task_status}`);

  if (data.header.code !== 0) {
    return { success: false, error: `VMS error (${data.header.code}): ${data.header.message}` };
  }

  const response: VideoQueryResponse = {
    success: true,
    taskId: data.header.task_id,
    taskStatus: data.header.task_status,
  };

  // 任务完成时提取产物 URL
  if (data.payload) {
    response.text = data.payload.text;
    response.imageUrl = data.payload.image;
    response.audioUrl = data.payload.audio;
    response.bgmUrl = data.payload.bgm;
    response.videoUrl = data.payload.video;
  }

  return response;
}
