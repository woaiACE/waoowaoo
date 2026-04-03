# setup-dependencies.ps1 — waoowaoo Portable 便携依赖自动下载
#
# 检查并自动下载缺失的便携版运行时依赖：
#   - Node.js v20 LTS (Windows x64)
#   - Redis for Windows (redis-windows/redis-windows, Redis 7.x LTS)
#   - MariaDB 10.11 LTS (Windows x64)
#   - MinIO (Windows 单文件二进制)
#   - Caddy (Windows x64，优先离线缓存，否则从官网获取最新版本)
#
# 由 start.bat 在每次启动时自动调用。
# 若依赖已存在则秒速跳过，不重复下载；若缺失则自动下载并就位。
#
# 如需升级依赖版本，仅需修改下方"版本配置"中的版本号与下载 URL。

param(
    [string]$InstallDir = (Split-Path -Parent $MyInvocation.MyCommand.Path),
    [int]$TimeoutSec = 600
)

$ErrorActionPreference = "Stop"

# TLS 1.2：Windows 10/11 的 PowerShell 5.1 默认可能协商 TLS 1.0/1.1，
# 而 GitHub、nodejs.org 等服务器要求 TLS 1.2+，强制指定以避免下载失败。
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── 依赖版本配置（单一数据源策略）────────────────────────────────────────────────
# 优先从随包分发的 deps-manifest.json 读取，使版本升级只需改一个文件。
# 若文件不存在（如仅从源码仓库直接调用且未构建），则回落到下方的硬编码默认值。
$_manifestPath = Join-Path $InstallDir "deps-manifest.json"
if (-not (Test-Path $_manifestPath)) {
    # 兼容直接从源码仓库 portable/ 目录调用的情形
    $_manifestPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "deps-manifest.json"
}

$_manifestLoaded = $false
if (Test-Path $_manifestPath) {
    try {
        $_m             = Get-Content $_manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $NodeVersion    = $_m.node.version
        $RedisVersion   = $_m.redis.version
        $MariaDBVersion = $_m.mariadb.version
        $MinioVersion   = $_m.minio.version
        $CaddyVersion   = $_m.caddy.version
        $NodeUrl        = $_m.node.url
        $RedisUrl       = $_m.redis.url
        $MariaDBUrl     = $_m.mariadb.url
        $MinioUrl       = $_m.minio.url
        $CaddyUrl       = $_m.caddy.url
        $NodeSha256     = $_m.node.sha256
        $RedisSha256    = $_m.redis.sha256
        $MariaDBSha256  = $_m.mariadb.sha256
        $MinioSha256    = $_m.minio.sha256
        $CaddySha256    = $_m.caddy.sha256
        $RedisFilename  = $_m.redis.filename
        $_manifestLoaded = $true
        Write-Host "[Setup] 版本清单来源: $_manifestPath"
    } catch {
        Write-Warning "[Setup] deps-manifest.json 解析失败，使用内置默认值: $_"
    }
}

if (-not $_manifestLoaded) {
    # ── 硬编码后备（仅在 deps-manifest.json 不可用时使用）──────────────────────────
    Write-Host "[Setup] 未找到 deps-manifest.json，使用内置默认版本配置"
    $NodeVersion    = "20.18.1"
    $RedisVersion   = "7.4.2"
    $MariaDBVersion = "10.11.10"
    $MinioVersion   = "RELEASE.2025-09-07T16-13-09Z"
    $CaddyVersion   = "2.11.2"
    $NodeUrl    = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    $RedisUrl   = "https://github.com/redis-windows/redis-windows/releases/download/$RedisVersion/Redis-$RedisVersion-Windows-x64-msys2.zip"
    $MariaDBUrl = "https://archive.mariadb.org/mariadb-$MariaDBVersion/winx64-packages/mariadb-$MariaDBVersion-winx64.zip"
    $MinioUrl   = "https://dl.min.io/server/minio/release/windows-amd64/archive/minio.$MinioVersion"
    $CaddyUrl   = "https://github.com/caddyserver/caddy/releases/download/v$CaddyVersion/caddy_${CaddyVersion}_windows_amd64.zip"
    $NodeSha256    = ""
    $RedisSha256   = "65C8D2FF57572AFA3CF4634820D4CDB8921E82760B272AD1DD12F38308414A96"
    $MariaDBSha256 = ""
    $MinioSha256   = ""
    $CaddySha256   = "2902D2A278597E4983D70ED6D694FCAB36B29B0B7D109771C59D7DA7147AFAD8"
    $RedisFilename = "Redis-$RedisVersion-Windows-x64-msys2.zip"
}

