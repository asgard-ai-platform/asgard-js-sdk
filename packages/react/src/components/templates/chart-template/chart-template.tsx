import { ReactNode, useMemo, useState, CSSProperties } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { ConversationBotMessage } from '@asgard-js/core';
import { Time } from '../time';
import { useAsgardContext } from 'src/context/asgard-service-context';
import { ChartMessageTemplate } from '@asgard-js/core';
import { VegaLite, VisualizationSpec } from 'react-vega';
import clsx from 'clsx';
import classes from './chart-template.module.scss';
import { useAsgardThemeContext } from 'src/context/asgard-theme-context';

interface ChartTemplateProps {
  message: ConversationBotMessage;
}

export function ChartTemplate(props: ChartTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as ChartMessageTemplate;

  const { template: themeTemplate, botMessage } = useAsgardThemeContext();
  const { avatar } = useAsgardContext();

  const [option, setOption] = useState(
    template?.defaultChart ?? template?.chartOptions?.[0]?.type
  );

  const options = useMemo(() => template.chartOptions, [template]);

  const spec = useMemo(
    () =>
      (template?.chartOptions?.find((item) => item.type === option)?.spec ??
        options[0].spec) as VisualizationSpec,
    [option, template.chartOptions]
  );

  const styles = useMemo<CSSProperties>(
    () => ({
      color: botMessage?.color,
      backgroundColor: botMessage?.backgroundColor,
    }),
    [botMessage]
  );

  return (
    <TemplateBox
      className="asgard-chart-template"
      type="bot"
      direction="vertical"
      style={themeTemplate?.ChartMessageTemplate?.style}
    >
      <Avatar avatar={avatar} />
      <div className={clsx(classes.text, classes['text--bot'])} style={styles}>
        <div>{template.title}</div>
        <div>{template.text}</div>
      </div>
      {options.length > 1 && (
        <div className={classes.quick_replies_box}>
          {options.map((option) => (
            <button
              key={option.type}
              className={classes.quick_reply}
              onClick={() => setOption(option.type)}
            >
              {option.title}
            </button>
          ))}
        </div>
      )}
      <TemplateBoxContent quickReplies={template?.quickReplies}>
        <VegaLite spec={spec} />
      </TemplateBoxContent>
      <Time className={classes.chart_time} time={message.time} />
    </TemplateBox>
  );
}
