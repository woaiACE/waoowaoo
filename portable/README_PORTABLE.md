# waoowaoo AI 影视工作室 — Windows 便携包使用说明

> **免安装绿化版（Portable）** · Windows 10/11 x64  
> 解压 → 双击 `start.bat` → 自动下载依赖 → 自动启动 HTTPS → 自动打开浏览器

---

## 目录结构

解压后（或构建完成后）的完整目录结构如下：

```
waoowaoo-portable-v<版本号>-windows/
│
├── node/                          ← 便携版 Node.js v20 LTS（首次启动时自动下载）
│   ├── node.exe
│   ├── npm
│   ├── npm.cmd
│   └── node_modules/
│
├── portable_db/                   ← MariaDB 10.11 便携版（首次启动时自动下载）
│   ├── bin/
│   │   ├── mysqld.exe
│   │   ├── mysqladmin.exe
│   │   ├── mysql.exe
│   │   └── mysql_install_db.exe
│   └── my.ini                     ← 由本包提供，无需修改
│
├── portable_redis/                ← Redis for Windows 便携版（首次启动时自动下载）
│   ├── redis-server.exe
│   ├── redis-cli.exe
│   └── redis.windows.conf
│
├── portable_minio/                ← MinIO Windows 单文件二进制（首次启动时自动下载）
│   └── minio.exe
│
├── portable_caddy/                ← Caddy HTTPS 反向代理（首次启动时自动下载）
│   └── caddy.exe
│
├── app/                           ← Next.js 应用（由构建脚本生成）
│   ├── server/                    ← .next/standalone 输出
│   │   ├── server.js              ← Next.js 服务入口
│   │   ├── worker.js              ← BullMQ 工作进程（esbuild 打包）
│   │   ├── bull-board.js          ← 任务面板（esbuild 打包）
│   │   ├── .next/
│   │   ├── public/
│   │   └── node_modules/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── .env                       ← 环境变量（便携版预配置）
│
├── version.txt                    ← 当前版本号（用于自动更新比较）
│
├── start.bat                      ← ★ 一键启动脚本（关闭窗口或 Ctrl+C 即可停止所有服务）
├── Caddyfile                      ← ★ 便携版 HTTPS 反向代理配置

> **用户数据目录**（在 `%LOCALAPPDATA%\waoowaoo\`）：
> - `data\mysql\`  — MariaDB 数据库文件
> - `data\minio\`  — MinIO 对象存储数据
> - `data\redis\`  — Redis 持久化文件
> - `logs\`        — 运行日志（nextjs.log / worker.log / mysql.log 等）
> - `pids\`        — 进程 PID 文件（运行中自动创建，退出后自动清除）
>
> **密钥文件**：`%APPDATA%\waoowaoo\.secrets`（首次启动自动生成，请勿删除）
├── update.ps1                     ← 自动更新脚本（由 start.bat 调用）
├── setup-dependencies.ps1         ← 便携依赖自动下载脚本（由 start.bat 调用）
├── build-portable.ps1             ← 开发者构建脚本（最终用户无需使用）
└── README_PORTABLE.md             ← 本文件
```

---

## 快速开始（用户）

### 第一步：双击启动

```
双击 start.bat
```

首次启动时，脚本将**自动**联网下载所需的便携版二进制依赖（Node.js、Redis、MariaDB、MinIO、Caddy），
无需任何手动操作。下载完成后，后续启动将跳过下载步骤，秒速就绪。

如果你是在源码仓库内直接运行 portable/start.bat，且 portable/app 尚未生成，启动脚本会先执行一次便携运行文件构建；这一步只会生成 dist-portable/ 暂存目录并继续启动，不会额外创建 ZIP 安装包。

> **网络要求**：首次启动需要可访问以下地址，总下载量约 300-500 MB（大小随版本更新有所变化）：
> - `nodejs.org` — Node.js v20 LTS
> - `github.com` — Redis for Windows
> - `archive.mariadb.org` — MariaDB 10.11 LTS
> - `dl.min.io` — MinIO
> - `caddyserver.com` — Caddy Windows x64 最新版

脚本将依次执行：
1. 检查 GitHub 是否有新版本补丁包并自动更新
2. 检查并自动下载缺失的便携依赖（Node.js / Redis / MariaDB / MinIO / Caddy）
3. 启动 Caddy HTTPS 入口（默认 https://localhost:1443；若失败则自动回退到 HTTP）
4. 启动 Redis（端口 6379，绑定 127.0.0.1，含重试 ping 检测）
5. 启动 MariaDB（端口 3306，首次运行自动初始化数据目录）
6. 启动 MinIO 对象存储（端口 9000，含健康检查等待）
7. 自动创建 MinIO `waoowaoo` 存储桶（如已存在则跳过）+ 执行 `prisma migrate deploy`，确保数据库结构为最新版本
8. 启动 Next.js 服务器（端口 3000）及后台工作进程
9. 端口 3000 就绪后，自动在默认浏览器打开 HTTPS 入口

默认情况下，便携版会优先打开 HTTPS 入口。这一层本地反向代理可以缓解浏览器在纯 HTTP 模式下的同源并发连接限制，尤其是在 SSE、轮询和并发任务同时运行时，页面通常会更顺滑。

### 第二步：停止服务

关闭 `start.bat` 的控制台窗口，或在窗口内按 **Ctrl+C**，即可自动优雅退出所有服务（MariaDB、Redis、MinIO、Caddy、Node.js）。

---

## 手动放入依赖（可选，适用于离线环境）

