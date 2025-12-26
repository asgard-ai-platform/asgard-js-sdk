import { ButtonMessageTemplate, ConversationBotMessage } from '@asgard-js/core';
import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { Card } from './card';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface ButtonTemplateProps {
  message: ConversationBotMessage;
}

export function ButtonTemplate(props: ButtonTemplateProps): ReactNode {
  const { message } = props;

  const { template: themeTemplate } = useAsgardThemeContext();

  const { avatar } = useAsgardContext();

  const template = message.message.template as ButtonMessageTemplate;

  return (
    <TemplateBox className="asgard-button-template" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent time={message.time} quickReplies={template?.quickReplies} message={message}>
        <Card
          template={template}
          customStyle={{
            style: themeTemplate?.ButtonMessageTemplate?.style,
            title: {
              style: themeTemplate?.ButtonMessageTemplate?.title?.style ?? {},
            },
            description: {
              style: themeTemplate?.ButtonMessageTemplate?.description?.style ?? {},
            },
            button: {
              style: themeTemplate?.ButtonMessageTemplate?.button?.style ?? {},
            },
          }}
        />
      </TemplateBoxContent>
    </TemplateBox>
  );
}
