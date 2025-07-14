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

// Enhanced completion detection with math expression support
function isCompleteParagraph(raw: string): boolean {
  // Basic completion logic
  const basicCompletion = (
    raw.trim().endsWith('\n\n') ||
    raw.trim().endsWith('\n') ||
    raw.trim().endsWith('.') ||
    raw.trim().endsWith('。') ||
    raw.trim().endsWith('！')
  );
  
  // Math-specific completion detection
  const mathCompletion = (
    !raw.includes('$') ||                    // No math expressions
    (raw.match(/\$/g) || []).length % 2 === 0  // Even number of $ signs (complete inline math)
  );
  
  return basicCompletion && mathCompletion;
}

// Custom table renderer to maintain current styling
const TableRenderer = ({ children, ...props }: any) => (
  <div className={classes.table_container}>
    <table {...props}>{children}</table>
  </div>
);

// Custom code renderer to maintain highlight.js classes exactly
const CodeRenderer = ({ children, className, ...props }: any) => {
  return (
    <code className={`hljs ${className || ''}`} {...props}>
      {children}
    </code>
  );
};

// Custom link renderer to integrate defaultLinkTarget prop
const LinkRenderer = ({ children, href, ...props }: any) => {
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
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};

// Custom math renderers for inline and block math expressions
const InlineMathRenderer = ({ children, ...props }: any) => (
  <span className="math math-inline" {...props}>
    {children}
  </span>
);

const BlockMathRenderer = ({ children, ...props }: any) => (
  <div className="math math-display" {...props}>
    {children}
  </div>
);

// Component renderers that maintain current styling and behavior
const components = {
  table: TableRenderer,
  code: CodeRenderer,
  a: LinkRenderer,
  math: InlineMathRenderer,          // Inline math: $expression$
  div: ({ className, ...props }: any) =>   // Block math: $$expression$$
    className?.includes('math-display') ? 
      <BlockMathRenderer {...props} /> : 
      <div className={className} {...props} />
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
    const paragraphs = text.split(/\n\s*\n/);

    return paragraphs.map((p) => ({ raw: p + '\n\n', type: 'paragraph' }));
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

      let lastCompleteIndex = tokens.length - 1;
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
