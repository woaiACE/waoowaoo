#Requires -Version 5.1
<#
.SYNOPSIS
    waoowaoo 便携一键启动核心调度脚本
.DESCRIPTION
    按照 Phase 1~12 的时序，全自动完成绿色包下载、服务初始化、有序启停。
    所有用户数据 100% 隔离在 $env:LOCALAPPDATA\waoowaoo 目录下。
.PARAMETER RepoDir
    项目仓库根目录（由 start.bat 传入，或手动指定）
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$RepoDir = '',

    # 指定此开关可跳过 BUILD_ID / git commit 检查，强制重新执行 next build
    [switch]$ForceRebuild
)

# 若未传入 RepoDir，则以本脚本的父目录（项目根）作为默认值
if ($RepoDir -eq '') {
    $RepoDir = Split-Path -Path $PSScriptRoot -Parent
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================
# 全局常量定义
# ============================================================
$Script:AppName    = 'waoowaoo'
$Script:DataRoot   = Join-Path $env:LOCALAPPDATA $Script:AppName
$Script:EngineRoot = Join-Path $Script:DataRoot 'engines'
$Script:LogRoot    = Join-Path $Script:DataRoot 'logs'
$Script:RunRoot    = Join-Path $Script:DataRoot 'run'

# 各服务数据目录
$Script:MySqlDataDir  = Join-Path $Script:DataRoot 'mysql-data'
$Script:RedisDataDir  = Join-Path $Script:DataRoot 'redis-data'
$Script:MinioDataDir  = Join-Path $Script:DataRoot 'minio-data'
$Script:AppDataDir    = Join-Path $Script:DataRoot 'app-data'

# 各引擎安装目录
$Script:NodeDir   = Join-Path $Script:EngineRoot 'node'
$Script:MySqlDir  = Join-Path $Script:EngineRoot 'mysql'
$Script:RedisDir  = Join-Path $Script:EngineRoot 'redis'
$Script:MinioDir  = Join-Path $Script:EngineRoot 'minio'

# 关键可执行文件路径
$Script:NodeExe    = Join-Path $Script:NodeDir  'node.exe'
$Script:NpmCmd     = Join-Path $Script:NodeDir  'npm.cmd'
$Script:NpxCmd     = Join-Path $Script:NodeDir  'npx.cmd'
$Script:MySqldExe  = Join-Path $Script:MySqlDir 'bin\mysqld.exe'
$Script:MySqlCli   = Join-Path $Script:MySqlDir 'bin\mysql.exe'
$Script:MySqlAdmin = Join-Path $Script:MySqlDir 'bin\mysqladmin.exe'
$Script:RedisExe   = Join-Path $Script:RedisDir 'redis-server.exe'
$Script:RedisCli   = Join-Path $Script:RedisDir 'redis-cli.exe'
$Script:MinioExe   = Join-Path $Script:MinioDir 'minio.exe'

# 运行时配置文件
$Script:MySqlIni    = Join-Path $Script:MySqlDir  'my.ini'
$Script:RedisConf   = Join-Path $Script:RedisDir  'redis.conf'

# 端口配置（与 docker-compose.yml 保持一致）
$Script:PortMySql    = 13306
$Script:PortRedis    = 16379
$Script:PortMinioApi = 19000
$Script:PortApp      = 13000

# 进程 PID 记录文件
$Script:PidMySql  = Join-Path $Script:RunRoot 'mysql.pid'
$Script:PidRedis  = Join-Path $Script:RunRoot 'redis.pid'
$Script:PidMinio  = Join-Path $Script:RunRoot 'minio.pid'
$Script:PidApp    = Join-Path $Script:RunRoot 'app.pid'

# --------------------------------------------------------
# 软件版本与下载地址（固定版本，确保 SHA256 可验证）
# --------------------------------------------------------
$Script:NodeVersion     = '20.19.1'
$Script:NodeUrl         = "https://nodejs.org/dist/v$($Script:NodeVersion)/node-v$($Script:NodeVersion)-win-x64.zip"
$Script:NodeSha256      = 'ce04b36022aacc2cf50a8cd0ea2070156710f12f5ea070ccd48705ab090389d2'

# MariaDB 11.4 LTS ZIP Archive（免安装器，免 Oracle EULA）
# 使用官方存档镜像直链，而非 REST API 端点
$Script:MariaDbVersion  = '11.4.5'
$Script:MariaDbUrl      = "https://archive.mariadb.org/mariadb-$($Script:MariaDbVersion)/winx64-packages/mariadb-$($Script:MariaDbVersion)-winx64.zip"
$Script:MariaDbSha256   = ''   # 空字符串表示跳过 SHA256 校验（仅 Node.js 强制校验）

# redis-windows 8.6.2 MSYS2 构建（官方社区 Windows 移植，活跃维护）
$Script:RedisVersion    = '8.6.2'
$Script:RedisUrl        = "https://github.com/redis-windows/redis-windows/releases/download/$($Script:RedisVersion)/Redis-$($Script:RedisVersion)-Windows-x64-msys2.zip"
$Script:RedisSha256     = 'c2bcaa8ce0f4b942f749c491327dcf126a98169e0bde59013251e179d6f86b8b'

# AIStor 商业版 Windows 单一可执行文件（MinIO 企业版，S3 API 完全兼容）
# 需在 .env 中配置 MINIO_SUBNET_LICENSE 以激活商业许可
$Script:MinioUrl        = 'https://dl.min.io/aistor/minio/release/windows-amd64/minio.exe'
$Script:MinioSha256     = ''   # 跟随最新版，跳过哈希校验

# MySQL 密码与数据库名（与 docker-compose.yml 保持一致）
$Script:DbRootPassword = 'waoowaoo123'
$Script:DbName         = 'waoowaoo'

# ============================================================
# 工具函数
# ============================================================

function Write-Step {
    <#
    .SYNOPSIS 输出带阶段标签的彩色进度信息#>
    param(
        [Parameter(Mandatory)]
        [string]$Phase,
        [Parameter(Mandatory)]
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "  [$Phase] " -ForegroundColor $Color -NoNewline
    Write-Host $Message -ForegroundColor White
}

function Write-Banner {
    param([string]$Text)
    $line = '=' * 60
    Write-Host ''
    Write-Host $line -ForegroundColor DarkCyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor DarkCyan
    Write-Host ''
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}

function Test-PortOpen {
    <#
    .SYNOPSIS 检测本地指定端口是否已有进程监听#>
    param(
        [Parameter(Mandatory)]
        [int]$Port,
        [string]$HostAddress = '127.0.0.1'
    )
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connectResult = $tcpClient.BeginConnect($HostAddress, $Port, $null, $null)
        $waitResult = $connectResult.AsyncWaitHandle.WaitOne(1000)
        if ($waitResult) {
            $tcpClient.EndConnect($connectResult)
            $tcpClient.Close()
            return $true
        }
        $tcpClient.Close()
        return $false
    }
    catch {
        return $false
    }
}

function Wait-ForPort {
    <#
    .SYNOPSIS 轮询等待指定端口就绪，超时后抛出异常#>
    param(
        [Parameter(Mandatory)]
        [int]$Port,
        [Parameter(Mandatory)]
        [string]$ServiceName,
        [int]$TimeoutSeconds = 60,
        [int]$IntervalMs = 1000
    )
    $elapsed = 0
    Write-Host "  [等待] $ServiceName 端口 $Port 就绪..." -ForegroundColor DarkYellow -NoNewline
    while ($elapsed -lt ($TimeoutSeconds * 1000)) {
        if (Test-PortOpen -Port $Port) {
            Write-Host ' 就绪！' -ForegroundColor Green
            return
        }
        Start-Sleep -Milliseconds $IntervalMs
        $elapsed += $IntervalMs
        Write-Host '.' -ForegroundColor DarkYellow -NoNewline
    }
    Write-Host ' 超时！' -ForegroundColor Red
    throw "错误：$ServiceName 在 ${TimeoutSeconds}s 内未就绪，端口 $Port 无响应。"
}

function Get-FileHashValue {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )
    return (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()
}

function Invoke-SafeDownload {
    <#
    .SYNOPSIS 带进度显示的文件下载，下载后可选校验 SHA256#>
    param(
        [Parameter(Mandatory)]
        [string]$Url,
        [Parameter(Mandatory)]
        [string]$Destination,
        [string]$ExpectedSha256 = '',
        [string]$Label = '文件'
    )
    Write-Step -Phase '下载' -Message "正在下载 $Label ..."
    Write-Host "      来源: $Url" -ForegroundColor DarkGray

    # 强制 TLS 1.2（PowerShell 5.1 默认 TLS 1.0，GitHub/MinIO 等现代站点要求 TLS 1.2+）
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # 使用 HTTPS 下载，禁用进度条（大幅提升 Invoke-WebRequest 速度）
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    catch {
        throw "下载失败 ($Label): $_"
    }
    finally {
        $ProgressPreference = 'Continue'
    }

    Write-Success "下载完成：$Destination"

    # SHA256 校验（仅当提供了期望值时执行）
    if ($ExpectedSha256 -and $ExpectedSha256 -ne '') {
        Write-Step -Phase '校验' -Message "校验 SHA256 完整性..."
        $actual = Get-FileHashValue -FilePath $Destination
        if ($actual -ne $ExpectedSha256.ToLower()) {
            Remove-Item -Path $Destination -Force
            throw "SHA256 校验失败！\n期望: $ExpectedSha256\n实际: $actual\n文件已删除，请重试。"
        }
        Write-Success 'SHA256 校验通过'
    }
}

function Expand-ZipTo {
    <#
    .SYNOPSIS 将 ZIP 解压到目标目录，首层子目录透明展平#>
    param(
        [Parameter(Mandatory)]
        [string]$ZipPath,
        [Parameter(Mandatory)]
        [string]$TargetDir,
        [switch]$FlattenTopLevel
    )
    $tempExtract = "$TargetDir`_tmp_extract"
    if (Test-Path $tempExtract) {
        Remove-Item -Path $tempExtract -Recurse -Force
    }

    Write-Step -Phase '解压' -Message "正在解压..."
    $ProgressPreference = 'SilentlyContinue'
    Expand-Archive -Path $ZipPath -DestinationPath $tempExtract -Force
    $ProgressPreference = 'Continue'

    if ($FlattenTopLevel) {
        # ZIP 内往往有单层目录（如 node-v20.x-win-x64\），将其内容移到目标
        # 注意：@() 强制数组化，避免 Set-StrictMode 下单元素返回时 .Count 不可用
        $topLevelItems = @(Get-ChildItem -Path $tempExtract)
        if ($topLevelItems.Count -eq 1 -and $topLevelItems[0].PSIsContainer) {
            $innerDir = $topLevelItems[0].FullName
            if (Test-Path $TargetDir) {
                Remove-Item -Path $TargetDir -Recurse -Force
            }
            Move-Item -Path $innerDir -Destination $TargetDir
        }
        else {
            if (Test-Path $TargetDir) {
                Remove-Item -Path $TargetDir -Recurse -Force
            }
            Move-Item -Path $tempExtract -Destination $TargetDir
        }
    }
    else {
        if (Test-Path $TargetDir) {
            Remove-Item -Path $TargetDir -Recurse -Force
        }
        Move-Item -Path $tempExtract -Destination $TargetDir
    }

    if (Test-Path $tempExtract) {
        Remove-Item -Path $tempExtract -Recurse -Force
    }
    Write-Success "解压完成：$TargetDir"
}

function New-DirectoryJunction {
    <#
    .SYNOPSIS 创建 Windows 目录联接（mklink /J），使项目目录内的路径透明指向数据目录#>
    param(
        [Parameter(Mandatory)]
        [string]$LinkPath,
        [Parameter(Mandatory)]
        [string]$TargetPath
    )
    # 确保目标目录存在
    if (-not (Test-Path $TargetPath)) {
        New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
    }

    # 若链接已存在且是联接，跳过
    if (Test-Path $LinkPath) {
        $item = Get-Item -Path $LinkPath -Force
        if ($item.LinkType -eq 'Junction') {
            return  # 已是联接，无需重建
        }
        # 若是普通目录（如 git pull 带来的空目录），移除后重建
        Remove-Item -Path $LinkPath -Recurse -Force
    }

    $result = & cmd.exe /c "mklink /J `"$LinkPath`" `"$TargetPath`"" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "创建目录联接失败：$LinkPath -> $TargetPath`n$result"
    }
    Write-Success "目录联接已建立：$LinkPath -> $TargetPath"
}

function Stop-ProcessByPidFile {
    <#
    .SYNOPSIS 读取 PID 文件并安全终止对应进程#>
    param(
        [Parameter(Mandatory)]
        [string]$PidFilePath,
        [string]$ServiceName = '进程'
    )
    if (-not (Test-Path $PidFilePath)) { return }

    $pidValue = Get-Content -Path $PidFilePath -ErrorAction SilentlyContinue
    if (-not $pidValue) { return }

    try {
        $processId = [int]$pidValue.Trim()
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            $process.Kill()
            $process.WaitForExit(5000) | Out-Null
            Write-Success "已停止 $ServiceName (PID: $processId)"
        }
    }
    catch {
        Write-Warn "停止 $ServiceName 时出现异常：$_"
    }
    finally {
        Remove-Item -Path $PidFilePath -Force -ErrorAction SilentlyContinue
    }
}

function Save-PidFile {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId,
        [Parameter(Mandatory)]
        [string]$PidFilePath
    )
    Set-Content -Path $PidFilePath -Value $ProcessId -Encoding ASCII -Force
}

# ============================================================
# PHASE 1: 环境探测与目录结构准备
# ============================================================
function Invoke-Phase1-EnvironmentCheck {
    Write-Banner 'Phase 1: 环境探测'

    # 检测 Windows 版本（需要 Win 10 1607+ 以支持长路径，Win 11 优先）
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -lt 10) {
        throw '此方案需要 Windows 10 或更高版本 (build 1607+)。'
    }
    Write-Success "操作系统版本：$($osVersion.ToString())"

    # 检测 PowerShell 版本
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw '需要 PowerShell 5.1 或更高版本。'
    }
    Write-Success "PowerShell 版本：$($PSVersionTable.PSVersion)"

    # 检测架构（仅支持 x64）
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw "不支持的处理器架构：$env:PROCESSOR_ARCHITECTURE。需要 x64 架构。"
    }
    Write-Success "处理器架构：x64"

    # 尝试启用长路径支持（需管理员权限，失败时仅告警不中断）
    try {
        $regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
        Set-ItemProperty -Path $regPath -Name 'LongPathsEnabled' -Value 1 -ErrorAction Stop
        Write-Success '长路径支持已启用'
    }
    catch {
        Write-Warn '无法启用长路径支持（可能需要管理员权限），将继续尝试启动。'
    }

    # 创建所有必要目录
    $dirsToCreate = @(
        $Script:DataRoot,
        $Script:EngineRoot,
        $Script:LogRoot,
        $Script:RunRoot,
        $Script:MySqlDataDir,
        $Script:RedisDataDir,
        $Script:MinioDataDir,
        $Script:AppDataDir,
        (Join-Path $Script:AppDataDir 'uploads'),
        $Script:NodeDir,
        $Script:MySqlDir,
        $Script:RedisDir,
        $Script:MinioDir
    )

    foreach ($dir in $dirsToCreate) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    Write-Success "数据目录已就绪：$Script:DataRoot"
    Write-Success "引擎目录已就绪：$Script:EngineRoot"
}

# ============================================================
# PHASE 2 & 3: 绿色包完整性检查与按需下载
# ============================================================
function Invoke-Phase2And3-DownloadEngines {
    Write-Banner 'Phase 2-3: 绿色依赖包检查与下载'

    $tempDir = Join-Path $env:TEMP "waoowaoo-downloads"
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }

    # ── Node.js ──────────────────────────────────────────────
    if (-not (Test-Path $Script:NodeExe)) {
        Write-Step -Phase '检查' -Message "Node.js 未找到，准备下载..."
        $nodeZip = Join-Path $tempDir "node-v$($Script:NodeVersion)-win-x64.zip"

        if (-not (Test-Path $nodeZip)) {
            Invoke-SafeDownload `
                -Url $Script:NodeUrl `
                -Destination $nodeZip `
                -ExpectedSha256 $Script:NodeSha256 `
                -Label "Node.js v$Script:NodeVersion"
        }

        Expand-ZipTo -ZipPath $nodeZip -TargetDir $Script:NodeDir -FlattenTopLevel
        Remove-Item -Path $nodeZip -Force -ErrorAction SilentlyContinue
    }
    else {
        $nodeVersion = & $Script:NodeExe --version 2>&1
        Write-Success "Node.js 已就绪：$nodeVersion"
    }

    # ── MariaDB ──────────────────────────────────────────────
    if (-not (Test-Path $Script:MySqldExe)) {
        Write-Step -Phase '检查' -Message "MariaDB 未找到，准备下载..."

        $mariaDbZipName = "mariadb-$($Script:MariaDbVersion)-winx64.zip"
        $mariaDbZip = Join-Path $tempDir $mariaDbZipName
        # 支持用户预先将 ZIP 放入 engines\mysql 目录（离线部署）
        $mariaDbZipPreplaced = Join-Path $Script:MySqlDir $mariaDbZipName

        if (Test-Path $mariaDbZipPreplaced) {
            Write-Success "检测到预置 MariaDB ZIP：$mariaDbZipPreplaced，跳过下载。"
            $mariaDbZip = $mariaDbZipPreplaced
        }
        elseif (-not (Test-Path $mariaDbZip)) {
            Write-Warn "MariaDB ZIP 约 180MB，首次下载需要几分钟，请耐心等待..."
            Invoke-SafeDownload `
                -Url $Script:MariaDbUrl `
                -Destination $mariaDbZip `
                -ExpectedSha256 $Script:MariaDbSha256 `
                -Label "MariaDB $Script:MariaDbVersion"
        }

        Expand-ZipTo -ZipPath $mariaDbZip -TargetDir $Script:MySqlDir -FlattenTopLevel
        # 若使用的是预置文件，解压后不删除，方便重复使用
        if ($mariaDbZip -ne $mariaDbZipPreplaced) {
            Remove-Item -Path $mariaDbZip -Force -ErrorAction SilentlyContinue
        }
    }
    else {
        Write-Success "MariaDB 已就绪：$Script:MySqldExe"
    }

    # ── Redis (redis-windows) ──────────────────────────────────
    if (-not (Test-Path $Script:RedisExe)) {
        Write-Step -Phase '检查' -Message "Redis 未找到，准备下载..."
        $redisZip = Join-Path $tempDir "Redis-$($Script:RedisVersion)-Windows-x64-msys2.zip"

        if (-not (Test-Path $redisZip)) {
            Invoke-SafeDownload `
                -Url $Script:RedisUrl `
                -Destination $redisZip `
                -ExpectedSha256 $Script:RedisSha256 `
                -Label "Redis Windows $Script:RedisVersion"
        }

        Expand-ZipTo -ZipPath $redisZip -TargetDir $Script:RedisDir -FlattenTopLevel
        Remove-Item -Path $redisZip -Force -ErrorAction SilentlyContinue
    }
    else {
        Write-Success "Redis 已就绪：$Script:RedisExe"
    }

    # ── MinIO ─────────────────────────────────────────────────
    if (-not (Test-Path $Script:MinioExe)) {
        Write-Step -Phase '检查' -Message "MinIO 未找到，准备下载..."
        Invoke-SafeDownload `
            -Url $Script:MinioUrl `
            -Destination $Script:MinioExe `
            -ExpectedSha256 $Script:MinioSha256 `
            -Label 'MinIO Server'
    }
    else {
        Write-Success "MinIO 已就绪：$Script:MinioExe"
    }

    # 清理临时下载目录（若为空）
    try {
        $remaining = Get-ChildItem -Path $tempDir -ErrorAction SilentlyContinue
        if ($null -eq $remaining -or $remaining.Count -eq 0) {
            Remove-Item -Path $tempDir -Force -ErrorAction SilentlyContinue
        }
    }
    catch { <# 忽略清理错误 #> }
}

# ============================================================
# PHASE 4: MySQL 首次初始化（仅当 mysql-data 为空时执行）
# ============================================================
function Invoke-Phase4-MySqlInit {
    Write-Banner 'Phase 4: MySQL 数据库初始化检测'

    $ibdata    = Join-Path $Script:MySqlDataDir 'ibdata1'
    $mysqlSys  = Join-Path $Script:MySqlDataDir 'mysql'

    if ((Test-Path $ibdata) -and (Test-Path $mysqlSys)) {
        Write-Success 'MySQL 数据目录已完整存在，跳过初始化。'
        return
    }

    # 若有残留的不完整初始化目录，先清理
    if (Test-Path $Script:MySqlDataDir) {
        Write-Step -Phase '清理' -Message "检测到不完整的数据目录，正在清理..."
        Remove-Item -Path $Script:MySqlDataDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Step -Phase '初始化' -Message "首次运行，正在初始化 MariaDB 数据目录（可能需要1分钟）..."

    # 生成 my.ini（使用已知路径，执行初始化时必须正确指向 datadir）
    Invoke-Phase5a-WriteMySqlIni

    # MariaDB 11.x 使用 mysql_install_db.exe（不支持 --initialize-insecure）
    # --password 直接设置 root@localhost 密码，--allow-remote-root-access 创建 root@'%'
    $installDbExe = Join-Path $Script:MySqlDir 'bin\mysql_install_db.exe'
    $initArgs = @(
        "--datadir=`"$Script:MySqlDataDir`"",
        "--password=`"$Script:DbRootPassword`"",
        '--allow-remote-root-access'
    )
    $initProcess = Start-Process `
        -FilePath $installDbExe `
        -ArgumentList $initArgs `
        -NoNewWindow `
        -PassThru `
        -Wait

    if ($initProcess.ExitCode -ne 0) {
        throw "MariaDB 初始化失败，退出代码：$($initProcess.ExitCode)"
    }

    if (-not (Test-Path $ibdata)) {
        throw 'MariaDB 初始化完成但 ibdata1 未找到，请检查日志。'
    }

    # 启动临时 mysqld 以创建应用数据库
    Write-Step -Phase '配置' -Message "启动临时 MariaDB 进程以创建数据库 $Script:DbName ..."
    $mysqldProcess = Start-Process `
        -FilePath $Script:MySqldExe `
        -ArgumentList "--defaults-file=`"$Script:MySqlIni`"" `
        -NoNewWindow `
        -PassThru

    # 等待 MySQL 端口就绪
    Wait-ForPort -Port $Script:PortMySql -ServiceName 'MariaDB(初始化)' -TimeoutSeconds 60

    # 创建应用数据库（密码已在 mysql_install_db 中设置）
    Write-Step -Phase '配置' -Message "创建数据库 $Script:DbName ..."
    $sqlCreateDb = "CREATE DATABASE IF NOT EXISTS ``$Script:DbName`` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    $sqlTempFile = Join-Path $env:TEMP 'waoowaoo-createdb.sql'
    Set-Content -Path $sqlTempFile -Value $sqlCreateDb -Encoding UTF8 -Force

    $mysqlArgs = @(
        "-h127.0.0.1",
        "-P$Script:PortMySql",
        '-uroot',
        "-p$Script:DbRootPassword",
        '--connect-timeout=10'
    )
    $createDbProcess = Start-Process `
        -FilePath $Script:MySqlCli `
        -ArgumentList $mysqlArgs `
        -NoNewWindow `
        -RedirectStandardInput $sqlTempFile `
        -PassThru `
        -Wait

    Remove-Item -Path $sqlTempFile -Force -ErrorAction SilentlyContinue

    if ($createDbProcess.ExitCode -ne 0) {
        throw "创建数据库失败，退出代码：$($createDbProcess.ExitCode)"
    }
    Write-Success "数据库 $Script:DbName 创建完成。"

    # 安全关闭临时 MySQL
    Write-Step -Phase '关闭' -Message "关闭临时 MariaDB 进程..."
    $shutdownArgs = @(
        "-h127.0.0.1",
        "-P$Script:PortMySql",
        "-uroot",
        "-p$Script:DbRootPassword",
        'shutdown'
    )
    Start-Process `
        -FilePath $Script:MySqlAdmin `
        -ArgumentList $shutdownArgs `
        -NoNewWindow `
        -Wait | Out-Null

    # 等待端口释放
    $waited = 0
    while ((Test-PortOpen -Port $Script:PortMySql) -and $waited -lt 30) {
        Start-Sleep -Seconds 1
        $waited++
    }

    if ($mysqldProcess -and -not $mysqldProcess.HasExited) {
        try { $mysqldProcess.Kill() } catch { <# 忽略 #> }
    }

    Write-Success 'MariaDB 首次初始化完成。'
}

# ============================================================
# PHASE 5a: 生成 my.ini（内部工具函数，供 Phase4 和 Phase5 调用）
# ============================================================
function Invoke-Phase5a-WriteMySqlIni {
    $mysqlLogFile = Join-Path $Script:LogRoot 'mysql-error.log'
    $iniContent = @"
[mysqld]
datadir=$($Script:MySqlDataDir.Replace('\', '/'))
port=$Script:PortMySql
sql_mode=STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log_error=$($mysqlLogFile.Replace('\', '/'))
pid_file=$($Script:PidMySql.Replace('\', '/'))
bind-address=127.0.0.1
max_connections=100
innodb_buffer_pool_size=128M

[client]
port=$Script:PortMySql
default-character-set=utf8mb4
"@
    Set-Content -Path $Script:MySqlIni -Value $iniContent -Encoding ASCII -Force
}

# ============================================================
# PHASE 5: 配置文件生成与路径重定向
# ============================================================
function Invoke-Phase5-ConfigAndLinks {
    Write-Banner 'Phase 5: 配置生成与路径重定向'

    # ── 生成 my.ini ─────────────────────────────────────────
    Invoke-Phase5a-WriteMySqlIni
    Write-Success "my.ini 已生成：$Script:MySqlIni"

    # ── 生成 redis.conf ──────────────────────────────────────
    $redisConf = @"
port $Script:PortRedis
bind 127.0.0.1
dir $($Script:RedisDataDir.Replace('\', '/'))
appendonly yes
appendfilename appendonly.aof
save 900 1
save 300 10
save 60 10000
loglevel notice
logfile $($Script:LogRoot.Replace('\', '/') + '/redis.log')
"@
    Set-Content -Path $Script:RedisConf -Value $redisConf -Encoding ASCII -Force
    Write-Success "redis.conf 已生成：$Script:RedisConf"

    # ── 生成/更新 .env ───────────────────────────────────────
    $envFile = Join-Path $RepoDir '.env'
    $envExample = Join-Path $RepoDir '.env.example'

    if (-not (Test-Path $envFile)) {
        Write-Step -Phase '配置' -Message "生成 .env 文件..."

        # 生成随机 NEXTAUTH_SECRET（32 字节十六进制，一次性，后续不重新生成）
        $secretBytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
        $nextAuthSecret = -join ($secretBytes | ForEach-Object { $_.ToString('x2') })

        $envContent = @"
# ============================================================
# waoowaoo 便携方案自动生成的 .env 配置
# 此文件已加入 .gitignore，git pull 不会覆盖。
# 如需修改 AI API 密钥等配置，请直接编辑此文件。
# ============================================================

# 数据库
DATABASE_URL="mysql://root:$($Script:DbRootPassword)@127.0.0.1:$($Script:PortMySql)/$($Script:DbName)"

# 存储（便携方案使用 MinIO 模式，确保与生产环境一致）
STORAGE_TYPE=minio
MINIO_ENDPOINT=http://127.0.0.1:$Script:PortMinioApi
MINIO_REGION=us-east-1
MINIO_BUCKET=waoowaoo
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_FORCE_PATH_STYLE=true
MINIO_SUBNET_LICENSE=

# 认证
NEXTAUTH_URL=http://localhost:$Script:PortApp
NEXTAUTH_SECRET=$nextAuthSecret

# 服务端内部自调用
INTERNAL_APP_URL=http://127.0.0.1:$Script:PortApp

# 内部密钥（可自行修改）
CRON_SECRET=waoowaoo-cron-$(New-Guid)-portable
INTERNAL_TASK_TOKEN=waoowaoo-task-$(New-Guid)-portable
API_ENCRYPTION_KEY=waoowaoo-opensource-fixed-key-2026

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=$Script:PortRedis
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_TLS=

# Worker 配置（单机场景可适当降低并发避免过热）
WATCHDOG_INTERVAL_MS=30000
TASK_HEARTBEAT_TIMEOUT_MS=90000
QUEUE_CONCURRENCY_IMAGE=10
QUEUE_CONCURRENCY_VIDEO=5
QUEUE_CONCURRENCY_VOICE=5
QUEUE_CONCURRENCY_TEXT=10

# Bull Board（本地访问，默认无密码）
BULL_BOARD_HOST=127.0.0.1
BULL_BOARD_PORT=3010
BULL_BOARD_BASE_PATH=/admin/queues
BULL_BOARD_USER=
BULL_BOARD_PASSWORD=

# 日志
LOG_UNIFIED_ENABLED=true
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_DEBUG_ENABLED=false
LOG_AUDIT_ENABLED=true
LOG_SERVICE=waoowaoo
LOG_REDACT_KEYS=password,token,apiKey,apikey,authorization,cookie,secret,access_token,refresh_token

# 计费（便携方案默认关闭）
BILLING_MODE=OFF

# 流式输出
LLM_STREAM_EPHEMERAL_ENABLED=true

# ========================================================
# 以下为 AI 服务 API 密钥，请根据需要填写
# ========================================================
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=...
# GOOGLE_API_KEY=...
"@
        Set-Content -Path $envFile -Value $envContent -Encoding UTF8 -Force
        Write-Success ".env 文件已生成：$envFile"
    }
    else {
        Write-Success '.env 文件已存在，跳过生成（保留用户已有配置）。'
    }

    # ── 目录联接（mklink /J）重定向 ─────────────────────────
    Write-Step -Phase '路径' -Message "建立目录联接（物理数据隔离）..."

    # data\ → %LOCALAPPDATA%\waoowaoo\app-data
    $dataLink = Join-Path $RepoDir 'data'
    New-DirectoryJunction -LinkPath $dataLink -TargetPath $Script:AppDataDir

    # docker-logs\ → %LOCALAPPDATA%\waoowaoo\logs
    $logsLink = Join-Path $RepoDir 'docker-logs'
    New-DirectoryJunction -LinkPath $logsLink -TargetPath $Script:LogRoot

    # logs\ → %LOCALAPPDATA%\waoowaoo\logs
    # file-writer.ts 将 worker 日志写到 process.cwd()/logs/，此 junction 将其重定向到 LogRoot
    $logsLink2 = Join-Path $RepoDir 'logs'
    New-DirectoryJunction -LinkPath $logsLink2 -TargetPath $Script:LogRoot

    Write-Success '路径重定向配置完成。'
}

# ============================================================
# PHASE 6: npm install（仅首次或 node_modules 缺失时）
# ============================================================
function Invoke-Phase6-NpmInstall {
    Write-Banner 'Phase 6: Node.js 依赖安装检查'

    $nodeModules   = Join-Path $RepoDir 'node_modules'
    # npm 只有在 install 完全成功后才写 .package-lock.json，用此文件作安装成功标记
    $installMarker = Join-Path $nodeModules '.package-lock.json'

    if ((Test-Path $nodeModules) -and (Test-Path $installMarker)) {
        Write-Success 'node_modules 已存在（安装完整），跳过安装。'
        return
    }

    # 如果 node_modules 存在但缺少成功标记 → 上次安装中途失败，需清理后重装
    if ((Test-Path $nodeModules) -and -not (Test-Path $installMarker)) {
        Write-Warn 'node_modules 不完整（上次安装未成功），正在清理并重新安装...'
        Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Step -Phase '安装' -Message "正在安装 Node.js 依赖（首次安装含 Prisma generate，需要5-15分钟）..."
    Write-Warn "请勿关闭窗口，此步骤包含 Prisma 引擎下载，进度慢属正常现象。"

    # 将便携 node\node_modules\.bin 加入 PATH 以支持 npx
    $env:PATH = "$Script:NodeDir;$($env:PATH)"

    # ── 网络优化：走淘宝 CDN 镜像，规避国内网络 ECONNRESET ──
    $env:npm_config_registry   = 'https://registry.npmmirror.com'
    $env:PRISMA_ENGINES_MIRROR = 'https://registry.npmmirror.com/-/binary/prisma'

    $maxRetries    = 3
    $retryDelaySec = 30

    Push-Location $RepoDir
    try {
        for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
            if ($attempt -gt 1) {
                Write-Step -Phase "安装 $attempt/$maxRetries" -Message "重试 npm install..."
            }

            $npmProcess = Start-Process `
                -FilePath $Script:NpmCmd `
                -ArgumentList 'install', '--no-audit', '--prefer-offline' `
                -NoNewWindow `
                -PassThru `
                -Wait `
                -WorkingDirectory $RepoDir

            if ($npmProcess.ExitCode -eq 0) {
                break
            }

            if ($attempt -lt $maxRetries) {
                Write-Warn "npm install 第 $attempt 次失败，清理残留并在 ${retryDelaySec} 秒后重试..."
                # 清理不完整的 node_modules，保证下次安装从干净状态开始
                if (Test-Path $nodeModules) {
                    Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
                }
                Start-Sleep -Seconds $retryDelaySec
                $retryDelaySec = [int]($retryDelaySec * 1.5)   # 指数退避
            } else {
                throw "npm install 失败，退出代码：$($npmProcess.ExitCode)"
            }
        }
    }
    finally {
        Pop-Location
    }

    Write-Success 'npm install 完成（包含 prisma generate）。'
}

# ============================================================
# PHASE 7: 有序启动基础服务
# ============================================================
function Invoke-Phase7-StartServices {
    Write-Banner 'Phase 7: 启动基础服务'

    # 将便携 node 加入当前进程 PATH
    $env:PATH = "$Script:NodeDir;$($env:PATH)"

    # ── 启动 MySQL ───────────────────────────────────────────
    if (Test-PortOpen -Port $Script:PortMySql) {
        Write-Success "MySQL 端口 $Script:PortMySql 已在监听，跳过启动。"
    }
    else {
        Write-Step -Phase '启动' -Message "启动 MySQL..."
        $mysqlArgs = "--defaults-file=`"$Script:MySqlIni`""
        $mysqlProcess = Start-Process `
            -FilePath $Script:MySqldExe `
            -ArgumentList $mysqlArgs `
            -WindowStyle Hidden `
            -PassThru

        Save-PidFile -ProcessId $mysqlProcess.Id -PidFilePath $Script:PidMySql
        Wait-ForPort -Port $Script:PortMySql -ServiceName 'MySQL' -TimeoutSeconds 60
    }

    # ── 启动 Redis ───────────────────────────────────────────
    if (Test-PortOpen -Port $Script:PortRedis) {
        Write-Success "Redis 端口 $Script:PortRedis 已在监听，跳过启动。"
    }
    else {
        Write-Step -Phase '启动' -Message "启动 Redis..."
        # MSYS2 构建：-RedirectStandardOutput 与 MSYS2 管道机制冲突会导致进程立即退出
        # 改用 redis.conf 中已配置的 logfile 指令落盘，不做 PowerShell 级别重定向
        # -WindowStyle Hidden 同样不兼容 MSYS2，使用 -NoNewWindow
        $redisProcess = Start-Process `
            -FilePath $Script:RedisExe `
            -ArgumentList 'redis.conf' `
            -WorkingDirectory $Script:RedisDir `
            -NoNewWindow `
            -PassThru

        # 早期退出检测（配置有误时 Redis 会在 ~1s 内退出）
        Start-Sleep -Milliseconds 1500
        if ($redisProcess.HasExited) {
            $logContent = Get-Content (Join-Path $Script:LogRoot 'redis.log') -Tail 20 -ErrorAction SilentlyContinue
            throw "Redis 进程启动后立即退出（代码：$($redisProcess.ExitCode)）。日志：`n$logContent"
        }

        Save-PidFile -ProcessId $redisProcess.Id -PidFilePath $Script:PidRedis
        Wait-ForPort -Port $Script:PortRedis -ServiceName 'Redis' -TimeoutSeconds 30
    }

    # ── 启动 MinIO ───────────────────────────────────────────
    if (Test-PortOpen -Port $Script:PortMinioApi) {
        Write-Success "MinIO 端口 $Script:PortMinioApi 已在监听，跳过启动。"
    }
    else {
        Write-Step -Phase '启动' -Message "启动 MinIO..."
        $env:MINIO_ROOT_USER     = 'minioadmin'
        $env:MINIO_ROOT_PASSWORD = 'minioadmin'

        # 从 .env 读取 AIStor 许可证密钥（若未配置则跳过）
        $envFile = Join-Path $RepoDir '.env'
        if (Test-Path $envFile) {
            $licLine = Get-Content $envFile | Where-Object { $_ -match '^MINIO_SUBNET_LICENSE=(.+)$' } | Select-Object -First 1
            if ($licLine -match '^MINIO_SUBNET_LICENSE=(.+)$') {
                $env:MINIO_SUBNET_LICENSE = $Matches[1].Trim()
            }
        }

        $minioLogFile = Join-Path $Script:LogRoot 'minio.log'
        $minioErrLog  = Join-Path $Script:LogRoot 'minio-err.log'
        $minioArgs = "server `"$Script:MinioDataDir`" --address :$Script:PortMinioApi --console-address :9001"
        # 注意：-RedirectStandardOutput 与 -WindowStyle 不能同时使用，使用 -NoNewWindow 替代
        $minioProcess = Start-Process `
            -FilePath $Script:MinioExe `
            -ArgumentList $minioArgs `
            -NoNewWindow `
            -RedirectStandardOutput $minioLogFile `
            -RedirectStandardError  $minioErrLog `
            -PassThru

        Save-PidFile -ProcessId $minioProcess.Id -PidFilePath $Script:PidMinio
        Wait-ForPort -Port $Script:PortMinioApi -ServiceName 'MinIO' -TimeoutSeconds 30
    }

    Write-Success '所有基础服务已就绪。'
}

# ============================================================
# PHASE 8: Prisma DB Push（幂等 Schema 同步）
# ============================================================
function Invoke-Phase8-PrismaDbPush {
    Write-Banner 'Phase 8: 数据库 Schema 同步'

    Write-Step -Phase 'Prisma' -Message "执行 prisma db push（幂等操作，首次约需15秒）..."

    $env:PATH = "$Script:NodeDir;$($env:PATH)"

    Push-Location $RepoDir
    try {
        # 读取 .env 文件中的 DATABASE_URL 注入到当前进程环境
        $envFile = Join-Path $RepoDir '.env'
        if (Test-Path $envFile) {
            Get-Content $envFile | Where-Object { $_ -match '^\s*([^#\s][^=]*)=(.*)$' } | ForEach-Object {
                if ($_ -match '^\s*([^#\s][^=]*)=(.*)$') {
                    $varName  = $Matches[1].Trim()
                    $varValue = $Matches[2].Trim().Trim('"')
                    [System.Environment]::SetEnvironmentVariable($varName, $varValue, 'Process')
                }
            }
        }

        $prismaProcess = Start-Process `
            -FilePath $Script:NpxCmd `
            -ArgumentList 'prisma', 'db', 'push', '--skip-generate' `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -WorkingDirectory $RepoDir

        if ($prismaProcess.ExitCode -ne 0) {
            throw "prisma db push 失败，退出代码：$($prismaProcess.ExitCode)"
        }

        # 独立执行 prisma generate，确保 Prisma Client 与最新 schema 同步。
        # 注意：prisma db push --skip-generate 仅同步数据库结构但不重新生成客户端，
        # 若客户端未更新，新增字段在运行时会被 Prisma 当作未知字段拒绝。
        Write-Step -Phase 'Prisma' -Message "重新生成 Prisma Client（同步新字段定义）..."

        # EPERM 防护：生成前检查 DLL 是否被旧 Node 进程锁住，等待释放（最多 30s）
        $dllPath = Join-Path $RepoDir 'node_modules\.prisma\client\query_engine-windows.dll.node'
        if (Test-Path $dllPath) {
            $lockWaited = 0
            while ($lockWaited -lt 30) {
                try {
                    $fs = [System.IO.File]::Open($dllPath, 'Open', 'ReadWrite', 'None')
                    $fs.Close()
                    $fs.Dispose()
                    break  # 文件可写，跳出等待
                } catch {
                    Write-Step -Phase 'Prisma' -Message "DLL 被占用，等待释放（${lockWaited}s）..."
                    Start-Sleep -Seconds 2
                    $lockWaited += 2
                }
            }
            if ($lockWaited -ge 30) {
                Write-Warn "DLL 超时仍被占用，尝试终止残留 Node 进程..."
                Get-Process -Name 'node' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            }
        }

        $generateProcess = Start-Process `
            -FilePath $Script:NpxCmd `
            -ArgumentList 'prisma', 'generate' `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -WorkingDirectory $RepoDir

        if ($generateProcess.ExitCode -ne 0) {
            throw "prisma generate 失败，退出代码：$($generateProcess.ExitCode)"
        }
    }
    finally {
        Pop-Location
    }

    Write-Success 'Schema 同步完成。'
}

# ============================================================
# PHASE 9 (兼 Phase 6b): next build（首次或强制重建）
# ============================================================
function Invoke-Phase9a-NextBuild {
    Write-Banner 'Phase 9a: Next.js 应用构建'

    $nextDir       = Join-Path $RepoDir '.next'
    $buildIdFile   = Join-Path $nextDir 'BUILD_ID'
    $gitCommitFile = Join-Path $nextDir 'GIT_COMMIT'   # 构建时写入，用于跨启动检测代码变更

    # ── 获取当前 git HEAD commit hash ────────────────────────
    $currentCommit = ''
    try {
        $gitOutput = & git -C $RepoDir rev-parse HEAD 2>&1
        if ($LASTEXITCODE -eq 0) {
            $currentCommit = $gitOutput.Trim()
        }
    }
    catch { <# git 不可用，跳过 commit 比对 #> }

    # ── 是否需要重建 ─────────────────────────────────────────
    $needRebuild  = $false
    $rebuildReason = ''

    if ($ForceRebuild) {
        $needRebuild  = $true
        $rebuildReason = '--ForceRebuild 参数指定，强制重建'
    }
    elseif (-not (Test-Path $buildIdFile)) {
        $needRebuild  = $true
        $rebuildReason = '首次构建或 .next 目录已清除'
    }
    elseif ($currentCommit -ne '') {
        if (-not (Test-Path $gitCommitFile)) {
            # 旧版构建没有 GIT_COMMIT 文件 → 无法确认是否最新，保守重建
            $needRebuild  = $true
            $rebuildReason = '构建缺少 git 版本记录，保守重建以确保同步'
        }
        else {
            $lastCommit = (Get-Content $gitCommitFile -ErrorAction SilentlyContinue).Trim()
            if ($lastCommit -ne $currentCommit) {
                $needRebuild  = $true
                $rebuildReason = "git HEAD 已变更（上次: $($lastCommit.Substring(0,[Math]::Min(8,$lastCommit.Length)))... 当前: $($currentCommit.Substring(0,8))...）"
            }
        }
    }

    if (-not $needRebuild) {
        Write-Success ".next 生产构建与当前代码一致（git: $($currentCommit.Substring(0,8))...），跳过构建。"
        return
    }

    Write-Step -Phase '构建' -Message "触发原因：$rebuildReason"

    # 清除旧构建
    if (Test-Path $nextDir) {
        Write-Step -Phase '清理' -Message '正在清除旧 .next 目录...'
        Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
    }

    Write-Step -Phase '构建' -Message "开始 next build（首次约需5-10分钟，请耐心等待）..."
    Write-Warn "构建期间 CPU 占用较高属于正常现象。"

    $env:PATH = "$Script:NodeDir;$($env:PATH)"

    Push-Location $RepoDir
    try {
        $buildProcess = Start-Process `
            -FilePath $Script:NpmCmd `
            -ArgumentList 'run', 'build' `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -WorkingDirectory $RepoDir

        if ($buildProcess.ExitCode -ne 0) {
            throw "next build 失败，退出代码：$($buildProcess.ExitCode)。请查看上方错误信息。"
        }
    }
    finally {
        Pop-Location
    }

    # 构建成功后写入 git commit hash，供下次启动比对
    if ($currentCommit -ne '' -and (Test-Path $buildIdFile)) {
        Set-Content -Path $gitCommitFile -Value $currentCommit -Encoding ASCII -Force
        Write-Step -Phase '版本' -Message "已记录构建版本：$($currentCommit.Substring(0,8))..."
    }

    Write-Success 'Next.js 构建完成。'
}

