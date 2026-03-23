import type { ReactNode } from 'react';

export default function FullscreenLayout({ children }: { children: ReactNode }): ReactNode {
  return <div className="fixed inset-0 z-50 bg-background">{children}</div>;
}
