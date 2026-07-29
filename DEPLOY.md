# SmartLearn（智学方舟）部署指南

## 目录

- [环境要求](#环境要求)
- [快速开始（Docker Compose）](#快速开始docker-compose)
- [Windows 本地部署](#windows-本地部署)
- [Linux 服务器手动部署](#linux-服务器手动部署)
- [环境变量说明](#环境变量说明)
- [常用运维命令](#常用运维命令)
- [故障排查](#故障排查)

---

## 环境要求

### 推荐配置

| 资源   | 最低要求   | 推荐配置   |
| ------ | ---------- | ---------- |
| CPU    | 2 核       | 4 核       |
| 内存   | 2 GB       | 4 GB       |
| 磁盘   | 20 GB      | 50 GB+     |

> 2 核 2GB 可满足 1-3 人低频使用（基础浏览、聊天），但在知识库文档处理（PDF 解析/分块/向量化）、电子书编译、PPT 生成、并发超过 3 人时会明显卡顿。建议至少 2 核 4GB。

### 软件依赖

| 软件              | 版本要求         | 用途                   |
| ----------------- | ---------------- | ---------------------- |
| Node.js           | >= 22.0.0        | 运行时                 |
| PostgreSQL        | >= 16            | 主数据库               |
| pgvector 扩展     | 与 PG 版本匹配   | 向量检索（RAG 必须）   |
| Docker（可选）    | >= 24            | 容器化部署             |

### 外部服务（按需配置）

| 服务       | 用途             | 是否必须 |
| ---------- | ---------------- | -------- |
| AI 大模型  | 核心智能对话      | 是       |
| Embedding  | 向量化（知识库）  | 是       |
| TTS / ASR  | 语音合成与识别    | 否       |
| 图片生成   | 生成配图         | 否       |
| Web 搜索   | 联网搜索         | 否       |

---

## 快速开始（Docker Compose）

推荐的一键部署方式，自动创建 PostgreSQL（含 pgvector）、代码沙箱与应用。

### 1. 进入项目目录

```bash
cd smartlearn
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填写必填项：

```ini
# === 必填：AI 大模型 ===
AI_PROVIDER=deepseek
AI_MODEL=deepseek-v4-flash
AI_API_KEY=你的_API_Key

# === 必填：密钥 ===
JWT_SECRET=随机32位以上字符串
DT_ENCRYPTION_SECRET=随机32位以上字符串

# === 必填：向量化 ===
DT_EMBEDDING_PROVIDER=siliconflow
DT_EMBEDDING_API_KEY=你的_Embedding_API_Key
DT_EMBEDDING_MODEL=BAAI/bge-m3

# === 认证模式 ===
AUTH_MODE=multi
```

生成密钥（Linux/WSL）：

```bash
openssl rand -hex 32
```

生成密钥（Windows PowerShell）：

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | % {[char]$_})
```

### 3. 启动

```bash
docker compose up -d
```

首次启动会自动拉取镜像、构建应用、执行数据库迁移，约需 3-5 分钟。

### 4. 验证

```bash
curl http://localhost:3000/api/v1/health
```

返回 `{"status":"ok"}` 表示成功。浏览器访问 `http://localhost:3000`。

### 5. 查看日志

```bash
docker compose logs -f app
```

---

## Windows 本地部署

项目提供了一键部署脚本 `deploy-local.bat`。

### 前提

1. 安装 [Node.js 22+](https://nodejs.org/)
2. 安装 [PostgreSQL 16+](https://www.postgresql.org/download/windows/)
3. 为 PostgreSQL 安装 [pgvector 扩展](https://github.com/pgvector/pgvector)

### 使用脚本部署

以管理员身份运行 `deploy-local.bat`，脚本会自动完成所有步骤。

### 手动部署

```powershell
# 1. 配置
copy .env.example .env
# 编辑 .env，DATABASE_URL 指向本地

# 2. 安装
npm install
npx prisma generate

# 3. 创建数据库并启用 pgvector
# psql -U postgres -c "CREATE DATABASE smartlearn;"
# psql -U postgres -d smartlearn -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. 初始化和构建
npx prisma migrate deploy
npm run build

# 5. 启动
node .next/standalone/server.js
```

---

## Linux 服务器手动部署

### 1. 安装系统依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib

# 安装 pgvector
git clone https://github.com/pgvector/pgvector.git
cd pgvector && make && sudo make install
cd .. && rm -rf pgvector
```

### 2. 配置 PostgreSQL

```bash
sudo -u postgres psql -c "CREATE DATABASE smartlearn;"
sudo -u postgres psql -d smartlearn -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '你的密码';"
```

### 3. 部署应用

```bash
cd /opt/smartlearn
git clone <仓库地址> .

cp .env.example .env
# 编辑 .env:
#   DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/smartlearn

npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

### 4. PM2 守护（推荐）

```bash
npm install -g pm2
pm2 start .next/standalone/server.js --name smartlearn
pm2 save
pm2 startup
```

### 5. Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

### 6. 低配服务器优化（2GB 内存）

添加 swap 防止 OOM：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

限制 Node.js 内存：

```bash
pm2 start .next/standalone/server.js --name smartlearn --node-args="--max-old-space-size=384"
```

---

## 环境变量说明

### AI 大模型

| 变量          | 说明                                   | 必填 |
| ------------- | -------------------------------------- | ---- |
| `AI_PROVIDER` | 提供商（openai/deepseek/spark 等）     | 是   |
| `AI_MODEL`    | 模型名称                               | 是   |
| `AI_API_KEY`  | API 密钥                               | 是   |
| `AI_BASE_URL` | API 地址（厂商兼容接口需指定）          | 否   |

支持：`openai` `anthropic` `google` `deepseek` `kimi` `glm` `qwen` `minimax` `siliconflow` `doubao` `grok` `spark`

### 安全

| 变量                   | 说明                            | 必填 |
| ---------------------- | ------------------------------- | ---- |
| `JWT_SECRET`           | JWT 密钥（openssl rand -hex 32） | 是   |
| `DT_ENCRYPTION_SECRET` | 加密密钥（用于 API Key 加密）    | 是   |
| `AUTH_MODE`            | 认证：disabled / single / multi  | 是   |

### 向量检索

| 变量                    | 说明                         | 必填 |
| ----------------------- | ---------------------------- | ---- |
| `DT_EMBEDDING_PROVIDER` | Embedding 提供商              | 是   |
| `DT_EMBEDDING_API_KEY`  | Embedding API 密钥            | 是   |
| `DT_EMBEDDING_MODEL`    | 模型（bge-m3 为 1024 维）     | 是   |
| `DT_EMBEDDING_BASE_URL` | API 地址                     | 否   |

### 数据库

| 变量               | 说明                          | 必填 |
| ------------------ | ----------------------------- | ---- |
| `DATABASE_URL`     | PostgreSQL 连接串              | 是   |
| `POSTGRES_USER`    | 用户名（Docker 部署用）        | 否   |
| `POSTGRES_PASSWORD`| 密码（Docker 部署用）          | 否   |
| `POSTGRES_DB`      | 数据库名（Docker 部署用）      | 否   |

### 可选功能

| 变量                 | 说明                        | 必填 |
| -------------------- | --------------------------- | ---- |
| `VISION_PROVIDER`    | 视觉代理（主模型不支持图片时） | 否   |
| `IMAGE_GEN_PROVIDER` | 图片生成提供商               | 否   |
| `DT_VOICE_PROVIDER`  | TTS 语音提供商               | 否   |
| `DT_SEARCH_PROVIDER` | 联网搜索提供商               | 否   |
| `DT_MCP_SERVERS`     | MCP 工具服务器（JSON 格式）   | 否   |

---

## 常用运维命令

### Docker Compose

```bash
docker compose up -d            # 启动
docker compose down             # 停止
docker compose restart          # 重启
docker compose logs -f app      # 日志
docker compose exec app sh      # 进入容器
docker compose exec db psql -U postgres -d smartlearn  # 数据库
docker compose exec app npx prisma migrate deploy      # 手动迁移
docker compose build app        # 重新构建（代码更新后）
docker compose up -d            # 重新部署
```

### PM2

```bash
pm2 status              # 状态
pm2 logs smartlearn     # 日志
pm2 restart smartlearn  # 重启
pm2 stop smartlearn     # 停止
pm2 monit               # 监控
```

### 健康检查

```bash
curl http://localhost:3000/api/v1/health
```

---

## 故障排查

### 数据库连接失败

- Docker：确认 `db` 已启动 `docker compose ps db`，查看日志 `docker compose logs db`
- 手动：确认 PostgreSQL 运行 `systemctl status postgresql`
- 检查 `.env` 中 `DATABASE_URL` 格式

### 数据库迁移失败

```bash
npx prisma migrate status                        # 查看状态
npx prisma migrate resolve --applied <迁移名称>   # 标记已完成
npx prisma migrate deploy                        # 重试
```

### pgvector 未安装

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### AI 调用无响应

- 检查 `AI_API_KEY`、`AI_PROVIDER`、`AI_MODEL` 是否正确
- 检查 API 配额
- 查看日志

### 内存不足（OOM）

- 添加 2GB swap
- 限制 Node.js 内存：`--max-old-space-size=384`
- 关闭 LLM 思考过程：`LLM_THINKING_DISABLED=true`

### standalone 缺少依赖

```bash
cp -r node_modules .next/standalone/
cp -r lib/generation/prompts .next/standalone/lib/generation/
cp -r prisma .next/standalone/
```
