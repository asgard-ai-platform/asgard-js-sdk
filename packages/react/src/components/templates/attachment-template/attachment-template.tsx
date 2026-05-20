import { AttachmentMessageTemplate, ConversationBotMessage } from '@asgard-js/core';
import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { AttachmentChip } from './chip';
import styles from './attachment-template.module.scss';

interface AttachmentTemplateProps {
  message: ConversationBotMessage;
}

export function AttachmentTemplate(props: AttachmentTemplateProps): ReactNode {
  const { message } = props;

  const { avatar } = useAsgardContext();

  const template = message.message.template as AttachmentMessageTemplate;

  return (
    <TemplateBox className="asgard-attachment-template" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent
        time={message.time}
        quickReplies={template?.quickReplies}
        references={template?.references}
        message={message}
      >
        <div className={styles.root}>
          {template?.attachments?.map((attachment, index) => (
            <AttachmentChip
              key={index}
              title={attachment.title}
              text={attachment.text}
              defaultAction={attachment.defaultAction}
              downloadAction={attachment.downloadAction}
              raw={message.raw}
            />
          ))}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
