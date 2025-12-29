import { LocationMessageTemplate, ConversationBotMessage } from '@asgard-js/core';
import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { LocationCard } from './location-card';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface LocationTemplateProps {
  message: ConversationBotMessage;
}

export function LocationTemplate(props: LocationTemplateProps): ReactNode {
  const { message } = props;

  const { template: themeTemplate } = useAsgardThemeContext();

  const { avatar } = useAsgardContext();

  const template = message.message.template as LocationMessageTemplate;

  return (
    <TemplateBox className="asgard-location-template" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent time={message.time} quickReplies={template?.quickReplies} references={template?.references}>
        <LocationCard
          template={template}
          customStyle={{
            style: themeTemplate?.LocationMessageTemplate?.style,
            title: {
              style: themeTemplate?.LocationMessageTemplate?.title?.style ?? {},
            },
            description: {
              style: themeTemplate?.LocationMessageTemplate?.description?.style ?? {},
            },
          }}
        />
      </TemplateBoxContent>
    </TemplateBox>
  );
}
