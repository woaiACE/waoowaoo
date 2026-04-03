@ECHO OFF
CHCP 65001 > NUL
SETLOCAL ENABLEDELAYEDEXPANSION
TITLE waoowaoo AI 影视工作室

REM =====================================================
REM  waoowaoo Portable Launcher - start.bat
REM  平台：Windows 10/11 x64
REM  目录结构参见 README_PORTABLE.md
REM =====================================================

SET "ROOT=%~dp0"
IF "%ROOT:~-1%"=="\" SET "ROOT=%ROOT:~0,-1%"

SET "NODE=%ROOT%\node\node.exe"
SET "REDIS_EXE=%ROOT%\portable_redis\redis-server.exe"
SET "REDIS_CLI=%ROOT%\portable_redis\redis-cli.exe"
SET "REDIS_CONF=%ROOT%\portable_redis\redis.windows.conf"
SET "MARIADB_BIN=%ROOT%\portable_db\bin"
SET "MYSQLD=%MARIADB_BIN%\mysqld.exe"
SET "MYSQLADMIN=%MARIADB_BIN%\mysqladmin.exe"
REM ---- 用户数据目录：所有运行时数据写入 %LOCALAPPDATA%\waoowaoo（不污染便携包目录）----
SET "USER_DATA=%LOCALAPPDATA%\waoowaoo"
SET "MYSQL_DATA=%LOCALAPPDATA%\waoowaoo\data\mysql"
SET "MINIO_DATA=%LOCALAPPDATA%\waoowaoo\data\minio"
SET "REDIS_DATA=%LOCALAPPDATA%\waoowaoo\data\redis"
SET "LOGS_DIR=%LOCALAPPDATA%\waoowaoo\logs"
SET "PIDS_DIR=%LOCALAPPDATA%\waoowaoo\pids"
REM ---- 构建暂存目录：构建产物写入 %LOCALAPPDATA%\waoowaoo\build（不污染项目目录）----
SET "BUILD_STAGING=%LOCALAPPDATA%\waoowaoo\build\dist-portable"
REM ---- 便携包内二进制及配置（只读，不写数据）----
SET "MYSQL_INI=%ROOT%\portable_db\my.ini"
SET "MINIO_EXE=%ROOT%\portable_minio\minio.exe"
SET "APP_SERVER=%ROOT%\app\server\server.js"
SET "APP_WORKER=%ROOT%\app\server\worker.mjs"
SET "APP_BOARD=%ROOT%\app\server\bull-board.js"
SET "APP_WATCHDOG=%ROOT%\app\server\watchdog.js"
SET "APP_STORAGE_INIT=%ROOT%\app\server\storage-init.js"
SET "PRISMA_JS=%ROOT%\app\server\node_modules\prisma\build\index.js"
SET "PRISMA_SCHEMA=%ROOT%\app\prisma\schema.prisma"
SET "CADDY_EXE=%ROOT%\portable_caddy\caddy.exe"
SET "CADDY_CONFIG=%ROOT%\Caddyfile"
SET "PORTABLE_HTTP_URL=http://localhost:3000"
SET "PORTABLE_HTTPS_URL=https://localhost:1443"
SET "PORTABLE_WEB_URL=%PORTABLE_HTTPS_URL%"
SET "PORTABLE_BULL_BOARD_URL=%PORTABLE_HTTPS_URL%/admin/queues"
SET "PORTABLE_HTTPS_ENABLED=1"

REM ---- 把便携 node 目录加入 PATH（供 prisma 等内部调用使用）----
SET "PATH=%ROOT%\node;%PATH%"

REM ---- 非敏感环境变量（Non-secret Environment Variables） ----
SET DATABASE_URL=mysql://root:waoowaoo123@127.0.0.1:3306/waoowaoo
SET REDIS_HOST=127.0.0.1
SET REDIS_PORT=6379
SET REDIS_USERNAME=
SET REDIS_PASSWORD=
SET REDIS_TLS=
SET STORAGE_TYPE=minio
SET MINIO_ENDPOINT=http://127.0.0.1:9000
SET MINIO_REGION=us-east-1
SET MINIO_BUCKET=waoowaoo
SET MINIO_ACCESS_KEY=minioadmin
SET MINIO_SECRET_KEY=minioadmin
SET MINIO_FORCE_PATH_STYLE=true
SET NEXTAUTH_URL=%PORTABLE_HTTPS_URL%
SET INTERNAL_APP_URL=http://127.0.0.1:3000
SET WATCHDOG_INTERVAL_MS=30000
SET TASK_HEARTBEAT_TIMEOUT_MS=90000
SET QUEUE_CONCURRENCY_IMAGE=10
SET QUEUE_CONCURRENCY_VIDEO=10
SET QUEUE_CONCURRENCY_VOICE=5
SET QUEUE_CONCURRENCY_TEXT=10
SET WORKER_LOCK_DURATION_MS=300000
SET BULL_BOARD_HOST=127.0.0.1
SET BULL_BOARD_PORT=3010
SET BULL_BOARD_BASE_PATH=/admin/queues
SET MEDIA_DOWNLOAD_TIMEOUT_MS=120000
SET LOG_UNIFIED_ENABLED=true
SET LOG_LEVEL=INFO
SET LOG_FORMAT=text
SET LOG_DEBUG_ENABLED=false
SET LOG_AUDIT_ENABLED=true
SET LOG_SERVICE=waoowaoo
SET LOG_REDACT_KEYS=password,token,apiKey,apikey,authorization,cookie,secret,access_token,refresh_token
SET PORTABLE_LIVE_LOGS=1
SET PORTABLE_LIVE_LOGS_MODE=core
SET BILLING_MODE=OFF
SET LLM_STREAM_EPHEMERAL_ENABLED=true
SET PORT=3000
SET HOSTNAME=127.0.0.1
SET MINIO_ROOT_USER=minioadmin
SET MINIO_ROOT_PASSWORD=minioadmin

REM ---- 首次运行：生成随机安全密钥（First-run: generate unique secrets） ----
REM  生成的密钥写入 %APPDATA%\waoowaoo\.secrets，每台机器唯一，不随便携包迁移
SET "SECRETS_FILE=%APPDATA%\waoowaoo\.secrets"
IF NOT EXIST "%APPDATA%\waoowaoo" MKDIR "%APPDATA%\waoowaoo"
REM  步骤1：若包内存在构建时预置密钥（app\.secrets），优先迁移到用户目录
REM  这必须在"生成新密钥"之前执行，否则新密钥会先创建文件导致迁移条件不成立
IF EXIST "%ROOT%\app\.secrets" (
    IF NOT EXIST "%SECRETS_FILE%" (
        ECHO [初始化] 使用构建时预置密钥...
        COPY /Y "%ROOT%\app\.secrets" "%SECRETS_FILE%" > NUL 2>&1
        ECHO [初始化] 密钥已从包内初始化: %SECRETS_FILE%
    )
)
REM  步骤2：若密钥文件仍不存在（如首次运行无预置密钥），则生成随机密钥
IF NOT EXIST "%SECRETS_FILE%" (
    ECHO [初始化] 首次运行，正在生成安全密钥，请稍候...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try { $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create(); $b32=New-Object byte[] 32; $b16=New-Object byte[] 16; $ek=New-Object byte[] 32; $rng.GetBytes($b32); $s=[BitConverter]::ToString($b32) -replace '-',''; $rng.GetBytes($b16); $c=[BitConverter]::ToString($b16) -replace '-',''; $rng.GetBytes($b16); $t=[BitConverter]::ToString($b16) -replace '-',''; $rng.GetBytes($ek); $e=[BitConverter]::ToString($ek) -replace '-',''; $rng.Dispose(); 'NEXTAUTH_SECRET='+$s | Out-File -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'CRON_SECRET='+$c | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'INTERNAL_TASK_TOKEN='+$t | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'API_ENCRYPTION_KEY='+$e | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; Write-Host '[初始化] 密钥已生成并写入: %SECRETS_FILE%' } catch { Write-Host '[警告] 密钥生成失败，使用备用固定值'; 'NEXTAUTH_SECRET=portable-fallback-'+[Guid]::NewGuid().ToString('N') | Out-File -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'CRON_SECRET=portable-cron-'+[Guid]::NewGuid().ToString('N').Substring(0,16) | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'INTERNAL_TASK_TOKEN=portable-task-'+[Guid]::NewGuid().ToString('N').Substring(0,16) | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII; 'API_ENCRYPTION_KEY=portable-enc-'+[Guid]::NewGuid().ToString('N') | Add-Content -LiteralPath '%SECRETS_FILE%' -Encoding ASCII }"
)
REM  步骤3：加载密钥（tokens=1,* delims== 确保值中的 = 号被正确保留）
FOR /F "usebackq tokens=1,* delims==" %%A IN ("%SECRETS_FILE%") DO SET "%%A=%%B"

