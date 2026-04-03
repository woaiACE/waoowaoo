# build-exe.ps1 — waoowaoo Windows 离线安装包 (.exe) 构建脚本
#
# 用法（在项目根目录或任意位置执行）：
#   pwsh -ExecutionPolicy Bypass -File portable\build-exe.ps1
#   pwsh -ExecutionPolicy Bypass -File portable\build-exe.ps1 -NoCache
#   pwsh -ExecutionPolicy Bypass -File portable\build-exe.ps1 -ForceVersion 1.0.0
#   pwsh -ExecutionPolicy Bypass -File portable\build-exe.ps1 -SkipAppBuild
#
# 前置条件：
#   - Node.js 已安装（用于 Next.js 构建）
#   - npm install 已完成（含 devDependencies）
#   - makensis (NSIS 3.x) 已安装：
#       Windows : winget install NSIS.NSIS  OR  choco install nsis
#       Linux   : sudo apt-get install -y nsis
#       macOS   : brew install makensis
#   - 首次构建需要网络（下载 Node.js / Redis / MariaDB / MinIO 二进制；Caddy 由运行时自动补齐）
#     后续构建使用本地缓存 (build-cache/deps-windows/)，几乎不需要网络
#
# 产物：dist/waoowaoo-setup-v<version>-windows.exe

param(
    # 强制指定版本号（默认从 package.json 读取）
    [string]$ForceVersion = "",
    # 忽略构建缓存，强制重新下载所有依赖二进制
    [switch]$NoCache,
    # 跳过 Next.js 构建，直接使用已有的 dist-win/ 暂存目录（调试用）
    [switch]$SkipAppBuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# ── 构建产物目录：写入 LOCALAPPDATA（不污染项目目录）─────────────────────────────
# 优先顺序: LOCALAPPDATA (Windows) → RUNNER_TEMP (GitHub Actions) → TMPDIR/TMP → /tmp
$_lad         = if     ($env:LOCALAPPDATA) { $env:LOCALAPPDATA }  `
                elseif ($env:RUNNER_TEMP)  { $env:RUNNER_TEMP  }  `
                elseif ($env:TMPDIR)       { $env:TMPDIR       }  `
                elseif ($env:TMP)          { $env:TMP          }  `
                else                       { "/tmp"             }
$StagingDir   = [System.IO.Path]::Combine($_lad, "waoowaoo", "build", "dist-win")
$CacheDir     = Join-Path $ProjectRoot "build-cache" | Join-Path -ChildPath "deps-windows"
$OutputDir    = Join-Path $ProjectRoot "dist"          # 最终 .exe 留在项目 dist/ 便于 CI 归档
$ManifestPath = Join-Path $ProjectRoot "portable\deps-manifest.json"
$AssetsDir    = Join-Path $ProjectRoot "portable\assets"
$StageMetadataPath = Join-Path $StagingDir ".stage-metadata.json"

# ── 读取版本号 ──────────────────────────────────────────────────────────────────
if ($ForceVersion -ne "") {
    $Version = $ForceVersion
} else {
    $pkg     = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
    $Version = $pkg.version
}

Write-Host "======================================================"
Write-Host "  waoowaoo EXE Builder   版本 v$Version"
Write-Host "  项目根目录: $ProjectRoot"
Write-Host "  暂存目录  : $StagingDir"
Write-Host "  构建缓存  : $CacheDir"
Write-Host "======================================================"
Write-Host ""

# ── 暂存复用判断函数 ──────────────────────────────────────────────────────────
function Get-LatestWriteTimeUtc {
    param(
        [string[]]$Paths
    )

    $latest = [DateTime]::MinValue
    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) { continue }

        $item = Get-Item $path
        if ($item.PSIsContainer) {
            $containerLatest = $item.LastWriteTimeUtc
            if ($containerLatest -gt $latest) { $latest = $containerLatest }

            Get-ChildItem -Path $path -Recurse -Force -File | ForEach-Object {
                if ($_.LastWriteTimeUtc -gt $latest) {
                    $latest = $_.LastWriteTimeUtc
                }
            }
            continue
        }

        if ($item.LastWriteTimeUtc -gt $latest) {
            $latest = $item.LastWriteTimeUtc
        }
    }

    return $latest
}

