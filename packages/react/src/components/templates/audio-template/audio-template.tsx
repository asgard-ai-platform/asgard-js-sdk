import { ReactNode, useEffect } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import styles from './audio-template.module.scss';
import { ConversationBotMessage, AudioMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface AudioTemplateProps {
  message: ConversationBotMessage;
}

export function AudioTemplate(props: AudioTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as AudioMessageTemplate;
  const { originalContentUrl } = template;

  const { template: themeTemplate } = useAsgardThemeContext();
  const { avatar, messageBoxBottomRef } = useAsgardContext();

  // Auto scroll to bottom when AUDIO message is rendered
  useEffect(() => {
    const timer = setTimeout(() => {
      if (messageBoxBottomRef.current) {
        messageBoxBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);

    return (): void => clearTimeout(timer);
  }, [messageBoxBottomRef]);

  return (
    <TemplateBox
      className="asgard-audio-template"
      type="bot"
      direction="horizontal"
      style={themeTemplate?.AudioMessageTemplate?.style}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent quickReplies={template.quickReplies} time={message.time}>
        <div className={styles.audio_box}>
          <audio
            className={styles.audio_player}
            src={originalContentUrl}
            controls
            controlsList="nodownload nofullscreen noremoteplayback"
            preload="none"
          />
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
