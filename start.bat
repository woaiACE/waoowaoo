@echo off
chcp 65001 >nul 2>&1
setlocal

REM ============================================================
REM waoowaoo portable launcher
REM Starts all local services (MySQL, Redis, MinIO, Next.js)
REM ============================================================

REM Resolve repo directory
set "REPO_DIR=%~dp0"
set "REPO_DIR=%REPO_DIR:~0,-1%"

REM Locate core startup script
set "CORE_SCRIPT=%REPO_DIR%\scripts\start-core.ps1"

REM Ensure core script exists
if not exist "%CORE_SCRIPT%" (
    echo [错误] 找不到启动脚本：%CORE_SCRIPT%
    echo 请确认项目文件完整。
    pause
    exit /b 1
)

REM Ensure PowerShell is available
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell，请确认系统为 Windows 7 SP1 或更新版本。
    pause
    exit /b 1
)

REM Run the PowerShell bootstrap with safe options
powershell -NoProfile -ExecutionPolicy Bypass -File "%CORE_SCRIPT%" -RepoDir "%REPO_DIR%"

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动脚本执行失败，退出代码：%errorlevel%
    pause
    exit /b %errorlevel%
)

endlocal
