# update.ps1 — waoowaoo Portable 自动更新脚本 (Auto-Update Script)
#
# 使用方式: PowerShell -NoProfile -ExecutionPolicy Bypass -File update.ps1 -InstallDir "C:\path\to\portable"
# 由 start.bat 在每次启动时自动调用。
#
# 更新来源: GitHub Releases (公开 Release 中的 patch-*.zip 附件)
# 更新内容: 仅更新 app/ 目录及脚本文件（不覆盖 portable_db/data、portable_minio/data、logs/）
#
# 如需使用自定义更新服务器，修改 $UpdateApiUrl 参数即可。

param(
    # 便携包安装根目录（由 start.bat 传入，也可手动指定）
    [string]$InstallDir = (Split-Path -Parent $MyInvocation.MyCommand.Path),

    # GitHub 仓库标识（owner/repo）
    [string]$GithubRepo = "woaiACE/waoowaoo",

    # 自定义更新 API URL（留空则使用 GitHub Releases API）
    [string]$UpdateApiUrl = "",

    # 超时秒数（网络请求）
    [int]$TimeoutSec = 15
)

$ErrorActionPreference = "Stop"

$versionFile  = Join-Path $InstallDir "version.txt"
# 使用安装目录内的临时目录，避免 $env:TEMP 的宽松权限带来的安全风险
$tempDir      = Join-Path $InstallDir ".update_temp"
$patchZipPath = Join-Path $tempDir "patch.zip"
$patchExtDir  = Join-Path $tempDir "extracted"

