import { CSSProperties, ReactNode, useMemo } from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import clsx from 'clsx';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import classes from './text-template.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from './streamdown-client';

interface BotTypingBoxProps {
  isTyping: boolean;
  typingText: string | null;
}

// Renders the bot's live streaming text while a message is still assembling.
// The run-in-progress affordance now lives in <RunningIndicator/> at the thread↔input
// seam (F-003), so this box shows the streaming text only — no per-message three-dot
// animation and no debounce (both were pre-resume workarounds against flicker).
export function BotTypingBox(props: BotTypingBoxProps): ReactNode {
  const { isTyping, typingText } = props;
  const { avatar } = useAsgardContext();

  const theme = useAsgardThemeContext();

  const styles = useMemo<CSSProperties>(
    () => ({
      color: theme?.botMessage?.color,
      backgroundColor: theme?.botMessage?.backgroundColor,
    }),
    [theme],
  );

  if (!isTyping || !typingText) return null;

  return (
    <TemplateBox className="asgard-text-template asgard-text-template--bot" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent time={new Date()}>
        <div className={clsx(classes.text, classes['text--bot'])} style={styles}>
          <StreamdownClient>{typingText}</StreamdownClient>
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
