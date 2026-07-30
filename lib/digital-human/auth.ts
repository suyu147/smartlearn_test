/**
 * 讯飞 VMS 数字人 API 鉴权模块
 *
 * 使用 hmac-sha256 签名鉴权，鉴权参数拼接到 URL query string 中。
 * API 文档: https://www.xfyun.cn/doc/spark/videoGenerate.html
 *
 * 鉴权流程:
 *   1. 拼接签名原串 signature_origin = "host: {host}\ndate: {date}\n{method} {path} HTTP/1.1"
 *   2. 使用 APISecret 对 signature_origin 进行 hmac-sha256 签名 → base64 → signature
 *   3. 拼接 authorization_origin = api_key="{APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature}"
 *   4. 对 authorization_origin 进行 base64 编码
 *   5. 将 authorization、date、host 拼接到 URL query 参数中
 *
 * 适用于所有 VMS API:
 *   - /v1/private/video/generate
 *   - /v1/private/video/query
 */

import { createHmac } from 'crypto';

export interface VmsAuthConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/** 从环境变量中解析 VMS 配置 */
export function resolveVmsConfig(): VmsAuthConfig {
  const appId = process.env.XFYUN_VMS_APP_ID ?? '';
  const apiKey = process.env.XFYUN_VMS_API_KEY ?? '';
  const apiSecret = process.env.XFYUN_VMS_API_SECRET ?? '';
  const baseUrl = process.env.XFYUN_VMS_BASE_URL ?? 'http://vms.cn-huadong-1.xf-yun.com';

  return { appId, apiKey, apiSecret, baseUrl };
}

/** 检查 VMS 配置是否完整 */
export function isVmsConfigured(): boolean {
  const config = resolveVmsConfig();
  return !!(config.appId && config.apiKey && config.apiSecret);
}

/**
 * 生成讯飞 VMS 鉴权 URL
 *
 * 鉴权参数通过 URL query string 传递，而非 Header。
 *
 * 经实测验证：签名路径 = 实际请求路径 = /v1/private/video/{generate|query}
 * 官方文档写的签名路径 /api/v1/video/{generate|query} 实际会导致 401 签名不匹配
 *
 * @param apiKey - 讯飞 APIKey
 * @param apiSecret - 讯飞 APISecret (直接用原始字符串，无需 base64 解码)
 * @param method - HTTP 方法 (POST)
 * @param baseUrl - API 基础 URL (如 http://vms.cn-huadong-1.xf-yun.com)
 * @param path - API 路径 (如 /v1/private/video/generate)，签名和请求使用相同路径
 * @returns 带鉴权参数的完整 URL
 */
export function generateVmsAuthUrl(
  apiKey: string,
  apiSecret: string,
  method: string,
  baseUrl: string,
  path: string,
): string {
  const url = new URL(baseUrl);
  const host = url.host;
  // RFC1123 格式，UTC/GMT 时区
  const date = new Date().toUTCString();

  // 1. 签名原串（签名路径 = 实际请求路径）
  const signatureOrigin = `host: ${host}\ndate: ${date}\n${method} ${path} HTTP/1.1`;

  // 2. hmac-sha256 签名 → base64
  const signature = createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64');

  // 3. authorization_origin
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;

  // 4. base64 编码得到最终 authorization
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  // 5. 拼接到 URL query 参数
  const authParams = new URLSearchParams({
    authorization,
    date,
    host,
  });

  return `${baseUrl}${path}?${authParams.toString()}`;
}