# ── 离线依赖缓存目录（按优先级查找，命中则不走网络）──────────────────────────────
# 路径优先顺序：包内 deps-windows/ → LOCALAPPDATA 构建缓存 → 源码仓库旁缓存
$_lad = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $null }
$DepsCacheDirs = @(
    (Join-Path $InstallDir "deps-windows"),
    $(if ($_lad) { Join-Path $_lad "waoowaoo\build-cache\deps-windows" } else { $null }),
    (Join-Path $InstallDir "build-cache\deps-windows"),
    (Join-Path (Split-Path -Parent $InstallDir) "build-cache\deps-windows")
) | Where-Object { $_ }

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
function Get-HumanSize([long]$Bytes) {
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    return ('{0:N0} KB' -f ($Bytes / 1KB))
}

# 有效下载文件的最小体积阈值：小于此值说明下载的是 HTTP 错误页面而非真正的安装包
$script:MinDownloadBytes = 512KB

function Test-ValidDownload([string]$FilePath) {
    return (Test-Path $FilePath) -and ((Get-Item $FilePath).Length -gt $script:MinDownloadBytes)
}

function Find-OfflineDependencyFile {
    param(
        [string[]]$FileNames,
        [string]$Label
    )

    foreach ($dir in $DepsCacheDirs) {
        if (-not (Test-Path $dir)) { continue }
        foreach ($name in $FileNames) {
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            if ($name.Contains('*') -or $name.Contains('?')) {
                $matches = Get-ChildItem -Path $dir -Filter $name -File -ErrorAction SilentlyContinue |
                    Sort-Object LastWriteTime -Descending
                foreach ($match in $matches) {
                    if (Test-ValidDownload $match.FullName) {
                        Write-Host "  [离线缓存] $Label"
                        Write-Host "             $($match.FullName)"
                        return $match.FullName
                    }
                }
                continue
            }

            $candidate = Join-Path $dir $name
            if (Test-ValidDownload $candidate) {
                Write-Host "  [离线缓存] $Label"
                Write-Host "             $candidate"
                return $candidate
            }
        }
    }

    return $null
}

