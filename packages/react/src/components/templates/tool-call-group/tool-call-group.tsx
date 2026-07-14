import { ReactNode, useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import styles from './tool-call-group.module.scss';
import { DEFAULT_LOCALE, Locale, t } from '../../../i18n';

// Icons
function ChevronRightIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ErrorCircleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="32"
        strokeDashoffset="32"
        strokeLinecap="round"
      >
        <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// Per-variant icons for the seven native built-in tools; anything else → generic wrench (F-004).
// Exact lucide-react geometry (Terminal / FileText / FilePlus / FilePen / Sparkles / Globe / Search /
// Wrench) so the tool-call variants match the chat-kit prototype pixel-for-pixel. Inlined as raw SVG
// children (not the lucide-react package) to keep @asgard-js/react dependency-free.
const VARIANT_ICONS: Record<string, ReactNode> = {
  Bash: (
    <>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </>
  ),
  Read: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  Write: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M9 15h6" />
      <path d="M12 18v-6" />
    </>
  ),
  Edit: (
    <>
      <path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </>
  ),
  Skill: (
    <>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
      <circle cx="4" cy="20" r="2" />
    </>
  ),
  WebFetch: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  WebSearch: (
    <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </>
  ),
  generic: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
  ),
};

function ToolVariantIcon({ variant, className }: { variant?: string; className?: string }): ReactNode {
  const icon = (variant && VARIANT_ICONS[variant]) || VARIANT_ICONS.generic;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon}
    </svg>
  );
}

// Types
export type ToolCallStatus = 'running' | 'completed' | 'error';

export interface ToolCallItemData {
  id: string;
  label: string;
  status: ToolCallStatus;
  /** Native built-in tool name (Bash/Read/Write/Edit/Skill/WebFetch/WebSearch) → per-variant icon; undefined → generic. */
  variant?: string;
  /** Write/Edit line diff shown on the right (F-007). */
  diff?: { added: number; removed: number };
  initial?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface ToolCallGroupProps {
  title?: string;
  items: ToolCallItemData[];
  defaultExpanded?: boolean;
  className?: string;
  /** UI locale for expand titles (F-005/F-008); default `en-US`. */
  locale?: Locale;
}

// JSON Syntax Highlighting
type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

interface JsonToken {
  type: JsonTokenType;
  value: string;
}

function tokenizeJson(jsonString: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const regex =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],:])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(jsonString)) !== null) {
    // Add any whitespace/text before this match
    if (match.index > lastIndex) {
      const between = jsonString.slice(lastIndex, match.index);
      if (between.trim()) {
        tokens.push({ type: 'punctuation', value: between });
      } else if (between) {
        tokens.push({ type: 'punctuation', value: between });
      }
    }

    if (match[1]) {
      // Key (string followed by colon)
      tokens.push({ type: 'key', value: match[1] });
      tokens.push({ type: 'punctuation', value: ':' });
    } else if (match[2]) {
      // String value
      tokens.push({ type: 'string', value: match[2] });
    } else if (match[3]) {
      // Number
      tokens.push({ type: 'number', value: match[3] });
    } else if (match[4]) {
      // Boolean
      tokens.push({ type: 'boolean', value: match[4] });
    } else if (match[5]) {
      // Null
      tokens.push({ type: 'null', value: match[5] });
    } else if (match[6]) {
      // Punctuation
      tokens.push({ type: 'punctuation', value: match[6] });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < jsonString.length) {
    tokens.push({ type: 'punctuation', value: jsonString.slice(lastIndex) });
  }

  return tokens;
}

function getTokenClassName(type: JsonTokenType): string {
  switch (type) {
    case 'key':
      return styles['json_token--key'];
    case 'string':
      return styles['json_token--string'];
    case 'number':
      return styles['json_token--number'];
    case 'boolean':
      return styles['json_token--boolean'];
    case 'null':
      return styles['json_token--null'];
    case 'punctuation':
    default:
      return styles['json_token--punctuation'];
  }
}

export function SyntaxHighlightedJson({ json }: { json: string }): ReactNode {
  const tokens = tokenizeJson(json);

  return (
    <pre className={styles.json_viewer__code}>
      {tokens.map((token, index) => (
        <span key={index} className={getTokenClassName(token.type)}>
          {token.value}
        </span>
      ))}
    </pre>
  );
}

// Modal Component
export interface JsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: Record<string, unknown>;
}

export function JsonModal({ isOpen, onClose, title, data }: JsonModalProps): ReactNode {
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = useCallback((): void => {
    navigator.clipboard.writeText(jsonString);
  }, [jsonString]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return (): void => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.json_modal__backdrop} onClick={handleBackdropClick}>
      <div className={styles.json_modal}>
        <div className={styles.json_modal__header}>
          <span className={styles.json_modal__title}>{title}</span>
          <div className={styles.json_modal__actions}>
            <button className={styles.json_modal__action_btn} onClick={handleCopy} title="Copy">
              <CopyIcon />
            </button>
            <button className={styles.json_modal__action_btn} onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className={styles.json_modal__content}>
          <SyntaxHighlightedJson json={jsonString} />
        </div>
      </div>
    </div>
  );
}