REM ---- 创建用户数据目录（首次运行或全新安装）----
IF NOT EXIST "%USER_DATA%" MKDIR "%USER_DATA%"
IF NOT EXIST "%USER_DATA%\data" MKDIR "%USER_DATA%\data"
IF NOT EXIST "%MYSQL_DATA%" MKDIR "%MYSQL_DATA%"
IF NOT EXIST "%MINIO_DATA%" MKDIR "%MINIO_DATA%"
IF NOT EXIST "%REDIS_DATA%" MKDIR "%REDIS_DATA%"
IF NOT EXIST "%LOGS_DIR%" MKDIR "%LOGS_DIR%"
IF NOT EXIST "%PIDS_DIR%" MKDIR "%PIDS_DIR%"

REM ---- 一次性迁移：将旧版嵌套数据目录迁移到用户目录（兼容升级用户）----
IF EXIST "%ROOT%\portable_db\data\mysql" (
    IF NOT EXIST "%MYSQL_DATA%\mysql" (
        ECHO [迁移] 发现旧版 MariaDB 数据，正在迁移至用户目录...
        XCOPY "%ROOT%\portable_db\data\*" "%MYSQL_DATA%\" /E /I /H /Q > NUL 2>&1
        IF %ERRORLEVEL% NEQ 0 (
            ECHO [错误] MariaDB 数据迁移失败！可能是磁盘已满或权限不足。
            ECHO [提示] 请手动将 %ROOT%\portable_db\data\ 内容复制到 %MYSQL_DATA%\
            PAUSE & EXIT /B 1
        )
        ECHO [迁移] MariaDB 数据迁移完成（旧目录 portable_db\data 已不再使用，可手动删除）
    )
)

REM ---- 一次性迁移：旧版 MinIO 数据（portable_minio\data → 用户目录）----
IF EXIST "%ROOT%\portable_minio\data" (
    IF NOT EXIST "%MINIO_DATA%\.minio.sys" (
        ECHO [迁移] 发现旧版 MinIO 数据，正在迁移至用户目录...
        XCOPY "%ROOT%\portable_minio\data\*" "%MINIO_DATA%\" /E /I /H /Q > NUL 2>&1
        IF %ERRORLEVEL% NEQ 0 (
            ECHO [错误] MinIO 数据迁移失败！可能是磁盘已满或权限不足。
            ECHO [提示] 请手动将 %ROOT%\portable_minio\data\ 内容复制到 %MINIO_DATA%\
            PAUSE & EXIT /B 1
        )
        ECHO [迁移] MinIO 数据迁移完成（旧目录 portable_minio\data 已不再使用，可手动删除）
    )
)

REM ---- 一次性迁移：旧版 ROOT\data\mysql → 用户目录（兼容中间版本）----
IF EXIST "%ROOT%\data\mysql\mysql" (
    IF NOT EXIST "%MYSQL_DATA%\mysql" (
        ECHO [迁移] 发现 ROOT\data\mysql，正在迁移至用户目录...
        XCOPY "%ROOT%\data\mysql\*" "%MYSQL_DATA%\" /E /I /H /Q > NUL 2>&1
        ECHO [迁移] MariaDB ROOT 路径迁移完成（旧目录 data\mysql 可手动删除）
    )
)

REM ---- 一次性迁移：旧版 ROOT\data\minio → 用户目录 ----
IF EXIST "%ROOT%\data\minio\.minio.sys" (
    IF NOT EXIST "%MINIO_DATA%\.minio.sys" (
        ECHO [迁移] 发现 ROOT\data\minio，正在迁移至用户目录...
        XCOPY "%ROOT%\data\minio\*" "%MINIO_DATA%\" /E /I /H /Q > NUL 2>&1
        ECHO [迁移] MinIO ROOT 路径迁移完成（旧目录 data\minio 可手动删除）
    )
)

REM ---- 清理残留 PID 文件（进程已不存在则删除，防止服务无法启动）----
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-ChildItem -Path $env:PIDS_DIR -Filter '*.pid' -EA 0 | ForEach-Object { $xp=(Get-Content $_.FullName -Raw -EA 0).Trim(); if ($xp -match '^\d+$' -and -not (Get-Process -Id ([int]$xp) -EA 0)) { Write-Host ('[清理] 删除残留 PID 文件: '+$_.Name); Remove-Item $_.FullName -Force -EA 0 } }"

REM ---- 检测构建状态，然后进入主菜单 ----
CALL :CHECK_BUILD_STATE
GOTO MAIN_MENU

REM ====================================================
REM  一级主菜单
REM ====================================================
:MAIN_MENU
CLS
ECHO.
ECHO  ====================================================
ECHO    waoowaoo AI 影视工作室  ^|  便携版 (Portable)
ECHO  ====================================================
ECHO.
IF "%BS_READY%"=="1" (
    ECHO  [OK] 构建状态: !BUILD_STATUS_LINE!
) ELSE (
    ECHO  [!] 构建状态: !BUILD_STATUS_LINE!
)
ECHO.
ECHO  +--------------------------------------------------+
ECHO  ^|  [1]  快速启动   （30 秒无操作后自动执行）      ^|
ECHO  ^|  [2]  维护工具   （重建 / 依赖 / 清理 / 日志）  ^|
ECHO  ^|  [3]  退  出                                    ^|
ECHO  +--------------------------------------------------+
ECHO.
CHOICE /C 123 /T 30 /D 1 /N /M " >>> 请输入选项 [1/2/3]（30 秒后自动启动）: "
IF ERRORLEVEL 3 (
    ECHO.
    ECHO  再见！
    EXIT /B 0
)
IF ERRORLEVEL 2 GOTO MAINTENANCE_MENU
GOTO DO_START

