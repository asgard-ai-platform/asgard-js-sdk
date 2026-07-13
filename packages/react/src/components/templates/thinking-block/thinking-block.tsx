import { ReactNode, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ConversationThinkingMessage } from '@asgard-js/core';
import styles from './thinking-block.module.scss';

// Expanded-state reasoning preview cap (chars, ~4 lines); beyond it → truncate + show more/less.
const PREVIEW_LIMIT = 160;

interface ThinkingBlockProps {
  message: ConversationThinkingMessage;
}

// Renders the model's extended-thinking stream (asgard.message.thinking.*) as a standalone
// collapsible block, separate from tool-calls and the final answer (F-001).
// - Streaming: auto-expanded, "Thinking…", bottom-anchored auto-scroll window (append-only, top
//   fade mask), plain text (no markdown / no typewriter / no horizontal tail-window).
// - Complete: collapses to a fixed "Thought for a moment" summary, re-expandable, with a
//   preview-limit + show more/less. Collapsed by default in history.
export function ThinkingBlock({ message }: ThinkingBlockProps): ReactNode {
  const { isStreaming, text } = message;
  const [manualOpen, setManualOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const open = isStreaming || manualOpen;

  const streamRef = useRef<HTMLDivElement>(null);

  // Bottom-anchored auto-scroll: every delta appends at the end and the window follows the latest.
  useEffect(() => {
    if (isStreaming && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  const clamped = text.length > PREVIEW_LIMIT;
  const previewText = !clamped || showFull ? text : `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…`;

  return (
    <div className={clsx('asgard-thinking-block', styles.thinking_block)}>
      <button
        type="button"
        className={styles.thinking_block__header}
        onClick={(): void => setManualOpen(o => !o)}
        disabled={isStreaming}
        aria-expanded={open}
      >
        {!isStreaming && (
          <svg
            className={clsx(styles.thinking_block__chevron, open && styles['thinking_block__chevron--open'])}
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              d="M6 4l4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span className={clsx(styles.thinking_block__label, isStreaming && styles['thinking_block__label--streaming'])}>
          {isStreaming ? 'Thinking…' : 'Thought for a moment'}
        </span>
      </button>

      {open &&
        (isStreaming ? (
          <div className={styles.thinking_block__stream} ref={streamRef} aria-live="polite">
            <div className={styles.thinking_block__text}>{text}</div>
          </div>
        ) : (
          <div className={styles.thinking_block__body}>
            <div className={styles.thinking_block__text}>{previewText}</div>
            {clamped && (
              <button type="button" className={styles.thinking_block__more} onClick={(): void => setShowFull(v => !v)}>
                {showFull ? '顯示較少' : '顯示更多'}
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