function Get-StageReuseDecision {
    param(
        [string]$ProjectRoot,
        [string]$StagingDir,
        [string]$StageMetadataPath,
        [string]$Version
    )

    if (-not (Test-Path $StagingDir)) {
        return [pscustomobject]@{ Reuse = $false; Reason = "dist-win 不存在" }
    }
    if (-not (Test-Path (Join-Path $StagingDir "app\server\server.js"))) {
        return [pscustomobject]@{ Reuse = $false; Reason = "dist-win 缺少 app/server/server.js" }
    }
    if (-not (Test-Path $StageMetadataPath)) {
        return [pscustomobject]@{ Reuse = $false; Reason = "暂存元数据不存在" }
    }

    try {
        $metadata = Get-Content $StageMetadataPath -Raw | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{ Reuse = $false; Reason = "暂存元数据损坏" }
    }

    if (($metadata.version | Out-String).Trim() -ne $Version) {
        return [pscustomobject]@{ Reuse = $false; Reason = "暂存版本与当前版本不一致" }
    }

    $builtAtUtc = $null
    try {
        $builtAtUtc = [DateTime]::Parse(($metadata.builtAtUtc | Out-String).Trim()).ToUniversalTime()
    } catch {
        return [pscustomobject]@{ Reuse = $false; Reason = "暂存元数据 builtAtUtc 无法解析" }
    }

    $sourcePaths = @(
        (Join-Path $ProjectRoot "package.json"),
        (Join-Path $ProjectRoot "package-lock.json"),
        (Join-Path $ProjectRoot "pnpm-lock.yaml"),
        (Join-Path $ProjectRoot "next.config.ts"),
        (Join-Path $ProjectRoot "tsconfig.json"),
        (Join-Path $ProjectRoot "postcss.config.mjs"),
        (Join-Path $ProjectRoot "eslint.config.mjs"),
        (Join-Path $ProjectRoot "src"),
        (Join-Path $ProjectRoot "public"),
        (Join-Path $ProjectRoot "prisma"),
        (Join-Path $ProjectRoot "messages"),
        (Join-Path $ProjectRoot "scripts\bull-board.ts"),
        (Join-Path $ProjectRoot "scripts\watchdog.ts"),
        (Join-Path $ProjectRoot "portable\assets"),
        (Join-Path $ProjectRoot "portable\db"),
        (Join-Path $ProjectRoot "portable\start.bat"),
        (Join-Path $ProjectRoot "portable\Caddyfile"),
        (Join-Path $ProjectRoot "portable\update.ps1"),
        (Join-Path $ProjectRoot "portable\setup-dependencies.ps1"),
        (Join-Path $ProjectRoot "portable\deps-manifest.json"),
        (Join-Path $ProjectRoot "portable\README_PORTABLE.md"),
        (Join-Path $ProjectRoot "portable\waoowaoo-installer.nsi"),
        (Join-Path $ProjectRoot "portable\build-portable.ps1"),
        (Join-Path $ProjectRoot "portable\build-exe.ps1")
    )
    $latestSourceWriteUtc = Get-LatestWriteTimeUtc -Paths $sourcePaths
    if ($latestSourceWriteUtc -gt $builtAtUtc) {
        $changedAt = $latestSourceWriteUtc.ToString("u").Trim()
        $builtAt = $builtAtUtc.ToString("u").Trim()
        return [pscustomobject]@{ Reuse = $false; Reason = "检测到源码更新（最新: $changedAt，暂存构建于: $builtAt）" }
    }

    return [pscustomobject]@{
        Reuse = $true
        Reason = "dist-win 已是当前源码的最新暂存产物"
        BuiltAtUtc = $builtAtUtc
    }
}

# ── Step 0: 检查 makensis ──────────────────────────────────────────────────────
Write-Host "[0/7] 检查 makensis..."
$makensisPath = $null

$makensisCmd = Get-Command "makensis" -ErrorAction SilentlyContinue
if ($makensisCmd) {
    $makensisPath = $makensisCmd.Source
} else {
    # Windows 常见安装路径
    foreach ($candidate in @(
        "C:\Program Files (x86)\NSIS\makensis.exe",
        "C:\Program Files\NSIS\makensis.exe"
    )) {
        if (Test-Path $candidate) { $makensisPath = $candidate; break }
    }
}

