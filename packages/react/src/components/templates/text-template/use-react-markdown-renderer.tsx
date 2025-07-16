import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import classes from './text-template.module.scss';
import { useAsgardTemplateContext } from 'src/context/asgard-template-context';
import { safeWindowOpen } from 'src/utils/uri-validation';

interface MarkdownRenderResult {
  htmlBlocks: ReactNode;
  lastTypingText: string;
}

type Token = {
  raw: string;
  type: string;
};

// Maximum number of cached markdown blocks to prevent memory leaks
export const MAX_CACHE_SIZE = 100;

// Helper function to manage cache size with LRU eviction
export function manageCacheSize(cache: Map<string, ReactNode>): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Remove the first (oldest) entry to make room for new ones
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
}

// Enhanced completion detection with math expression support
function isCompleteParagraph(raw: string): boolean {
  // Basic completion logic - must end with proper punctuation or newlines
  // OR contain complete markdown elements
  const hasMarkdownElements =
    /^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|---+|```|\|.*\|)/m.test(raw.trim());

  // Check for complete table structure (header row + separator + at least one data row)
  const hasCompleteTable = /\|.*\|\s*\n\s*\|[-:\s|]+\|\s*\n\s*\|.*\|/m.test(
    raw.trim()
  );

  const basicCompletion =
    raw.endsWith('\n\n') ||
    raw.endsWith('\n') ||
    raw.endsWith('.') ||
    raw.endsWith('。') ||
    raw.endsWith('！') ||
    raw.endsWith('!') ||
    raw.endsWith('?') ||
    hasMarkdownElements || // Has complete markdown elements
    hasCompleteTable; // Has complete table structure

  // Math-specific completion detection
  // Check for complete math patterns (properly closed with $..$ or $$..$$)
  const completeInlineMath = /\$[^$\s][^$]*\$/.test(raw);
  const completeBlockMath = /\$\$[^$]*\$\$/.test(raw);
  const hasCompleteMath = completeInlineMath || completeBlockMath;

  const mathCompletion =
    !raw.includes('$') || // No math expressions
    hasCompleteMath; // Has complete math and no incomplete math

  // Complete if: (basic completion AND math completion) OR complete block math
  // OR if it's just a single token without newlines (treat as complete)
  const isSimpleToken = !raw.includes('\n\n') && raw.trim().length > 0;

  return (
    (basicCompletion && mathCompletion) || (isSimpleToken && mathCompletion)
  );
}

// Custom table renderer to maintain current styling
const TableRenderer = ({ children, ...props }: any): ReactNode => (
  <div className={classes.table_container}>
    <table {...props}>{children}</table>
  </div>
);

// Custom code renderer to maintain highlight.js classes exactly
const CodeRenderer = ({ children, className, ...props }: any): ReactNode => {
  return (
    <code className={`hljs ${className || ''}`} {...props}>
      {children}
    </code>
  );
};

// Custom link renderer to integrate defaultLinkTarget prop
const LinkRenderer = ({ children, href, ...props }: any): ReactNode => {
  const { defaultLinkTarget } = useAsgardTemplateContext();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        safeWindowOpen(href, defaultLinkTarget || '_blank');
      }
    },
    [href, defaultLinkTarget]
  );

  return (
    <a href={href} onClick={handleClick} rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
};

// Custom math renderers for inline and block math expressions
const InlineMathRenderer = ({ children, ...props }: any): ReactNode => (
  <span className="math math-inline" {...props}>
    {children}
  </span>
);

const BlockMathRenderer = ({ children, ...props }: any): ReactNode => (
  <div className="math math-display" {...props}>
    {children}
  </div>
);

// Component renderers that maintain current styling and behavior
const components = {
  table: TableRenderer,
  code: CodeRenderer,
  a: LinkRenderer,
  math: InlineMathRenderer, // Inline math: $expression$
  div: ({ className, ...props }: any): ReactNode => {
    // Block math: $$expression$$
    // Check for KaTeX display math classes
    if (
      className?.includes('math-display') ||
      className?.includes('katex-display')
    ) {
      return (
        <BlockMathRenderer
          className={`math math-display ${className || ''}`}
          {...props}
        />
      );
    }

    return <div className={className} {...props} />;
  },
};

export function useMarkdownRenderer(
  markdownText: string,
  delay = 100
): MarkdownRenderResult {
  const [blocks, setBlocks] = useState<ReactNode[]>([]);
  const [typingText, setTypingText] = useState<string>('');

  const cacheRef = useRef<Map<string, ReactNode>>(new Map());

  const getRawText = useCallback((text: string): string => {
    return text || '';
  }, []);

  // Mimic the exact token-based logic from current implementation
  const parseToTokens = useCallback((text: string): Token[] => {
    if (!text) return [];

    // Simple tokenization - split by double newlines for paragraphs
    // If there are no double newlines, treat the entire text as one token
    const paragraphs = text.includes('\n\n') ? text.split(/\n\s*\n/) : [text];

    return paragraphs.map((p) => ({
      raw: p + (text.includes('\n\n') ? '\n\n' : ''),
      type: 'paragraph',
    }));
  }, []);

  useEffect(() => {
    if (!markdownText) {
      setBlocks([]);
      setTypingText('');
      cacheRef.current.clear();

      return;
    }

    const handler = setTimeout(() => {
      const tokens = parseToTokens(markdownText);
      if (tokens.length === 0) {
        setBlocks([]);
        setTypingText('');

        return;
      }

      // Find the last complete token
      let lastCompleteIndex = -1;

      for (let i = tokens.length - 1; i >= 0; i--) {
        const raw = getRawText(tokens[i].raw);
        if (isCompleteParagraph(raw)) {
          lastCompleteIndex = i;

          break;
        }
      }

      const finishedTokens = tokens.slice(0, lastCompleteIndex + 1);
      const unprocessedTokens = tokens.slice(lastCompleteIndex + 1);

      const newBlocks: ReactNode[] = [];

      for (const token of finishedTokens) {
        const raw = getRawText(token.raw);
        const blockInCache = cacheRef.current.get(raw);
        if (blockInCache) {
          newBlocks.push(blockInCache);
        } else {
          const reactElement = (
            <ReactMarkdown
              key={raw}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeKatex]}
              components={components}
            >
              {raw.trim()}
            </ReactMarkdown>
          );
          // Manage cache size before adding new entry
          manageCacheSize(cacheRef.current);
          cacheRef.current.set(raw, reactElement);
          newBlocks.push(reactElement);
        }
      }

      const lastRaw = unprocessedTokens
        .map((t) => getRawText(t.raw))
        .join('\n')
        .trim();
      setBlocks(newBlocks);
      setTypingText(lastRaw);
    }, delay);

    return (): void => clearTimeout(handler);
  }, [markdownText, delay, getRawText, parseToTokens]);

  const htmlBlocks = useMemo<ReactNode>(() => {
    return <div className={classes.md_container}>{blocks}</div>;
  }, [blocks]);

  return {
    htmlBlocks,
    lastTypingText: typingText,
  };
}