# ============================================================
# PHASE 9b: 启动应用（npm run start）
# ============================================================
function Invoke-Phase9b-StartApp {
    Write-Banner 'Phase 9b: 启动 waoowaoo 应用'

    if (Test-PortOpen -Port $Script:PortApp) {
        Write-Success "应用端口 $Script:PortApp 已在监听，跳过启动。"
        return $null
    }

    Write-Step -Phase '启动' -Message "启动 Next.js + Worker + Watchdog + Bull Board..."

    $env:PATH = "$Script:NodeDir;$($env:PATH)"

    # 载入 .env 到当前进程环境（storage:init 需要 MINIO 等变量）
    $envFile = Join-Path $RepoDir '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | Where-Object { $_ -match '^\s*([^#\s][^=]*)=(.*)$' } | ForEach-Object {
            if ($_ -match '^\s*([^#\s][^=]*)=(.*)$') {
                $varName  = $Matches[1].Trim()
                $varValue = $Matches[2].Trim().Trim('"')
                [System.Environment]::SetEnvironmentVariable($varName, $varValue, 'Process')
            }
        }
    }

    $appLogFile    = Join-Path $Script:LogRoot 'app.log'
    $appErrLogFile = Join-Path $Script:LogRoot 'app-err.log'
    # 注意：-WindowStyle Hidden 与 -RedirectStandardOutput 互斥，使用 -NoNewWindow 配合重定向
    # stdout/stderr 必须指向不同文件（PowerShell Start-Process 限制）
    $appProcess = Start-Process `
        -FilePath $Script:NpmCmd `
        -ArgumentList 'run', 'start' `
        -WorkingDirectory $RepoDir `
        -NoNewWindow `
        -RedirectStandardOutput $appLogFile `
        -RedirectStandardError  $appErrLogFile `
        -PassThru

    Save-PidFile -ProcessId $appProcess.Id -PidFilePath $Script:PidApp
    return $appProcess
}

# ============================================================
# PHASE 10: 等待应用就绪并唤起浏览器
# ============================================================
function Invoke-Phase10-OpenBrowser {
    param(
        [System.Diagnostics.Process]$AppProcess
    )

    Write-Banner 'Phase 10: 等待应用就绪'

    # 在等待端口时同时监测进程是否提前退出，避免傻等 120s
    $portApp    = $Script:PortApp
    $elapsed    = 0
    $timeout    = 120000
    $intervalMs = 800
    $appErrLog  = Join-Path $Script:LogRoot 'app-err.log'

    Write-Host "  [等待] waoowaoo 应用 端口 $portApp 就绪..." -ForegroundColor DarkYellow -NoNewline
    while ($elapsed -lt $timeout) {
        if (Test-PortOpen -Port $portApp) {
            Write-Host ' 就绪！' -ForegroundColor Green
            break
        }
        # 检测进程是否已提前退出
        if ($null -ne $AppProcess -and $AppProcess.HasExited) {
            Write-Host ' 进程已退出！' -ForegroundColor Red
            $errContent = Get-Content $appErrLog -Tail 30 -ErrorAction SilentlyContinue
            $logContent = Get-Content (Join-Path $Script:LogRoot 'app.log') -Tail 30 -ErrorAction SilentlyContinue
            throw "应用进程在端口就绪前退出（代码：$($AppProcess.ExitCode)）。`n错误日志：`n$errContent`n应用日志末尾：`n$logContent"
        }
        Start-Sleep -Milliseconds $intervalMs
        $elapsed += $intervalMs
        Write-Host '.' -ForegroundColor DarkYellow -NoNewline
    }
    if (-not (Test-PortOpen -Port $portApp)) {
        Write-Host ' 超时！' -ForegroundColor Red
        throw "waoowaoo 应用在 120s 内未就绪，端口 $portApp 无响应。"
    }

    $appUrl = "http://localhost:$portApp"
    Write-Step -Phase '浏览器' -Message "正在打开 $appUrl ..."
    Start-Process $appUrl
    Write-Success "请在浏览器中访问：$appUrl"
}

# ============================================================
# PHASE 11 & 12: 守护等待与优雅关闭
# ============================================================
function Invoke-Phase11And12-GuardAndShutdown {
    param(
        [System.Diagnostics.Process]$AppProcess
    )

    Write-Banner 'Phase 11: 服务守护中'
    Write-Host ''
    Write-Host '  ┌──────────────────────────────────────────────────┐' -ForegroundColor DarkCyan
    Write-Host '  │          waoowaoo 便携版已成功启动                │' -ForegroundColor Cyan
    Write-Host '  ├──────────────────────────────────────────────────┤' -ForegroundColor DarkCyan
    Write-Host "  │  Web 界面  : http://localhost:$Script:PortApp         │" -ForegroundColor White
    Write-Host "  │  Bull Board: http://localhost:3010/admin/queues   │" -ForegroundColor White
    Write-Host "  │  MinIO 控制台: http://localhost:9001               │" -ForegroundColor White
    Write-Host '  ├──────────────────────────────────────────────────┤' -ForegroundColor DarkCyan
    Write-Host '  │  数据目录  : %LOCALAPPDATA%\waoowaoo              │' -ForegroundColor DarkGray
    Write-Host '  ├──────────────────────────────────────────────────┤' -ForegroundColor DarkCyan
    Write-Host '  │  按 Ctrl+C 或关闭此窗口以安全停止所有服务         │' -ForegroundColor Yellow
    Write-Host '  └──────────────────────────────────────────────────┘' -ForegroundColor DarkCyan
    Write-Host ''

    # 守护循环：每 500ms 检测一次键盘输入或进程状态
    # 用键盘轮询替代异常捕获，在 PS5.1 / .NET Framework 下更可靠
    Write-Host '  提示：按任意键安全停止所有服务...' -ForegroundColor Yellow
    $shouldStop = $false
    while (-not $shouldStop) {
        # 检查键盘（非阻塞）
        if ([Console]::KeyAvailable) {
            $null = [Console]::ReadKey($true)
            $shouldStop = $true
        }
        # 检查应用进程是否意外退出
        if ($null -ne $AppProcess -and $AppProcess.HasExited) {
            Write-Warn "应用进程意外退出（代码：$($AppProcess.ExitCode)）！请检查日志：$($Script:LogRoot)\app.log"
            $shouldStop = $true
        }
        if (-not $shouldStop) {
            Start-Sleep -Milliseconds 500
        }
    }
    Invoke-Phase12-GracefulShutdown -AppProcess $AppProcess
}

function Invoke-Phase12-GracefulShutdown {
    param(
        [System.Diagnostics.Process]$AppProcess
    )

    Write-Banner 'Phase 12: 优雅关闭所有服务'

    # 1. 停止 Next.js App（concurrently --kill-others 会级联终止所有子进程）
    Write-Step -Phase '关闭' -Message "正在停止应用进程..."
    if ($null -ne $AppProcess -and -not $AppProcess.HasExited) {
        # 用 taskkill /T 递归终止整个进程树（/F 强制，/T 包含子进程）
        # PS5.1 的 .NET Framework 4.x 不支持 Process.Kill(bool)
        & taskkill /F /T /PID $AppProcess.Id 2>&1 | Out-Null
        $AppProcess.WaitForExit(5000) | Out-Null
        Write-Success "应用进程已停止"
    }
    else {
        Stop-ProcessByPidFile -PidFilePath $Script:PidApp -ServiceName '应用'
    }

    # 等待 app 端口释放
    $waited = 0
    while ((Test-PortOpen -Port $Script:PortApp) -and $waited -lt 15) {
        Start-Sleep -Seconds 1
        $waited++
    }

    # 等待 Prisma DLL 文件锁释放（防止下次启动时 prisma generate EPERM）
    $dllPath = Join-Path $RepoDir 'node_modules\.prisma\client\query_engine-windows.dll.node'
    if (Test-Path $dllPath) {
        $waited = 0
        while ($waited -lt 10) {
            try {
                $fs = [System.IO.File]::Open($dllPath, 'Open', 'ReadWrite', 'None')
                $fs.Close(); $fs.Dispose()
                break
            } catch {
                Start-Sleep -Seconds 1
                $waited++
            }
        }
    }

    # 2. 安全关闭 Redis（SHUTDOWN SAVE 确保 AOF 落盘）
    Write-Step -Phase '关闭' -Message "正在安全关闭 Redis（SHUTDOWN SAVE）..."
    try {
        $redisPid = $null
        if (Test-Path $Script:PidRedis) {
            $redisPid = [int](Get-Content $Script:PidRedis -ErrorAction SilentlyContinue)
        }
        & $Script:RedisCli -p $Script:PortRedis SHUTDOWN SAVE 2>&1 | Out-Null
        # 等待端口释放
        $waited = 0
        while ((Test-PortOpen -Port $Script:PortRedis) -and $waited -lt 15) {
            Start-Sleep -Seconds 1
            $waited++
        }
        Write-Success 'Redis 已安全关闭（数据已落盘）'
    }
    catch {
        Write-Warn "Redis 正常关闭失败，尝试强制终止：$_"
        Stop-ProcessByPidFile -PidFilePath $Script:PidRedis -ServiceName 'Redis'
    }
    Remove-Item -Path $Script:PidRedis -Force -ErrorAction SilentlyContinue

    # 3. 安全关闭 MySQL（mysqladmin shutdown）
    Write-Step -Phase '关闭' -Message "正在安全关闭 MySQL..."
    try {
        $shutdownArgs = @(
            "-h127.0.0.1",
            "-P$Script:PortMySql",
            "-uroot",
            "-p$Script:DbRootPassword",
            '--connect-timeout=5',
            'shutdown'
        )
        Start-Process `
            -FilePath $Script:MySqlAdmin `
            -ArgumentList $shutdownArgs `
            -NoNewWindow `
            -Wait | Out-Null

        $waited = 0
        while ((Test-PortOpen -Port $Script:PortMySql) -and $waited -lt 20) {
            Start-Sleep -Seconds 1
            $waited++
        }
        Write-Success 'MySQL 已安全关闭'
    }
    catch {
        Write-Warn "MySQL 正常关闭失败，尝试强制终止：$_"
        Stop-ProcessByPidFile -PidFilePath $Script:PidMySql -ServiceName 'MySQL'
    }
    Remove-Item -Path $Script:PidMySql -Force -ErrorAction SilentlyContinue

    # 4. 停止 MinIO
    Write-Step -Phase '关闭' -Message "停止 MinIO..."
    Stop-ProcessByPidFile -PidFilePath $Script:PidMinio -ServiceName 'MinIO'

    # 5. 最终确认所有端口已释放
    $portsToCheck = @($Script:PortApp, $Script:PortRedis, $Script:PortMySql, $Script:PortMinioApi)
    $allClosed = $true
    foreach ($port in $portsToCheck) {
        if (Test-PortOpen -Port $port) {
            Write-Warn "端口 $port 仍在监听，可能有残留进程。"
            $allClosed = $false
        }
    }

    if ($allClosed) {
        Write-Success '所有服务已完全停止，无僵尸进程。'
    }

    Write-Host ''
    Write-Host '  waoowaoo 已安全退出。再见！' -ForegroundColor Cyan
    Write-Host ''
}

# ============================================================
# 主入口
# ============================================================
function Main {
    $host.UI.RawUI.WindowTitle = "waoowaoo 便携版 - 启动中..."

    Write-Host ''
    Write-Host '  =================================================' -ForegroundColor DarkCyan
    Write-Host '   waoowaoo 便携一键启动系统 v1.0' -ForegroundColor Cyan
    Write-Host '   数据隔离目录: %LOCALAPPDATA%\waoowaoo' -ForegroundColor DarkGray
    Write-Host '  =================================================' -ForegroundColor DarkCyan
    Write-Host ''

    # 验证项目目录
    if (-not (Test-Path (Join-Path $RepoDir 'package.json'))) {
        throw "找不到 package.json，请确认 RepoDir 参数指向正确的项目目录：$RepoDir"
    }

    try {
        Invoke-Phase1-EnvironmentCheck
        Invoke-Phase2And3-DownloadEngines
        Invoke-Phase4-MySqlInit
        Invoke-Phase5-ConfigAndLinks
        Invoke-Phase6-NpmInstall
        Invoke-Phase7-StartServices
        Invoke-Phase8-PrismaDbPush
        Invoke-Phase9a-NextBuild
        $appProcess = Invoke-Phase9b-StartApp
        Invoke-Phase10-OpenBrowser -AppProcess $appProcess

        $host.UI.RawUI.WindowTitle = "waoowaoo 便携版 - 运行中"
        Invoke-Phase11And12-GuardAndShutdown -AppProcess $appProcess
    }
    catch {
        # 区分正常地Ctrl+C/键盘退出与真实错误
        if ($_.Exception -is [System.Management.Automation.PipelineStoppedException]) {
            # 用户按了 Ctrl+C，关闭流程已在 Phase12 完成
            exit 0
        }
        Write-Host ''
        Write-Fail "启动失败：$_"
        Write-Host ''
        Write-Host "  错误详情：" -ForegroundColor DarkGray
        Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor DarkGray
        Write-Host ''
        Write-Host '  日志目录：' -ForegroundColor DarkGray
        Write-Host "  $Script:LogRoot" -ForegroundColor DarkGray
        Write-Host ''
        Write-Host '  按任意键退出...' -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        exit 1
    }
}

Main