// JsonViewer Component
export interface JsonViewerProps {
  title: string;
  data: Record<string, unknown>;
}

export function JsonViewer({ title, data }: JsonViewerProps): ReactNode {
  const [isModalOpen, setModalOpen] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = useCallback((): void => {
    navigator.clipboard.writeText(jsonString);
  }, [jsonString]);

  const handleExpand = useCallback((): void => {
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback((): void => {
    setModalOpen(false);
  }, []);

  return (
    <>
      <div className={styles.json_viewer}>
        <div className={styles.json_viewer__header}>
          <span className={styles.json_viewer__title}>{title}</span>
          <div className={styles.json_viewer__actions}>
            <button className={styles.json_viewer__action_btn} onClick={handleCopy} title="Copy">
              <CopyIcon />
            </button>
            <button className={styles.json_viewer__action_btn} onClick={handleExpand} title="Expand">
              <ExpandIcon />
            </button>
          </div>
        </div>
        <div className={styles.json_viewer__content}>
          <SyntaxHighlightedJson json={jsonString} />
        </div>
      </div>
      <JsonModal isOpen={isModalOpen} onClose={handleCloseModal} title={title} data={data} />
    </>
  );
}

// StatusIcon Component — only the noteworthy states get a marker (F-007): running = amber spinner,
// error = red alert. `completed` is the resting state → no marker (the variant icon already carries
// identity; a per-row green check would be redundant noise).
function StatusIcon({ status }: { status: ToolCallStatus }): ReactNode {
  const iconClass = styles.tool_call_item__status_icon;

  switch (status) {
    case 'error':
      return <ErrorCircleIcon className={clsx(iconClass, styles['tool_call_item__status_icon--error'])} />;
    case 'running':
      return <LoadingIcon className={clsx(iconClass, styles['tool_call_item__status_icon--running'])} />;
    case 'completed':
    default:
      return null;
  }
}

// ToolCallItem Component
interface ToolCallItemProps {
  item: ToolCallItemData;
  locale: Locale;
}

function ToolCallItem({ item, locale }: ToolCallItemProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = item.initial || item.result;
  const diff = item.diff;
  const hasDiff = !!diff && (diff.added > 0 || diff.removed > 0);

  const handleToggle = useCallback((): void => {
    if (hasContent) {
      setIsExpanded(prev => !prev);
    }
  }, [hasContent]);

  return (
    <div className={styles.tool_call_item}>
      <div className={styles.tool_call_item__header} onClick={handleToggle}>
        <div className={styles.tool_call_item__left}>
          {hasContent && (
            <ChevronRightIcon
              className={clsx(
                styles.tool_call_item__chevron,
                isExpanded && styles['tool_call_item__chevron--expanded'],
              )}
            />
          )}
          <ToolVariantIcon variant={item.variant} className={styles.tool_call_item__variant_icon} />
          <span className={styles.tool_call_item__label}>{item.label}</span>
        </div>
        <div className={styles.tool_call_item__status}>
          {hasDiff && (
            <span className={styles.tool_call_item__diff}>
              {diff.added > 0 && <span className={styles['tool_call_item__diff--added']}>+{diff.added}</span>}
              {diff.removed > 0 && <span className={styles['tool_call_item__diff--removed']}>-{diff.removed}</span>}
            </span>
          )}
          <StatusIcon status={item.status} />
        </div>
      </div>
      {isExpanded && hasContent && (
        <div className={styles.tool_call_item__content}>
          {item.initial && <JsonViewer title={t(locale, 'expand.initial')} data={item.initial} />}
          {item.result && <JsonViewer title={t(locale, 'expand.result')} data={item.result} />}
        </div>
      )}
    </div>
  );
}

// ToolCallGroup Component
export function ToolCallGroup({
  title = 'Answer preparation steps',
  items,
  defaultExpanded = true,
  className,
  locale = DEFAULT_LOCALE,
}: ToolCallGroupProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = useCallback((): void => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div className={clsx(styles.tool_call_group, className)}>
      <div className={styles.tool_call_group__header} onClick={handleToggle}>
        <ChevronRightIcon
          className={clsx(styles.tool_call_group__chevron, isExpanded && styles['tool_call_group__chevron--expanded'])}
        />
        <span className={styles.tool_call_group__title}>{title}</span>
      </div>
      {isExpanded && (
        <div className={styles.tool_call_group__content}>
          {items.map(item => (
            <ToolCallItem key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
