import { ReactNode, useState } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import styles from './image-template.module.scss';
import { ConversationBotMessage, ImageMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import CloseSvg from '../../../icons/close.svg?react';

interface ImageTemplateProps {
  message: ConversationBotMessage;
}

export function ImageTemplate(props: ImageTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as ImageMessageTemplate;
  const { previewImageUrl, originalContentUrl } = template;

  const { template: themeTemplate } = useAsgardThemeContext();

  const { avatar } = useAsgardContext();
  const [isFullScreen, setIsFullScreen] = useState(false);
  if (isFullScreen) {
    return (
      <div className={styles.full_screen} onClick={() => setIsFullScreen(false)}>
        <div className={styles.full_screen_close}>
          <CloseSvg />
        </div>
        <div className={styles.imageOrigin} style={{ backgroundImage: `url(${originalContentUrl})` }} />
      </div>
    );
  }

  return (
    <TemplateBox
      className="asgard-image-template"
      type="bot"
      direction="horizontal"
      style={themeTemplate?.ImageMessageTemplate?.style}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent quickReplies={template.quickReplies} time={message.time} message={message}>
        <div className={styles.image_box} onClick={() => setIsFullScreen(true)}>
          <img src={previewImageUrl} alt="Conversation content" />
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