if (-not $makensisPath) {
    Write-Host ""
    Write-Host "  ❌ 未找到 makensis！请先安装 NSIS 3.x："
    if ($IsWindows -or $PSVersionTable.PSEdition -ne 'Core') {
        Write-Host "     winget install NSIS.NSIS"
        Write-Host "     choco install nsis"
        Write-Host "     或前往 https://nsis.sourceforge.io/Download 手动安装"
    } else {
        Write-Host "     Ubuntu/Debian : sudo apt-get install -y nsis"
        Write-Host "     macOS         : brew install makensis"
    }
    throw "makensis 未安装，请安装 NSIS 3.x 后重试。"
}
Write-Host "  makensis: $makensisPath"

# ── Step 1: 读取依赖清单 ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/7] 读取依赖清单 portable/deps-manifest.json..."
if (-not (Test-Path $ManifestPath)) {
    throw "依赖清单不存在: $ManifestPath"
}
$manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "  Node.js  : v$($manifest.node.version)"
Write-Host "  MariaDB  : v$($manifest.mariadb.version)"
Write-Host "  Redis    : v$($manifest.redis.version)"
Write-Host "  MinIO    : $($manifest.minio.version)"
Write-Host "  Caddy    : v$($manifest.caddy.version)"

# TLS 1.2：Windows PowerShell 5.1 默认可能协商低版本 TLS
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Step 2: 构建 Next.js Standalone + esbuild ────────────────────────────────
Write-Host ""
if ($SkipAppBuild) {
    Write-Host "[2/7] -SkipAppBuild：跳过 Next.js 构建，使用现有暂存目录..."
    if (-not (Test-Path $StagingDir)) {
        throw "-SkipAppBuild 指定但暂存目录不存在: $StagingDir。请先执行完整构建。"
    }
} else {
    $stageReuse = Get-StageReuseDecision -ProjectRoot $ProjectRoot -StagingDir $StagingDir -StageMetadataPath $StageMetadataPath -Version $Version
    if ($stageReuse.Reuse) {
        $builtAtText = if ($stageReuse.BuiltAtUtc) { $stageReuse.BuiltAtUtc.ToString("u").Trim() } else { "未知时间" }
        Write-Host "[2/7] 复用现有 dist-win 暂存目录，跳过重复 StageOnly 构建..."
        Write-Host "  原因: $($stageReuse.Reason)"
        Write-Host "  暂存构建时间(UTC): $builtAtText"
    } else {
        Write-Host "[2/7] 构建 Next.js Standalone + esbuild 打包 Worker..."
        Write-Host "  触发原因: $($stageReuse.Reason)"
        $buildPs1 = Join-Path $ProjectRoot "portable\build-portable.ps1"
        # 传入绝对路径：build-portable.ps1 的 IsPathRooted 检查会直接使用该路径
        & $buildPs1 -StageOnly -StagingDirName $StagingDir -ForceVersion $Version
        if ($LASTEXITCODE -ne 0) { throw "build-portable.ps1 -StageOnly 失败（退出码 $LASTEXITCODE）。" }
    }
}

# ── Step 3 & 4: 下载/缓存依赖并解压到 dist-win/ ─────────────────────────────
Write-Host ""
Write-Host "[3/7] 准备离线依赖（构建时缓存：build-cache/deps-windows/）..."
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

# ─── 辅助函数 ──────────────────────────────────────────────────────────────────
function Get-HumanSize([long]$Bytes) {
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    return ('{0:N0} KB' -f ($Bytes / 1KB))
}

$MinFileBytes = 512KB
function Test-ValidFile([string]$Path) {
    return (Test-Path $Path) -and ((Get-Item $Path).Length -gt $MinFileBytes)
}

# SHA256 校验（sha256 字段非空时执行）
function Assert-FileSha256([string]$FilePath, [string]$ExpectedHash, [string]$Label) {
    if ([string]::IsNullOrWhiteSpace($ExpectedHash)) { return }
    Write-Host "  [校验] $Label SHA256..."
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash
    if ($actual.ToUpper() -ne $ExpectedHash.ToUpper()) {
        Remove-Item $FilePath -Force -ErrorAction SilentlyContinue
        throw "SHA256 校验失败: $Label`n  期望: $($ExpectedHash.ToUpper())`n  实际: $actual`n已删除缓存文件，请重新下载。"
    }
    Write-Host "  [校验] SHA256 通过"
}

