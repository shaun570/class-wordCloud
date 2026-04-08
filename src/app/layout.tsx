import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '会议助手 | 智能录音转文字，词云分析',
    template: '%s | 会议助手',
  },
  description:
    '会议助手是一款智能会议记录工具，支持实时录音转文字，自动检测静默，生成词云分析，让会议内容一目了然。',
  keywords: [
    '会议助手',
    '录音转文字',
    '语音转文字',
    '会议记录',
    '词云生成',
    '会议分析',
  ],
  authors: [{ name: 'Meeting Assistant' }],
  generator: 'Coze Code',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: '会议助手 | 智能录音转文字，词云分析',
    description:
      '会议助手是一款智能会议记录工具，支持实时录音转文字，自动检测静默，生成词云分析。',
    url: 'https://code.coze.cn',
    siteName: '扣子编程',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
