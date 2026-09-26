import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VideoAgent · AI 原生视频创作工作台',
  description:
    'AI 原生视频创作操作系统：描述一个内容目标，系统自动组织 Agent，生成脚本、分镜、素材提示词、发布文案与合规检查，所有产出沉淀为可审查、可审批的项目资产。',
  icons: {
    icon: '/icon.svg'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f8f8'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
