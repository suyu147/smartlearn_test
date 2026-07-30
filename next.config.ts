import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {},
  serverExternalPackages: ['@langchain/core', '@langchain/langgraph', 'undici'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      // 讯飞虚拟人 API 代理（解决跨域问题）
      {
        source: '/vmss/:path*',
        destination: 'http://vms.cn-huadong-1.xf-yun.com/:path*',
      },
    ];
  },
};

export default nextConfig;
