# build-portable.ps1 — waoowaoo Windows 便携包构建脚本
#
# 使用方式：在项目根目录执行：
#   powershell -ExecutionPolicy Bypass -File portable\build-portable.ps1
#
# 前置条件：
#   1. npm install 已完成（含 devDependencies）
#   2. 系统已安装 Node.js（仅构建时使用，构建产物内置便携 node）
#   3. 已从下列地址下载并解压便携版依赖（路径见说明注释）
#
# 构建产物：waoowaoo-portable-v<version>-windows.zip
# 解压后目录结构见 README_PORTABLE.md

param(
    # 便携包输出的暂存目录：
    #   ""（默认）→ %LOCALAPPDATA%\waoowaoo\build\dist-portable（不污染项目目录）
    #   相对路径   → 相对于项目根（如 "dist-portable"），供向下兼容或脚本间调用使用
    #   绝对路径   → 直接使用（如 build-exe.ps1 传入 dist-win 的绝对路径）
    [string]$StagingDirName = "",
    # 强制指定版本号（默认从 package.json 读取）
    [string]$ForceVersion = "",
    # 仅执行暂存（跳过最终 ZIP 打包），供 build-exe.ps1 调用
    [switch]$StageOnly
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# ── 解析暂存目录路径（不污染项目目录）────────────────────────────────────────────
if ([System.IO.Path]::IsPathRooted($StagingDirName)) {
    # 调用者传入了绝对路径（如 build-exe.ps1 传入 LOCALAPPDATA\…\dist-win）
    $StagingDir = $StagingDirName
} elseif ($StagingDirName -ne "") {
    # 调用者传入了相对路径，相对于项目根（向下兼容）
    $StagingDir = Join-Path $ProjectRoot $StagingDirName
} else {
    # 默认：写入用户本地缓存目录，不放在项目目录里
    # 优先顺序: LOCALAPPDATA (Windows) → RUNNER_TEMP (GitHub Actions) → TMPDIR/TMP → /tmp
    $lad = if     ($env:LOCALAPPDATA) { $env:LOCALAPPDATA }  `
           elseif ($env:RUNNER_TEMP)  { $env:RUNNER_TEMP  }  `
           elseif ($env:TMPDIR)       { $env:TMPDIR       }  `
           elseif ($env:TMP)          { $env:TMP          }  `
           else                       { "/tmp"             }
    $StagingDir = [System.IO.Path]::Combine($lad, "waoowaoo", "build", "dist-portable")
}
$AppDir      = Join-Path $StagingDir  "app"
$AppServerDir= Join-Path $AppDir      "server"
$AppPrismaDir= Join-Path $AppDir      "prisma"

# ── 读取版本号 ─────────────────────────────────────────────────────────────────
if ($ForceVersion -ne "") {
    $Version = $ForceVersion
} else {
    $pkg = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
    $Version = $pkg.version
}

Write-Host "======================================================"
Write-Host "  waoowaoo Portable Builder   版本 v$Version"
Write-Host "  项目根目录: $ProjectRoot"
Write-Host "  暂存目录  : $StagingDir"
Write-Host "======================================================"
Write-Host ""

# ── Step 1: Next.js Standalone Build ──────────────────────────────────────────
Write-Host "[1/6] 构建 Next.js Standalone..."
Push-Location $ProjectRoot
# 构建前清空 .next/ 使 outputFileTracingExcludes 对 portable/ 的排除规则生效。
# 若不清空，旧的 trace 缓存仍会把 portable/app/server/.next/cache/images 纳入
# standalone，导致 Copy-Item 在 Windows MAX_PATH(260) 下失败。
$nextBuildDir = Join-Path $ProjectRoot ".next"
if (Test-Path $nextBuildDir) {
    Write-Host "  清空 .next/（强制 file tracer 重新追踪，排除 portable/ 路径）..."
    # 使用 robocopy /MIR 将空目录镜像到 .next，以规避 Windows MAX_PATH 对深层 cache 路径的限制。
    $tempEmptyDir = Join-Path ([System.IO.Path]::GetTempPath()) ("waoowaoo-next-empty-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempEmptyDir | Out-Null
    & robocopy $tempEmptyDir $nextBuildDir /MIR | Out-Null
    $robocopyExit = $LASTEXITCODE
    Remove-Item $tempEmptyDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($robocopyExit -ge 8) {
        throw "清空 .next/ 失败（robocopy 返回代码 $robocopyExit）。"
    }
    # 验证 .next/ 是否已被清空（允许保留空目录本身）
    $remaining = Get-ChildItem -LiteralPath $nextBuildDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($remaining) {
        throw "清空 .next/ 失败：仍存在残留文件/目录，无法保证 portable 构建可用。"
    }
}
# 确保 next.config.ts 已含 output: 'standalone'（build-portable.ps1 会提示但不修改）
$nextCfg = Get-Content (Join-Path $ProjectRoot "next.config.ts") -Raw
if ($nextCfg -notmatch "output\s*:\s*['""]standalone['""]") {
    Write-Warning "next.config.ts 中未检测到 output: 'standalone'，构建产物可能不正确。"
    Write-Warning "请参见 README_PORTABLE.md 进行修改后再运行本脚本。"
}
# 若 node_modules 不存在（如 git clone 后首次构建），自动安装依赖
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "  [依赖] node_modules 不存在，执行 npm ci（从 package-lock.json 精确安装，约需 2-5 分钟）..."
    & npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [警告] npm ci 失败（package-lock.json 与当前环境存在版本漂移），改用 npm install 重新解析依赖..."
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install 失败，请检查网络连接或 npm 日志。" }
    }
    Write-Host "  [依赖] 依赖安装完成"
}
$env:WAOOWAOO_PORTABLE_BUILD = "1"
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Next.js 构建失败 (npm run build)，请检查错误信息。" }
} finally {
    Remove-Item Env:WAOOWAOO_PORTABLE_BUILD -ErrorAction SilentlyContinue
}
Pop-Location

