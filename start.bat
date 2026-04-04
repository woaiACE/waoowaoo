@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
:: waoowaoo 便携启动入口
:: 双击此文件即可启动所有服务（MySQL、Redis、MinIO、Next.js）
:: ============================================================

:: 获取本文件所在目录（不含末尾反斜杠）
set "REPO_DIR=%~dp0"
set "REPO_DIR=%REPO_DIR:~0,-1%"

:: 定位核心调度脚本
set "CORE_SCRIPT=%REPO_DIR%\scripts\start-core.ps1"

:: 检查核心脚本是否存在
if not exist "%CORE_SCRIPT%" (
    echo [错误] 找不到启动脚本：%CORE_SCRIPT%
    echo 请确认项目文件完整。
    pause
    exit /b 1
)

:: 检查 PowerShell 是否可用
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell，请确认系统为 Windows 7 SP1 或更新版本。
    pause
    exit /b 1
)

:: 以 ExecutionPolicy Bypass 运行核心脚本（无需用户手动修改系统策略）
:: -NoProfile     跳过用户配置文件，加快启动速度
:: -NonInteractive 阻止弹出任何交互对话框
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%CORE_SCRIPT%" -RepoDir "%REPO_DIR%"

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动脚本执行失败，退出代码：%errorlevel%
    pause
    exit /b %errorlevel%
)

endlocal
