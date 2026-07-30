/**
 * Digital Human (数字人) Type Definitions
 *
 * 讯飞数字人视频大模型 — 异步 RESTful API 类型定义
 * API 文档: https://www.xfyun.cn/doc/spark/videoGenerate.html
 *
 * 核心流程:
 *   1. POST /api/v1/video/generate → 提交文本 Prompt，异步创建视频生成任务，返回 task_id
 *   2. POST /api/v1/video/query   → 轮询 task_id，获取任务状态和视频产物 URL
 *
 * 任务状态:
 *   task_status "1" = 已创建 (Created)
 *   task_status "2" = 处理中 (Queued / Processing)
 *   task_status "3" = 处理完成，等待回调
 *   task_status "4" = 最终完成
 *
 * 硬限制（来自 API schema）:
 *   prompt:    最大 300 字符
 *   wordCount: 50 - 300 字
 */

/** prompt 最大字符数（API schema 限制） */
export const PROMPT_MAX_LENGTH = 300;
/** wordCount 最小值 */
export const WORD_COUNT_MIN = 50;
/** wordCount 最大值 */
export const WORD_COUNT_MAX = 300;

// ============================================================================
// 创建视频生成任务 (video/generate)
// ============================================================================

/** 创建视频生成任务请求 */
export interface VideoGenerateRequest {
  /** 用户输入文本，服务将据此扩写播报文案并生成视频 */
  prompt: string;
  /** 播报文案字数上限，范围 50-300，不传时默认 80-150 字 */
  wordCount?: number;
  /** 异步回调地址（可选），任务完成后服务将 POST 通知至该地址 */
  callbackUrl?: string;
}

/** 创建视频生成任务响应 */
export interface VideoGenerateResponse {
  success: boolean;
  /** 任务 ID，供后续查询使用 */
  taskId?: string;
  error?: string;
}

// ============================================================================
// 查询任务状态 (video/query)
// ============================================================================

/** 查询任务状态请求 */
export interface VideoQueryRequest {
  /** 创建任务时返回的任务 ID */
  taskId: string;
}

/** 查询任务状态响应 */
export interface VideoQueryResponse {
  success: boolean;
  /** 任务 ID */
  taskId?: string;
  /** 任务状态: "1"=已创建, "2"=处理中, "3"=等待回调, "4"=最终完成 */
  taskStatus?: string;
  /** 扩写后的播报文案 */
  text?: string;
  /** 数字人封面图 URL */
  imageUrl?: string;
  /** 语音音频 URL (WAV) */
  audioUrl?: string;
  /** 背景音乐 URL (MP3) */
  bgmUrl?: string;
  /** 最终合成视频 URL (MP4) */
  videoUrl?: string;
  error?: string;
}

// ============================================================================
// 讯飞 API 原始请求/响应（严格按官方文档）
// ============================================================================

// ── video/generate ──

export interface XfyunVideoGenerateRequest {
  header: {
    app_id: string;
    callback_url?: string;
  };
  parameter: {
    avatar: {
      prompt: string;
      word_count?: number;
    };
  };
}

export interface XfyunVideoGenerateResponse {
  header: {
    code: number;
    message: string;
    task_id: string;
  };
}

// ── video/query ──

export interface XfyunVideoQueryRequest {
  header: {
    app_id: string;
    task_id: string;
  };
}

export interface XfyunVideoQueryResponse {
  header: {
    code: number;
    message: string;
    task_id: string;
    task_status: string;
  };
  payload?: {
    text?: string;
    image?: string;
    audio?: string;
    bgm?: string;
    video?: string;
  };
}

// ============================================================================
// 前端状态
// ============================================================================

export type DigitalHumanPosition = 'overlay' | 'sidebar' | 'pip';

/** 任务生成状态 */
export type VideoTaskStatus = 'idle' | 'generating' | 'polling' | 'completed' | 'failed';