# ── Step 2: Bundle Workers with esbuild ───────────────────────────────────────
Write-Host ""
Write-Host "[2/6] 使用 esbuild 打包 Worker / Bull-Board..."

# 公共 esbuild 参数：排除含原生 .node 绑定或需要运行时解析的包
$esbuildExternalFlags = @(
    "--external:sharp",
    "--external:@prisma/client",
    "--external:.prisma",
    "--external:fsevents",
    "--external:cpu-features",
    "--external:ssh2",
    "--external:bufferutil",
    "--external:utf-8-validate",
    "--external:@vercel/og"   # @vercel/og 内部用 import.meta.url 加载字体，esbuild CJS 模式下会 crash
)
$esbuildCommon = @(
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    "--log-level=warning"
) + $esbuildExternalFlags

Push-Location $ProjectRoot

# Worker (BullMQ)
Write-Host "  Bundling src/lib/workers/index.ts → .next/standalone/worker.js"
& npx esbuild src/lib/workers/index.ts @esbuildCommon --outfile=".next/standalone/worker.js"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Worker bundle 失败；BullMQ 后台任务处理将不可用。"
}

# Bull Board (可选管理面板)
Write-Host "  Bundling scripts/bull-board.ts → .next/standalone/bull-board.js"
& npx esbuild scripts/bull-board.ts @esbuildCommon --outfile=".next/standalone/bull-board.js"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Bull Board bundle 失败；任务管理面板将不可用。"
}

# Watchdog (任务看门狗，与 Docker 版 npm run start:watchdog 对齐)
Write-Host "  Bundling scripts/watchdog.ts → .next/standalone/watchdog.js"
& npx esbuild scripts/watchdog.ts @esbuildCommon --outfile=".next/standalone/watchdog.js"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Watchdog bundle 失败；任务看门狗将不可用（DB↔Queue 持续对账、日志清理将缺失）。"
}

# Storage Init (MinIO 存储桶初始化助手，由 start.bat 在启动时调用)
Write-Host "  Bundling src/lib/storage/init.ts → .next/standalone/storage-init.js"
& npx esbuild src/lib/storage/init.ts @esbuildCommon --outfile=".next/standalone/storage-init.js"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "storage-init bundle 失败；MinIO 存储桶将不会在启动时自动创建，需手动创建。"
}

Pop-Location

