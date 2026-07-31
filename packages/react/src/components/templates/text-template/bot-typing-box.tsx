import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { BotMessageText } from './bot-message-text';

interface BotTypingBoxProps {
  isTyping: boolean;
  typingText: string | null;
}

// F-003 — the "in progress" cue now lives at the seam (RunningIndicator), bound to the whole
// connection. This box only renders the live streaming text — no 3-dot animation, no 500ms debounce.
// It shows once there is streaming text; the empty pre-first-delta gap is covered by the seam indicator.
export function BotTypingBox(props: BotTypingBoxProps): ReactNode {
  const { isTyping, typingText } = props;

  if (!isTyping || !typingText) return null;

  return (
    <TemplateBox className="asgard-text-template asgard-text-template--bot" type="bot" direction="horizontal">
      <TemplateBoxContent>
        <BotMessageText>{typingText}</BotMessageText>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
