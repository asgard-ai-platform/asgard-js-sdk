import { ReactNode, useMemo, useState, CSSProperties } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { ConversationBotMessage, ChartMessageTemplate } from '@asgard-js/core';
import { Time } from '../time';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { VegaEmbed } from 'react-vega';
import { VisualizationSpec } from 'vega-embed';
import clsx from 'clsx';
import classes from './chart-template.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface ChartTemplateProps {
  message: ConversationBotMessage;
}

export function ChartTemplate(props: ChartTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as ChartMessageTemplate;

  const { template: themeTemplate, botMessage } = useAsgardThemeContext();
  const { avatar } = useAsgardContext();

  const [option, setOption] = useState(template?.defaultChart ?? template?.chartOptions?.[0]?.type);

  const options = useMemo(() => template.chartOptions, [template]);

  const spec = useMemo(
    () =>
      (template?.chartOptions?.find(
        (item: { type: string; title: string; spec: Record<string, unknown> }) => item.type === option,
      )?.spec ?? options[0].spec) as VisualizationSpec,
    [option, template.chartOptions, options],
  );

  const styles = useMemo<CSSProperties>(
    () => ({
      color: botMessage?.color,
      backgroundColor: botMessage?.backgroundColor,
    }),
    [botMessage],
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
          {options.map((option: { type: string; title: string; spec: Record<string, unknown> }) => (
            <button key={option.type} className={classes.quick_reply} onClick={() => setOption(option.type)}>
              {option.title}
            </button>
          ))}
        </div>
      )}
      <TemplateBoxContent quickReplies={template?.quickReplies} references={template?.references} message={message}>
        <div className={classes.chart_wrapper}>
          <VegaEmbed spec={spec} />
        </div>
      </TemplateBoxContent>
      <Time className={classes.chart_time} time={message.time} />
    </TemplateBox>
  );
}