# ── Step 3: Setup Staging Directory ───────────────────────────────────────────
Write-Host ""
Write-Host "[3/6] 准备暂存目录..."
Write-Host "  暂存目录: $StagingDir"
# 确保父目录存在（尤其是 LOCALAPPDATA\waoowaoo\build\ 可能尚未创建）
New-Item -ItemType Directory -Force -Path (Split-Path $StagingDir -Parent) | Out-Null
if (Test-Path $StagingDir) {
    Write-Host "  清理旧暂存目录..."
    Remove-Item $StagingDir -Recurse -Force
}
$dirsToCreate = @(
    $AppServerDir,
    $AppPrismaDir,
    "$StagingDir\portable_db",         # 纯二进制目录（数据统一在 LOCALAPPDATA\waoowaoo 下）
    "$StagingDir\portable_redis",
    "$StagingDir\portable_minio",       # 纯二进制目录（数据统一在 LOCALAPPDATA\waoowaoo 下）
    "$StagingDir\node"
    # 注：logs/、data/、pids/ 不放入包内，由 start.bat 在 LOCALAPPDATA\waoowaoo 下按需创建
)
foreach ($d in $dirsToCreate) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# ── Step 4: Copy Next.js Standalone ───────────────────────────────────────────
Write-Host "[4/6] 复制 Next.js Standalone 构建产物..."

$standaloneDir = Join-Path $ProjectRoot ".next\standalone"
if (-not (Test-Path $standaloneDir)) {
    throw ".next/standalone 目录不存在，Next.js 构建可能未启用 output:'standalone'。"
}
# 双重保险：删除 standalone 里可能混入的 portable/ 子目录。
# 使用 robocopy /MIR 镜像空目录的方式强制删除，绕过 Windows MAX_PATH(260) 限制
# （Remove-Item / rd /s /q 在路径 >260 字符时均会失败）。
$standalonePortable = Join-Path $standaloneDir "portable"
if (Test-Path $standalonePortable) {
    Write-Host "  删除 standalone/portable/（超长路径，使用 robocopy /MIR 强制删除）..."
    $emptyTmp = Join-Path $env:TEMP "waoowaoo_empty_$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $emptyTmp | Out-Null
    # robocopy /MIR 把空目录镜像到目标 → 删除目标内所有文件（含超长路径文件）
    robocopy $emptyTmp $standalonePortable /MIR /R:1 /W:0 /NP /NFL /NDL /NJH /NJS | Out-Null
    Remove-Item $emptyTmp  -Force -Recurse -ErrorAction SilentlyContinue
    Remove-Item $standalonePortable -Force -Recurse -ErrorAction SilentlyContinue
}
Copy-Item "$standaloneDir\*" $AppServerDir -Recurse -Force

# Next.js standalone 需要手动复制 public/ 和 .next/static/
Write-Host "  复制 public/ ..."
Copy-Item (Join-Path $ProjectRoot "public") (Join-Path $AppServerDir "public") -Recurse -Force

Write-Host "  复制 .next/static/ ..."
$staticDest = Join-Path $AppServerDir ".next\static"
New-Item -ItemType Directory -Force -Path $staticDest | Out-Null
Copy-Item (Join-Path $ProjectRoot ".next\static\*") $staticDest -Recurse -Force

# 将 Prisma CLI 及其依赖闭包复制进 standalone node_modules（migrate deploy 需要）
function Resolve-NpmPackagePath([string]$nodeModulesRoot, [string]$packageName) {
    if ($packageName.StartsWith("@")) {
        $parts = $packageName.Split("/", 2)
        if ($parts.Count -ne 2) { return $null }
        return Join-Path (Join-Path $nodeModulesRoot $parts[0]) $parts[1]
    }
    return Join-Path $nodeModulesRoot $packageName
}

function Copy-NpmPackageClosure {
    param(
        [string]$SourceNodeModules,
        [string]$DestNodeModules,
        [string[]]$EntryPackages
    )

    $queue = New-Object System.Collections.Generic.Queue[string]
    $seen  = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($pkg in $EntryPackages) { $queue.Enqueue($pkg) }

    while ($queue.Count -gt 0) {
        $pkg = $queue.Dequeue()
        if ($seen.Contains($pkg)) { continue }
        $seen.Add($pkg) | Out-Null

        $srcPkgPath = Resolve-NpmPackagePath -nodeModulesRoot $SourceNodeModules -packageName $pkg
        if (-not $srcPkgPath -or -not (Test-Path $srcPkgPath)) {
            Write-Warning "node_modules/$pkg 未找到，Prisma CLI 可能运行失败。"
            continue
        }

        $destPkgPath   = Resolve-NpmPackagePath -nodeModulesRoot $DestNodeModules -packageName $pkg
        $destParentDir = Split-Path $destPkgPath -Parent
        New-Item -ItemType Directory -Force -Path $destParentDir | Out-Null
        Copy-Item $srcPkgPath $destPkgPath -Recurse -Force

        $pkgJsonPath = Join-Path $srcPkgPath "package.json"
        if (-not (Test-Path $pkgJsonPath)) { continue }
        $pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        $deps = $pkgJson.dependencies
        if (-not $deps) { continue }
        foreach ($depName in $deps.PSObject.Properties.Name) {
            # 某些依赖会被包管理器嵌套在当前包的 node_modules 下。
            # 由于当前包已整体复制，这类依赖无需再从根 node_modules 单独解析，避免误报缺失。
            $localNodeModules = Join-Path $srcPkgPath "node_modules"
            $localDepPath = Resolve-NpmPackagePath -nodeModulesRoot $localNodeModules -packageName $depName
            if (Test-Path $localDepPath) { continue }
            $queue.Enqueue($depName)
        }
    }
}

