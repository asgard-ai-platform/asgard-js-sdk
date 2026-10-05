import { AttachmentMessageTemplate, ButtonAction, ConversationBotMessage, resolveSandboxUri } from '@asgard-js/core';
import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { SandboxDownloadCard } from '../../sandbox-download/sandbox-download-card';
import { AttachmentChip } from './chip';
import styles from './attachment-template.module.scss';

/** The `sandbox://…/download-file` intent behind an attachment, from whichever of its two actions carries it. */
function downloadFileIntent(
  ...actions: (ButtonAction | undefined)[]
): { sandboxName: string; absolutePath: string } | null {
  for (const action of actions) {
    if (action?.type !== 'uri' && action?.type !== 'URI') continue;

    const intent = resolveSandboxUri(action.uri);

    if (intent?.kind === 'download-file') return intent;
  }

  return null;
}

interface AttachmentTemplateProps {
  message: ConversationBotMessage;
}

export function AttachmentTemplate(props: AttachmentTemplateProps): ReactNode {
  const { message } = props;

  const { template: themeTemplate } = useAsgardThemeContext();

  const template = message.message.template as AttachmentMessageTemplate;
  const themed = themeTemplate?.AttachmentMessageTemplate;
  const customStyle = {
    style: themed?.style,
    title: { style: themed?.title?.style ?? {} },
    description: { style: themed?.description?.style ?? {} },
    iconBox: { style: themed?.iconBox?.style ?? {} },
    downloadButton: { style: themed?.downloadButton?.style ?? {} },
  };

  return (
    <TemplateBox className="asgard-attachment-template" type="bot" direction="horizontal">
      <TemplateBoxContent quickReplies={template?.quickReplies} references={template?.references} message={message}>
        <div className={styles.root}>
          {template?.attachments?.map((attachment, index) => {
            // F-038 — a download-file card has state (wake → wait → download), so it is its own component.
            const download = downloadFileIntent(attachment.downloadAction, attachment.defaultAction);

            if (download) {
              return (
                <SandboxDownloadCard
                  key={index}
                  sandboxName={download.sandboxName}
                  absolutePath={download.absolutePath}
                  title={attachment.title}
                  text={attachment.text}
                  customStyle={customStyle}
                />
              );
            }

            return (
              <AttachmentChip
                key={index}
                title={attachment.title}
                text={attachment.text}
                defaultAction={attachment.defaultAction}
                downloadAction={attachment.downloadAction}
                raw={message.raw}
                customStyle={customStyle}
              />
            );
          })}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
