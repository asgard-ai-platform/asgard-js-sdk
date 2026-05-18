import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolCallConsentPendingCall } from '@asgard-js/core';
import { useAsgardThemeContext } from '../../context/asgard-theme-context';
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

  const { chatbot } = useAsgardThemeContext();
  const secondaryColor = chatbot?.primaryComponent?.secondaryColor ?? chatbot?.secondaryColor;
  const inactiveColor = chatbot?.inactiveColor;
  const backgroundColor = chatbot?.backgroundColor;
  const borderColor = chatbot?.borderColor;

  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        ...(secondaryColor && {
          '--asgard-consent-modal-accent': secondaryColor,
          '--asgard-consent-modal-accent-hover': `color-mix(in srgb, ${secondaryColor} 85%, black)`,
        }),
        ...(backgroundColor && {
          '--asgard-consent-modal-bg': backgroundColor,
          '--asgard-consent-modal-input-bg': backgroundColor,
        }),
        ...(borderColor && { '--asgard-consent-modal-border': borderColor }),
        ...(inactiveColor && { '--asgard-consent-modal-muted': inactiveColor }),
      } as CSSProperties),
    [secondaryColor, backgroundColor, borderColor, inactiveColor],
  );

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
    <div className={styles.backdrop} onClick={handleBackdropClick} style={themeVars}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.title}>
            允許使用工具 <span className={styles.title_tool}>「{pendingCall.toolName}」</span>？
          </div>
          {onDismiss && (
            <button type="button" className={styles.close_btn} onClick={onDismiss} aria-label="關閉">
              <CloseIcon />
            </button>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.meta_row}>
            <span>
              工具集：<strong>{pendingCall.toolsetName}</strong>
            </span>
            <span>
              工具：<strong>{pendingCall.toolName}</strong>
            </span>
          </div>

          <div className={styles.input_section}>
            <button
              type="button"
              className={clsx(styles.input_toggle, isInputExpanded && styles.input_toggle_expanded)}
              onClick={(): void => setIsInputExpanded(prev => !prev)}
            >
              <ChevronRightIcon />
              <span>輸入內容</span>
            </button>
            {isInputExpanded && (
              <div className={styles.input_viewer}>
                <JsonViewer title="parameter" data={pendingCall.parameter} />
              </div>
            )}
          </div>

          {isDenyMode && (
            <div className={styles.deny_reason}>
              <label htmlFor="asgard-consent-deny-reason">拒絕原因（選填）</label>
              <textarea
                id="asgard-consent-deny-reason"
                value={denyReason}
                onChange={(e): void => setDenyReason(e.target.value)}
                placeholder="告訴 AI 你為什麼拒絕此次工具呼叫。"
              />
            </div>
          )}
        </div>

        {totalCount > 1 && (
          <div className={styles.pending_indicator}>
            {currentIndex} / {totalCount} 個待處理工具呼叫
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={clsx(styles.action_btn, styles.action_primary)} onClick={handleAllowAlways}>
            本次對話皆允許
          </button>
          <button type="button" className={clsx(styles.action_btn, styles.action_secondary)} onClick={handleAllowOnce}>
            僅此次允許
          </button>
          <button type="button" className={clsx(styles.action_btn, styles.action_danger)} onClick={handleDenyClick}>
            {isDenyMode ? '送出拒絕' : '拒絕'}
          </button>
        </div>
      </div>
    </div>
  );
}
