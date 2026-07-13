import { ReactNode, useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import styles from './tool-call-group.module.scss';

// Icons
function ChevronRightIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
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
const VARIANT_PATHS: Record<string, string> = {
  Bash: 'M4 17l6-5-6-5M12 19h8',
  Read: 'M6 2h9l5 5v15H6zM14 2v6h6',
  Write: 'M6 2h9l5 5v15H6zM14 2v6h6M12 12v6M9 15h6',
  Edit: 'M4 20h4L18 8l-4-4L4 16zM14 4l4 4',
  Skill: 'M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z',
  WebFetch: 'M12 2a10 10 0 100 20 10 10 0 000-20M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20',
  WebSearch: 'M11 4a7 7 0 100 14 7 7 0 000-14M20 20l-4-4',
  generic: 'M14 6a3.5 3.5 0 01-4.6 4.6L5 15v4h4l4.4-4.4A3.5 3.5 0 0118 10l-4-4z',
};

function ToolVariantIcon({ variant, className }: { variant?: string; className?: string }): ReactNode {
  const path = (variant && VARIANT_PATHS[variant]) || VARIANT_PATHS.generic;

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
      <path d={path} />
    </svg>
  );
}

// Types
export type ToolCallStatus = 'pending' | 'completed' | 'error';

export interface ToolCallItemData {
  id: string;
  label: string;
  status: ToolCallStatus;
  /** Native built-in tool name (Bash/Read/Write/Edit/Skill/WebFetch/WebSearch) → per-variant icon; undefined → generic. */
  variant?: string;
  initial?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface ToolCallGroupProps {
  title?: string;
  items: ToolCallItemData[];
  defaultExpanded?: boolean;
  className?: string;
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
function StatusIcon({ status }: { status: ToolCallStatus }): ReactNode {
  const iconClass = styles.tool_call_item__status_icon;

  switch (status) {
    case 'completed':
      return <CheckCircleIcon className={clsx(iconClass, styles['tool_call_item__status_icon--completed'])} />;
    case 'error':
      return <ErrorCircleIcon className={clsx(iconClass, styles['tool_call_item__status_icon--error'])} />;
    case 'pending':
    default:
      return <LoadingIcon className={clsx(iconClass, styles['tool_call_item__status_icon--pending'])} />;
  }
}

// ToolCallItem Component
interface ToolCallItemProps {
  item: ToolCallItemData;
}

function ToolCallItem({ item }: ToolCallItemProps): ReactNode {
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
          <ToolVariantIcon variant={item.variant} className={styles.tool_call_item__variant_icon} />
          <span className={styles.tool_call_item__label}>{item.label}</span>
        </div>
        <div className={styles.tool_call_item__status}>
          <StatusIcon status={item.status} />
        </div>
      </div>
      {isExpanded && hasContent && (
        <div className={styles.tool_call_item__content}>
          {item.initial && <JsonViewer title="Initial" data={item.initial} />}
          {item.result && <JsonViewer title="Result" data={item.result} />}
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
            <ToolCallItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