REM ====================================================
REM  二级维护菜单
REM ====================================================
:MAINTENANCE_MENU
CALL :CHECK_BUILD_STATE
CLS
ECHO.
ECHO  ====================================================
ECHO    waoowaoo  ^|  维护工具
ECHO  ====================================================
ECHO.
ECHO  组件状态:
ECHO    Node.js  : !BS_NODE!    ( %ROOT%\node\node.exe )
ECHO    Redis    : !BS_REDIS!   ( %ROOT%\portable_redis\redis-server.exe )
ECHO    MariaDB  : !BS_MARIADB! ( %ROOT%\portable_db\bin\mysqld.exe )
ECHO    MinIO    : !BS_MINIO!   ( %ROOT%\portable_minio\minio.exe )
ECHO    Caddy    : !BS_CADDY!   ( %ROOT%\portable_caddy\caddy.exe )
ECHO    应用程序 : !BS_APP!     ( %APP_SERVER% )
IF "!BS_IN_SOURCE!"=="1" (
    ECHO    node_mod : !BS_NM!      ( %ROOT%\..\node_modules )
)
ECHO.
ECHO  +--------------------------------------------------+
ECHO  ^|  [1]  检查构建完整性                            ^|
ECHO  ^|  [2]  重新安装便携依赖  (Node/Redis/DB/MinIO)   ^|
ECHO  ^|  [3]  重新构建应用     (完整, 约 5-15 分钟)     ^|
ECHO  ^|  [4]  快速重建 Worker  (仅 JS 包, 约 10 秒)     ^|
ECHO  ^|  [5]  查看日志目录                              ^|
ECHO  ^|  [6]  数据库迁移       (应用更新后执行)         ^|
ECHO  ^|  [7]  清理用户数据     (删除数据库/存储/日志)   ^|
ECHO  ^|  [0]  返回主菜单                                ^|
ECHO  +--------------------------------------------------+
ECHO.
CHOICE /C 01234567 /N /M " >>> 请输入选项 [0/1/2/3/4/5/6/7]: "
IF ERRORLEVEL 8 GOTO MENU_CLEAN_DATA
IF ERRORLEVEL 7 GOTO MENU_DB_MIGRATE
IF ERRORLEVEL 6 GOTO MENU_VIEW_LOGS
IF ERRORLEVEL 5 GOTO MENU_QUICK_REBUILD
IF ERRORLEVEL 4 GOTO MENU_REBUILD
IF ERRORLEVEL 3 GOTO MENU_INSTALL_DEPS
IF ERRORLEVEL 2 GOTO MENU_CHECK_BUILD
IF ERRORLEVEL 1 GOTO MAIN_MENU
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [1] 检查构建完整性
REM ====================================================
:MENU_CHECK_BUILD
CALL :CHECK_BUILD_STATE
CLS
ECHO.
ECHO  ====================================================
ECHO    构建完整性检查
ECHO  ====================================================
ECHO.
ECHO  便携依赖:
ECHO    !BS_NODE!    Node.js v20    ( %ROOT%\node\node.exe )
ECHO    !BS_REDIS!   Redis          ( %ROOT%\portable_redis\redis-server.exe )
ECHO    !BS_MARIADB! MariaDB        ( %ROOT%\portable_db\bin\mysqld.exe )
ECHO    !BS_MINIO!   MinIO          ( %ROOT%\portable_minio\minio.exe )
ECHO    !BS_CADDY!   Caddy          ( %ROOT%\portable_caddy\caddy.exe )
ECHO.
ECHO  应用程序:
ECHO    !BS_APP!     server.js      ( %APP_SERVER% )
ECHO    !BS_PRISMA!  Prisma CLI     ( %PRISMA_JS% )
ECHO.
IF "!BS_IN_SOURCE!"=="1" (
    ECHO  源码仓库模式:
    ECHO    !BS_NM!      node_modules   ( %ROOT%\..\node_modules )
    ECHO.
)
ECHO  用户数据目录:
IF EXIST "%USER_DATA%" (
    ECHO    [  OK  ]  %USER_DATA%
) ELSE (
    ECHO    [ 未建 ]  %USER_DATA%
)
ECHO.
ECHO  总体状态: !BUILD_STATUS_LINE!
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [2] 重新安装便携依赖
REM ====================================================
:MENU_INSTALL_DEPS
CLS
ECHO.
ECHO  ====================================================
ECHO    重新安装便携依赖
ECHO  ====================================================
ECHO.
ECHO  即将重新安装: Node.js v20 / Redis / MariaDB / MinIO / Caddy
ECHO  首次安装约需下载 300-500 MB，请保持网络连接...
ECHO.
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\setup-dependencies.ps1" -InstallDir "%ROOT%"
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO  [警告] 部分依赖安装失败，请检查:
    ECHO    [分类: 网络失败] 检查网络连接或代理设置 (HTTPS_PROXY)
    ECHO    [分类: 权限不足] 确保对 %ROOT% 目录有写入权限
) ELSE (
    ECHO.
    ECHO  [OK] 便携依赖安装完成
)
CALL :CHECK_BUILD_STATE
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [3] 重新构建应用
REM ====================================================
:MENU_REBUILD
CLS
ECHO.
ECHO  ====================================================
ECHO    重新构建应用
ECHO  ====================================================
ECHO.
REM  resolve parent dir to absolute path using PUSHD
PUSHD "%ROOT%\.."
SET "_SRC_ROOT=%CD%"
POPD
ECHO  源码目录: %_SRC_ROOT%
ECHO  构建脚本: %ROOT%\build-portable.ps1
ECHO.
IF NOT EXIST "%_SRC_ROOT%\node_modules" (
    ECHO  [依赖] node_modules 缺失，正在执行 npm install...
    ECHO  [依赖] 预计耗时 2-5 分钟，请保持网络连接
    ECHO.
    PUSHD "%_SRC_ROOT%"
    npm install
    SET "_NRC=!ERRORLEVEL!"
    POPD
    IF "!_NRC!" NEQ "0" (
        ECHO.
        ECHO  [错误] npm install 失败！
        ECHO  [提示] 常见原因: 网络问题 / npm ^>= 9.0.0 版本要求
        ECHO  [提示] 请在项目根目录手动执行: npm install
        ECHO.
        PAUSE
        GOTO MAINTENANCE_MENU
    )
    ECHO  [依赖] npm install 完成
    ECHO.
)
ECHO  [构建] 正在构建应用，约需 5-15 分钟，请耐心等待...
ECHO.
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\build-portable.ps1" -StageOnly
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO  [错误] 构建失败，请查看以上错误信息
    ECHO  [提示] 如仍失败，可尝试删除 node_modules 后重新安装
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
IF EXIST "%BUILD_STAGING%\app" (
    ECHO.
    ECHO  [构建] 正在复制构建产物到 portable\app\...
    ROBOCOPY "%BUILD_STAGING%\app" "%ROOT%\app" /E /IS /IT /NP /NFL /NDL > NUL 2>&1
    SET "_RRC=!ERRORLEVEL!"
    IF !_RRC! GTR 7 (
        ECHO  [错误] 文件复制失败，ROBOCOPY 错误码: !_RRC!
    ) ELSE (
        ECHO  [OK] 应用构建并复制完成！
    )
) ELSE (
    ECHO  [错误] 构建产物目录不存在: %BUILD_STAGING%\app
)
CALL :CHECK_BUILD_STATE
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [4] 快速重建 Worker / Bull-Board / Watchdog
REM      仅重新运行 esbuild，跳过 Next.js 完整构建
REM      适用场景：修改了 src/lib/workers/ 等 Worker 代码后快速验证
REM ====================================================
:MENU_QUICK_REBUILD
CLS
ECHO.
ECHO  ====================================================
ECHO    快速重建  ^|  仅重新打包 Worker / Bull-Board
ECHO  ====================================================
ECHO.
IF NOT "!BS_IN_SOURCE!"=="1" (
    ECHO  [错误] 此功能仅在源码仓库模式下可用
    ECHO  [提示] 快速重建需要读取 src/ 源码，请确保从项目的
    ECHO          portable\ 目录运行 start.bat
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
PUSHD "%ROOT%\.."
SET "_QR_SRC=%CD%"
POPD
SET "_QR_DEST=%ROOT%\app\server"
ECHO  源码目录 : %_QR_SRC%
ECHO  目标目录 : %_QR_DEST%
ECHO.
ECHO  将重新打包以下组件（跳过 Next.js 完整构建，约 5-15 秒）:
ECHO    [*] worker.mjs      - BullMQ 后台任务处理器  (ESM)
ECHO    [*] bull-board.js   - 任务队列管理面板       (CJS)
ECHO    [*] watchdog.js     - 任务看门狗             (CJS)
ECHO    [*] storage-init.js - MinIO 存储桶初始化     (CJS)
ECHO.
ECHO  注意: 此操作不会更新页面/API 代码；如遇前端异常请改用 [3] 完整重建
ECHO.
PAUSE
ECHO.
ECHO  [快速重建] 开始打包...
ECHO.
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$src=$env:_QR_SRC; $dest=$env:_QR_DEST; $ext=@('--external:sharp','--external:@prisma/client','--external:.prisma','--external:fsevents','--external:cpu-features','--external:ssh2','--external:bufferutil','--external:utf-8-validate','--external:@vercel/og'); Push-Location $src; $ok=$true; $results=@(); Write-Host '  [1/4] worker.mjs (ESM) ...'; & npx esbuild src/lib/workers/index.ts --bundle --platform=node --target=node20 --format=esm --log-level=warning @ext --outfile='.next/standalone/worker.mjs' 2>&1|Out-Default; if($LASTEXITCODE -ne 0){Write-Warning 'worker.mjs 打包失败'; $ok=$false}else{$results+='worker.mjs'}; Write-Host '  [2/4] bull-board.js ...'; & npx esbuild scripts/bull-board.ts --bundle --platform=node --target=node20 --format=cjs --log-level=warning @ext --outfile='.next/standalone/bull-board.js' 2>&1|Out-Default; if($LASTEXITCODE -ne 0){Write-Warning 'bull-board.js 打包失败'; $ok=$false}else{$results+='bull-board.js'}; Write-Host '  [3/4] watchdog.js ...'; & npx esbuild scripts/watchdog.ts --bundle --platform=node --target=node20 --format=cjs --log-level=warning @ext --outfile='.next/standalone/watchdog.js' 2>&1|Out-Default; if($LASTEXITCODE -ne 0){Write-Warning 'watchdog.js 打包失败'; $ok=$false}else{$results+='watchdog.js'}; Write-Host '  [4/4] storage-init.js ...'; & npx esbuild src/lib/storage/init.ts --bundle --platform=node --target=node20 --format=cjs --log-level=warning @ext --outfile='.next/standalone/storage-init.js' 2>&1|Out-Default; if($LASTEXITCODE -ne 0){Write-Warning 'storage-init.js 打包失败'; $ok=$false}else{$results+='storage-init.js'}; Pop-Location; Write-Host ''; Write-Host '[复制] 正在将构建产物复制到 app\server ...'; foreach($f in @('worker.mjs','bull-board.js','watchdog.js','storage-init.js')){ $s=Join-Path (Join-Path $src '.next\standalone') $f; $d=Join-Path $dest $f; if(Test-Path $s){ Copy-Item $s $d -Force; Write-Host ('  [OK] '+$f) }else{ Write-Warning ('跳过 (未生成): '+$f) } }; Write-Host ''; if(-not $ok){ Write-Host '[部分失败] 已成功打包: '+($results -join ', '); exit 1 }; Write-Host '[完成] 快速重建成功！重启 start.bat 即可生效。'"
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO  [!] 部分组件打包失败，请查看上方输出
    ECHO.
) ELSE (
    ECHO.
    ECHO  [OK] 快速重建完成！
    ECHO  [提示] 重新运行 start.bat 后新代码即可生效
    ECHO.
)
CALL :CHECK_BUILD_STATE
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [5] 查看日志目录
REM ====================================================
:MENU_VIEW_LOGS
ECHO.
IF EXIST "%LOGS_DIR%" (
    ECHO  [日志] 正在打开日志目录: %LOGS_DIR%
    START "" explorer.exe "%LOGS_DIR%"
) ELSE (
    ECHO  [提示] 日志目录尚不存在 ^(服务未曾运行^): %LOGS_DIR%
)
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [5] 数据库迁移
REM ====================================================
:MENU_DB_MIGRATE
CLS
ECHO.
ECHO  ====================================================
ECHO    数据库迁移  ^|  应用更新后同步 Schema 变更
ECHO  ====================================================
ECHO.
ECHO  [检测] 正在检查 MariaDB 是否已运行 (127.0.0.1:3306)...
ECHO.
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$c=New-Object System.Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',3306); $c.Close(); exit 0 } catch { exit 1 }" >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO  [错误] MariaDB 未运行！请先通过主菜单 [1] 启动服务，再执行数据库迁移。
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
ECHO  [OK]  MariaDB 已运行，准备执行迁移...
ECHO.
IF NOT EXIST "%PRISMA_JS%" (
    ECHO  [错误] Prisma CLI 不存在: %PRISMA_JS%
    ECHO  [提示] 请先执行 [3] 重新构建应用
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
IF NOT EXIST "%PRISMA_SCHEMA%" (
    ECHO  [错误] Prisma Schema 不存在: %PRISMA_SCHEMA%
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
ECHO  [迁移] 正在执行 prisma db push（同步 Schema 到数据库）...
ECHO.
"%NODE%" "%PRISMA_JS%" db push --schema="%PRISMA_SCHEMA%" --skip-generate
IF %ERRORLEVEL% NEQ 0 (
    ECHO.
    ECHO  [错误] 数据库迁移失败！
    ECHO  [提示] 请确认 MariaDB 正在运行且 Schema 文件完整
) ELSE (
    ECHO.
    ECHO  [OK]  数据库迁移成功！Schema 已同步至最新版本。
)
ECHO.
PAUSE
GOTO MAINTENANCE_MENU

REM ====================================================
REM  [6] 清理用户数据
REM ====================================================
:MENU_CLEAN_DATA
CLS
ECHO.
ECHO  ====================================================
ECHO    清理用户数据  ^|  警告: 此操作不可逆！
ECHO  ====================================================
ECHO.
ECHO  将被删除的数据:
ECHO    数据库文件  : %MYSQL_DATA%
ECHO    对象存储    : %MINIO_DATA%
ECHO    Redis 数据  : %REDIS_DATA%
ECHO    运行日志    : %LOGS_DIR%
ECHO.
ECHO  不会被删除:
ECHO    应用程序    : %ROOT%\app\
ECHO    便携依赖    : %ROOT%\portable_db 等
ECHO    安全密钥    : %SECRETS_FILE%
ECHO.
ECHO  [!] 警告: 删除后所有项目、配置、上传文件将永久丢失！
ECHO.
ECHO  确认删除请输入 YES（大写），其他任意内容取消:
SET "_CD="
SET /P "_CD= >>> "
IF /I NOT "!_CD!"=="YES" (
    ECHO.
    ECHO  [取消] 操作已取消，数据未做任何修改
    ECHO.
    PAUSE
    GOTO MAINTENANCE_MENU
)
ECHO.
ECHO  [清理] 正在停止运行中的服务（如有）...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$pd=$env:PIDS_DIR; $rt=$env:ROOT; foreach($s in @('nextjs','worker','board','watchdog','caddy','minio')){ $pf=Join-Path $pd ($s+'.pid'); if(Test-Path $pf){ $xp=(Get-Content $pf -Raw -EA 0).Trim(); if($xp -match '^\d+$'){ Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $pf -Force -EA 0 } }; $rc=Join-Path $rt 'portable_redis\redis-cli.exe'; if(Test-Path $rc){ & $rc -h 127.0.0.1 -p 6379 SHUTDOWN NOSAVE 2>$null|Out-Null }; $rpf=Join-Path $pd 'redis.pid'; if(Test-Path $rpf){ $xp=(Get-Content $rpf -Raw -EA 0).Trim(); if($xp -match '^\d+$'){ Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $rpf -Force -EA 0 }; $ma=Join-Path $rt 'portable_db\bin\mysqladmin.exe'; if(Test-Path $ma){ $cf=Join-Path $pd '_c.cnf'; '[client]','user=root','password=waoowaoo123'|Set-Content $cf -Encoding ASCII; & $ma ('--defaults-extra-file='+$cf) -h 127.0.0.1 -P 3306 shutdown 2>$null|Out-Null; Remove-Item $cf -Force -EA 0 }; $mpf=Join-Path $pd 'mysql.pid'; if(Test-Path $mpf){ $xp=(Get-Content $mpf -Raw -EA 0).Trim(); if($xp -match '^\d+$'){ Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $mpf -Force -EA 0 }"
TIMEOUT /T 3 /NOBREAK >NUL
ECHO  [清理] 正在删除数据...
IF EXIST "%MYSQL_DATA%" (
    RD /S /Q "%MYSQL_DATA%" >NUL 2>&1
    ECHO  [OK]  MariaDB 数据已删除: %MYSQL_DATA%
)
IF EXIST "%MINIO_DATA%" (
    RD /S /Q "%MINIO_DATA%" >NUL 2>&1
    ECHO  [OK]  MinIO 数据已删除  : %MINIO_DATA%
)
IF EXIST "%REDIS_DATA%" (
    RD /S /Q "%REDIS_DATA%" >NUL 2>&1
    ECHO  [OK]  Redis 数据已删除  : %REDIS_DATA%
)
IF EXIST "%LOGS_DIR%" (
    RD /S /Q "%LOGS_DIR%" >NUL 2>&1
    ECHO  [OK]  日志已删除        : %LOGS_DIR%
)
ECHO.
ECHO  [OK] 清理完成！下次启动将重新初始化所有数据。
ECHO.
PAUSE
GOTO MAIN_MENU

REM ====================================================
REM  主服务启动流程（原 start.bat 核心逻辑）
REM ====================================================
:DO_START
ECHO.
ECHO ====================================================
ECHO   waoowaoo AI 影视工作室  ^|  便携版 (Portable)
ECHO ====================================================
ECHO.

REM ====================================================
REM  Step 1 / 9: Auto-Update Check
REM ====================================================
ECHO [1/9] 检查版本更新 (Update Check)...
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\update.ps1" -InstallDir "%ROOT%"
IF %ERRORLEVEL% NEQ 0 (
    ECHO [警告] 更新检查失败，继续启动...
)
ECHO.

REM ====================================================
REM  Step 2 / 9: Auto-Setup — download dependencies and prepare app files
REM ====================================================
ECHO [2/9] 初始化：检查并自动下载便携依赖...
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\setup-dependencies.ps1" -InstallDir "%ROOT%"
IF %ERRORLEVEL% NEQ 0 (
    ECHO [警告] 部分便携依赖下载失败（见上方错误），将尝试继续启动。如遇问题请参见 README_PORTABLE.md
    ECHO [提示] 常见原因分类:
    ECHO   [分类: 网络失败] 检查网络连接或代理设置（HTTPS_PROXY 环境变量）
    ECHO   [分类: 权限不足] 请确保对 !ROOT! 目录有写入权限
)

REM ---- 若应用文件不存在，检测是否在源码仓库中并自动构建 ----
REM      使用 next.config.ts 作为项目特征文件，避免误判普通 Node.js 项目
IF NOT EXIST "%APP_SERVER%" (
    IF EXIST "%ROOT%\..\next.config.ts" (
        IF EXIST "%ROOT%\..\package.json" (
            ECHO [App] 检测到源代码仓库，正在首次构建便携运行文件（不创建 ZIP 包，约需 5-15 分钟）...
            PowerShell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\build-portable.ps1" -StageOnly
            IF %ERRORLEVEL% NEQ 0 (
                ECHO [错误] 便携应用构建失败，请查看以上错误信息。
                ECHO [提示] 可在主菜单选择「维护工具 → 重新构建应用」重试（会自动处理 npm install）
                PAUSE & GOTO MAIN_MENU
            )
            IF EXIST "%BUILD_STAGING%\app" (
                ECHO [App] 正在复制构建产物...
                ROBOCOPY "%BUILD_STAGING%\app" "%ROOT%\app" /E /IS /IT /NP /NFL /NDL > NUL 2>&1
                SET "RC=!ERRORLEVEL!"
                IF !RC! GTR 7 (
                    ECHO [错误] ROBOCOPY 复制失败 ^(错误码 !RC!^)，请在主菜单选择「维护工具 → 重新构建应用」
                    PAUSE & GOTO MAIN_MENU
                )
                IF NOT EXIST "%APP_SERVER%" (
                    ECHO [错误] 应用文件复制失败，请在主菜单选择「维护工具 → 重新构建应用」
                    PAUSE & GOTO MAIN_MENU
                )
                ECHO [App] 应用文件已就绪
            ) ELSE (
                ECHO [错误] 构建产物目录不存在: %BUILD_STAGING%\app
                PAUSE & GOTO MAIN_MENU
            )
        )
    )
)
ECHO.

REM ====================================================
REM  Step 3 / 9: Start Caddy HTTPS Proxy
REM ====================================================
ECHO [3/9] 启动 Caddy HTTPS 反向代理...
IF /I "%PORTABLE_HTTPS_ENABLED%"=="1" (
    IF NOT EXIST "%CADDY_EXE%" (
        SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
        SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
        SET NEXTAUTH_URL=%PORTABLE_HTTP_URL%
        ECHO [警告] Caddy 未找到: %CADDY_EXE%
        ECHO [提示] 将回退到 HTTP 入口: %PORTABLE_HTTP_URL%
    ) ELSE (
        IF NOT EXIST "%CADDY_CONFIG%" (
            SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
            SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
            SET NEXTAUTH_URL=%PORTABLE_HTTP_URL%
            ECHO [警告] Caddy 配置文件未找到: %CADDY_CONFIG%
            ECHO [提示] 将回退到 HTTP 入口: %PORTABLE_HTTP_URL%
        ) ELSE (
            PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
                "$ok=$false; $c=New-Object System.Net.Sockets.TcpClient; try { $iar=$c.BeginConnect('127.0.0.1',1443,$null,$null); if($iar.AsyncWaitHandle.WaitOne(1000)){ $c.EndConnect($iar); $ok=$true } } catch {} finally { $c.Close() }; if($ok){ exit 0 } else { exit 1 }"
            IF !ERRORLEVEL! EQU 0 (
                SET "PORTABLE_WEB_URL=%PORTABLE_HTTPS_URL%"
                SET "PORTABLE_BULL_BOARD_URL=%PORTABLE_HTTPS_URL%/admin/queues"
                SET NEXTAUTH_URL=%PORTABLE_HTTPS_URL%
                ECHO [Caddy] 已在运行 ^(端口 1443^)
            ) ELSE (
                SET "_EXE=%CADDY_EXE%"
                SET "_ARG1=run"
                SET "_ARG2=--config"
                SET "_ARG3=%CADDY_CONFIG%"
                SET "_ARG4=--adapter"
                SET "_ARG5=caddyfile"
                PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
                    "try{$a=@($env:_ARG1,$env:_ARG2,$env:_ARG3,$env:_ARG4,$env:_ARG5);$p=Start-Process -FilePath $env:_EXE -ArgumentList $a -WorkingDirectory $env:ROOT -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'caddy.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'caddy-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'caddy.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_;exit 1}"
                IF !ERRORLEVEL! EQU 0 (
                    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
                        "$ok=$false; for($i=1;$i -le 15;$i++){ $c=New-Object System.Net.Sockets.TcpClient; try { $iar=$c.BeginConnect('127.0.0.1',1443,$null,$null); if($iar.AsyncWaitHandle.WaitOne(1000)){ $c.EndConnect($iar); $ok=$true; break } } catch {} finally { $c.Close() }; Start-Sleep -Seconds 1 }; if($ok){ exit 0 } else { exit 1 }"
                    IF !ERRORLEVEL! EQU 0 (
                        SET "PORTABLE_WEB_URL=%PORTABLE_HTTPS_URL%"
                        SET "PORTABLE_BULL_BOARD_URL=%PORTABLE_HTTPS_URL%/admin/queues"
                        SET NEXTAUTH_URL=%PORTABLE_HTTPS_URL%
                        ECHO [Caddy] HTTPS 入口就绪: %PORTABLE_HTTPS_URL%
                        REM ---- 安装 Caddy 根证书（首次运行；浏览器信任 HTTPS）----
                        PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
                            "try { $p=Start-Process -FilePath $env:CADDY_EXE -ArgumentList 'trust' -NoNewWindow -Wait -PassThru -EA Stop; if($p.ExitCode -eq 0){ Write-Host '[Caddy] 根证书已安装，浏览器将信任 HTTPS 连接' } else { Write-Host '[Caddy] 根证书安装返回码 '+$p.ExitCode+'（若浏览器显示证书警告，请以管理员身份运行 start.bat 一次）' } } catch { Write-Host '[Caddy] 根证书安装跳过: '+$_.Exception.Message }"
                    ) ELSE (
                        SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
                        SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
                        SET NEXTAUTH_URL=%PORTABLE_HTTP_URL%
                        ECHO [警告] Caddy 启动超时，将回退到 HTTP 入口: %PORTABLE_HTTP_URL%
                        CALL :CLASSIFY_ERROR "%LOGS_DIR%\caddy-err.log"
                    )
                ) ELSE (
                    SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
                    SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
                    SET NEXTAUTH_URL=%PORTABLE_HTTP_URL%
                    ECHO [警告] Caddy 进程启动失败，将回退到 HTTP 入口: %PORTABLE_HTTP_URL%
                    CALL :CLASSIFY_ERROR "%LOGS_DIR%\caddy-err.log"
                )
            )
        )
    )
) ELSE (
    SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
    SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
    SET NEXTAUTH_URL=%PORTABLE_HTTP_URL%
    ECHO [Caddy] 已禁用，使用 HTTP 入口: %PORTABLE_HTTP_URL%
)
ECHO.

REM ====================================================
REM  Step 4 / 9: Start Redis (Portable)
REM ====================================================
ECHO [4/9] 启动 Redis...
IF NOT EXIST "%REDIS_EXE%" (
    ECHO [错误] Redis 未找到: %REDIS_EXE%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新安装便携依赖」
    PAUSE & GOTO MAIN_MENU
)
NETSTAT -an 2>NUL | FINDSTR ":6379 " | FINDSTR "LISTENING" >NUL 2>&1
IF %ERRORLEVEL% EQU 0 (
    ECHO [Redis] 已在运行 ^(端口 6379^)
) ELSE (
    SET "_EXE=%REDIS_EXE%"
    REM 使用命令行参数直接配置 Redis，不依赖 conf 文件路径（redis-windows 7.x 为 MSYS2 二进制，
    REM 传入 Windows 反斜线路径给 conf 文件参数会失败；--dir 需使用正斜线路径）。
    REM 追加 --appendonly yes 与 docker-compose.yml 行为保持一致。
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$rdata=($env:REDIS_DATA -replace '\\\\','/'); try{$a=@('--bind','127.0.0.1','--port','6379','--loglevel','notice','--appendonly','yes','--dir',$rdata);$p=Start-Process -FilePath $env:_EXE -ArgumentList $a -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'redis.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'redis-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'redis.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
    REM 在 CMD 括号块内避免使用 GOTO 标签，改为 PowerShell 轮询
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ok=$false; for($i=1;$i -le 15;$i++){ try { & $env:REDIS_CLI -h 127.0.0.1 -p 6379 PING > $null 2>&1; if($LASTEXITCODE -eq 0){ Write-Host ('[Redis] 就绪 (第 ' + $i + ' 次 ping 成功)'); $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if(-not $ok){ Write-Host '[警告] Redis 启动超时，继续...' }"
)
ECHO.

REM ====================================================
REM  Step 5 / 9: Start MariaDB (Portable)
REM ====================================================
ECHO [5/9] 启动 MariaDB...
IF NOT EXIST "%MYSQLD%" (
    ECHO [错误] MariaDB 未找到: %MYSQLD%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新安装便携依赖」
    PAUSE & GOTO MAIN_MENU
)
REM 首次运行：初始化数据目录 (First-run initialization)
IF NOT EXIST "%MYSQL_DATA%\mysql" (
    ECHO [MariaDB] 首次运行，初始化数据目录 ^(此过程约需 10-30 秒^)...
    IF NOT EXIST "%MYSQL_DATA%" MKDIR "%MYSQL_DATA%"
    "%MARIADB_BIN%\mysql_install_db.exe" "--datadir=%MYSQL_DATA%" --password=waoowaoo123 >> "%LOGS_DIR%\mysql-init.log" 2>&1
    IF %ERRORLEVEL% NEQ 0 (
        ECHO [错误] MariaDB 初始化失败！请查看: %LOGS_DIR%\mysql-init.log
        CALL :CLASSIFY_ERROR "%LOGS_DIR%\mysql-init.log"
        PAUSE & EXIT /B 1
    )
    ECHO [MariaDB] 数据目录初始化成功
)
REM ---- 清理 MariaDB 残留锁/PID 文件（防止上次异常退出导致无法启动）----
IF EXIST "%MYSQL_DATA%\mysqld.pid" DEL /F /Q "%MYSQL_DATA%\mysqld.pid" >NUL 2>&1
IF EXIST "%MYSQL_DATA%\mysql.sock" DEL /F /Q "%MYSQL_DATA%\mysql.sock" >NUL 2>&1
NETSTAT -an 2>NUL | FINDSTR ":3306 " | FINDSTR "LISTENING" >NUL 2>&1
IF %ERRORLEVEL% EQU 0 GOTO MARIADB_ALREADY_RUNNING

SET "_EXE=%MYSQLD%"
SET "_ARG1=--defaults-file=%MYSQL_INI%"
SET "_ARG2=--basedir=%ROOT%\portable_db"
SET "_ARG3=--datadir=%MYSQL_DATA%"
REM 使用 Start-Process -PassThru 记录 PID 并正确重定向 mysqld 日志（START /B 无法捕获子进程日志）
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try{$a=@($env:_ARG1,$env:_ARG2,$env:_ARG3);$p=Start-Process -FilePath $env:_EXE -ArgumentList $a -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'mysql.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'mysql-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'mysql.pid') -Encoding ASCII -NoNewline}catch{Write-Error $_;exit 1}"
IF %ERRORLEVEL% NEQ 0 (
    ECHO [错误] mysqld 进程无法启动，请查看: %LOGS_DIR%\mysql-err.log
    CALL :CLASSIFY_ERROR "%LOGS_DIR%\mysql-err.log"
    PAUSE & EXIT /B 1
)
ECHO [MariaDB] 等待数据库就绪 ^(最多 60 秒^)...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ok=$false; for($i=1;$i -le 30;$i++){ $cnf=Join-Path $env:PIDS_DIR 'waoowaoo_ping.cnf'; try { '[client]' | Set-Content -LiteralPath $cnf -Encoding ASCII; 'user=root' | Add-Content -LiteralPath $cnf -Encoding ASCII; 'password=waoowaoo123' | Add-Content -LiteralPath $cnf -Encoding ASCII; & $env:MYSQLADMIN ('--defaults-extra-file=' + $cnf) -h 127.0.0.1 -P 3306 ping > $null 2>&1; if($LASTEXITCODE -eq 0){ Write-Host ('[MariaDB] 数据库就绪 (第 ' + $i + ' 次 ping 成功)'); $ok=$true; break } } catch {} finally { Remove-Item -LiteralPath $cnf -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 2 }; if(-not $ok){ Write-Host ('[错误] MariaDB 启动超时，请查看: ' + (Join-Path $env:LOGS_DIR 'mysql.log')); exit 1 }"
IF %ERRORLEVEL% NEQ 0 (
    PAUSE & EXIT /B 1
)
GOTO MARIADB_READY

:MARIADB_ALREADY_RUNNING
ECHO [MariaDB] 已在运行 ^(端口 3306^)

:MARIADB_READY
REM 首次运行：创建应用数据库（若已存在则静默跳过）
SET "MYSQL_CNF=%PIDS_DIR%\waoowaoo_create.cnf"
ECHO [client]>"%MYSQL_CNF%"
ECHO user=root>>"%MYSQL_CNF%"
ECHO password=waoowaoo123>>"%MYSQL_CNF%"
"%MARIADB_BIN%\mysql.exe" "--defaults-extra-file=%MYSQL_CNF%" -h 127.0.0.1 -P 3306 -e "CREATE DATABASE IF NOT EXISTS waoowaoo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" >> "%LOGS_DIR%\mysql-init.log" 2>&1
SET "_DBRC=%ERRORLEVEL%"
DEL /F /Q "%MYSQL_CNF%" >NUL 2>&1
IF %_DBRC% NEQ 0 (
    ECHO [警告] 数据库 waoowaoo 创建失败，请查看: %LOGS_DIR%\mysql-init.log
) ELSE (
    ECHO [MariaDB] 数据库 waoowaoo 就绪
)
ECHO.

REM ====================================================
REM  Step 6 / 9: Start MinIO (Portable Object Storage)
REM ====================================================
ECHO [6/9] 启动 MinIO 对象存储...
IF NOT EXIST "%MINIO_EXE%" (
    ECHO [错误] MinIO 未找到: %MINIO_EXE%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新安装便携依赖」
    PAUSE & GOTO MAIN_MENU
)
NETSTAT -an 2>NUL | FINDSTR ":9000 " | FINDSTR "LISTENING" >NUL 2>&1
IF %ERRORLEVEL% EQU 0 (
    ECHO [MinIO] 已在运行 ^(端口 9000^)
) ELSE (
    IF NOT EXIST "%MINIO_DATA%" MKDIR "%MINIO_DATA%"
    SET "_EXE=%MINIO_EXE%"
    SET "_MDATA=%MINIO_DATA%"
    REM 绑定 127.0.0.1 避免对外网暴露，使用 Start-Process -PassThru 记录 PID
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try{$minioArgs=@('server',$env:_MDATA,'--address','127.0.0.1:9000','--console-address','127.0.0.1:9001');$p=Start-Process -FilePath $env:_EXE -ArgumentList $minioArgs -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'minio.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'minio-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'minio.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
    REM 等待 MinIO 健康就绪（/minio/health/ready，最多 30 秒）
    ECHO [MinIO] 等待健康检查就绪...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ok=$false; for($i=0;$i -lt 30;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:9000/minio/health/ready' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop;if($r.StatusCode -eq 200){$ok=$true;break}}catch{};Start-Sleep 1}; if(-not $ok){Write-Host '[MinIO] 健康检查超时，继续启动...'}"
    ECHO [MinIO] 启动完成
)
ECHO.

REM ====================================================
REM  Step 7 / 9: Storage Init + Prisma Database Migration
REM ====================================================
ECHO [7/9] 初始化对象存储 + 执行数据库迁移...
REM ---- MinIO bucket 初始化（首次运行时创建 waoowaoo bucket）----
IF EXIST "%APP_STORAGE_INIT%" (
    IF NOT EXIST "%NODE%" (
        ECHO [警告] Node.js 未找到，跳过存储桶初始化
    ) ELSE (
        "%NODE%" "%APP_STORAGE_INIT%" >> "%LOGS_DIR%\storage-init.log" 2>&1
        IF %ERRORLEVEL% NEQ 0 (
            ECHO [警告] MinIO 存储桶初始化失败，请查看: %LOGS_DIR%\storage-init.log
        ) ELSE (
            ECHO [Storage] 对象存储桶就绪
        )
    )
)
REM ---- Prisma 数据库迁移 ----
IF NOT EXIST "%NODE%" (
    ECHO [错误] Node.js 未找到: %NODE%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新安装便携依赖」
    PAUSE & GOTO MAIN_MENU
)
IF NOT EXIST "%PRISMA_JS%" (
    ECHO [错误] Prisma CLI 未找到: %PRISMA_JS%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新构建应用」
    PAUSE & GOTO MAIN_MENU
)
REM Step 1: apply any formal migration files (no-op if none pending)
"%NODE%" "%PRISMA_JS%" migrate deploy "--schema=%PRISMA_SCHEMA%" >> "%LOGS_DIR%\migrate.log" 2>&1
SET _MIGRATE_ERR=%ERRORLEVEL%
IF %_MIGRATE_ERR% NEQ 0 (
    ECHO [初始化] migrate deploy 失败（全新数据库？），将使用 db push 初始化结构...
)
REM Step 2: always run db push to sync any schema drift (e.g. new columns without migration files)
"%NODE%" "%PRISMA_JS%" db push --skip-generate "--schema=%PRISMA_SCHEMA%" >> "%LOGS_DIR%\migrate.log" 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO [错误] Prisma db push 失败！请查看: %LOGS_DIR%\migrate.log
    CALL :CLASSIFY_ERROR "%LOGS_DIR%\migrate.log"
    PAUSE & EXIT /B 1
)
:MIGRATE_DONE
ECHO [Migrate] 数据库结构已同步
ECHO.

REM ====================================================
REM  Step 8 / 9: Start Next.js Server + Workers
REM ====================================================
ECHO [8/9] 启动 Next.js 服务及后台工作进程...
IF NOT EXIST "%APP_SERVER%" (
    ECHO [错误] Next.js standalone server.js 未找到: %APP_SERVER%
    ECHO [提示] 请在主菜单选择「维护工具 → 重新构建应用」
    PAUSE & GOTO MAIN_MENU
)

REM ---- Create worker startup shim (fix Node.js stdout buffering when redirected to file) ----
REM  When Start-Process redirects stdout to a file, the fd is a DISK handle (not a Pipe/TTY).
REM  setBlocking() is only effective for Pipe handles; for DISK handles Node.js uses async stream
REM  buffering (~64KB) that only flushes when full. We override console.log/error with fs.writeSync
REM  (synchronous by design) so every log line is immediately visible in the console tail.
SET "_WORKER_SHIM=%ROOT%\app\server\_worker_start.js"
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$lines=@('// Auto-generated by start.bat - do not edit manually','// Forces synchronous stdout/stderr via fs.writeSync so log lines appear immediately in portable mode','var fs=require(''fs'');','var _log=console.log;var _err=console.error;','console.log=function(){var t=Array.prototype.slice.call(arguments).join('' '')+(''\'n'');try{fs.writeSync(1,t,''utf8'')}catch(e){_log.apply(console,arguments)}};','console.error=function(){var t=Array.prototype.slice.call(arguments).join('' '')+(''\'n'');try{fs.writeSync(2,t,''utf8'')}catch(e){_err.apply(console,arguments)}};',('import('+"'./worker.mjs'"+')'+ '.catch(function(e){console.error(e);process.exit(1);});')); [System.IO.File]::WriteAllText($env:_WORKER_SHIM, ($lines -join "`n"), [System.Text.Encoding]::UTF8)"

REM Use Start-Process -PassThru to record PIDs for graceful shutdown on Ctrl+C
REM Use @($env:_ARG) array form to prevent path-with-spaces splitting issues
SET "_EXE=%NODE%"
SET "_WDIR=%ROOT%\app\server"
SET "_ARG=%APP_SERVER%"
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try{$p=Start-Process -FilePath $env:_EXE -ArgumentList @($env:_ARG) -WorkingDirectory $env:_WDIR -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'nextjs.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'nextjs-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'nextjs.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
TIMEOUT /T 1 /NOBREAK >NUL
IF EXIST "%APP_WORKER%" (
    SET "_ARG=%_WORKER_SHIM%"
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try{$p=Start-Process -FilePath $env:_EXE -ArgumentList @($env:_ARG) -WorkingDirectory $env:_WDIR -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'worker.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'worker-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'worker.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
) ELSE (
    ECHO [警告] 工作进程包未找到，BullMQ 任务处理不可用: %APP_WORKER%
)
IF EXIST "%APP_BOARD%" (
    SET "_ARG=%APP_BOARD%"
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try{$p=Start-Process -FilePath $env:_EXE -ArgumentList @($env:_ARG) -WorkingDirectory $env:_WDIR -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'bull-board.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'bull-board-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'board.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
)
IF EXIST "%APP_WATCHDOG%" (
    SET "_ARG=%APP_WATCHDOG%"
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "try{$p=Start-Process -FilePath $env:_EXE -ArgumentList @($env:_ARG) -WorkingDirectory $env:_WDIR -NoNewWindow -RedirectStandardOutput (Join-Path $env:LOGS_DIR 'watchdog.log') -RedirectStandardError (Join-Path $env:LOGS_DIR 'watchdog-err.log') -PassThru;$p.Id|Out-File -LiteralPath (Join-Path $env:PIDS_DIR 'watchdog.pid') -Encoding ASCII -NoNewline}catch{Write-Warning $_}"
) ELSE (
    ECHO [警告] 看门狗进程包未找到，任务对账和日志清理不可用: %APP_WATCHDOG%
)
ECHO [服务] 进程已在后台启动
ECHO.

REM ====================================================
REM  Step 9 / 9: Wait for Port 3000 → Open Browser
REM ====================================================
ECHO [9/9] 等待 Web 服务就绪 ^(端口 3000，最多 60 秒^)...
SET /A APP_RETRY=0
:APP_WAIT_LOOP
SET /A APP_RETRY+=1
IF !APP_RETRY! GTR 30 (
    ECHO [警告] Web 服务启动超时，直接尝试打开浏览器...
    GOTO LAUNCH_BROWSER
)
TIMEOUT /T 2 /NOBREAK >NUL
NETSTAT -an 2>NUL | FINDSTR ":3000 " | FINDSTR "LISTENING" >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 GOTO APP_WAIT_LOOP

:LAUNCH_BROWSER
REM 启动前做一次最终 URL 校正，避免浏览器被错误打开到 3000
IF /I "%PORTABLE_HTTPS_ENABLED%"=="1" (
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ok=$false; $c=New-Object System.Net.Sockets.TcpClient; try { $iar=$c.BeginConnect('127.0.0.1',1443,$null,$null); if($iar.AsyncWaitHandle.WaitOne(1000)){ $c.EndConnect($iar); $ok=$true } } catch {} finally { $c.Close() }; if($ok){ exit 0 } else { exit 1 }"
    IF !ERRORLEVEL! EQU 0 (
        SET "PORTABLE_WEB_URL=%PORTABLE_HTTPS_URL%"
        SET "PORTABLE_BULL_BOARD_URL=%PORTABLE_HTTPS_URL%/admin/queues"
        SET "NEXTAUTH_URL=%PORTABLE_HTTPS_URL%"
    ) ELSE (
        SET "PORTABLE_WEB_URL=%PORTABLE_HTTP_URL%"
        SET "PORTABLE_BULL_BOARD_URL=http://localhost:3010/admin/queues"
        SET "NEXTAUTH_URL=%PORTABLE_HTTP_URL%"
    )
)

ECHO.
ECHO ====================================================
ECHO   waoowaoo 已成功启动！
ECHO.
ECHO   主界面  : %PORTABLE_WEB_URL%/zh
ECHO   任务面板: %PORTABLE_BULL_BOARD_URL%
ECHO   MinIO   : http://localhost:9001  (minioadmin / minioadmin)
ECHO.
ECHO   数据目录: %USER_DATA%
ECHO   日志目录: %LOGS_DIR%
ECHO   若通过本控制台窗口启动，关闭此窗口或按 Ctrl+C 可自动停止所有服务并退出
ECHO   若通过桌面/开始菜单等快捷方式隐藏启动，请使用对应的「停止/退出 waoowaoo」入口关闭所有服务
ECHO ====================================================
ECHO.
START "" "%PORTABLE_WEB_URL%/zh"

REM ---- 确保所有日志文件存在（Get-Content -Wait 需要文件已存在）----
FOR %%F IN ("%LOGS_DIR%\nextjs.log" "%LOGS_DIR%\nextjs-err.log" "%LOGS_DIR%\worker.log" "%LOGS_DIR%\worker-err.log" "%LOGS_DIR%\bull-board.log" "%LOGS_DIR%\bull-board-err.log" "%LOGS_DIR%\watchdog.log" "%LOGS_DIR%\watchdog-err.log" "%LOGS_DIR%\redis.log" "%LOGS_DIR%\redis-err.log" "%LOGS_DIR%\mysql.log" "%LOGS_DIR%\mysql-err.log" "%LOGS_DIR%\minio.log" "%LOGS_DIR%\minio-err.log" "%LOGS_DIR%\caddy.log" "%LOGS_DIR%\caddy-err.log") DO (
    IF NOT EXIST "%%~fF" TYPE NUL > "%%~fF"
)

REM ====================================================
REM  优雅退出 + 实时日志
REM  关闭窗口或按 Ctrl+C 均会自动停止所有服务
REM ====================================================
PowerShell -NoProfile -ExecutionPolicy Bypass -NonInteractive -Command "$global:_d=$false; function global:_Stop { if($global:_d){return}; $global:_d=$true; Write-Host ''; Write-Host '[停止] 正在停止所有服务，请稍候...'; $pd=$env:PIDS_DIR; $rt=$env:ROOT; foreach($s in @('nextjs','worker','board','watchdog','caddy','minio')){ $pf=Join-Path $pd ($s+'.pid'); if(Test-Path $pf){ $xp=(Get-Content $pf -Raw -EA 0).Trim(); if($xp -match '^[0-9]+$'){ Write-Host ('  停止 '+$s+' PID='+$xp); Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $pf -Force -EA 0 } }; $rc=Join-Path $rt 'portable_redis\redis-cli.exe'; if(Test-Path $rc){ & $rc -h 127.0.0.1 -p 6379 SHUTDOWN NOSAVE 2>$null|Out-Null; Write-Host '  停止 Redis' }; $rpf=Join-Path $pd 'redis.pid'; if(Test-Path $rpf){ $xp=(Get-Content $rpf -Raw -EA 0).Trim(); if($xp -match '^[0-9]+$'){ Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $rpf -Force -EA 0 }; $ma=Join-Path $rt 'portable_db\bin\mysqladmin.exe'; if(Test-Path $ma){ $cf=Join-Path $pd '_s.cnf'; '[client]','user=root','password=waoowaoo123'|Set-Content $cf -Encoding ASCII; & $ma ('--defaults-extra-file='+$cf) -h 127.0.0.1 -P 3306 shutdown 2>$null|Out-Null; Remove-Item $cf -Force -EA 0; Write-Host '  停止 MariaDB' }; $mpf=Join-Path $pd 'mysql.pid'; if(Test-Path $mpf){ $xp=(Get-Content $mpf -Raw -EA 0).Trim(); if($xp -match '^[0-9]+$'){ Stop-Process -Id ([int]$xp) -Force -EA 0 }; Remove-Item $mpf -Force -EA 0 }; Write-Host '[停止] 所有服务已停止'; Start-Sleep 2 }; Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { _Stop }; $ll=$env:PORTABLE_LIVE_LOGS; $lm=$env:PORTABLE_LIVE_LOGS_MODE; $ld=$env:LOGS_DIR; if($ll -ne '1'){ Write-Host '[提示] 服务已在后台运行，关闭此窗口或按 Ctrl+C 可停止所有服务'; try{ while($true){ Start-Sleep 10 } }catch{}finally{ _Stop }; exit }; if($lm -ieq 'full'){ $lp=@(Get-ChildItem (Join-Path $ld '*.log') -EA 0|Select-Object -ExpandProperty FullName) }else{ $lp=@((Join-Path $ld 'nextjs.log'),(Join-Path $ld 'nextjs-err.log'),(Join-Path $ld 'worker.log'),(Join-Path $ld 'worker-err.log'),(Join-Path $ld 'watchdog.log'),(Join-Path $ld 'watchdog-err.log'),(Join-Path $ld 'caddy-err.log')) }; foreach($f in $lp){ if(-not (Test-Path $f)){ New-Item -Path $f -Force -ItemType File|Out-Null } }; Write-Host '[日志] 实时日志已开启（关闭窗口或按 Ctrl+C 将自动停止所有服务）'; Write-Host ('[日志] 模式: '+$lm+' | 文件数: '+$lp.Count); try{ Get-Content -Path $lp -Tail 80 -Wait -Encoding UTF8 -EA 0 }catch{}finally{ _Stop }"

ENDLOCAL
GOTO :EOF

REM ====================================================
REM  :CHECK_BUILD_STATE — 检测构建完整性，设置 BS_* 变量
REM  调用方式: CALL :CHECK_BUILD_STATE
REM ====================================================
:CHECK_BUILD_STATE
SET "BS_NODE=[ 缺失 ]"
SET "BS_REDIS=[ 缺失 ]"
SET "BS_MARIADB=[ 缺失 ]"
SET "BS_MINIO=[ 缺失 ]"
SET "BS_CADDY=[ 缺失 ]"
SET "BS_APP=[ 缺失 ]"
SET "BS_PRISMA=[ 缺失 ]"
SET "BS_NM=[ 不适用 ]"
SET "BS_IN_SOURCE=0"
SET "BS_READY=1"
IF EXIST "%NODE%"       ( SET "BS_NODE=[  OK  ]"    ) ELSE ( SET "BS_READY=0" )
IF EXIST "%REDIS_EXE%"  ( SET "BS_REDIS=[  OK  ]"   ) ELSE ( SET "BS_READY=0" )
IF EXIST "%MYSQLD%"     ( SET "BS_MARIADB=[  OK  ]" ) ELSE ( SET "BS_READY=0" )
IF EXIST "%MINIO_EXE%"  ( SET "BS_MINIO=[  OK  ]"   ) ELSE ( SET "BS_READY=0" )
IF EXIST "%CADDY_EXE%"  SET "BS_CADDY=[  OK  ]"
IF EXIST "%APP_SERVER%" ( SET "BS_APP=[  OK  ]"     ) ELSE ( SET "BS_READY=0" )
IF EXIST "%PRISMA_JS%"  SET "BS_PRISMA=[  OK  ]"
IF EXIST "%ROOT%\..\next.config.ts" (
    SET "BS_IN_SOURCE=1"
    IF EXIST "%ROOT%\..\node_modules" (
        SET "BS_NM=[  OK  ]"
    ) ELSE (
        SET "BS_NM=[ 缺失 ]"
    )
)
IF "%BS_READY%"=="1" (
    SET "BUILD_STATUS_LINE=所有关键组件就绪，可以启动"
) ELSE (
    SET "BUILD_STATUS_LINE=部分组件缺失  建议: 维护工具 ^> 重新安装依赖"
)
GOTO :EOF

REM ====================================================
REM  :CLASSIFY_ERROR — 错误分类辅助子程序
REM  用法: CALL :CLASSIFY_ERROR "日志文件路径"
REM  检查日志文件，输出网络/锁文件/权限 分类提示
REM ====================================================
:CLASSIFY_ERROR
SET "_CE_LOG=%~1"
IF NOT EXIST "%_CE_LOG%" GOTO :EOF
FINDSTR /I /C:"access denied" /C:"permission denied" /C:"拒绝访问" /C:"error 5" /C:"error 13" /C:"operation not permitted" "%_CE_LOG%" >NUL 2>&1
IF NOT ERRORLEVEL 1 (
    ECHO   [分类: 权限不足] 可能原因：目录无写入权限或需要管理员身份
    ECHO   [建议] 右键 start.bat ^-^> "以管理员身份运行"，或检查 %USER_DATA% 目录权限
    GOTO :EOF
)
FINDSTR /I /C:".lock" /C:"lockfile" /C:"lock file" /C:"in use" /C:"already running" /C:"already locked" /C:"socket in use" "%_CE_LOG%" >NUL 2>&1
IF NOT ERRORLEVEL 1 (
    ECHO   [分类: 锁文件冲突] 可能有残留进程未退出
    ECHO   [建议] 重启计算机，或在任务管理器中结束 mysqld.exe/redis-server.exe/minio.exe 进程
    GOTO :EOF
)
FINDSTR /I /C:"connection refused" /C:"timed out" /C:"network error" /C:"no route" /C:"unreachable" /C:"ssl error" /C:"certificate" /C:"proxy" /C:"download" "%_CE_LOG%" >NUL 2>&1
IF NOT ERRORLEVEL 1 (
    ECHO   [分类: 网络失败] 可能原因：网络不可用、防火墙拦截或代理设置
    ECHO   [建议] 检查网络连接；如使用代理，请设置 HTTPS_PROXY 环境变量后重试
    GOTO :EOF
)
ECHO   [提示] 请查看日志获取详细错误: %_CE_LOG%
GOTO :EOF
