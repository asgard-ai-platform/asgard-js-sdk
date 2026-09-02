import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { FeedbackVerdict, feedbackCommentByteLength, FEEDBACK_COMMENT_MAX_BYTES } from '@asgard-js/core';
import { useAsgardThemeContext } from '../../context/asgard-theme-context';
import { Locale, t } from '../../i18n';
import styles from './message-feedback-modal.module.scss';

/**
 * What the user chose in the feedback dialog (F-033). `comment` is trimmed and absent when empty;
 * `sendToAi` mirrors the "send to AI as well" checkbox, which is **checked by default**.
 */
export interface FeedbackSubmission {
  verdict: FeedbackVerdict;
  comment?: string;
  sendToAi: boolean;
}

export interface MessageFeedbackModalProps {
  verdict: FeedbackVerdict;
  locale: Locale;
  /** Close without sending — Cancel, Escape or a backdrop click (UC-055 Alt B). */
  onCancel: () => void;
  /**
   * Submit. The dialog stays open, with the comment intact, until the promise resolves; a rejection is
   * shown as an inline error so the user can try again (UC-055 Alt A). The caller closes the dialog.
   */
  onSubmit: (submission: FeedbackSubmission) => Promise<void>;
}

/**
 * The feedback dialog (F-033 / UC-055, UC-056). Three things, in this order, matching the pinned
 * chat-kit prototype: an **optional** comment (submitting never requires text), the "send to AI as
 * well" checkbox checked by default (most people will not type — the checkbox is what still turns a
 * bare 👍 into a signal the agent hears), then Cancel / Submit. Focus lands on the textarea on open;
 * Escape and a click on the backdrop cancel.
 */
export function MessageFeedbackModal(props: MessageFeedbackModalProps): ReactNode {
  const { verdict, locale, onCancel, onSubmit } = props;
  const [comment, setComment] = useState('');
  const [sendToAi, setSendToAi] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const errorId = useId();

  const theme = useAsgardThemeContext();
  const { chatbot } = theme;
  // The same accent resolution as the consent modal / footer focus ring: primaryComponent.mainColor,
  // then the shell mainColor, then the user-bubble color so a host that only themes userMessage still
  // gets a matching accent.
  const accent = chatbot?.primaryComponent?.mainColor ?? chatbot?.mainColor ?? theme.userMessage?.backgroundColor;
  const onAccent = chatbot?.primaryComponent?.secondaryColor ?? chatbot?.secondaryColor;

  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        ...(accent && { '--asgard-feedback-accent': accent }),
        ...(onAccent && { '--asgard-feedback-on-accent': onAccent }),
        ...(chatbot?.backgroundColor && {
          '--asgard-feedback-modal-bg': chatbot.backgroundColor,
          '--asgard-feedback-input-bg': chatbot.backgroundColor,
        }),
        ...(chatbot?.borderColor && { '--asgard-feedback-border': chatbot.borderColor }),
        ...(chatbot?.inactiveColor && { '--asgard-feedback-muted': chatbot.inactiveColor }),
      } as CSSProperties),
    [accent, onAccent, chatbot],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const good = verdict === 'GOOD';
  const title = t(locale, good ? 'feedback.titleGood' : 'feedback.titleBad');

  const handleSubmit = useCallback(
    async (event?: FormEvent): Promise<void> => {
      event?.preventDefault();

      if (submitting) return;

      const trimmed = comment.trim();

      // UC-056 Alt B — the server measures the cap in UTF-8 bytes; refuse here rather than round-trip a
      // request that can only come back 400.
      if (feedbackCommentByteLength(trimmed) > FEEDBACK_COMMENT_MAX_BYTES) {
        setError(t(locale, 'feedback.tooLong'));

        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        await onSubmit({ verdict, ...(trimmed ? { comment: trimmed } : {}), sendToAi });
      } catch {
        // UC-055 Alt A — keep the dialog and the text; say what happened; let the user try again.
        setError(t(locale, 'feedback.submitFailed'));
      } finally {
        setSubmitting(false);
      }
    },
    [comment, locale, onSubmit, sendToAi, submitting, verdict],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape' && !submitting) {
        event.stopPropagation();
        onCancel();
      }
    },
    [onCancel, submitting],
  );

  const handleBackdropMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // The backdrop counts as "outside"; the card itself does not.
      if (event.target === event.currentTarget && !submitting) onCancel();
    },
    [onCancel, submitting],
  );

  return (
    <div
      className={clsx('asgard-message-feedback-modal', styles.backdrop)}
      style={themeVars}
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        onSubmit={handleSubmit}
      >
        <div id={titleId} className={styles.title}>
          {title}
        </div>
        <label className={styles.details}>
          {t(locale, 'feedback.detailsLabel')}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={comment}
            onChange={(event): void => setComment(event.target.value)}
            placeholder={t(locale, good ? 'feedback.placeholderGood' : 'feedback.placeholderBad')}
            rows={4}
            disabled={submitting}
          />
        </label>
        <label className={styles.send_to_ai} title={t(locale, 'feedback.sendToAiTitle')}>
          <input
            type="checkbox"
            checked={sendToAi}
            onChange={(event): void => setSendToAi(event.target.checked)}
            disabled={submitting}
          />
          {t(locale, 'feedback.sendToAi')}
        </label>
        {error && (
          <div id={errorId} className={styles.error} role="alert">
            {error}
          </div>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={clsx(styles.button, styles['button--secondary'])}
            onClick={onCancel}
            disabled={submitting}
          >
            {t(locale, 'feedback.cancel')}
          </button>
          <button type="submit" className={clsx(styles.button, styles['button--primary'])} disabled={submitting}>
            {t(locale, submitting ? 'feedback.submitting' : 'feedback.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