# ── 读取当前版本 ──────────────────────────────────────────────────────────────
$currentVersion = "0.0.0"
if (Test-Path $versionFile) {
    $raw = (Get-Content $versionFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($raw -match '^\d+\.\d+') { $currentVersion = $raw }
}
Write-Host "[Update] 当前版本 (Current): $currentVersion"

# ── 查询最新 Release 信息 ─────────────────────────────────────────────────────
try {
    if ($UpdateApiUrl -ne "") {
        # 自定义更新服务器：期望返回 { version, patchUrl } JSON
        $releaseInfo = Invoke-RestMethod -Uri $UpdateApiUrl `
            -Headers @{ "User-Agent" = "waoowaoo-portable-updater/1.0" } `
            -TimeoutSec $TimeoutSec `
            -ErrorAction Stop
        $latestVersion = $releaseInfo.version
        $patchUrl      = $releaseInfo.patchUrl
    } else {
        # GitHub Releases API
    $apiUrl = "https://api.github.com/repos/$GithubRepo/releases/latest"
        $release = Invoke-RestMethod -Uri $apiUrl `
            -Headers @{ "User-Agent" = "waoowaoo-portable-updater/1.0" } `
            -TimeoutSec $TimeoutSec `
            -ErrorAction Stop
        $latestVersion = $release.tag_name -replace '^v', ''
        # 在 Release 附件中查找名为 patch-*.zip 的文件
        $patchAsset = $release.assets | Where-Object { $_.name -match '^patch.*\.zip$' } | Select-Object -First 1
        $patchUrl   = if ($patchAsset) { $patchAsset.browser_download_url } else { $null }
    }
} catch {
    $httpStatus = $null
    try { $httpStatus = [int]$_.Exception.Response.StatusCode.value__ } catch { }
    if ($httpStatus -eq 404) {
        Write-Host "[Update] 更新服务器暂无可用版本（尚未发布 Release），跳过更新检查。"
    } else {
        Write-Host "[Update] 无法连接更新服务器: $($_.Exception.Message)"
    }
    Write-Host "[Update] 跳过本次更新检查，继续启动..."
    exit 0
}

Write-Host "[Update] 最新版本 (Latest): $latestVersion"

# ── 版本比较 ──────────────────────────────────────────────────────────────────
try {
    $cv = [System.Version]$currentVersion
    $lv = [System.Version]$latestVersion
    if ($lv -le $cv) {
        Write-Host "[Update] 已是最新版本，无需更新。"
        exit 0
    }
} catch {
    # 版本号格式不标准时（如 1.2.3-beta），不再尝试按大小比较，避免误升级/降级
    Write-Host "[Update] 警告: 无法将版本号解析为标准格式。Current='$currentVersion', Latest='$latestVersion'"

    # 字符串完全相同则视为已是最新版本
    if ($latestVersion -eq $currentVersion) {
        Write-Host "[Update] 已是最新版本（字符串匹配），无需更新。"
        exit 0
    }

    # 版本号格式不标准，跳过自动更新，避免意外升级或降级
    Write-Host "[Update] 由于版本号格式不标准，已跳过自动更新。如需更新，请手动前往 https://github.com/$GithubRepo/releases 下载。"
    exit 0
}

Write-Host "[Update] 发现新版本: $currentVersion → $latestVersion"

# ── 检查是否有可用的 Patch ZIP ─────────────────────────────────────────────────
if (-not $patchUrl) {
    Write-Host "[Update] 此 Release 未附带 patch 压缩包，跳过本次更新。"
    Write-Host "[Update] 如需手动升级，请前往 https://github.com/$GithubRepo/releases 下载完整包。"
    exit 0
}

# ── 下载补丁包 ────────────────────────────────────────────────────────────────
Write-Host "[Update] 正在下载补丁: $patchUrl ..."
try {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    Invoke-WebRequest -Uri $patchUrl -OutFile $patchZipPath `
        -TimeoutSec 120 `
        -ErrorAction Stop
    Write-Host "[Update] 下载完成: $('{0:N1}' -f ((Get-Item $patchZipPath).Length / 1MB)) MB"
} catch {
    Write-Host "[Update] 下载失败: $($_.Exception.Message)"
    Write-Host "[Update] 跳过本次更新，继续启动..."
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

# ── 解压并覆盖（排除数据目录和日志）─────────────────────────────────────────
Write-Host "[Update] 正在应用补丁到 $InstallDir ..."
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    # 先解压到临时目录，再选择性覆盖（保护用户数据）
    # 清理可能残留的上次中断解压目录，避免 ExtractToDirectory 因文件已存在而报错
    if (Test-Path $patchExtDir) { Remove-Item $patchExtDir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Force -Path $patchExtDir | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($patchZipPath, $patchExtDir)

    # 受保护目录/文件（不允许被补丁覆盖，规范化为绝对路径用于后续比较）
    $protected = @(
        [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($InstallDir, "portable_db", "data")),
        [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($InstallDir, "portable_minio", "data")),
        [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($InstallDir, "logs")),
        [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($InstallDir, "app", ".secrets")),
        [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($InstallDir, "app", ".env"))
    )
    # 规范化安装根路径（用于 Zip Slip 边界校验）
    $installRootFull = [System.IO.Path]::GetFullPath($InstallDir)

    Get-ChildItem -Path $patchExtDir -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($patchExtDir.Length).TrimStart('\', '/')
        $destPath = Join-Path $InstallDir $relativePath
        $destFull = [System.IO.Path]::GetFullPath($destPath)
        $destDir  = Split-Path $destFull -Parent

        # 安全校验：防止 Zip Slip / 路径遍历攻击（确保目标路径仍在安装根目录内）
        # 注：File 类型的条目不可能等于目录路径，无需额外的相等性检查
        if (-not $destFull.StartsWith($installRootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "[Update] 跳过潜在不安全路径（路径遍历尝试？）: $relativePath"
            return
        }

        # 跳过受保护目录/文件中的内容
        $isProtected = $protected | Where-Object {
            $destFull.Equals($_, [System.StringComparison]::OrdinalIgnoreCase) -or
            $destFull.StartsWith($_ + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
        }
        if ($isProtected) { return }

        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item $_.FullName $destFull -Force
    }
    Write-Host "[Update] 补丁已成功应用！"
} catch {
    Write-Host "[Update] 解压/覆盖失败: $($_.Exception.Message)"
    Write-Host "[Update] 回滚：本次更新已跳过，继续使用旧版本。"
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

# ── 写入新版本号 ──────────────────────────────────────────────────────────────
$latestVersion | Out-File -FilePath $versionFile -Encoding UTF8 -NoNewline
Write-Host "[Update] 版本已更新: $currentVersion → $latestVersion"

# ── 清理临时文件 ──────────────────────────────────────────────────────────────
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[Update] 更新完成，继续启动..."
exit 0