function Invoke-Download {
    # 下载文件，依次尝试：curl.exe（系统内置）→ System.Net.WebClient → Invoke-WebRequest
    # 每种方式最多重试 $MaxRetries 轮；每轮三种方式都失败才进入下一轮。
    param([string]$Url, [string]$Dest, [string]$Label, [int]$MaxRetries = 3)
    Write-Host "  [下载] $Label"
    Write-Host "         $Url"

    # 查找系统内置 curl.exe（Windows 10 1803 / Build 17134 起内置，速度最快）
    $curlCmd  = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    $curlPath = if ($curlCmd) { $curlCmd.Source } else { $null }

    $lastError = "未知错误"

    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        if ($attempt -gt 1) {
            Write-Host "  [重试] 第 $attempt/$MaxRetries 次（等待 5 秒）..."
            Start-Sleep -Seconds 5
        }
        if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }

        # ── 方式 1：curl.exe（速度最快，原生支持 TLS 1.2/1.3，支持断点重试）────
        if ($curlPath) {
            try {
                $curlOut = & $curlPath -L -s --show-error --fail -o $Dest $Url `
                    --retry 2 --retry-delay 3 --max-time $TimeoutSec 2>&1
                if ($LASTEXITCODE -eq 0 -and (Test-ValidDownload $Dest)) {
                    Write-Host "  [完成] $Label ($(Get-HumanSize (Get-Item $Dest).Length)) [curl]"
                    return
                }
                $lastError = if ($LASTEXITCODE -ne 0) { "curl 退出码 ${LASTEXITCODE}: $($curlOut -join ' ')" } else { "文件过小，URL 可能无效" }
            } catch { $lastError = "curl: $($_.Exception.Message)" }
            if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }
        }

        # ── 方式 2：System.Net.WebClient（流式写入，不占大量内存）────────────────
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", "waoowaoo-portable-setup/1.0")
            $wc.DownloadFile($Url, $Dest)
            if (Test-ValidDownload $Dest) {
                Write-Host "  [完成] $Label ($(Get-HumanSize (Get-Item $Dest).Length)) [WebClient]"
                return
            }
            $lastError = "文件过小，URL 可能无效 (WebClient)"
        } catch { $lastError = "WebClient: $($_.Exception.Message)" }
        if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }

        # ── 方式 3：Invoke-WebRequest（兼容性最好，但速度慢）────────────────────
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $Url -OutFile $Dest -TimeoutSec $TimeoutSec -ErrorAction Stop
            if (Test-ValidDownload $Dest) {
                Write-Host "  [完成] $Label ($(Get-HumanSize (Get-Item $Dest).Length)) [IWR]"
                return
            }
            $lastError = "文件过小，URL 可能无效 (IWR)"
        } catch { $lastError = "IWR: $($_.Exception.Message)" }
        if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }
    }

    throw "下载失败（已尝试 $MaxRetries 轮）: $lastError"
}

function Expand-ZipTo {
    param([string]$ZipPath, [string]$DestDir)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestDir)
}

function Test-ZipArchive {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) { return $false }
    $stream = [System.IO.File]::OpenRead($FilePath)
    try {
        if ($stream.Length -lt 2) { return $false }
        $first = $stream.ReadByte()
        $second = $stream.ReadByte()
        return ($first -eq 0x50 -and $second -eq 0x4B)
    } finally {
        $stream.Dispose()
    }
}

function Test-FileHash {
    # 当 $ExpectedHash 为空时直接跳过校验（允许在无官方校验和时继续运行）
    param([string]$FilePath, [string]$ExpectedHash, [string]$Label)
    if ([string]::IsNullOrWhiteSpace($ExpectedHash)) { return }
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash
    if ($actual -ne $ExpectedHash.ToUpper()) {
        throw "SHA256 校验失败 ($Label): 期望 $ExpectedHash，实际 $actual"
    }
    Write-Host "  [校验] $Label SHA256 ✓"
}

function Get-InnerDir([string]$ExtractDir) {
    # 处理带前缀子目录的 zip（如 node-v20.x-win-x64/）。
    # 仅当解压目录内只有一个子目录且无文件时才将其视为前缀目录。
    $items = Get-ChildItem -Path $ExtractDir
    $dirs  = $items | Where-Object { $_.PSIsContainer }
    $files = $items | Where-Object { -not $_.PSIsContainer }
    if ($dirs.Count -eq 1 -and $files.Count -eq 0) { return $dirs[0].FullName }
    return $null
}

function Find-FirstFileRecursive {
    param(
        [string]$RootDir,
        [string[]]$FileNames
    )

    foreach ($name in $FileNames) {
        $match = Get-ChildItem -Path $RootDir -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ieq $name } |
            Select-Object -First 1
        if ($match) {
            return $match.FullName
        }
    }

    return $null
}

# ── 临时目录（安装目录内，避免 %TEMP% 的宽松权限风险）────────────────────────
$tempDir = Join-Path $InstallDir ".setup_temp"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$anyDownloaded = $false
$failCount     = 0

# ══════════════════════════════════════════════════════════════════════════════
# Node.js v20 LTS
# ══════════════════════════════════════════════════════════════════════════════
try {
    $nodeDir = Join-Path $InstallDir "node"
    $nodeExe = Join-Path $nodeDir "node.exe"
    if (-not (Test-Path $nodeExe)) {
        Write-Host ""
        Write-Host "[Setup] Node.js 未找到，正在自动下载 v$NodeVersion ..."
        $zipDest = Join-Path $tempDir "node.zip"
        $nodeOffline = Find-OfflineDependencyFile -FileNames @("node-v$NodeVersion-win-x64.zip") -Label "Node.js v$NodeVersion"
        if ($nodeOffline) {
            Copy-Item $nodeOffline $zipDest -Force
        } else {
            Invoke-Download -Url $NodeUrl -Dest $zipDest -Label "Node.js v$NodeVersion"
        }
        Test-FileHash -FilePath $zipDest -ExpectedHash $NodeSha256 -Label "Node.js v$NodeVersion"
        Write-Host "  [解压] Node.js ..."
        $extDir = Join-Path $tempDir "node_ext"
        Expand-ZipTo -ZipPath $zipDest -DestDir $extDir
        New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
        $inner = Get-InnerDir $extDir
        $srcDir = if ($inner) { $inner } else { $extDir }
        Copy-Item "$srcDir\*" $nodeDir -Recurse -Force
        Write-Host "  [就绪] Node.js 已安装至 node\"
        $anyDownloaded = $true
    } else {
        Write-Host "[Setup] Node.js ✓ (已存在，跳过)"
    }
} catch {
    Write-Warning "[Setup] Node.js 安装失败: $_"
    $failCount++
}

# ══════════════════════════════════════════════════════════════════════════════
# Redis for Windows (redis-windows/redis-windows — Redis 7.x, BullMQ 5.x 要求 Redis 6.2+)
# ══════════════════════════════════════════════════════════════════════════════
try {
    $redisDir = Join-Path $InstallDir "portable_redis"
    $redisExe = Join-Path $redisDir "redis-server.exe"
    if (-not (Test-Path $redisExe)) {
        Write-Host ""
        Write-Host "[Setup] Redis 未找到，正在自动下载 v$RedisVersion ..."
        $zipDest = Join-Path $tempDir "redis.zip"
        # 搜索缓存目录中的 Redis 安装包
        $redisOffline = Find-OfflineDependencyFile -FileNames @($RedisFilename) -Label "Redis v$RedisVersion"
        if ($redisOffline) {
            Copy-Item $redisOffline $zipDest -Force
        } else {
            Invoke-Download -Url $RedisUrl -Dest $zipDest -Label "Redis v$RedisVersion"
        }
        Test-FileHash -FilePath $zipDest -ExpectedHash $RedisSha256 -Label "Redis v$RedisVersion"
        Write-Host "  [解压] Redis ..."
        $extDir = Join-Path $tempDir "redis_ext"
        Expand-ZipTo -ZipPath $zipDest -DestDir $extDir
        New-Item -ItemType Directory -Force -Path $redisDir | Out-Null
        $inner = Get-InnerDir $extDir
        $srcDir = if ($inner) { $inner } else { $extDir }
        Copy-Item "$srcDir\*" $redisDir -Recurse -Force
        # redis-windows 7.x 仅含 redis.conf；创建 redis.windows.conf 供兼容性使用
        $winConf   = Join-Path $redisDir "redis.windows.conf"
        $linuxConf = Join-Path $redisDir "redis.conf"
        if (-not (Test-Path $winConf) -and (Test-Path $linuxConf)) {
            Copy-Item $linuxConf $winConf -Force
            Write-Host "  [配置] 已从 redis.conf 创建 redis.windows.conf"
        }
        Write-Host "  [就绪] Redis 已安装至 portable_redis\"
        $anyDownloaded = $true
    } else {
        Write-Host "[Setup] Redis ✓ (已存在，跳过)"
    }
} catch {
    Write-Warning "[Setup] Redis 安装失败: $_"
    $failCount++
}

# ══════════════════════════════════════════════════════════════════════════════
# MariaDB 10.11 LTS
# ══════════════════════════════════════════════════════════════════════════════
try {
    $dbDir  = Join-Path $InstallDir "portable_db"
    $mysqld = Join-Path $dbDir "bin\mysqld.exe"
    if (-not (Test-Path $mysqld)) {
        Write-Host ""
        Write-Host "[Setup] MariaDB 未找到，正在自动下载 v$MariaDBVersion ..."
        $zipDest = Join-Path $tempDir "mariadb.zip"
        $mariaOffline = Find-OfflineDependencyFile -FileNames @("mariadb-$MariaDBVersion-winx64.zip") -Label "MariaDB $MariaDBVersion"
        if ($mariaOffline) {
            Copy-Item $mariaOffline $zipDest -Force
        } else {
            Invoke-Download -Url $MariaDBUrl -Dest $zipDest -Label "MariaDB $MariaDBVersion"
        }
        Test-FileHash -FilePath $zipDest -ExpectedHash $MariaDBSha256 -Label "MariaDB $MariaDBVersion"
        Write-Host "  [解压] MariaDB ..."
        $extDir = Join-Path $tempDir "mariadb_ext"
        Expand-ZipTo -ZipPath $zipDest -DestDir $extDir
        New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

        # 保存已有 my.ini（来自便携包构建产物），提取后恢复，避免被 MariaDB 默认配置覆盖
        # 注：db\my.ini 的路径与 build-portable.ps1 中的 "portable\db\my.ini" 同源，如需迁移请同步修改
        $myIniPath   = Join-Path $dbDir "my.ini"
        $myIniBytes  = if (Test-Path $myIniPath) { [System.IO.File]::ReadAllBytes($myIniPath) } else { $null }

        $inner = Get-InnerDir $extDir
        $srcDir = if ($inner) { $inner } else { $extDir }
        Copy-Item "$srcDir\*" $dbDir -Recurse -Force

        # 恢复或应用自定义 my.ini（优先级：构建包自带 > 源码仓库 db\my.ini > MariaDB 默认）
        if ($myIniBytes) {
            [System.IO.File]::WriteAllBytes($myIniPath, $myIniBytes)
            Write-Host "  [配置] 已恢复自定义 my.ini"
        } else {
            $myIniSrc = Join-Path $InstallDir "db\my.ini"
            if (Test-Path $myIniSrc) {
                Copy-Item $myIniSrc $myIniPath -Force
                Write-Host "  [配置] 已应用 db\my.ini 配置"
            }
        }

        Write-Host "  [就绪] MariaDB 已安装至 portable_db\"
        $anyDownloaded = $true
    } else {
        Write-Host "[Setup] MariaDB ✓ (已存在，跳过)"
    }
} catch {
    Write-Warning "[Setup] MariaDB 安装失败: $_"
    $failCount++
}

# ══════════════════════════════════════════════════════════════════════════════
# MinIO (Windows 固定版本二进制)
# ══════════════════════════════════════════════════════════════════════════════
try {
    $minioDir = Join-Path $InstallDir "portable_minio"
    $minioExe = Join-Path $minioDir "minio.exe"
    if (-not (Test-Path $minioExe)) {
        Write-Host ""
        Write-Host "[Setup] MinIO 未找到，正在自动下载 $MinioVersion ..."
        New-Item -ItemType Directory -Force -Path $minioDir | Out-Null
        $minioOffline = Find-OfflineDependencyFile -FileNames @(
            "minio.$MinioVersion",
            "minio.$MinioVersion.exe",
            "minio.exe"
        ) -Label "MinIO $MinioVersion"
        if ($minioOffline) {
            Copy-Item $minioOffline $minioExe -Force
        } else {
            Invoke-Download -Url $MinioUrl -Dest $minioExe -Label "MinIO $MinioVersion"
        }
        Test-FileHash -FilePath $minioExe -ExpectedHash $MinioSha256 -Label "MinIO $MinioVersion"
        Write-Host "  [就绪] MinIO 已安装至 portable_minio\"
        $anyDownloaded = $true
    } else {
        Write-Host "[Setup] MinIO ✓ (已存在，跳过)"
    }
} catch {
    Write-Warning "[Setup] MinIO 安装失败: $_"
    $failCount++
}

# ══════════════════════════════════════════════════════════════════════════════
# Caddy (Windows x64, latest official)
# ══════════════════════════════════════════════════════════════════════════════
try {
    $caddyDir = Join-Path $InstallDir "portable_caddy"
    $caddyExe = Join-Path $caddyDir "caddy.exe"
    if (-not (Test-Path $caddyExe)) {
        Write-Host ""
        Write-Host "[Setup] Caddy 未找到，正在准备官网最新版本 ..."
        New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null

        $caddyOffline = Find-OfflineDependencyFile -FileNames @(
            "caddy_${CaddyVersion}_windows_amd64.zip",
            "caddy*-windows-amd64.zip",
            "caddy*.zip",
            "caddy.exe"
        ) -Label "Caddy $CaddyVersion"

        $caddyDownload = Join-Path $tempDir "caddy_download.bin"
        if ($caddyOffline) {
            Copy-Item $caddyOffline $caddyDownload -Force
        } else {
            Invoke-Download -Url $CaddyUrl -Dest $caddyDownload -Label "Caddy $CaddyVersion"
        }

        Test-FileHash -FilePath $caddyDownload -ExpectedHash $CaddySha256 -Label "Caddy $CaddyVersion"

        if (Test-ZipArchive $caddyDownload) {
            Write-Host "  [解压] Caddy ..."
            $extDir = Join-Path $tempDir "caddy_ext"
            Expand-ZipTo -ZipPath $caddyDownload -DestDir $extDir
            $caddySource = Find-FirstFileRecursive -RootDir $extDir -FileNames @("caddy.exe")
            if (-not $caddySource) {
                throw "Caddy 压缩包中未找到 caddy.exe"
            }
            Copy-Item $caddySource $caddyExe -Force
        } else {
            Copy-Item $caddyDownload $caddyExe -Force
        }

        Write-Host "  [就绪] Caddy 已安装至 portable_caddy\"
        $anyDownloaded = $true
    } else {
        Write-Host "[Setup] Caddy ✓ (已存在，跳过)"
    }
} catch {
    Write-Warning "[Setup] Caddy 安装失败: $_"
    $failCount++
}

# ── 清理临时目录 ──────────────────────────────────────────────────────────────
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

if ($anyDownloaded) {
    Write-Host ""
    Write-Host "[Setup] 便携依赖准备完毕。"
}

if ($failCount -gt 0) {
    Write-Warning "[Setup] $failCount 个依赖安装失败。如后续启动报错，请参见 README_PORTABLE.md 手动放入依赖。"
}
exit $failCount
