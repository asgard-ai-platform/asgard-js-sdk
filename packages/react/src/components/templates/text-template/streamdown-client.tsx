'use client';

import { ReactNode, useEffect, useState } from 'react';
import remarkBreaks from 'remark-breaks';
import { withFileLinks } from './rehype-file-links';
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
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
}

interface StreamdownClientProps {
  children: string;
}

interface LoadedStreamdown {
  Component: React.ComponentType<StreamdownProps>;
  remarkPlugins: unknown[];
  rehypePlugins: unknown[];
}

export function StreamdownClient({ children }: StreamdownClientProps): ReactNode {
  const [loaded, setLoaded] = useState<LoadedStreamdown | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    loadKatexCss();

    let cancelled = false;

    const loadStreamdown = async (): Promise<void> => {
      try {
        const { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } = await import('streamdown');

        if (cancelled) return;

        // Streamdown 的 remarkPlugins prop 會整組覆蓋掉預設外掛，所以必須把預設
        // 外掛（remark-gfm 表格、remark-math、remark-cjk-friendly…）spread 回來，
        // 再把 remark-breaks 接在最後。
        setLoaded({
          Component: Streamdown as unknown as React.ComponentType<StreamdownProps>,
          remarkPlugins: [...Object.values(defaultRemarkPlugins), remarkBreaks],
          // rehypePlugins 同樣整組覆蓋預設；withFileLinks 保留全部預設外掛，只讓 file:// 連結不被擋成 [blocked]。
          rehypePlugins: withFileLinks(defaultRehypePlugins),
        });
      } catch {
        if (!cancelled) setError(true);
      }
    };

    loadStreamdown();

    return (): void => {
      cancelled = true;
    };
  }, []);

  if (error || !loaded) {
    return children;
  }

  const { Component: StreamdownComponent, remarkPlugins, rehypePlugins } = loaded;

  return (
    <StreamdownComponent components={streamdownComponents} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {children}
    </StreamdownComponent>
  );
}
