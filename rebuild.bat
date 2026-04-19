@echo off
chcp 65001 >nul 2>&1
setlocal

REM ============================================================
REM waoowaoo force rebuild launcher
REM Rebuilds Next.js and restarts the local services
REM Equivalent to start.bat plus --ForceRebuild
REM ============================================================

set "REPO_DIR=%~dp0"
set "REPO_DIR=%REPO_DIR:~0,-1%"
set "CORE_SCRIPT=%REPO_DIR%\scripts\start-core.ps1"

if not exist "%CORE_SCRIPT%" (
    echo [错误] 找不到启动脚本：%CORE_SCRIPT%
    pause
    exit /b 1
)

where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell。
    pause
    exit /b 1
)

echo [提示] 强制重建模式：将清除 .next 并重新执行 next build
echo        数据库 Schema 同步（prisma db push）也会自动执行
echo.

powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%CORE_SCRIPT%" -RepoDir "%REPO_DIR%" -ForceRebuild

if %errorlevel% neq 0 (
    echo.
    echo [错误] 重建失败，退出代码：%errorlevel%
    pause
    exit /b %errorlevel%
)

endlocal
