# SmartLearn 401 认证错误与 SSE 流修复

## 问题现象

部署到网站后，智能学习功能报错：
- `api/v1/smartlearn` → 401 Unauthorized
- `ERR_INCOMPLETE_CHUNKED_ENCODING`（SSE 流被截断）
- `api/v1/auth/register` → 409 Conflict（重复注册）

## 根因

1. **反向代理剥离 Authorization 头** — Nginx/Cloudflare 等代理可能未透传认证头
2. **Nginx 默认缓冲 SSE 流** — 缺少 `X-Accel-Buffering: no`，导致流式响应异常中断
3. **smartlearn 页面硬编码 `userId='anonymous'`** — 与实际登录用户不匹配

## 修复内容

### 1. 所有 SSE 响应增加 `X-Accel-Buffering: no` 头

| 文件 | 说明 |
|------|------|
| `app/api/v1/smartlearn/route.ts` | 主智能学习路由 |
| `app/api/v1/smartlearn/evaluate/route.ts` | 评测路由 |
| `app/api/v1/smartlearn/resources/route.ts` | 资源生成路由 |
| `app/api/v1/turns/route.ts` | 轮次路由 |

额外将 `Cache-Control` 从 `no-cache` 改为 `no-cache, no-transform` 避免代理转换。

### 2. smartlearn 路由认证优化

`app/api/v1/smartlearn/route.ts`：优先读取中间件注入的 `x-user-id` 头，避免重复 JWT 校验。

### 3. smartlearn 页面使用真实用户 ID

`app/smartlearn/page.tsx`：
- 从 auth store 获取真实 `userId`，替代硬编码 `'anonymous'`
- 所有 SSE 请求遇到 401 时自动清除过期 token 并跳转登录页

## 部署注意事项

Nginx 反代需确保配置了：

```nginx
proxy_set_header Authorization $http_authorization;
proxy_buffering off;
proxy_cache off;
```

如果不需要多用户认证，可在 `.env` 中设置 `AUTH_MODE=disabled`。
