/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * 两个 dev server 跑在同一个仓库时，会共用同一个 .next 目录并互相写坏对方的 webpack 缓存，
   * 症状是页面和 main-app.js 开始返 404（服务端 API 路由还活着，所以很容易误判成前端 bug）。
   * 仓库里那一堆 .next-broken-* / .next-stale-* 就是这么来的。
   * 给第二个实例单独指一个 distDir 就能彻底避开，默认行为不变。
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    outputFileTracingIncludes: {
      '/api/agent/run': ['./skills/dynamic-director/**/*']
    }
  }
};

export default nextConfig;