function Invoke-CachedDownload {
    param(
        [string]$Url,
        [string]$CachePath,
        [string]$Label,
        [switch]$ForceRedownload
    )
    if (-not $ForceRedownload -and (Test-ValidFile $CachePath)) {
        Write-Host "  [缓存] $Label  ($(Get-HumanSize (Get-Item $CachePath).Length))"
        return
    }
    Write-Host "  [下载] $Label"
    Write-Host "         $Url"

    $tmpPath  = $CachePath + ".tmp"
    # 在 Windows 优先找 curl.exe（内置），非 Windows 找 curl（GNU curl）
    $curlCmd  = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if (-not $curlCmd) {
        $curlCmd = Get-Command "curl" -ErrorAction SilentlyContinue
    }
    $lastErr  = "未知错误"
    $maxRetry = 3

    for ($attempt = 1; $attempt -le $maxRetry; $attempt++) {
        if ($attempt -gt 1) {
            Write-Host "  [重试] 第 $attempt/$maxRetry 次（等待 5 秒）..."
            Start-Sleep 5
        }
        if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue }

        # 方式 1：curl / curl.exe（Linux/macOS/Windows 通用）
        if ($curlCmd) {
            try {
                & $curlCmd.Source -L -s --show-error --fail -o $tmpPath $Url `
                    --retry 2 --retry-delay 3 --max-time 600 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0 -and (Test-ValidFile $tmpPath)) {
                    Move-Item $tmpPath $CachePath -Force
                    Write-Host "  [完成] $Label  ($(Get-HumanSize (Get-Item $CachePath).Length)) [curl]"
                    return
                }
                $lastErr = "curl 退出码 $LASTEXITCODE"
            } catch { $lastErr = "curl: $($_.Exception.Message)" }
            if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue }
        }

        # 方式 2：System.Net.WebClient（流式，不占大量内存）
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", "waoowaoo-build/1.0")
            $wc.DownloadFile($Url, $tmpPath)
            if (Test-ValidFile $tmpPath) {
                Move-Item $tmpPath $CachePath -Force
                Write-Host "  [完成] $Label  ($(Get-HumanSize (Get-Item $CachePath).Length)) [WebClient]"
                return
            }
            $lastErr = "文件过小，URL 可能无效 (WebClient)"
        } catch { $lastErr = "WebClient: $($_.Exception.Message)" }
        if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue }

        # 方式 3：Invoke-WebRequest（兼容性最好）
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $Url -OutFile $tmpPath -TimeoutSec 600 -ErrorAction Stop
            if (Test-ValidFile $tmpPath) {
                Move-Item $tmpPath $CachePath -Force
                Write-Host "  [完成] $Label  ($(Get-HumanSize (Get-Item $CachePath).Length)) [IWR]"
                return
            }
            $lastErr = "文件过小，URL 可能无效 (IWR)"
        } catch { $lastErr = "IWR: $($_.Exception.Message)" }
        if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue }
    }
    throw "下载失败（已尝试 $maxRetry 轮）: $lastErr"
}

function Expand-ZipTo([string]$ZipPath, [string]$DestDir) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestDir)
}

function Get-SingleInnerDir([string]$Dir) {
    # 处理带前缀子目录的 zip（如 node-v20.x-win-x64/）
    $items = Get-ChildItem -Path $Dir
    $dirs  = $items | Where-Object { $_.PSIsContainer }
    $files = $items | Where-Object { -not $_.PSIsContainer }
    if ($dirs.Count -eq 1 -and $files.Count -eq 0) { return $dirs[0].FullName }
    return $null
}

# ── Step 4: 解压依赖到 dist-win/ ─────────────────────────────────────────────
Write-Host ""
Write-Host "[4/7] 将离线依赖解压到暂存目录..."

$tempDir = Join-Path $_lad "waoowaoo\build\.exe_build_temp"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# ── Node.js ───────────────────────────────────────────────────────────────────
$nodeDest = Join-Path $StagingDir "node"
if (-not (Test-Path (Join-Path $nodeDest "node.exe"))) {
    $n         = $manifest.node
    $nCached   = Join-Path $CacheDir $n.filename
    Invoke-CachedDownload -Url $n.url -CachePath $nCached -Label "Node.js v$($n.version)" -ForceRedownload:$NoCache
    Assert-FileSha256 -FilePath $nCached -ExpectedHash $n.sha256 -Label "Node.js v$($n.version)"
    Write-Host "  [解压] Node.js..."
    $extDir = Join-Path $tempDir "node_ext"
    Expand-ZipTo -ZipPath $nCached -DestDir $extDir
    New-Item -ItemType Directory -Force -Path $nodeDest | Out-Null
    $inner = Get-SingleInnerDir $extDir
    $src   = if ($inner) { $inner } else { $extDir }
    Copy-Item "$src\*" $nodeDest -Recurse -Force
    Write-Host "  [就绪] Node.js v$($n.version)"
} else {
    Write-Host "  [跳过] Node.js 已存在"
}

# ── MariaDB ───────────────────────────────────────────────────────────────────
$dbDest = Join-Path $StagingDir "portable_db"
if (-not (Test-Path (Join-Path $dbDest "bin\mysqld.exe"))) {
    $db       = $manifest.mariadb
    $dbCached = Join-Path $CacheDir $db.filename
    Invoke-CachedDownload -Url $db.url -CachePath $dbCached -Label "MariaDB $($db.version)" -ForceRedownload:$NoCache
    Assert-FileSha256 -FilePath $dbCached -ExpectedHash $db.sha256 -Label "MariaDB $($db.version)"
    Write-Host "  [解压] MariaDB..."
    $extDir = Join-Path $tempDir "mariadb_ext"
    Expand-ZipTo -ZipPath $dbCached -DestDir $extDir
    New-Item -ItemType Directory -Force -Path $dbDest | Out-Null

    # 保存 build-portable.ps1 已放置的 my.ini（避免被 MariaDB 内置默认配置覆盖）
    $myIniPath  = Join-Path $dbDest "my.ini"
    $myIniBytes = if (Test-Path $myIniPath) { [IO.File]::ReadAllBytes($myIniPath) } else { $null }

    $inner = Get-SingleInnerDir $extDir
    $src   = if ($inner) { $inner } else { $extDir }
    Copy-Item "$src\*" $dbDest -Recurse -Force

    # 恢复自定义 my.ini（优先级高于 MariaDB 内置默认配置）
    if ($myIniBytes) {
        [IO.File]::WriteAllBytes($myIniPath, $myIniBytes)
        Write-Host "  [配置] 已恢复自定义 my.ini"
    } else {
        $myIniSrc = Join-Path $ProjectRoot "portable\db\my.ini"
        if (Test-Path $myIniSrc) {
            Copy-Item $myIniSrc $myIniPath -Force
            Write-Host "  [配置] 已应用 portable\db\my.ini"
        }
    }
    Write-Host "  [就绪] MariaDB $($db.version)"
} else {
    Write-Host "  [跳过] MariaDB 已存在"
}

# ── Redis ──────────────────────────────────────────────────────────────────────
$redisDest = Join-Path $StagingDir "portable_redis"
if (-not (Test-Path (Join-Path $redisDest "redis-server.exe"))) {
    $r        = $manifest.redis
    $rCached  = Join-Path $CacheDir $r.filename
    Invoke-CachedDownload -Url $r.url -CachePath $rCached -Label "Redis v$($r.version)" -ForceRedownload:$NoCache
    Assert-FileSha256 -FilePath $rCached -ExpectedHash $r.sha256 -Label "Redis v$($r.version)"
    Write-Host "  [解压] Redis..."
    $extDir = Join-Path $tempDir "redis_ext"
    Expand-ZipTo -ZipPath $rCached -DestDir $extDir
    New-Item -ItemType Directory -Force -Path $redisDest | Out-Null
    $inner = Get-SingleInnerDir $extDir
    $src   = if ($inner) { $inner } else { $extDir }
    Copy-Item "$src\*" $redisDest -Recurse -Force
    Write-Host "  [就绪] Redis v$($r.version)"
} else {
    Write-Host "  [跳过] Redis 已存在"
}

# ── MinIO ──────────────────────────────────────────────────────────────────────
$minioDest = Join-Path $StagingDir "portable_minio"
$minioExe  = Join-Path $minioDest "minio.exe"
if (-not (Test-Path $minioExe)) {
    $m        = $manifest.minio
    $mCached  = Join-Path $CacheDir $m.filename
    Invoke-CachedDownload -Url $m.url -CachePath $mCached -Label "MinIO $($m.version)" -ForceRedownload:$NoCache
    Assert-FileSha256 -FilePath $mCached -ExpectedHash $m.sha256 -Label "MinIO $($m.version)"
    New-Item -ItemType Directory -Force -Path $minioDest | Out-Null
    Copy-Item $mCached $minioExe -Force
    Write-Host "  [就绪] MinIO $($m.version)"
} else {
    Write-Host "  [跳过] MinIO 已存在"
}

# 清理临时解压目录
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

# ── Step 5: 复制 EXE 安装包专用资源 ─────────────────────────────────────────
Write-Host ""
Write-Host "[5/7] 复制 EXE 安装包专用资源..."

# 同步便携运行脚本（避免 -SkipAppBuild 时沿用旧版 dist-win 脚本）
$portableRuntimeFiles = @(
    "start.bat",
    "Caddyfile",
    "update.ps1",
    "setup-dependencies.ps1",
    "deps-manifest.json",
    "README_PORTABLE.md"
)
foreach ($file in $portableRuntimeFiles) {
    $src = Join-Path $ProjectRoot "portable\$file"
    if (Test-Path $src) {
        Copy-Item $src $StagingDir -Force
        Write-Host "  [复制] $file"
    } else {
        Write-Warning "  文件未找到: $src"
    }
}

# 同步 MariaDB 配置（防止旧 dist-win 内 my.ini 与当前版本不一致）
$myIniSrc  = Join-Path $ProjectRoot "portable\db\my.ini"
$myIniDest = Join-Path $StagingDir "portable_db\my.ini"
if (Test-Path $myIniSrc) {
    Copy-Item $myIniSrc $myIniDest -Force
    Write-Host "  [复制] portable_db\my.ini"
} else {
    Write-Warning "  my.ini 未找到: $myIniSrc"
}

# start-silent.vbs（无黑窗 VBScript 启动器）
$vbsSrc = Join-Path $AssetsDir "start-silent.vbs"
if (Test-Path $vbsSrc) {
    Copy-Item $vbsSrc $StagingDir -Force
    Write-Host "  [复制] start-silent.vbs"
} else {
    Write-Warning "  start-silent.vbs 未找到: $vbsSrc"
}

# uninstall-helper.bat（由 NSIS 卸载/升级前调用）
$uninstSrc = Join-Path $AssetsDir "uninstall-helper.bat"
if (Test-Path $uninstSrc) {
    Copy-Item $uninstSrc $StagingDir -Force
    Write-Host "  [复制] uninstall-helper.bat"
} else {
    Write-Warning "  uninstall-helper.bat 未找到: $uninstSrc"
}

# logo.ico（安装程序与快捷方式图标）
$resourcesDir = Join-Path $StagingDir "resources"
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null
$icoSrc = Join-Path $ProjectRoot "public\logo.ico"
if (Test-Path $icoSrc) {
    Copy-Item $icoSrc $resourcesDir -Force
    Write-Host "  [复制] resources\logo.ico"
} else {
    Write-Warning "  logo.ico 未找到: $icoSrc（NSIS 将使用默认图标）"
}

# ── Step 6: 调用 NSIS 编译 ────────────────────────────────────────────────────
Write-Host ""
Write-Host "[6/7] 调用 makensis 编译安装包（LZMA 固实压缩，预计 15-35 分钟）..."
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$nsiScript  = Join-Path $ProjectRoot "portable\waoowaoo-installer.nsi"
$buildStart = Get-Date

Push-Location $ProjectRoot
try {
    & $makensisPath /V2 "/INPUTCHARSET" "UTF8" "/DDISABLE_CUSTOM_ICON=1" "/DVERSION=$Version" "/DDIST_WIN=$StagingDir" "/DOUTPUT_DIR=$OutputDir" $nsiScript
    $nsisExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($nsisExitCode -ne 0) {
    throw "makensis 编译失败（退出码 $nsisExitCode），请查看上方错误信息。"
}

$elapsed = (Get-Date) - $buildStart
Write-Host "  编译完成，耗时 $([math]::Round($elapsed.TotalMinutes, 1)) 分钟"

# ── Step 7: 输出结果 ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[7/7] 完成"

$exePath = Join-Path $OutputDir "waoowaoo-setup-v$Version-windows.exe"
if (Test-Path $exePath) {
    $sizeMB = '{0:N1}' -f ((Get-Item $exePath).Length / 1MB)
    Write-Host ""
    Write-Host "======================================================"
    Write-Host "  ✅  安装包构建成功！"
    Write-Host "  EXE : $exePath"
    Write-Host "  大小: $sizeMB MB"
    Write-Host ""
    Write-Host "  用户双击 .exe 即可一键安装（完全离线）"
    Write-Host "======================================================"
} else {
    Write-Warning "安装包文件未找到于预期路径，请检查 NSIS 输出配置。"
}
