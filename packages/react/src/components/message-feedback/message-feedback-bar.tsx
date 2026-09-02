import { CSSProperties, ReactNode, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  composeFeedbackMessage,
  ConversationBotMessage,
  ConversationMessage,
  FeedbackVerdict,
  MessageTemplateType,
} from '@asgard-js/core';
import { useAsgardContext } from '../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { useAsgardThemeContext } from '../../context/asgard-theme-context';
import { t } from '../../i18n';
import { FeedbackSubmission, MessageFeedbackModal } from './message-feedback-modal';
import styles from './message-feedback-bar.module.scss';

/**
 * Whether a conversation message is an assistant reply the user can rate (F-033). Only a **completed
 * bot message** qualifies — the server 404s on anything else (a thinking block, a canvas, the user's own
 * message), and a reply still streaming has no settled content to judge. A completed bot frame with
 * nothing to show (empty text on a bare TEXT template — the default renderer draws nothing for it) is
 * skipped too, so no bar floats under an invisible message.
 */
export function isRatableReply(message: ConversationMessage): message is ConversationBotMessage {
  if (message.type !== 'bot' || message.isTyping) return false;

  const template = message.message.template;
  const hasText = Boolean(message.message.text?.trim());
  const hasNonTextTemplate = Boolean(template) && template.type !== MessageTemplateType.TEXT;

  return hasText || hasNonTextTemplate;
}

function ThumbsUpIcon({ filled }: { filled: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbsDownIcon({ filled }: { filled: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

export interface MessageFeedbackBarProps {
  message: ConversationBotMessage;
}

/**
 * The 👍 / 👎 row under an assistant reply (F-033). Message-level chrome: it is mounted by
 * `ConversationMessageRenderer` after the message content — default renderer or a host's
 * `renderMessageContent` alike — never inside a template.
 *
 * The rated button is filled and `aria-pressed`; the other stays outlined, and clicking it re-rates
 * (latest wins — there is no un-rate, UC-059). Clicking the already-lit one opens the same dialog and
 * resubmits that verdict, which is how a comment gets updated. Both buttons are disabled while a run is
 * in flight: a "send to AI as well" follow-up needs an idle channel, and a rating made mid-run would
 * otherwise post fine while its follow-up is refused as busy.
 *
 * Renders nothing unless `enableFeedback` is on and the context can rate (not in preview mode).
 */
export function MessageFeedbackBar(props: MessageFeedbackBarProps): ReactNode {
  const { message } = props;
  const { locale = 'en-US', enableFeedback } = useAsgardTemplateContext();
  const { sendMessageFeedback, sendMessage, isRunning } = useAsgardContext();
  const { chatbot } = useAsgardThemeContext();
  const [pending, setPending] = useState<FeedbackVerdict | null>(null);

  const accent = chatbot?.primaryComponent?.mainColor ?? chatbot?.mainColor;
  const themeVars = useMemo<CSSProperties>(
    () =>
      ({
        ...(accent && { '--asgard-feedback-accent': accent }),
        ...(chatbot?.inactiveColor && { '--asgard-feedback-muted': chatbot.inactiveColor }),
      } as CSSProperties),
    [accent, chatbot],
  );

  const submit = useCallback(
    async (submission: FeedbackSubmission): Promise<void> => {
      if (!sendMessageFeedback) return;

      // The structured verdict first; the dialog shows a rejection and nothing else happens (UC-057 Alt A).
      await sendMessageFeedback(message.messageId, {
        verdict: submission.verdict,
        ...(submission.comment ? { comment: submission.comment } : {}),
      });

      setPending(null);

      // Then — and only then — the optional follow-up, as an ordinary message (UC-057). Fire-and-forget:
      // the context's `sendMessage` reports its own failures through `onSseError`, and the rating has
      // already been recorded, so there is nothing here to roll back.
      if (submission.sendToAi) {
        void sendMessage?.({ text: composeFeedbackMessage(submission.verdict, submission.comment) });
      }
    },
    [message.messageId, sendMessage, sendMessageFeedback],
  );

  if (!enableFeedback || !sendMessageFeedback) return null;

  const rated = message.feedback?.verdict;

  const renderButton = (verdict: FeedbackVerdict): ReactNode => {
    const active = rated === verdict;
    const label = t(locale, verdict === 'GOOD' ? 'feedback.good' : 'feedback.bad');
    const Icon = verdict === 'GOOD' ? ThumbsUpIcon : ThumbsDownIcon;

    return (
      <button
        type="button"
        className={clsx(styles.button, active && styles['button--active'])}
        onClick={(): void => setPending(verdict)}
        disabled={isRunning}
        aria-label={label}
        aria-pressed={active}
        title={active ? t(locale, `feedback.rated.${verdict}`) : label}
        data-verdict={verdict}
      >
        <Icon filled={active} />
      </button>
    );
  };

  return (
    <div className={clsx('asgard-message-feedback', styles.bar)} style={themeVars}>
      {renderButton('GOOD')}
      {renderButton('BAD')}
      {pending && (
        <MessageFeedbackModal
          verdict={pending}
          locale={locale}
          onCancel={(): void => setPending(null)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
