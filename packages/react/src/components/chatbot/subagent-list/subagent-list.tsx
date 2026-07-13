import { ReactNode, useMemo, useState } from 'react';
import clsx from 'clsx';
import { reduceSubagents, Subagent, SubagentStatus, SubagentToolCall } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { DEFAULT_LOCALE, Locale, t, toolLabel } from '../../../i18n';
import styles from './subagent-list.module.scss';

// `reduceSubagents` + the routing predicates (`isAgentTool` / `isSubagentChildTool` /
// `isSubagentRelated`) + the `Subagent` / `SubagentToolCall` types now live in `@asgard-js/core`
// (F-013). The in-chatbot panel folds the current `messages`; external consumers rendering their own
// list use the `useSubagents()` hook / the `channel.subagents` store.

// The current (last running, else last) child tool — what a collapsed running subagent shows.
function currentTool(tools: SubagentToolCall[]): SubagentToolCall | undefined {
  for (let i = tools.length - 1; i >= 0; i--) {
    if (tools[i].status === 'running') return tools[i];
  }

  return tools[tools.length - 1];
}

const SPINNER = (
  <>
    <circle cx="12" cy="12" r="9" opacity="0.3" />
    <path d="M12 3a9 9 0 019 9" strokeLinecap="round">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="1s"
        repeatCount="indefinite"
      />
    </path>
  </>
);

function SubagentGlyph({ status, label }: { status: SubagentStatus; label: string }): ReactNode {
  const common = { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor' } as const;

  if (status === 'running') {
    return (
      <svg
        {...common}
        strokeWidth="2"
        className={clsx(styles.subagent_list__glyph, styles['subagent_list__glyph--running'])}
        aria-label={label}
      >
        {SPINNER}
      </svg>
    );
  }

  if (status === 'failed') {
    return (
      <svg
        {...common}
        strokeWidth="2"
        strokeLinecap="round"
        className={clsx(styles.subagent_list__glyph, styles['subagent_list__glyph--failed'])}
        aria-label={label}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }

  if (status === 'cancelled') {
    return (
      <svg {...common} strokeWidth="2" className={styles.subagent_list__glyph} aria-label={label}>
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
      </svg>
    );
  }

  // completed — muted check
  return (
    <svg
      {...common}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.subagent_list__glyph}
      aria-label={label}
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function ToolGlyph({ status }: { status: SubagentToolCall['status'] }): ReactNode {
  const common = { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor' } as const;

  if (status === 'running') {
    return (
      <svg
        {...common}
        strokeWidth="2"
        className={clsx(styles.subagent_list__tool_glyph, styles['subagent_list__tool_glyph--running'])}
      >
        {SPINNER}
      </svg>
    );
  }

  if (status === 'error') {
    return (
      <svg
        {...common}
        strokeWidth="2"
        strokeLinecap="round"
        className={clsx(styles.subagent_list__tool_glyph, styles['subagent_list__tool_glyph--error'])}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }

  return (
    <svg
      {...common}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.subagent_list__tool_glyph}
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      className={styles.subagent_list__chevron}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

function SubagentItem({ subagent, locale }: { subagent: Subagent; locale: Locale }): ReactNode {
  const [open, setOpen] = useState(false);
  const running = subagent.status === 'running';
  const hasTools = subagent.tools.length > 0;
  const active = running && hasTools ? currentTool(subagent.tools) : undefined;

  return (
    <div className={styles.subagent_list__item}>
      <button
        type="button"
        className={styles.subagent_list__item_header}
        onClick={(): void => {
          if (hasTools) setOpen(o => !o);
        }}
        aria-expanded={hasTools ? open : undefined}
      >
        <SubagentGlyph status={subagent.status} label={t(locale, `subagent.${subagent.status}`)} />
        <span className={styles.subagent_list__label}>
          {subagent.subagentType && <span className={styles.subagent_list__type}>{subagent.subagentType} · </span>}
          <span className={clsx(styles.subagent_list__desc, running && styles['subagent_list__desc--running'])}>
            {subagent.description}
          </span>
          {!open && active && (
            <span className={styles.subagent_list__active_tool}>
              ↳ {t(locale, 'subagent.activeTool', { tool: toolLabel(active, locale) })}
            </span>
          )}
        </span>
        <span className={styles.subagent_list__item_meta}>
          {!open && !running && hasTools && (
            <span>{t(locale, 'subagent.toolCount', { n: subagent.tools.length })}</span>
          )}
          {hasTools && <Chevron open={open} />}
        </span>
      </button>
      {open && hasTools && (
        <div className={styles.subagent_list__tools}>
          {subagent.tools.map((tool, i) => (
            <div key={i} className={styles.subagent_list__tool_row}>
              <ToolGlyph status={tool.status} />
              <span className={styles.subagent_list__tool_label}>{toolLabel(tool, locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Docked subagent panel, stacked above the Task List (F-012). Run-level live state (like
// RunningIndicator / TaskList), not a message block. Never rendered when empty; auto-collapsed
// once every subagent is terminal, expanded while any is running (until the user toggles).
export function SubagentList(): ReactNode {
  const { messages } = useAsgardContext();
  const { locale = DEFAULT_LOCALE } = useAsgardTemplateContext();

  const subagents = useMemo(() => reduceSubagents(Array.from(messages?.values() ?? [])), [messages]);

  // null → auto: show while any subagent is running; collapse when all terminal. A user click pins it.
  const [open, setOpen] = useState<boolean | null>(null);

  if (subagents.length === 0) return null;

  const anyRunning = subagents.some(s => s.status === 'running');
  const show = open ?? anyRunning;
  const doneCount = subagents.filter(s => s.status !== 'running').length;

  return (
    <div className={clsx('asgard-subagent-list', styles.subagent_list)}>
      <button
        type="button"
        className={styles.subagent_list__title}
        onClick={(): void => setOpen(!show)}
        aria-expanded={show}
      >
        <svg
          className={clsx(styles.subagent_list__bot, anyRunning && styles['subagent_list__bot--active'])}
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 4v4M9 14h.01M15 14h.01" />
        </svg>
        <span>{t(locale, 'subagent.title')}</span>
        <span className={styles.subagent_list__count}>
          {doneCount}/{subagents.length}
          <Chevron open={show} />
        </span>
      </button>
      {show && (
        <div className={styles.subagent_list__items}>
          {subagents.map(subagent => (
            <SubagentItem key={subagent.parentToolUseId} subagent={subagent} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
