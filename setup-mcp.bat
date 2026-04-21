@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================================
echo   MCP 开发工具 - 一键安装 ^& 配置脚本
echo   安装内容：
echo     1. code-index-mcp  (代码智能索引)
echo     2. @playwright/mcp (浏览器自动化)
echo     3. chrome-debug-mcp(Chrome 调试)
echo   生成文件：.vscode\mcp.json  .vscode\settings.json
echo ========================================================
echo.

cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────
REM  Step 0: 检测 Node.js / npm
REM ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js，请先安装 https://nodejs.org/  (推荐 LTS)
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo [OK] Node.js !NODE_VER!

where npx >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 npx，请更新 Node.js 至 v16+ 版本。
    pause
    exit /b 1
)
echo [OK] npx 可用

REM ─────────────────────────────────────────────────────────
REM  Step 1: 检测 / 安装 uv (Python 包管理器，用于 uvx)
REM ─────────────────────────────────────────────────────────
echo.
echo [步骤 1/4] 检测 uv / uvx ...

set "LOCAL_BIN=%USERPROFILE%\.local\bin"
set "UVX_EXE=%LOCAL_BIN%\uvx.exe"

REM 先检测 PATH 中是否已有 uvx
where uvx >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('uvx --version 2^>nul') do set "UVX_VER=%%v"
    echo [OK] uvx 已在 PATH 中: !UVX_VER!
    set "UVX_CMD=uvx"
    goto :uvx_ready
)

REM 检查 %USERPROFILE%\.local\bin\uvx.exe
if exist "%UVX_EXE%" (
    echo [OK] uvx 已存在: %UVX_EXE%
    set "UVX_CMD=%UVX_EXE%"
    goto :uvx_ready
)

REM 自动下载安装 uv（官方脚本，写入 %USERPROFILE%\.local\bin）
echo [INFO] uv 未找到，正在自动安装...
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 PowerShell，无法自动安装 uv，请手动安装: https://docs.astral.sh/uv/
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "irm https://astral.sh/uv/install.ps1 | iex"
if %errorlevel% neq 0 (
    echo [ERROR] uv 安装失败，请手动安装: https://docs.astral.sh/uv/
    pause
    exit /b 1
)

REM 安装后更新当前进程 PATH
set "PATH=%LOCAL_BIN%;%PATH%"

where uvx >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%UVX_EXE%" (
        echo [ERROR] uv 安装完成但 uvx.exe 未找到，请重新打开终端后再次运行此脚本。
        pause
        exit /b 1
    )
    set "UVX_CMD=%UVX_EXE%"
) else (
    set "UVX_CMD=uvx"
)
echo [OK] uv 安装完成

:uvx_ready

REM ─────────────────────────────────────────────────────────
REM  Step 2: 安装 code-index-mcp（通过 uvx，按需缓存）
REM ─────────────────────────────────────────────────────────
echo.
echo [步骤 2/4] 安装 code-index-mcp (uvx 预缓存)...

"%UVX_CMD%" code-index-mcp --help >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] code-index-mcp 已可用（uvx 缓存命中）
) else (
    echo [INFO] 正在预缓存 code-index-mcp（首次下载，请等待）...
    "%UVX_CMD%" --from code-index-mcp code-index-mcp --help >nul 2>&1
    if !errorlevel! neq 0 (
        echo [WARN] code-index-mcp 预缓存失败，VS Code 使用时将按需下载（不影响配置生成）
    ) else (
        echo [OK] code-index-mcp 缓存完成
    )
)

REM ─────────────────────────────────────────────────────────
REM  Step 3: 安装 @playwright/mcp（npx 按需，无需全局）
REM ─────────────────────────────────────────────────────────
echo.
echo [步骤 3/4] 检测 @playwright/mcp ...

REM npx 使用 @latest 时会自动拉取，此处仅做一次预热验证
echo [INFO] 正在预热 @playwright/mcp（首次拉取稍慢）...
npx --yes @playwright/mcp@latest --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] @playwright/mcp 可用
) else (
    echo [WARN] @playwright/mcp 预热失败，VS Code 使用时将按需拉取（不影响配置生成）
)

REM ─────────────────────────────────────────────────────────
REM  Step 4: 安装 chrome-debug-mcp（独立可执行文件）
REM ─────────────────────────────────────────────────────────
echo.
echo [步骤 4/4] 安装 chrome-debug-mcp ...

set "CDMCP_EXE=%LOCAL_BIN%\chrome-debug-mcp.exe"

if exist "%CDMCP_EXE%" (
    echo [OK] chrome-debug-mcp.exe 已存在: %CDMCP_EXE%
    goto :cdmcp_ready
)

REM 检查 PATH 中是否已有 chrome-debug-mcp
where chrome-debug-mcp >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%p in ('where chrome-debug-mcp 2^>nul') do set "CDMCP_EXE=%%p"
    echo [OK] chrome-debug-mcp 已在 PATH 中: !CDMCP_EXE!
    goto :cdmcp_ready
)