如果无法自动联网下载（内网隔离等情况），可手动下载并放入以下目录：

- 运行便携版时，启动脚本会优先检查 `build-cache/deps-windows/`。
- 如果你是在源码仓库中运行 `portable/start.bat`，对应目录就是 `portable/build-cache/deps-windows/`。
- Caddy 支持放入官网原始 ZIP、重命名后的 `caddy.zip`，或直接放入 `caddy.exe`。

| 目录 | 下载地址 | 说明 |
|---|---|---|
| `node/` | https://nodejs.org/en/download → "Windows Binary (.zip)" → v20 LTS x64 | 解压后将所有文件放入 `node/` |
| `portable_db/` | https://mariadb.org/download/ → "MariaDB 10.11.x" → "Windows x86_64 ZIP" | 解压后将所有文件（含 `bin/`）放入 `portable_db/` |
| `portable_redis/` | https://github.com/tporadowski/redis/releases → `Redis-x64-x.x.x.zip` | 解压后将所有文件放入 `portable_redis/` |
| `portable_minio/` | https://dl.min.io/server/minio/release/windows-amd64/minio.exe | 单个可执行文件，放入 `portable_minio/` |
| `build-cache/deps-windows/` | https://caddyserver.com/download → Windows amd64 | 放入官网 ZIP，或命名为 `caddy.zip` / `caddy.exe`，首次启动会自动安装到 `portable_caddy/` |

---

## 端口占用说明

| 端口 | 服务 |
|---|---|
| 3000 | Next.js Web 应用 |
| 3010 | Bull Board 任务管理面板 |
| 1443 | Caddy HTTPS 入口 |
| 3306 | MariaDB（MySQL 兼容） |
| 6379 | Redis |
| 9000 | MinIO S3 API |
| 9001 | MinIO Web 控制台 |

如有端口冲突，请编辑 `start.bat` 顶部的变量（`start.bat` 是便携版的唯一配置来源，`app/.env` 在运行时不会被读取）。

---

## 日志文件

所有服务的日志位于 `logs/` 目录：

| 文件 | 内容 |
|---|---|
| `logs/redis.log` | Redis 服务日志 |
| `logs/mysql.log` | MariaDB 服务日志 |
| `logs/mysql-init.log` | MariaDB 首次初始化日志 |
| `logs/minio.log` | MinIO 服务日志 |
| `logs/caddy.log` | Caddy HTTPS 反向代理日志 |
| `logs/storage-init.log` | MinIO 存储桶初始化日志 |
| `logs/migrate.log` | Prisma Migrate 执行日志 |
| `logs/nextjs.log` | Next.js 服务端日志 |
| `logs/worker.log` | BullMQ 工作进程日志 |

---

## 开发者：如何构建便携包

### 前置条件

- Node.js ≥ 18.18.0（系统安装，仅构建时使用）
- `npm install` 已完成

### 构建步骤

```powershell
# 在项目根目录执行
powershell -ExecutionPolicy Bypass -File portable\build-portable.ps1
```

构建脚本将：
1. 执行 `npm run build`（含 `prisma generate` + `next build`，使用 `output: 'standalone'` 模式）
2. 用 `esbuild` 将 Worker（`src/lib/workers/index.ts`）、Bull Board（`scripts/bull-board.ts`）和 Storage Init（`src/lib/storage/init.ts`）打包为单文件 CJS
3. 将 `.next/standalone/`、`prisma/`、启动脚本等复制到 `dist-portable/` 暂存目录
4. 打包为 `waoowaoo-portable-v<版本>-windows.zip`

构建完成后，**仍需手动将 4 个便携二进制依赖**（Node.js / MariaDB / Redis / MinIO）放入对应目录，再分发 ZIP。

### next.config.ts 配置

本仓库的 `next.config.ts` 已包含 `output: 'standalone'` 配置：

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  // ...
};
```

此配置对 Docker 部署和本地开发无副作用（Docker 忽略 standalone 模式，直接用 `npm run start`）。

---

## 注意事项

- **不要删除** `portable_db/data/` 和 `portable_minio/data/`，这是你的数据库和文件存储数据。
- `python-desktop-shell` 和 `local_ai_server` 这两个子模块**永久排除**于便携包之外，它们依赖 Python 运行时和 GPU 环境，与本便携包的设计目标不兼容，不支持手动添加。
- 自动更新仅更新 `app/` 目录和脚本文件，**不会覆盖数据目录和日志**。
- 若首次打开 HTTPS 页面时浏览器提示本地证书信任确认，按提示接受即可；这是 Caddy 的本地开发证书流程。
- 首次启动时，`start.bat` 会自动生成唯一随机密钥（`NEXTAUTH_SECRET`、`CRON_SECRET`、`INTERNAL_TASK_TOKEN`）存入 `%APPDATA%\waoowaoo\.secrets`，请勿删除此文件。
- **`API_ENCRYPTION_KEY`** 用于加密数据库中存储的 AI 服务商 API 密钥。一旦使用后请勿修改，否则已保存的 API 密钥将无法解密。便携版中此变量由 `start.bat` 中的 `SET API_ENCRYPTION_KEY=...` 行控制（**不会从 `app/.env` 读取**）；如需自定义，请在首次启动**前**编辑 `start.bat` 中对应的这一行。
- 便携包 MariaDB 默认 root 密码为 `waoowaoo123`，仅监听 `127.0.0.1`，不对外网开放。如修改密码，需同步更新 `start.bat` 中对应的 `waoowaoo123` 字符串。
