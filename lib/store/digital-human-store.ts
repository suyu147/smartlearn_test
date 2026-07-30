/**
 * 数字人前端状态管理
 *
 * 数字人视频大模型异步生成模式:
 *   1. generateVideo → 提交文本 Prompt，创建视频生成任务，获取 task_id
 *   2. pollTask → 定时轮询任务状态，等待视频生成完成
 *   3. 播放生成的 MP4 视频
 */

import { create } from 'zustand';
import { getApiToken } from '@/lib/auth-token';
import type { DigitalHumanPosition, VideoTaskStatus } from '@/lib/digital-human/types';

/** 构建 Authorization 请求头 */
function buildAuthHeaders(): Record<string, string> {
  const token = getApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

const LOG_PREFIX = '[DigitalHuman]';

/** 初始轮询间隔（毫秒） */
const POLL_INTERVAL_INITIAL = 5000;
/** 最大轮询间隔（毫秒） — 渐进退避上限 */
const POLL_INTERVAL_MAX = 30000;
/** 每次退避增长（毫秒） */
const POLL_BACKOFF_STEP = 5000;
/** 最大轮询次数 */
const MAX_POLL_COUNT = 120; // 约 10-15 分钟（随退避延长）

interface DigitalHumanState {
  // ── 功能开关 ──
  /** 数字人功能是否启用 */
  enabled: boolean;
  /** 数字人显示位置 */
  position: DigitalHumanPosition;
  /** 数字人缩放比例 */
  scale: number;

  // ── 任务状态 ──
  /** 当前任务 ID */
  taskId: string | null;
  /** 任务状态 */
  taskStatus: VideoTaskStatus;
  /** 是否正在生成/轮询 */
  isGenerating: boolean;
  /** 上一次错误信息 */
  lastError: string | null;

  // ── 视频产物 ──
  /** 生成的视频 URL (MP4) */
  videoUrl: string | null;
  /** 封面图 URL */
  imageUrl: string | null;
  /** 扩写后的播报文案 */
  generatedText: string | null;
  /** 视频是否正在播放 */
  isVideoPlaying: boolean;

  // ── Actions ──
  setEnabled: (enabled: boolean) => void;
  setPosition: (position: DigitalHumanPosition) => void;
  setScale: (scale: number) => void;
  setError: (error: string | null) => void;
  setIsVideoPlaying: (playing: boolean) => void;
  clearAll: () => void;

  // ── 异步操作 ──
  /** 提交视频生成任务 */
  generateVideo: (prompt: string, wordCount?: number) => Promise<string | null>;
  /** 轮询任务状态（内部自动调用） */
  pollTask: (taskId: string) => Promise<void>;
  /** 停止轮询 */
  stopPolling: () => void;
}

export const useDigitalHumanStore = create<DigitalHumanState>((set, get) => {
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollCount = 0;

  function stopPollTimer() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    pollCount = 0;
  }

  return {
    // ── 初始状态 ──
    enabled: false,
    position: 'pip',
    scale: 1.0,
    taskId: null,
    taskStatus: 'idle',
    isGenerating: false,
    lastError: null,
    videoUrl: null,
    imageUrl: null,
    generatedText: null,
    isVideoPlaying: false,

    // ── Actions ──
    setEnabled: (enabled) => set({ enabled }),
    setPosition: (position) => set({ position }),
    setScale: (scale) => set({ scale }),
    setError: (error) => set({ lastError: error }),
    setIsVideoPlaying: (playing) => set({ isVideoPlaying: playing }),
    clearAll: () => {
      stopPollTimer();
      set({
        taskId: null,
        taskStatus: 'idle',
        isGenerating: false,
        lastError: null,
        videoUrl: null,
        imageUrl: null,
        generatedText: null,
        isVideoPlaying: false,
      });
    },

    // ── 异步操作 ──

    generateVideo: async (prompt: string, wordCount?: number) => {
      const state = get();
      if (state.isGenerating) {
        console.log(LOG_PREFIX, '已有任务在生成中，跳过');
        return null;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        const errMsg = '文本内容为空，无法生成视频';
        console.warn(LOG_PREFIX, errMsg);
        set({ lastError: errMsg, taskStatus: 'failed' });
        return null;
      }

      state.setError(null);
      set({ isGenerating: true, taskStatus: 'generating', videoUrl: null, imageUrl: null, generatedText: null });

      const promptLen = trimmedPrompt.length;
      if (promptLen > 300) {
        console.log(LOG_PREFIX, `prompt 长度 ${promptLen} > 300，将自动截断为 300 字符后提交`);
      }
      console.log(LOG_PREFIX, `提交视频生成任务 (len=${promptLen})...`);

      try {
        const response = await fetch('/api/v1/digital-human/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
          body: JSON.stringify({ prompt: trimmedPrompt, wordCount }),
        });

        const data = await response.json();
        console.log(LOG_PREFIX, 'generate 响应:', data);

        if (!data.success || !data.taskId) {
          const errMsg = data.error ?? '生成任务创建失败';
          console.error(LOG_PREFIX, errMsg);
          set({ isGenerating: false, taskStatus: 'failed', lastError: errMsg });
          return null;
        }

        set({ taskId: data.taskId, taskStatus: 'polling' });
        console.log(LOG_PREFIX, '任务已创建, taskId:', data.taskId);

        // 启动轮询
        get().pollTask(data.taskId);

        return data.taskId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(LOG_PREFIX, '生成异常:', err);
        set({ isGenerating: false, taskStatus: 'failed', lastError: `生成失败: ${message}` });
        return null;
      }
    },

    pollTask: async (taskId: string) => {
      stopPollTimer();
      pollCount = 0;

      const doPoll = async () => {
        if (pollCount >= MAX_POLL_COUNT) {
          set({ isGenerating: false, taskStatus: 'failed', lastError: `视频生成超时（已轮询 ${MAX_POLL_COUNT} 次），请稍后重试` });
          return;
        }

        pollCount++;

        try {
          const response = await fetch('/api/v1/digital-human/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
            body: JSON.stringify({ taskId }),
          });

          const data = await response.json();
          console.log(LOG_PREFIX, `poll #${pollCount}: taskStatus=${data.taskStatus}`);

          if (!data.success) {
            set({ isGenerating: false, taskStatus: 'failed', lastError: data.error ?? '查询失败' });
            return;
          }

          // 任务完成
          if (data.taskStatus === '3' || data.taskStatus === '4') {
            console.log(LOG_PREFIX, '视频生成完成!', data.videoUrl);
            set({
              isGenerating: false,
              taskStatus: 'completed',
              videoUrl: data.videoUrl || null,
              imageUrl: data.imageUrl || null,
              generatedText: data.text || null,
            });
            return;
          }

          // 仍在处理中，继续轮询（渐进式退避）
          const interval = Math.min(POLL_INTERVAL_INITIAL + pollCount * POLL_BACKOFF_STEP, POLL_INTERVAL_MAX);
          console.log(LOG_PREFIX, `poll #${pollCount}: 状态=${data.taskStatus}，${interval / 1000}s 后重试`);
          pollTimer = setTimeout(doPoll, interval);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(LOG_PREFIX, '轮询异常:', err);
          // 网络错误时重试，使用退避
          const interval = Math.min(POLL_INTERVAL_INITIAL + pollCount * POLL_BACKOFF_STEP, POLL_INTERVAL_MAX);
          pollTimer = setTimeout(doPoll, interval);
        }
      };

      doPoll();
    },

    stopPolling: () => {
      stopPollTimer();
      set({ isGenerating: false, taskStatus: 'idle' });
    },
  };
});
