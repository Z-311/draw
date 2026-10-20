import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '你画我猜 · AI 猜画',
  description: '随手画一个东西，让 AI 来猜，并围绕这幅画继续聊天。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
