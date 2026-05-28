import { ReactNode, useMemo, useState, CSSProperties } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import { ConversationBotMessage, ChartMessageTemplate } from '@asgard-js/core';
import { Time } from '../time';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { VegaEmbed } from 'react-vega';
import { VisualizationSpec } from 'vega-embed';
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

  const containerStyles = useMemo<CSSProperties>(
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
      <TemplateBoxContent quickReplies={template?.quickReplies} references={template?.references} message={message}>
        <div className={classes.chart_container} style={containerStyles}>
          <div className={classes.chart_header}>
            {template.title && <span className={classes.chart_title}>{template.title}</span>}
            {options.length > 1 && (
              <select className={classes.chart_type_select} value={option} onChange={e => setOption(e.target.value)}>
                {options.map((o: { type: string; title: string; spec: Record<string, unknown> }) => (
                  <option key={o.type} value={o.type}>
                    {o.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <VegaEmbed spec={spec} options={{ actions: false }} />
        </div>
      </TemplateBoxContent>
      <Time className={classes.chart_time} time={message.time} />
    </TemplateBox>
  );
}
