import { ReactNode, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ToolCallConsentPendingCall } from '@asgard-js/core';
import { CloseIcon, JsonViewer } from '../templates/tool-call-group/tool-call-group';
import styles from './tool-call-consent-modal.module.scss';

function ChevronRightIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export type ToolCallConsentDecision =
  | { result: 'ALLOW_ONCE' }
  | { result: 'ALLOW_ALWAYS' }
  | { result: 'DENY_ONCE'; denyReason: string };

export interface ToolCallConsentModalProps {
  /** The pending call currently awaiting user response. */
  pendingCall: ToolCallConsentPendingCall;
  /** Total pending calls in this consent batch. */
  totalCount: number;
  /** 1-based index of the current pending call. */
  currentIndex: number;
  /** Called when the user makes a decision. */
  onDecide: (decision: ToolCallConsentDecision) => void;
  /** Called when the user tries to dismiss the modal without deciding (treated as deny). */
  onDismiss?: () => void;
}

export function ToolCallConsentModal(props: ToolCallConsentModalProps): ReactNode {
  const { pendingCall, totalCount, currentIndex, onDecide, onDismiss } = props;
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isDenyMode, setIsDenyMode] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  // Reset local state when the active pending call changes
  useEffect(() => {
    setIsInputExpanded(false);
    setIsDenyMode(false);
    setDenyReason('');
  }, [pendingCall.toolCallId]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return (): void => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleAllowOnce = useCallback(() => onDecide({ result: 'ALLOW_ONCE' }), [onDecide]);
  const handleAllowAlways = useCallback(() => onDecide({ result: 'ALLOW_ALWAYS' }), [onDecide]);
  const handleDenyClick = useCallback(() => {
    if (!isDenyMode) {
      setIsDenyMode(true);

      return;
    }

    onDecide({ result: 'DENY_ONCE', denyReason: denyReason.trim() });
  }, [isDenyMode, denyReason, onDecide]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onDismiss?.();
      }
    },
    [onDismiss],
  );

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.title}>
            Allow tool use <span className={styles.title_tool}>&quot;{pendingCall.toolName}&quot;</span>?
          </div>
          {onDismiss && (
            <button type="button" className={styles.close_btn} onClick={onDismiss} aria-label="Close">
              <CloseIcon />
            </button>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.meta_row}>
            <span>
              Toolset: <strong>{pendingCall.toolsetName}</strong>
            </span>
            <span>
              Tool: <strong>{pendingCall.toolName}</strong>
            </span>
          </div>

          <div className={styles.input_section}>
            <button
              type="button"
              className={clsx(styles.input_toggle, isInputExpanded && styles.input_toggle_expanded)}
              onClick={(): void => setIsInputExpanded(prev => !prev)}
            >
              <ChevronRightIcon />
              <span>Input</span>
            </button>
            {isInputExpanded && (
              <div className={styles.input_viewer}>
                <JsonViewer title="parameter" data={pendingCall.parameter} />
              </div>
            )}
          </div>

          {isDenyMode && (
            <div className={styles.deny_reason}>
              <label htmlFor="asgard-consent-deny-reason">Deny reason (optional)</label>
              <textarea
                id="asgard-consent-deny-reason"
                value={denyReason}
                onChange={(e): void => setDenyReason(e.target.value)}
                placeholder="Let the assistant know why you are denying this tool call."
              />
            </div>
          )}
        </div>

        {totalCount > 1 && (
          <div className={styles.pending_indicator}>
            {currentIndex} / {totalCount} pending tool call{totalCount > 1 ? 's' : ''}
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={clsx(styles.action_btn, styles.action_primary)} onClick={handleAllowAlways}>
            Allow for This Chat
          </button>
          <button type="button" className={clsx(styles.action_btn, styles.action_secondary)} onClick={handleAllowOnce}>
            Allow Once
          </button>
          <button type="button" className={clsx(styles.action_btn, styles.action_danger)} onClick={handleDenyClick}>
            {isDenyMode ? 'Send Deny' : 'Deny'}
          </button>
        </div>
      </div>
    </div>
  );
}
