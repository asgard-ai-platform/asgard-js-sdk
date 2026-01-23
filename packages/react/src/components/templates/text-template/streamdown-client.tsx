'use client';

import { ReactNode, useEffect, useState } from 'react';
import { streamdownComponents } from './streamdown-components';

// Load KaTeX CSS from CDN for math rendering
const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';

function loadKatexCss(): void {
  if (typeof document === 'undefined') return;

  if (document.querySelector(`link[href="${KATEX_CSS_URL}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = KATEX_CSS_URL;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

interface StreamdownProps {
  children: string;
  components?: Record<string, unknown>;
}

interface StreamdownClientProps {
  children: string;
}

export function StreamdownClient({ children }: StreamdownClientProps): ReactNode {
  const [StreamdownComponent, setStreamdownComponent] = useState<React.ComponentType<StreamdownProps> | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    loadKatexCss();

    const loadStreamdown = async (): Promise<void> => {
      try {
        const { Streamdown } = await import('streamdown');
        setStreamdownComponent(() => Streamdown);
      } catch {
        setError(true);
      }
    };

    loadStreamdown();
  }, []);

  if (error || !StreamdownComponent) {
    return children;
  }

  return <StreamdownComponent components={streamdownComponents}>{children}</StreamdownComponent>;
}
