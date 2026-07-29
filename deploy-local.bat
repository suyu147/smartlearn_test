@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: =============================================================================
:: SmartLearn — 本地部署脚本 (Windows · 非 Docker)
:: =============================================================================
:: 用法：以管理员身份运行 deploy-local.bat
:: 前提：已安装 Node.js 22+ 和 PostgreSQL 16（需 pgvector 扩展）
:: =============================================================================

title SmartLearn 本地部署

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║     SmartLearn 智能学习平台 — 本地部署（无 Docker）║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ===========================================================================
:: Step 1: 检查 Node.js
:: ===========================================================================
echo [1/6] 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 22+。
    echo        下载地址：https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
:: Remove leading "v" and get major
for /f "tokens=1,2 delims=v." %%a in ('node -v') do set NODE_VER=%%b
if %NODE_VER% lss 22 (
    echo [警告] 当前 Node.js 版本为 %NODE_VER%，建议使用 Node.js 22+。
    echo        继续可能遇到兼容性问题，是否继续？(Y/N)
    choice /c yn /n /m "        "
    if errorlevel 2 exit /b 1
)
echo        Node.js 环境正常 ✓
echo.

:: ===========================================================================
:: Step 2: 检查 PostgreSQL
:: ===========================================================================
echo [2/6] 检查 PostgreSQL 数据库...

:: Try to connect using pg_isready
where pg_isready >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未找到 pg_isready，无法自动检查 PostgreSQL 状态。
    echo        请确保 PostgreSQL 16+ 已安装并运行，且已启用 pgvector 扩展。
    echo.
    echo        pgvector 是必须的扩展，用于知识库向量检索（RAG）。
    echo        安装方式：
    echo          - 官方安装包：https://www.postgresql.org/download/windows/
    echo          - pgvector 安装：https://github.com/pgvector/pgvector
    echo.
    set PG_OK=0
    goto check_env
)

pg_isready -q 2>nul
if %errorlevel% neq 0 (
    echo [警告] PostgreSQL 似乎未运行，请先启动 PostgreSQL 服务。
    echo        可尝试：net start postgresql-x64-16
    set PG_OK=0
    goto check_env
)

echo        PostgreSQL 连接正常 ✓
set PG_OK=1

:: ===========================================================================
:: Step 3: 检查 .env 配置
:: ===========================================================================
:check_env
echo.
echo [3/6] 检查 .env 配置文件...

if not exist ".env" (
    echo        .env 文件不存在，正在从 .env.example 创建...
    copy .env.example .env >nul 2>nul
    echo ╔══════════════════════════════════════════════════╗
    echo ║  [重要] .env 文件已创建，请先编辑以下必填项：       ║
    echo ║                                                    ║
    echo ║  1. DATABASE_URL      — 数据库连接串              ║
    echo ║  2. AI_API_KEY        — AI 大模型 API Key         ║
    echo ║  3. JWT_SECRET        — JWT 密钥（任意 32+ 字符） ║
    echo ║  4. DT_ENCRYPTION_SECRET — 加密密钥（32+ 字符）   ║
    echo ║                                                    ║
    echo ║  配置完成后按任意键继续部署...                      ║
    echo ╚══════════════════════════════════════════════════╝
    pause
) else (
    echo        .env 文件已存在 ✓
)

:: 校验必填项
set MISSING=0
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "k=%%a"
    set "v=%%b"
    :: Remove leading/trailing spaces and comments
    for /f "tokens=1 delims=#" %%x in ("!k!") do set "k=%%x"
    if "!k!"=="JWT_SECRET" if "!v!"=="" set MISSING=1
    if "!k!"=="DT_ENCRYPTION_SECRET" if "!v!"=="" set MISSING=1
)
if %MISSING% equ 1 (
    echo ╔══════════════════════════════════════════════════╗
    echo ║  [警告] .env 中存在未配置的必填项！                 ║
    echo ║  - JWT_SECRET                                    ║
    echo ║  - DT_ENCRYPTION_SECRET                          ║
    echo ║                                                    ║
    echo ║  请编辑 .env 文件填写后重新运行本脚本。             ║
    echo ╚══════════════════════════════════════════════════╝
    pause
    exit /b 1
)

:: 本地部署需要 DATABASE_URL 指向 localhost
echo        .env 配置就绪 ✓
echo        ⚠  请确保 .env 中的 DATABASE_URL 指向本地 PostgreSQL
echo           （如 postgresql://postgres:password@localhost:5432/smartlearn）
echo.

:: ===========================================================================
:: Step 4: 安装依赖 & 数据库初始化
:: ===========================================================================
echo [4/6] 安装依赖 & 初始化数据库...

echo        安装 npm 依赖（首次约需 2-5 分钟）...
call npm install
if %errorlevel% neq 0 (
    echo [错误] npm install 失败。
    pause
    exit /b 1
)

echo        生成 Prisma Client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [错误] prisma generate 失败。
    pause
    exit /b 1
)

