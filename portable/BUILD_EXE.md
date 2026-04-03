# 开发者构建指南：Windows 离线安装包 (.exe)

本文档面向**开发者**，说明如何从源码构建 `waoowaoo-setup-vX.X.X-windows.exe` 单文件离线安装程序。

> **最终用户**无需阅读本文档。他们只需从 GitHub Releases 下载 `.exe` 双击安装即可。

---

## 目录

1. [构建方案概览](#1-构建方案概览)
2. [环境准备](#2-环境准备)
   - 2.1 Windows 本地构建
   - 2.2 Linux / macOS 构建（或 CI）
3. [快速开始（三条命令）](#3-快速开始三条命令)
4. [构建脚本参数说明](#4-构建脚本参数说明)
5. [构建过程详解（7 步）](#5-构建过程详解7-步)
6. [构建产物](#6-构建产物)
7. [目录结构说明（暂存目录 dist-win/）](#7-目录结构说明暂存目录-dist-win)
8. [升级依赖版本](#8-升级依赖版本)
9. [GitHub Actions 自动构建](#9-github-actions-自动构建)
10. [常见问题排查](#10-常见问题排查)
11. [设计决策说明](#11-设计决策说明)

---

## 1. 构建方案概览

```
源码仓库
  │
  ├─ [Step 1] npm run build        → Next.js Standalone + esbuild worker/board/storage-init
  │
  ├─ [Step 2] build-portable.ps1 -StageOnly → dist-win/  (应用文件暂存)
  │
  ├─ [Step 3] deps-manifest.json   → build-exe.ps1 下载/缓存 4 个 Windows 二进制依赖
  │              Node.js zip            → dist-win/node/
  │              MariaDB zip            → dist-win/portable_db/
  │              Redis zip              → dist-win/portable_redis/
  │              MinIO exe              → dist-win/portable_minio/
  │
  ├─ [Step 4] portable/assets/     → dist-win/ (start-silent.vbs, uninstall-helper.bat)
  │
  └─ [Step 5] makensis             → dist/waoowaoo-setup-vX.X.X-windows.exe
                waoowaoo-installer.nsi     (NSIS MUI2, LZMA 固实压缩)

# 主流程更新说明
Web 端开发完成
    │
    ▼
git commit & push (主分支)
    │
    ▼
检查变更类型（见上表）
    │
    ├─ 只有业务逻辑/UI/Worker 变更？
    │       └─ 直接重建便携包 → 完成 ✅
    │
    ├─ 有新增环境变量？
    │       ├─ 修改 build-portable.ps1 .env 模板
    │       ├─ 修改 start.bat SET 命令块
    │       └─ 重建便携包 ✅
    │
    ├─ 有新 Prisma 迁移？
    │       ├─ 验证 SQL 兼容 MariaDB
    │       └─ 重建便携包（自动打包迁移文件）✅
    │
    └─ 有新独立后台脚本？
            ├─ 在 build-portable.ps1 添加 esbuild 步骤
            ├─ 在 start.bat 添加启动步骤
            └─ 重建便携包 ✅
```

**关键设计原则：**
- `portable_*` 目录（Node.js / MariaDB / Redis / MinIO 二进制）在安装后为**纯只读**文件，升级时可直接覆盖
- 所有用户数据统一存放在 `$INSTDIR\data\mysql|minio|redis`，NSIS 升级/卸载时**不会触碰** `data\` 目录
- 所有服务严格绑定 `127.0.0.1`，不触发 Windows 防火墙弹窗，无需 UAC 提权写防火墙规则（安装本身仍需管理员权限以写入 Program Files）

---

## 2. 环境准备

### 2.1 Windows 本地构建（推荐）

| 工具 | 版本要求 | 安装方式 |
|------|----------|---------|
| Node.js | ≥ 18.18.0 | [nodejs.org](https://nodejs.org/) |
| PowerShell Core (pwsh) | ≥ 7.2 | `winget install Microsoft.PowerShell` |
| NSIS | ≥ 3.0 | `winget install NSIS.NSIS` 或 `choco install nsis` |
| Git | 任意 | [git-scm.com](https://git-scm.com/) |

验证安装：

```powershell
node --version      # v20.x.x
pwsh --version      # PowerShell 7.x.x
makensis -version   # v3.x
```

### 2.2 Linux / macOS 构建（或 CI）

**Ubuntu / Debian：**

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PowerShell Core（Ubuntu 22.04 为例）
source /etc/os-release
wget -q "https://packages.microsoft.com/config/ubuntu/${VERSION_ID}/packages-microsoft-prod.deb"
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update -q && sudo apt-get install -y powershell

# NSIS（Linux apt 版可跨平台编译 Windows .exe，无需 Wine）
sudo apt-get install -y nsis

# 验证
pwsh --version && makensis -version
```

**macOS：**

```bash
brew install node@20 powershell makensis
```

---

## 3. 快速开始（三条命令）

```bash
# 1. 克隆并安装依赖
git clone https://github.com/woaiACE/waoowaoo.git
cd waoowaoo
npm install

# 2. 构建 EXE（首次约需 20-45 分钟，主要用于 Next.js 构建 + 600 MB 依赖下载）
npm run build:exe

# 3. 产物在 dist/ 目录
ls dist/waoowaoo-setup-*.exe
```

**后续构建（依赖已缓存，且 dist-win 未过期时会自动复用，约数分钟到 10 分钟）：**

```bash
npm run build:exe
```

**仅重新打包（跳过 Next.js 构建，秒级启动，调试 NSIS 脚本时常用）：**

```bash
npm run build:exe:skip-app
```

---

## 4. 构建脚本参数说明

`portable/build-exe.ps1` 支持以下参数，均可通过 `npm run build:exe` 的对应脚本访问：

| npm 脚本 | 等效命令 | 用途 |
|---------|----------|------|
| `npm run build:exe` | `pwsh ... build-exe.ps1` | 标准构建；若 dist-win 已是当前源码最新暂存产物，则自动跳过重复应用重建 |
| `npm run build:exe:skip-app` | `... -SkipAppBuild` | 跳过 Next.js 构建（复用已有 dist-win/），调试 NSIS 时使用 |
| `npm run build:exe:nocache` | `... -NoCache` | 强制重新下载所有依赖（忽略 build-cache/），用于验证 URL 有效性 |

也可直接调用 `pwsh`，支持额外参数：

```powershell
# 指定版本号（覆盖 package.json 中的版本）
pwsh -ExecutionPolicy Bypass -File portable/build-exe.ps1 -ForceVersion 1.2.0

# 组合使用
pwsh -ExecutionPolicy Bypass -File portable/build-exe.ps1 -SkipAppBuild -ForceVersion 1.2.0
```

---

## 5. 构建过程详解（7 步）

`build-exe.ps1` 内部按以下顺序执行：

### Step 0：检查 makensis

脚本首先确认 `makensis` 可执行，并输出找到的路径。若未安装，给出平台对应的安装命令后立即退出。

### Step 1：读取 `deps-manifest.json`

从 `portable/deps-manifest.json` 读取 4 个 Windows 依赖的版本号、下载 URL 和 SHA256（可选）。这是**版本唯一来源**，升级依赖只需修改此文件。

### Step 2：构建 Next.js Standalone（除非命中暂存复用或显式 `-SkipAppBuild`）

脚本会先检查 `dist-win/.stage-metadata.json` 与源码更新时间：
- 如果 `dist-win/` 已经是当前源码的最新暂存产物，则直接复用，不重复执行 `npm run build`
- 如果源码、版本号或关键便携脚本发生变化，则自动调用 `portable/build-portable.ps1 -StageOnly`

真正需要重建时会执行：
- `npm run build`（Next.js Standalone + esbuild worker/board/storage-init）
- 将产物暂存到 `dist-win/`（跳过 ZIP 打包）

### Step 3 & 4：下载并缓存 Windows 依赖

对每个依赖：
1. 检查 `build-cache/deps-windows/<filename>` 是否已缓存（`-NoCache` 强制跳过检查）
2. 未缓存则下载（`curl.exe → WebClient → Invoke-WebRequest` 三重 fallback，各重试 3 次）
3. 解压到 `dist-win/` 对应目录

缓存位置：

```
build-cache/
└── deps-windows/
    ├── node-v20.18.1-win-x64.zip          (~40 MB)
    ├── Redis-x64-5.0.14.1.zip             (~5 MB)
    ├── mariadb-10.11.10-winx64.zip        (~475 MB)
    └── minio.RELEASE.2024-12-18T13-15-44Z.exe (~100 MB)
```

> `build-cache/` 已加入 `.gitignore`，不会被提交。CI 通过 `actions/cache` 在 runs 之间共享。

### Step 5：复制 EXE 专用资源

- `portable/assets/start-silent.vbs` → `dist-win/`（桌面快捷方式的无黑窗启动器）
- `portable/assets/uninstall-helper.bat` → `dist-win/`（NSIS 升级/卸载前调用的服务停止脚本）
- `public/logo.ico` → `dist-win/resources/`（安装程序图标）

### Step 6：调用 makensis

```
makensis /V2 /DVERSION=<ver> /DDIST_WIN=dist-win /DOUTPUT_DIR=dist portable/waoowaoo-installer.nsi
```

NSIS 以 **LZMA 固实压缩**将 `dist-win/` 所有内容打包。这一步是整个构建中最慢的（~15–35 分钟，取决于 CPU）。

### Step 7：输出结果

```
dist/waoowaoo-setup-v0.3.0-windows.exe   (~420–520 MB)
```

---

## 6. 构建产物

| 路径 | 说明 |
|------|------|
| `dist/waoowaoo-setup-vX.X.X-windows.exe` | 最终安装包，可直接分发 |
| `dist-win/` | 暂存目录（中间产物，构建完成后可删除） |
| `build-cache/deps-windows/` | 依赖下载缓存（跨构建复用，可手动删除以节省磁盘） |

这三个路径均已在 `.gitignore` 中排除。

---

## 7. 目录结构说明（暂存目录 dist-win/）

构建完成后，`dist-win/` 的结构与最终安装目录（`$INSTDIR\`）完全一致：

```
dist-win/
├── app/
│   ├── server/          Next.js Standalone + worker.js + bull-board.js + storage-init.js
│   ├── prisma/          schema.prisma + migrations/
│   ├── .env             非敏感环境变量
│   └── .secrets         ⚠️ 安全密钥（首次启动时由 start.bat 生成；升级时 NSIS 自动备份恢复）
├── node/                Node.js v20 Windows x64 便携版（纯二进制，升级时可直接覆盖）
├── portable_db/         MariaDB 10.11 Windows x64（纯二进制，升级时可直接覆盖）
├── portable_redis/      Redis for Windows（纯二进制，升级时可直接覆盖）
├── portable_minio/      MinIO Windows 单文件二进制（升级时可直接覆盖）
├── data/
│   ├── mysql/           ⚠️ MariaDB 数据（用户数据，NSIS 升级/卸载不触碰）
│   ├── minio/           ⚠️ MinIO 对象存储数据（用户数据）
│   └── redis/           ⚠️ Redis RDB/AOF 数据（用户数据）
├── logs/                运行日志（*.log）
├── pids/                进程 PID 文件（*.pid）
├── resources/
│   └── logo.ico         应用图标
├── start.bat            启动所有服务并打开浏览器
├── stop.bat             优雅停止所有服务
├── start-silent.vbs     无黑窗启动器（桌面快捷方式目标）
├── uninstall-helper.bat NSIS 升级/卸载前调用的服务停止脚本
├── setup-dependencies.ps1  运行时依赖自动下载（已内嵌依赖时跳过）
├── update.ps1           版本更新检查
├── build-portable.ps1   便携包构建脚本（CLI 工具，EXE 构建中间步骤）
└── version.txt          当前版本号
```

---

## 8. 升级依赖版本

所有 Windows 运行时依赖的版本由 **`portable/deps-manifest.json`** 统一管理：

```json
{
  "node":    { "version": "20.18.1", "url": "...", "sha256": "" },
  "redis":   { "version": "5.0.14.1", ... },
  "mariadb": { "version": "10.11.10", ... },
  "minio":   { "version": "RELEASE.2024-12-18T13-15-44Z", ... }
}
```

升级步骤：

1. 修改 `deps-manifest.json` 中对应的 `version`、`filename`、`url`
2. **同步修改** `portable/setup-dependencies.ps1` 中对应的版本变量（两处必须保持一致）
3. 可选：填写 `sha256`（官方提供时强烈建议填写，构建脚本会执行 `Get-FileHash` 校验；留空则跳过）
4. 运行 `npm run build:exe:nocache` 强制重新下载并验证新版本
5. 提交 `deps-manifest.json` 和 `setup-dependencies.ps1` 的修改

> **提示：** 修改 `deps-manifest.json` 后，GitHub Actions 的依赖缓存 key（`deps-windows-<hash>`）会自动失效，CI 将重新下载新版本。

---

## 9. GitHub Actions 自动构建

`.github/workflows/build-exe.yml` 在两种情况下自动触发：

### 推送 tag（推荐发布流程）

```bash
git tag v0.3.0
git push origin v0.3.0
```

Actions 将自动：
1. 安装 PowerShell Core + NSIS + Node.js 20
2. 还原 `build-cache/deps-windows/`（依赖缓存，首次运行后节省 ~15 分钟）
3. 执行完整构建
4. 将 `.exe` 上传到 GitHub Release（附件形式）

### 手动触发（测试用）

在 GitHub 仓库页面：**Actions → Build Windows EXE Installer → Run workflow**

可选填版本号覆盖（留空则读 `package.json`）。产物作为 Workflow Artifact 保留 30 天。

### 查看构建日志

如果构建失败，在 Actions 页面点击对应 run → 展开 `Build Windows EXE installer` 步骤查看完整输出。

---

## 10. 常见问题排查

### Q: `makensis: command not found`
安装 NSIS：
- Windows：`winget install NSIS.NSIS`
- Ubuntu：`sudo apt-get install -y nsis`
- macOS：`brew install makensis`

---

### Q: 构建时下载 MariaDB 失败（`mariadb.org` 超时）
`archive.mariadb.org` 在某些网络环境下较慢。可选方案：
1. 手动下载 zip 放入 `build-cache/deps-windows/mariadb-10.11.10-winx64.zip`，构建时自动识别缓存
2. 更换镜像 URL（修改 `deps-manifest.json` 的 `url` 字段）
3. 设置代理：`$env:HTTPS_PROXY = "http://your-proxy:port"`（PowerShell）

---

### Q: NSIS 编译报 `logo.ico not found`
`public/logo.ico` 不存在时 `build-exe.ps1` 会给出警告但继续，NSIS 使用默认图标。若需自定义图标，将 256x256 ICO 文件放置于 `public/logo.ico`。

---

### Q: `-SkipAppBuild` 后 EXE 内容不是最新
`-SkipAppBuild` 会无条件复用 `dist-win/app/` 的现有结果，适合仅修改 NSIS 脚本后快速重新打包。

标准 `npm run build:exe` 现在会先自动判断 `dist-win/` 是否过期：未过期则直接复用，过期才会重建。因此大多数情况下不需要手动区分“先 StageOnly，再 SkipAppBuild”。

---

### Q: 安装包大小超出预期
`dist-win/` 中最大的部分是 MariaDB（~450 MB 解压后）。LZMA 固实压缩会将整包压缩至 ~420–520 MB。若需减小包体：
- 从 MariaDB 中删除不需要的语言包、测试工具（`dist-win/portable_db/` 中的 `mysql-test/`）
- 在 NSIS 脚本 `Section` 中用 `File /r /x` 排除特定文件

---

### Q: 升级安装后旧数据丢失
**不应该发生。** NSIS 安装脚本（`waoowaoo-installer.nsi`）已做如下保护：
1. `.onInit` 检测旧版本 → 先调用 `uninstall-helper.bat` 停止所有服务
2. 备份 `app\.secrets`（JWT + API Key），安装后恢复
3. 所有用户数据（MariaDB / MinIO / Redis）在 `data\` 目录，安装脚本**不会删除**此目录
4. 仅 `portable_*`（纯二进制）、`app/`（应用代码）、`node/`（Node.js）被覆盖

若数据确实丢失，请检查旧版 `start.bat` 中的 `MYSQL_DATA` 变量是否指向 `portable_db\data`（旧版布局）——如果是，`start.bat` 会在首次启动时自动执行一次性迁移（XCOPY 到 `data\mysql\`）。

---

## 11. 设计决策说明

| 决策 | 理由 |
|------|------|
| 使用 NSIS 而非 Inno Setup | NSIS 在 Linux CI（apt）中可直接编译 Windows .exe，无需 Wine；Inno Setup 仅支持 Windows |
| LZMA 固实压缩 | 对 Node.js + MariaDB 二进制压缩率最高（约 3:1），最终包约 420–520 MB |
| 不添加防火墙规则 | 所有服务绑定 `127.0.0.1`，Windows 防火墙不拦截本地回环流量；避免 UAC 弹窗和杀软警报 |
| `data\` 与 `portable_*` 分离 | 升级和卸载时可安全覆盖/删除二进制目录，不影响用户的数据库和媒体文件 |
| `build-cache/deps-windows/` | ~600 MB 依赖仅首次下载；Git 不追踪，CI 通过 `actions/cache` 共享（以 `deps-manifest.json` hash 为 key） |
| `.secrets` 升级时备份恢复 | JWT secret 和 `API_ENCRYPTION_KEY` 丢失会导致用户登录失效和已存 API Key 无法解密 |
| `start-silent.vbs` | Windows 快捷方式无法直接隐藏 `.bat` 的命令行窗口；VBScript 以 `windowStyle=0` 运行 `wscript.exe`，用户体验与普通 GUI 应用一致 |

