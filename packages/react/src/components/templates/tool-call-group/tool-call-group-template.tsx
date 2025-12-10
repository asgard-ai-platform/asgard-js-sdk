import { ReactNode } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { ToolCallGroup, ToolCallGroupProps } from './tool-call-group';

interface ToolCallGroupTemplateProps extends ToolCallGroupProps {
  time?: Date;
}

export function ToolCallGroupTemplate(props: ToolCallGroupTemplateProps): ReactNode {
  const { time, ...toolCallGroupProps } = props;
  const { avatar } = useAsgardContext();

  return (
    <TemplateBox className="asgard-tool-call-group-template" type="bot" direction="horizontal">
      <Avatar avatar={avatar} />
      <TemplateBoxContent time={time}>
        <ToolCallGroup {...toolCallGroupProps} />
      </TemplateBoxContent>
    </TemplateBox>
  );
}
