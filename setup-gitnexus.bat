@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================================
echo   GitNexus 代码智能引擎 - 一键安装 ^& 启动脚本
echo ========================================================
echo.

REM -------------------------------------------------
REM  检查 Node.js
REM -------------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo [OK] Node.js !NODE_VER!

REM -------------------------------------------------
REM  检查 gitnexus（优先使用 npx，避免全局安装权限问题）
REM -------------------------------------------------
where gitnexus >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('gitnexus --version 2^>nul') do set "GN_VER=%%v"
    echo [OK] gitnexus 已安装 !GN_VER!
) else (
    echo [INFO] 未检测到全局 gitnexus，将使用 npx 临时运行
)

call npx --yes gitnexus --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] 无法通过 npx 获取 gitnexus，请检查网络、npm 配置或代理设置
    pause
    exit /b 1
)
echo [OK] gitnexus CLI 可用

REM -------------------------------------------------
REM  切换到项目根目录（脚本所在目录）
REM -------------------------------------------------
cd /d "%~dp0"
echo [INFO] 工作目录: %cd%

REM -------------------------------------------------
REM  检查索引是否存在
REM -------------------------------------------------
if exist ".gitnexus\meta.json" (
    echo [INFO] 检测到已有索引，执行增量更新...
) else (
    echo [INFO] 首次索引，开始完整分析...
)

set "ANALYZE_FLAGS="

REM -------------------------------------------------
REM  选择是否生成 Embedding（可选，需联网）
REM -------------------------------------------------
echo.
echo [INFO] 是否生成 Embedding 向量索引? 首次会下载约 90MB 模型
echo [1] 使用 hf-mirror.com 镜像, 推荐国内用户
echo [2] 跳过 Embedding, 速度更快
echo.
set /p EMBED_CHOICE=请输入选择 [1/2], 默认 2: 

if "%EMBED_CHOICE%"=="1" (
    echo [INFO] 设置 HuggingFace 镜像: hf-mirror.com
    set "HF_ENDPOINT=https://hf-mirror.com"
    set "ANALYZE_FLAGS=--embeddings"
) else (
    set "ANALYZE_FLAGS="
)

REM -------------------------------------------------
REM  执行索引分析
REM -------------------------------------------------
echo.
echo [INFO] 开始分析代码库（可能需要 1~10 分钟，取决于项目大小）...
echo.
call npx --yes gitnexus analyze %ANALYZE_FLAGS%

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] 索引分析失败，请查看上方错误信息
    pause
    exit /b 1
)

REM -------------------------------------------------
REM  生成 skills 文件（可选）
REM -------------------------------------------------
echo.
echo [INFO] 生成模块技能文件（.claude/skills/）...
call npx --yes gitnexus analyze --skills >nul 2>&1
echo [OK] skills 文件生成完成

REM -------------------------------------------------
REM  确认 VS Code MCP 配置
REM -------------------------------------------------
if not exist ".vscode\mcp.json" (
    echo [INFO] 创建 VS Code MCP 配置...
    if not exist ".vscode" mkdir ".vscode"
    (
        echo {
        echo   "servers": {
        echo     "gitnexus": {
        echo       "type": "stdio",
        echo       "command": "npx",
        echo       "args": ["--yes", "gitnexus", "mcp"]
        echo     }
        echo   }
        echo }
    ) > ".vscode\mcp.json"
    echo [OK] .vscode\mcp.json 已创建
) else (
    echo [OK] .vscode\mcp.json 已存在
)

REM -------------------------------------------------
REM  显示索引统计
REM -------------------------------------------------
echo.
echo ========================================================
echo   GitNexus 安装完成！
echo ========================================================
echo.
echo 下一步：
echo   1. 用 VS Code 打开项目
echo   2. 打开 .vscode\mcp.json 文件
echo   3. 点击文件顶部的 [Start] 按钮启动 MCP 服务
echo   4. 在 GitHub Copilot Chat 中即可使用代码智能分析工具
echo.
echo Common commands:
echo Index update: npx gitnexus analyze
echo Status check: npx gitnexus status
echo Start MCP: npx gitnexus mcp
echo.
pause
