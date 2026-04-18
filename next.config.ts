import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

// Windows 路径中方括号（如 [...nextauth]）导致 nft.json build trace ENOENT；
// 便携版为自包含部署，禁用 output file tracing 即可绕过此问题。
// Next.js 15 不暴露配置键，使用官方内部环境变量禁用。
process.env.NEXT_PRIVATE_DISABLE_OUTPUT_FILE_TRACING = '1';

const nextConfig: NextConfig = {
  // 已删除 ignoreBuildErrors / ignoreDuringBuilds，构建保持严格门禁
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
};

export default withNextIntl(nextConfig);
