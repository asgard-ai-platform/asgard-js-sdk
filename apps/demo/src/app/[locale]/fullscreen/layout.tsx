import type { ReactNode } from 'react';

export default function FullscreenLayout({ children }: { children: ReactNode }): ReactNode {
  return <div className="h-[calc(100vh-56px)]">{children}</div>;
}
