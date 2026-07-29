/**
 * Auth layout — centered card layout for login/register pages.
 * Minimal layout without sidebar clutter.
 */

export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-background to-muted/30">
      {children}
    </div>
  );
}
