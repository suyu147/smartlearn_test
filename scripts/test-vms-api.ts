/**
 * 讯飞数字人视频大模型 API 测试脚本
 *
 * 用法: npx tsx -r dotenv/config scripts/test-vms-api.ts
 *
 * 验证鉴权签名和 video/generate + video/query 异步流程
 * 经实测：签名路径 = 实际请求路径 = /v1/private/video/{generate|query}
 */

import 'dotenv/config';
import { createHmac } from 'crypto';

const APP_ID = process.env.XFYUN_VMS_APP_ID ?? '';
const API_KEY = process.env.XFYUN_VMS_API_KEY ?? '';
const API_SECRET = process.env.XFYUN_VMS_API_SECRET ?? '';
const BASE_URL = process.env.XFYUN_VMS_BASE_URL ?? 'http://vms.cn-huadong-1.xf-yun.com';

function generateAuthUrl(path: string): string {
  const url = new URL(BASE_URL);
  const host = url.host;
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nPOST ${path} HTTP/1.1`;
  const signature = createHmac('sha256', API_SECRET).update(signatureOrigin).digest('base64');
  const authorizationOrigin = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  const authParams = new URLSearchParams({ authorization, date, host });
  return `${BASE_URL}${path}?${authParams.toString()}`;
}

async function main() {
  console.log('=== 环境变量 ===');
  console.log(`APP_ID: ${APP_ID}`);
  console.log(`API_KEY: ${API_KEY}`);
  console.log(`API_SECRET: ${API_SECRET}`);
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log('');

  if (!APP_ID || !API_KEY || !API_SECRET) {
    console.error('错误: 缺少环境变量');
    process.exit(1);
  }

  // ── 1. 创建视频生成任务 ──
  console.log('=== 1. 创建视频生成任务 ===');
  const generateUrl = generateAuthUrl('/v1/private/video/generate');
  const generateBody = {
    header: { app_id: APP_ID },
    parameter: {
      avatar: {
        prompt: '介绍一下人工智能的发展历史和未来趋势',
        word_count: 120,
      },
    },
  };

  let taskId = '';

  try {
    const genRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(generateBody),
    });

    console.log(`HTTP Status: ${genRes.status}`);
    const genData = await genRes.json();
    console.log('响应:', JSON.stringify(genData, null, 2));

    if (genData.header?.code !== 0) {
      console.error('创建任务失败!');
      process.exit(1);
    }

    taskId = genData.header.task_id;
    console.log(`\ntaskId: ${taskId}`);
  } catch (err) {
    console.error('创建任务请求失败:', err);
    process.exit(1);
  }

  // ── 2. 轮询任务状态 ──
  console.log('\n=== 2. 轮询任务状态 ===');
  const maxPolls = 60;
  const pollInterval = 5000;

  for (let i = 1; i <= maxPolls; i++) {
    console.log(`\n--- 轮询 #${i} ---`);
    const queryUrl = generateAuthUrl('/v1/private/video/query');
    const queryBody = {
      header: { app_id: APP_ID, task_id: taskId },
    };

    try {
      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(queryBody),
      });

      console.log(`HTTP Status: ${queryRes.status}`);
      const queryData = await queryRes.json();
      console.log('响应:', JSON.stringify(queryData, null, 2));

      const taskStatus = queryData.header?.task_status;
      console.log(`task_status: ${taskStatus}`);

      if (taskStatus === '3' || taskStatus === '4') {
        console.log('\n=== 视频生成完成! ===');
        if (queryData.payload) {
          console.log('文案:', queryData.payload.text);
          console.log('封面图:', queryData.payload.image);
          console.log('音频:', queryData.payload.audio);
          console.log('BGM:', queryData.payload.bgm);
          console.log('视频:', queryData.payload.video);
        }
        break;
      }

      if (i < maxPolls) {
        console.log(`等待 ${pollInterval / 1000} 秒后继续轮询...`);
        await new Promise((r) => setTimeout(r, pollInterval));
      }
    } catch (err) {
      console.error('查询请求失败:', err);
    }
  }

  console.log('\n=== 测试完成 ===');
}

main();
