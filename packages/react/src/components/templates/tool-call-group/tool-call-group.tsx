import { ReactNode, useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import styles from './tool-call-group.module.scss';
import { ToolCallVariant, ToolCallDiff } from './tool-call-label';
import { Locale, t } from '../../../i18n';

// Icons
function ChevronRightIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// Status icons (F-007 / §3.5) — inlined lucide 0.487.0. `completed` shows no icon; `running` = the
// LoaderCircle spinner (amber, spun via CSS); `error` = CircleAlert (red).
function LoaderCircleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CircleAlertIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
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

// Native built-in variant icons (F-004) — inlined lucide geometry, matching the stroke language above.
const variantSvgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function TerminalIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function FilePlusIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M9 15h6" />
      <path d="M12 18v-6" />
    </svg>
  );
}

function FilePenIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} {...variantSvgProps}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

const VARIANT_ICON: Record<ToolCallVariant, (props: { className?: string }) => ReactNode> = {
  bash: TerminalIcon,
  read: FileTextIcon,
  write: FilePlusIcon,
  edit: FilePenIcon,
  skill: SparklesIcon,
  webfetch: GlobeIcon,
  websearch: SearchIcon,
  generic: WrenchIcon,
};

function VariantIcon({ variant, className }: { variant: ToolCallVariant; className?: string }): ReactNode {
  const Icon = VARIANT_ICON[variant];

  return <Icon className={className} />;
}

// Types
export type ToolCallStatus = 'pending' | 'completed' | 'error';

export interface ToolCallItemData {
  id: string;
  label: string;
  status: ToolCallStatus;
  /** Left identity icon (F-004): native built-ins get their own icon; others get `generic`. */
  variant: ToolCallVariant;
  /** Right-side `+/-` line diff for Write / Edit (F-007); `null` for tools without a diff. */
  diff?: ToolCallDiff | null;
  initial?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface ToolCallGroupProps {
  title?: string;
  items: ToolCallItemData[];
  /**
   * Pins the initial expand state and opts out of auto-collapse. When omitted, the group stays expanded
   * while it is the live tail of the thread and auto-collapses to its summary once the assistant moves
   * on — i.e. once `sealed` (mirrors the thinking block / SubagentList). A user click always takes over.
   */
  defaultExpanded?: boolean;
  /**
   * True once later content (another group or a message) follows this group — the assistant has moved
   * past it, so the finished group may fold. While it is still the tail (`sealed === false`) it stays
   * open, so it never flickers shut between streamed tools. Ignored when `defaultExpanded` is set.
   */
  sealed?: boolean;
  className?: string;
  /** Language for the expanded `Initial` / `Result` titles (F-008). Defaults to `en-US`. */
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

// StatusIcon Component
// §3.5 — status is expressed minimally: `completed` adds no mark (the left variant icon already carries
// identity); `running` = an amber spinner; `error` = a red alert.
function StatusIcon({ status }: { status: ToolCallStatus }): ReactNode {
  const iconClass = styles.tool_call_item__status_icon;

  switch (status) {
    case 'completed':
      return null;
    case 'error':
      return <CircleAlertIcon className={clsx(iconClass, styles['tool_call_item__status_icon--error'])} />;
    case 'pending':
    default:
      return (
        <LoaderCircleIcon
          className={clsx(
            iconClass,
            styles['tool_call_item__status_icon--running'],
            styles.tool_call_item__status_icon_spin,
          )}
        />
      );
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
          <VariantIcon variant={item.variant} className={styles.tool_call_item__variant_icon} />
          <span className={styles.tool_call_item__label}>{item.label}</span>
        </div>
        <div className={styles.tool_call_item__status}>
          {item.diff && (
            <span className={styles.tool_call_item__diff}>
              <span className={styles['tool_call_item__diff--added']}>+{item.diff.added}</span>
              {item.diff.removed > 0 && (
                <span className={styles['tool_call_item__diff--removed']}>-{item.diff.removed}</span>
              )}
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
  defaultExpanded,
  sealed = false,
  className,
  locale = 'en-US',
}: ToolCallGroupProps): ReactNode {
  // `expanded === null` → auto: stay open while this group is the live tail (a tool is still running, or
  // nothing has followed it yet) and fold to the summary only once it is `sealed` by later content — so a
  // group collapses after it has fully finished, never between streamed tools. A click takes over; an
  // explicit `defaultExpanded` opts out of auto entirely.
  const [expanded, setExpanded] = useState<boolean | null>(defaultExpanded ?? null);

  const anyRunning = items.some(item => item.status === 'pending');
  const isExpanded = expanded ?? (anyRunning || !sealed);

  const handleToggle = useCallback((): void => {
    setExpanded(() => !isExpanded);
  }, [isExpanded]);

  return (
    <div className={clsx(styles.tool_call_group, className)}>
      <button
        type="button"
        className={styles.tool_call_group__header}
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <ChevronRightIcon
          className={clsx(styles.tool_call_group__chevron, isExpanded && styles['tool_call_group__chevron--expanded'])}
        />
        <span className={styles.tool_call_group__title}>{title}</span>
      </button>
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