echo        执行数据库迁移...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [错误] 数据库迁移失败，请检查 PostgreSQL 是否运行及 DATABASE_URL 是否正确。
    echo        如果数据库尚未创建，请先执行：
    echo          createdb -U postgres smartlearn
    echo        并确保已启用 pgvector 扩展：
    echo          psql -U postgres -d smartlearn -c "CREATE EXTENSION IF NOT EXISTS vector;"
    pause
    exit /b 1
)

echo        依赖安装 & 数据库初始化完成 ✓
echo.

:: ===========================================================================
:: Step 5: 构建项目
:: ===========================================================================
echo [5/6] 构建项目（约需 2-5 分钟）...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 项目构建失败。
    pause
    exit /b 1
)

:: 构建后设置 standalone 目录（模拟 Docker 部署流程）
echo        准备 standalone 运行环境...

:: 复制 prompt 模板文件
if exist "lib\generation\prompts" (
    if not exist ".next\standalone\lib\generation" mkdir ".next\standalone\lib\generation"
    xcopy /E /I /Q /Y "lib\generation\prompts" ".next\standalone\lib\generation\prompts" >nul 2>&1
)

:: 复制 Prisma 文件到 standalone
if exist "prisma" (
    if not exist ".next\standalone\prisma" mkdir ".next\standalone\prisma"
    xcopy /E /I /Q /Y "prisma" ".next\standalone\prisma" >nul 2>&1
)

:: 复制完整 node_modules（standalone 不会追踪 serverExternalPackages 的传递依赖）
echo        复制 node_modules 到 standalone 目录...
xcopy /E /I /Q /Y "node_modules" ".next\standalone\node_modules" >nul 2>&1

echo        项目构建完成 ✓
echo.

:: ===========================================================================
:: Step 6: 启动服务
:: ===========================================================================
echo [6/6] 启动 SmartLearn 服务...
echo.
echo        请选择启动方式：
echo        [1] 前台运行（关闭终端即停止）
echo        [2] PM2 后台运行（推荐）
echo        [3] 仅测试启动（30 秒后自动终止）
echo.
choice /c 123 /n /m "        请选择 [1/2/3]："

if errorlevel 3 goto test_run
if errorlevel 2 goto pm2_run
if errorlevel 1 goto foreground_run

:foreground_run
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║  服务启动中...访问 http://localhost:3000          ║
echo ║  按 Ctrl+C 停止服务                              ║
echo ╚══════════════════════════════════════════════════╝
echo.
cd .next\standalone
node server.js
goto done

:pm2_run
echo.
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo        正在安装 PM2 进程管理器...
    call npm install -g pm2
    if %errorlevel% neq 0 (
        echo [错误] PM2 安装失败，请手动安装：npm install -g pm2
        pause
        exit /b 1
    )
)

:: 先停止旧实例（如果存在）
pm2 delete smartlearn >nul 2>&1

:: 启动 standalone 服务器
echo        启动 SmartLearn（PM2 守护）...
cd .next\standalone
pm2 start server.js --name smartlearn
cd ..\..

:: 设置开机自启（需管理员权限）
pm2 save >nul 2>&1
pm2 startup >nul 2>&1

:: 等待服务启动
echo        等待服务就绪...
timeout /t 5 /nobreak >nul
curl -sf http://localhost:3000/api/v1/health >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ╔══════════════════════════════════════════════════╗
    echo ║                                                  ║
    echo ║      SmartLearn 部署成功！                        ║
    echo ║                                                  ║
    echo ║      访问地址：http://localhost:3000              ║
    echo ║                                                  ║
    echo ║      常用命令：                                    ║
    echo ║        查看状态：pm2 status                       ║
    echo ║        查看日志：pm2 logs smartlearn              ║
    echo ║        重启服务：pm2 restart smartlearn           ║
    echo ║        停止服务：pm2 stop smartlearn              ║
    echo ║        删除服务：pm2 delete smartlearn            ║
    echo ║                                                  ║
    echo ╚══════════════════════════════════════════════════╝
) else (
    echo ╔══════════════════════════════════════════════════╗
    echo ║  [注意] 服务已启动但健康检查未通过。               ║
    echo ║  请检查日志：pm2 logs smartlearn                  ║
    echo ╚══════════════════════════════════════════════════╝
)
goto done

:test_run
echo.
echo        测试启动中（30 秒后自动终止）...
cd .next\standalone
start "SmartLearn-Test" cmd /c "node server.js & pause"
cd ..\..

:: 等待并检查
echo        等待服务启动...
timeout /t 10 /nobreak >nul

curl -sf http://localhost:3000/api/v1/health >nul 2>&1
if %errorlevel% equ 0 (
    echo        健康检查通过 ✓
    echo        服务正在新窗口中运行，请访问 http://localhost:3000
    echo        关闭新窗口即可停止服务。
) else (
    echo        [警告] 健康检查未通过，请查看新窗口中的日志。
)

:: ===========================================================================
:done
echo.
echo 按任意键退出...
pause >nul
endlocal
