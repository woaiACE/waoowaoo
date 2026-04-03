import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 已删除 ignoreBuildErrors / ignoreDuringBuilds，构建保持严格门禁
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
  // ── 便携包构建配置 ────────────────────────────────────────────────────────────
  // output: 'standalone' 使 next build 在 .next/standalone/ 输出可独立运行的服务端产物。
  // build-portable.ps1 依赖此目录将应用复制到便携包中。
  output: 'standalone',
  // outputFileTracingRoot 指定项目根目录，消除多 lockfile 时 Next.js 向上推断根目录的警告。
  outputFileTracingRoot: path.join(__dirname),
  // outputFileTracingExcludes 排除 portable/ 目录，避免将便携版依赖（MariaDB/Redis/MinIO 等）
  // 打包进 standalone，防止超长路径（>260 字符）在 Windows 下导致 Copy-Item 失败。
  outputFileTracingExcludes: {
    '*': [
      './portable/**',
      './build-cache/**',
    ],
  },
};

export default withNextIntl(nextConfig);