REM 尝试通过 uvx 安装（部分版本发布到 PyPI）
echo [INFO] 尝试通过 uvx 安装 chrome-debug-mcp...
"%UVX_CMD%" chrome-debug-mcp --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] chrome-debug-mcp 通过 uvx 可用
    REM 写出包装脚本让 mcp.json 直接调 uvx
    set "USE_UVX_CDMCP=1"
    goto :cdmcp_ready
)

REM 从 GitHub Releases 下载独立 exe
echo [INFO] 正在从 GitHub 下载 chrome-debug-mcp.exe...
if not exist "%LOCAL_BIN%" mkdir "%LOCAL_BIN%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol='Tls12';" ^
  "$url='https://github.com/nicobytes/chrome-debug-mcp/releases/latest/download/chrome-debug-mcp-windows.exe';" ^
  "Write-Host '  下载中...';" ^
  "Invoke-WebRequest -Uri $url -OutFile '%CDMCP_EXE%' -UseBasicParsing"

if %errorlevel% neq 0 (
    echo [WARN] chrome-debug-mcp 下载失败，跳过（不影响其他 MCP 服务器配置）。
    echo        可手动下载放至: %CDMCP_EXE%
    echo        GitHub: https://github.com/nicobytes/chrome-debug-mcp/releases
    set "CDMCP_SKIP=1"
    goto :cdmcp_ready
)
echo [OK] chrome-debug-mcp.exe 下载完成

REM 确保 .local\bin 在用户 PATH 中（永久生效）
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$up=[Environment]::GetEnvironmentVariable('Path','User');" ^
  "if($up -notlike '*\.local\bin*'){" ^
  "  [Environment]::SetEnvironmentVariable('Path','%LOCAL_BIN%;'+$up,'User');" ^
  "  Write-Host '  PATH 已更新（新终端生效）'" ^
  "}"

:cdmcp_ready

REM ─────────────────────────────────────────────────────────
REM  生成 .vscode\mcp.json
REM ─────────────────────────────────────────────────────────
echo.
echo [生成] .vscode\mcp.json ...

if not exist ".vscode" mkdir ".vscode"

REM chrome-debug-mcp command 根据安装情况决定
if defined USE_UVX_CDMCP (
    set "CDMCP_CMD=${env:USERPROFILE}\\.local\\bin\\uvx.exe"
    set "CDMCP_ARGS=[\"chrome-debug-mcp\", \"--local\"]"
) else (
    set "CDMCP_CMD=${env:USERPROFILE}\\.local\\bin\\chrome-debug-mcp.exe"
    set "CDMCP_ARGS=[\"--local\"]"
)

(
echo {
echo   "servers": {
echo     "code-index": {
echo       "type": "stdio",
echo       "command": "${env:USERPROFILE}\\.local\\bin\\uvx.exe",
echo       "args": ["code-index-mcp", "--project-path", "${workspaceFolder}"],
echo       "env": {}
echo     },
echo     "playwright": {
echo       "type": "stdio",
echo       "command": "npx",
echo       "args": ["@playwright/mcp@latest"],
echo       "env": {}
echo     },
echo     "chrome-debug": {
echo       "type": "stdio",
echo       "command": "!CDMCP_CMD!",
echo       "args": ["--local"],
echo       "env": {}
echo     }
echo   }
echo }
) > ".vscode\mcp.json"

echo [OK] .vscode\mcp.json 已生成

REM ─────────────────────────────────────────────────────────
REM  生成 .vscode\settings.json（保留已有内容，追加 MCP 开关）
REM ─────────────────────────────────────────────────────────
echo.
echo [生成] .vscode\settings.json ...

if not exist ".vscode\settings.json" (
    (
    echo {
    echo   "chat.mcp.enabled": true
    echo }
    ) > ".vscode\settings.json"
    echo [OK] .vscode\settings.json 已创建
) else (
    REM 检查是否已有 chat.mcp.enabled
    findstr /c:"chat.mcp.enabled" ".vscode\settings.json" >nul 2>&1
    if !errorlevel! neq 0 (
        REM 没有此键 → 用 PowerShell 安全合并 JSON
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
          "$f='.vscode\settings.json';" ^
          "$j=Get-Content $f -Raw | ConvertFrom-Json;" ^
          "$j | Add-Member -NotePropertyName 'chat.mcp.enabled' -NotePropertyValue $true -Force;" ^
          "$j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8"
        echo [OK] .vscode\settings.json 已追加 chat.mcp.enabled
    ) else (
        echo [OK] .vscode\settings.json 已包含 chat.mcp.enabled，无需修改
    )
)

REM ─────────────────────────────────────────────────────────
REM  完成摘要
REM ─────────────────────────────────────────────────────────
echo.
echo ========================================================
echo   安装完成！
echo --------------------------------------------------------
echo   .vscode\mcp.json      - MCP 服务器配置
echo   .vscode\settings.json - VS Code MCP 启用开关
echo --------------------------------------------------------
echo   在 VS Code 中重新加载窗口（Ctrl+Shift+P → Reload Window）
echo   即可在 Copilot Chat 中使用三个 MCP 工具。
echo ========================================================
echo.
pause
