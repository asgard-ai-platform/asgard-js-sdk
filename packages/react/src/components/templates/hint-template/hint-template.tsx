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
            {onErrorClick && (
              <div className={classes.error_hint_message} onClick={onErrorHintClick}>
                Click <span>here</span> to view the report.
              </div>
            )}
          </>
        )}
      </div>
    );

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
