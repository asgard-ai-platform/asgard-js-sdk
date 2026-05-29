import { ReactNode, useMemo, useState, useRef, useEffect, CSSProperties } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { ConversationBotMessage, ChartMessageTemplate } from '@asgard-js/core';
import { Time } from '../time';
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

  const [option, setOption] = useState(template?.defaultChart ?? template?.chartOptions?.[0]?.type);

  const options = useMemo(() => template.chartOptions, [template]);

  const spec = useMemo(
    () => (template?.chartOptions?.find(item => item.type === option)?.spec ?? options[0].spec) as VisualizationSpec,
    [option, template.chartOptions, options],
  );

  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = chartRef.current;

    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;

      if (width) setChartWidth(Math.floor(width));
    });

    observer.observe(el);

    return (): void => observer.disconnect();
  }, []);

  const responsiveSpec = useMemo<VisualizationSpec>(() => {
    if (!chartWidth) return spec;

    const cloned = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;

    cloned.width = chartWidth;
    cloned.autosize = { type: 'fit', resize: true, contains: 'padding' };

    return cloned as unknown as VisualizationSpec;
  }, [spec, chartWidth]);

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
      <TemplateBoxContent quickReplies={template?.quickReplies} references={template?.references} message={message}>
        <div className={classes.container} style={styles}>
          <div className={classes.header}>
            <div className={classes.title_box}>
              {template.title && <div className={classes.title}>{template.title}</div>}
              {template.text && <div className={classes.description}>{template.text}</div>}
            </div>
            {options.length > 1 && (
              <select
                className={classes.chart_select}
                value={option}
                onChange={e => setOption(e.target.value)}
                aria-label="Select chart type"
              >
                {options.map(opt => (
                  <option key={opt.type} value={opt.type}>
                    {opt.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div ref={chartRef} className={classes.chart_wrapper}>
            <VegaEmbed spec={responsiveSpec} options={{ actions: false }} />
          </div>
        </div>
      </TemplateBoxContent>
      <Time className={classes.chart_time} time={message.time} />
    </TemplateBox>
  );
}