Write-Host "  复制 Prisma CLI 依赖闭包到 standalone/node_modules ..."
$sourceNodeModules = Join-Path $ProjectRoot "node_modules"
$destNodeModules   = Join-Path $AppServerDir "node_modules"
Copy-NpmPackageClosure -SourceNodeModules $sourceNodeModules -DestNodeModules $destNodeModules -EntryPackages @("prisma", "@vercel/og")

# .prisma/client 目录包含 Prisma 生成的客户端代码和 query engine 二进制文件（.dll.node）。
# Next.js standalone 的 file-tracer 不追踪 .node 二进制，需手动复制。
Write-Host "  复制 .prisma/client (query engine 二进制) 到 standalone/node_modules ..."
$prismaGeneratedSrc  = Join-Path $ProjectRoot "node_modules\.prisma\client"
$prismaGeneratedDest = Join-Path $AppServerDir "node_modules\.prisma\client"
if (Test-Path $prismaGeneratedSrc) {
    New-Item -ItemType Directory -Force -Path $prismaGeneratedDest | Out-Null
    Copy-Item "$prismaGeneratedSrc\*" $prismaGeneratedDest -Recurse -Force
    Write-Host "  [就绪] .prisma/client 已复制"
} else {
    Write-Warning ".prisma/client 未找到，请确认 'prisma generate' 或 'npm run build' 已执行。"
}

# 复制 Prisma schema 和 migrations
Write-Host "  复制 prisma/schema.prisma + migrations/ ..."
Copy-Item (Join-Path $ProjectRoot "prisma\schema.prisma") $AppPrismaDir -Force
Copy-Item (Join-Path $ProjectRoot "prisma\migrations")    $AppPrismaDir -Recurse -Force

# ── Step 5: Copy Portable Scripts ─────────────────────────────────────────────
Write-Host ""
Write-Host "[5/6] 复制启动脚本和配置文件..."

Copy-Item (Join-Path $ProjectRoot "portable\start.bat")              $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\Caddyfile")              $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\update.ps1")             $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\setup-dependencies.ps1") $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\deps-manifest.json")     $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\README_PORTABLE.md")     $StagingDir -Force
Copy-Item (Join-Path $ProjectRoot "portable\db\my.ini")              "$StagingDir\portable_db" -Force

# ── 生成唯一安全密钥（每次构建生成新密钥，写入 app/.secrets） ─────────────────
Write-Host "  生成安全密钥 (Generating unique secrets)..."
$rng         = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$secretBytes = New-Object byte[] 32
$cronBytes   = New-Object byte[] 16
$taskBytes   = New-Object byte[] 16
$rng.GetBytes($secretBytes)
$rng.GetBytes($cronBytes)
$rng.GetBytes($taskBytes)
$nextauthSecret    = [BitConverter]::ToString($secretBytes) -replace '-', ''
$cronSecret        = [BitConverter]::ToString($cronBytes)   -replace '-', ''
$internalTaskToken = [BitConverter]::ToString($taskBytes)   -replace '-', ''
$rng.Dispose()

# .secrets 文件：仅存储需要每台机器唯一的密钥；由 start.bat 在运行时加载
@"
NEXTAUTH_SECRET=$nextauthSecret
CRON_SECRET=$cronSecret
INTERNAL_TASK_TOKEN=$internalTaskToken
"@ | Out-File -FilePath (Join-Path $AppDir ".secrets") -Encoding ASCII -NoNewline

# ── 写入 app/.env（无敏感密钥；密钥存于 .secrets，由 start.bat 加载） ─────────
@"
# waoowaoo 便携版环境配置
# 安全密钥（NEXTAUTH_SECRET 等）由 start.bat 首次运行时生成，存储在 app/.secrets
# 如需修改端口等配置，编辑本文件后重启即可

