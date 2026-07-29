import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { ThemeScript } from '@/components/theme-script';
import { Providers, AppShell } from '@/components/providers';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartLearn — 智能学习系统',
  description: '基于大模型的个性化资源生成与学习多智能体系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="font-sans" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="h-screen overflow-hidden antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <AppShell>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </AppShell>
          </Providers>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
