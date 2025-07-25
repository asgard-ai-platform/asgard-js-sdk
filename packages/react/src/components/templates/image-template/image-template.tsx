import { ReactNode, useState } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import styles from './image-template.module.scss';
import { ConversationBotMessage } from '@asgard-js/core';
import { useAsgardContext } from 'src/context/asgard-service-context';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';
import { ImageMessageTemplate } from '@asgard-js/core';
import CloseSvg from 'src/icons/close.svg?react';

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
      <div
        className={styles.full_screen}
        onClick={() => setIsFullScreen(false)}
      >
        <div className={styles.full_screen_close}>
          <CloseSvg />
        </div>
        <div
          className={styles.imageOrigin}
          style={{ backgroundImage: `url(${originalContentUrl})` }}
        />
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
      <TemplateBoxContent
        quickReplies={template.quickReplies}
        time={message.time}
      >
        <div className={styles.image_box} onClick={() => setIsFullScreen(true)}>
          <img src={previewImageUrl} alt="Message image" />
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
