import { LocationMessageTemplate, ConversationBotMessage } from '@asgard-js/core';
import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { LocationCard } from './location-card';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface LocationTemplateProps {
  message: ConversationBotMessage;
}

export function LocationTemplate(props: LocationTemplateProps): ReactNode {
  const { message } = props;

  const { template: themeTemplate } = useAsgardThemeContext();

  const template = message.message.template as LocationMessageTemplate;

  return (
    <TemplateBox className="asgard-location-template" type="bot" direction="horizontal">
      <TemplateBoxContent quickReplies={template?.quickReplies} references={template?.references} message={message}>
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
