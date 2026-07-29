import { ReactNode, useCallback } from 'react';
import classes from './hint-template.module.scss';
import { formatTime } from '../../../utils';
import { ConversationErrorMessage, ConversationMessage, MessageTemplateType } from '@asgard-js/core';
import { useAsgardTemplateContext, useAsgardThemeContext } from '../../../context';
import clsx from 'clsx';

interface HintTemplateProps {
  message: ConversationMessage;
}

export function HintTemplate(props: HintTemplateProps): ReactNode {
  const { message } = props;

  const { template: themeTemplate } = useAsgardThemeContext();
  const { onErrorClick, errorMessageRenderer } = useAsgardTemplateContext();

  const onErrorHintClick = useCallback(() => {
    onErrorClick?.(message as ConversationErrorMessage);
  }, [message, onErrorClick]);

  if (message.type === 'user') return null;

  if (message.type === 'error')
    return (
      <div className={clsx('asgard-hint-template asgard-hint-template--error', classes.hint_root)}>
        {errorMessageRenderer?.(message) ?? (
          <>
            <div className={classes.error_hint_title}>
              <span className={classes.time}>{formatTime(message.time)}</span>
              <span>Unexpected error</span>
            </div>
            {/* The server's own wording for what went wrong (`run.error`'s `error.message`). Without it the
                bubble said only "Unexpected error", so the cause was reachable solely by reading the raw SSE
                frame. Hosts that must not show server internals to end users can still replace the whole
                bubble via `errorMessageRenderer`. */}
            {message.error.message && <div className={classes.error_hint_detail}>{message.error.message}</div>}
            {onErrorClick && (
              <div className={classes.error_hint_message} onClick={onErrorHintClick}>
                Click <span>here</span> to view the report.
              </div>
            )}
          </>
        )}
      </div>
    );

  // Only bot messages have the message.template property
  if (message.type !== 'bot') return null;

  const template = message.message.template;

  if (template.type !== MessageTemplateType.HINT) return null;

  return (
    <div
      className={clsx('asgard-hint-template asgard-hint-template--hint', classes.hint_root)}
      style={themeTemplate?.HintMessageTemplate?.style}
    >
      <div className={classes.time} style={themeTemplate?.time?.style}>
        {formatTime(message.time)}
      </div>
      <div className={classes.hint_text} style={themeTemplate?.HintMessageTemplate?.style}>
        {template.text}
      </div>
    </div>
  );
}
