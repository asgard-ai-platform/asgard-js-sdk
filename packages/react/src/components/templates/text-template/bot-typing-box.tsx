import { CSSProperties, ReactNode, useMemo } from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import clsx from 'clsx';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { useDebounce } from '../../../hooks';
import classes from './text-template.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from './streamdown-client';

interface BotTypingBoxProps {
  isTyping: boolean;
  typingText: string | null;
}

export function BotTypingBox(props: BotTypingBoxProps): ReactNode {
  const { isTyping, typingText } = props;
  const { avatar } = useAsgardContext();

  const theme = useAsgardThemeContext();

  const _isTyping = useDebounce(isTyping, 500);

  const styles = useMemo<CSSProperties>(
    () => ({
      color: theme?.botMessage?.color,
      backgroundColor: theme?.botMessage?.backgroundColor,
    }),
    [theme],
  );

  const dotStyles = useMemo<CSSProperties>(
    () => ({
      backgroundColor: theme?.botMessage?.color,
    }),
    [theme],
  );

  if (!_isTyping) return null;

  return (
    <TemplateBox className="asgard-text-template asgard-text-template--bot" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent time={new Date()}>
        <div className={clsx(classes.text, classes['text--bot'])} style={styles}>
          <span>
            {typingText ? <StreamdownClient>{typingText}</StreamdownClient> : null}
            {_isTyping && (
              <span className={classes['typing-indicator']}>
                <div className={classes.dot} style={dotStyles} />
                <div className={classes.dot} style={dotStyles} />
                <div className={classes.dot} style={dotStyles} />
              </span>
            )}
          </span>
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