DATABASE_URL=mysql://root:waoowaoo123@127.0.0.1:3306/waoowaoo

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_TLS=

STORAGE_TYPE=minio
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_REGION=us-east-1
MINIO_BUCKET=waoowaoo
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_FORCE_PATH_STYLE=true

NEXTAUTH_URL=http://localhost:3000
INTERNAL_APP_URL=http://127.0.0.1:3000
# API_ENCRYPTION_KEY: 用于加密数据库中存储的 API 密钥，首次使用后请勿修改
API_ENCRYPTION_KEY=waoowaoo-opensource-fixed-key-2026

WATCHDOG_INTERVAL_MS=30000
TASK_HEARTBEAT_TIMEOUT_MS=90000
QUEUE_CONCURRENCY_IMAGE=10
QUEUE_CONCURRENCY_VIDEO=10
QUEUE_CONCURRENCY_VOICE=5
QUEUE_CONCURRENCY_TEXT=10
WORKER_LOCK_DURATION_MS=300000
MEDIA_DOWNLOAD_TIMEOUT_MS=120000

BULL_BOARD_HOST=127.0.0.1
BULL_BOARD_PORT=3010
BULL_BOARD_BASE_PATH=/admin/queues

LOG_UNIFIED_ENABLED=true
LOG_LEVEL=ERROR
LOG_FORMAT=json
LOG_DEBUG_ENABLED=false
LOG_AUDIT_ENABLED=true
LOG_SERVICE=waoowaoo
LOG_REDACT_KEYS=password,token,apiKey,apikey,authorization,cookie,secret,access_token,refresh_token

BILLING_MODE=OFF
LLM_STREAM_EPHEMERAL_ENABLED=true
PORT=3000
HOSTNAME=127.0.0.1
"@ | Out-File -FilePath (Join-Path $AppDir ".env") -Encoding UTF8 -NoNewline

# ── 写入版本文件 ───────────────────────────────────────────────────────────────
$Version | Out-File -FilePath (Join-Path $StagingDir "version.txt") -Encoding UTF8 -NoNewline

# ── 写入暂存元数据（供 build-exe.ps1 复用判断） ─────────────────────────────
$stageMetadata = [ordered]@{
    version = $Version
    builtAtUtc = [DateTime]::UtcNow.ToString("o")
    stagingDirName = $StagingDirName
    stageOnly = [bool]$StageOnly
}
($stageMetadata | ConvertTo-Json) | Out-File -FilePath (Join-Path $StagingDir ".stage-metadata.json") -Encoding UTF8 -NoNewline

# ── Step 6: Create ZIP (skipped when -StageOnly) ──────────────────────────────
Write-Host ""
if ($StageOnly) {
    Write-Host "[6/6] -StageOnly 模式：跳过 ZIP 打包，暂存目录已就绪"
    Write-Host "  暂存目录: $StagingDir"
    Write-Host ""
    Write-Host "======================================================"
    Write-Host "  ✅  暂存构建完成！（供 build-exe.ps1 后续使用）"
    Write-Host "======================================================"
} else {
    Write-Host "[6/6] 打包为 ZIP..."
    # ZIP 输出到暂存目录的同级目录（与暂存目录相同位置，不放在项目目录里）
    $zipOutputDir = Split-Path $StagingDir -Parent
    New-Item -ItemType Directory -Force -Path $zipOutputDir | Out-Null
    $zipPath = Join-Path $zipOutputDir "waoowaoo-portable-v$Version-windows.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($StagingDir, $zipPath)

    $zipSizeMB = '{0:N1}' -f ((Get-Item $zipPath).Length / 1MB)
    Write-Host ""
    Write-Host "======================================================"
    Write-Host "  ✅  便携包构建成功！"
    Write-Host "  ZIP : $zipPath  ($zipSizeMB MB)"
    Write-Host ""
    Write-Host "  ⚠️  构建完成后，还需手动放入便携二进制文件："
    Write-Host "     node/          → Node.js v20 LTS Windows x64 ZIP 解压内容"
    Write-Host "     portable_db/   → MariaDB 10.x Windows ZIP 解压内容"
    Write-Host "     portable_redis/→ Redis for Windows (tporadowski) 解压内容"
    Write-Host "     portable_minio/→ minio.exe (MinIO Windows 二进制)"
    Write-Host ""
    Write-Host "  详细说明见 README_PORTABLE.md"
    Write-Host "======================================================"
}
