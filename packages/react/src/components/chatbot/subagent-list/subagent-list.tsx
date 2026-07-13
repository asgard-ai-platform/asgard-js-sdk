import { ReactNode, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ConversationMessage, ConversationSubagentMessage, ConversationToolCallMessage } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { DEFAULT_LOCALE, Locale, t, toolLabel } from '../../../i18n';
import styles from './subagent-list.module.scss';

// A subagent is spawned by an `Agent` tool call (native builtin); its lifecycle rides on the
// `asgard.subagent.{start,complete}` events, and its own child tool calls carry `parentToolUseId`
// pointing back at the `Agent` call's `toolUseId`. The `Agent` call and all child tool calls are
// routed OUT of the main tool-call group (F-012); the subagent list is accumulated instead.

// The `Agent` tool call = spawn marker (native builtin `toolsetName === '' && toolName === 'Agent'`).
export function isAgentTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && message.toolsetName === '' && message.toolName === 'Agent';
}

// A tool call that belongs to a subagent (child): `parentToolUseId` is non-empty.
export function isSubagentChildTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && !!message.parentToolUseId;
}

// Everything the subagent list owns — routed out of the message thread and the main tool-call group.
export function isSubagentRelated(message: ConversationMessage): boolean {
  return message.type === 'subagent' || isAgentTool(message) || isSubagentChildTool(message);
}

// Reuse the core-authoritative status literals so the view model never drifts from the event type.
export type SubagentStatus = ConversationSubagentMessage['status'];

export interface SubagentToolCall {
  toolsetName: string;
  toolName: string;
  parameter: Record<string, unknown>;
  reason?: string;
  status: 'running' | 'completed' | 'error';
}

export interface Subagent {
  /** Association key = the spawning `Agent` tool call's `toolUseId` (all child events carry it). */
  parentToolUseId: string;
  agentId?: string;
  subagentType?: string;
  description?: string;
  /** Driven by `subagent.complete` (core keeps it replay-safe); never by the `Agent` tool_call.complete. */
  status: SubagentStatus;
  summary?: string;
  tools: SubagentToolCall[];
}

interface SubagentMeta {
  agentId?: string;
  subagentType?: string;
  description?: string;
  status: SubagentStatus;
  summary?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Unified status (F-007/F-009), same rule as the main tool-call group: running → completed / error.
function toolStatus(call: ConversationToolCallMessage): SubagentToolCall['status'] {
  if (!call.isComplete) return 'running';

  return call.isError ?? Boolean(call.result?.error) ? 'error' : 'completed';
}

// Fold the conversation into the current subagent list, keyed by `parentToolUseId` in first-seen
// order. Pure + replay-safe: subagent status comes straight off the (core-computed) `subagent`
// message; the `Agent` tool call only seeds the entry and its description.
export function reduceSubagents(messages: ConversationMessage[]): Subagent[] {
  const order: string[] = [];
  const meta = new Map<string, SubagentMeta>();
  const tools = new Map<string, Map<string, SubagentToolCall>>();

  const ensure = (id: string): SubagentMeta => {
    if (!meta.has(id)) {
      order.push(id);
      meta.set(id, { status: 'running' });
      tools.set(id, new Map());
    }

    return meta.get(id) as SubagentMeta;
  };

  for (const message of messages) {
    if (message.type === 'subagent') {
      const m = ensure(message.parentToolUseId);
      m.agentId = message.agentId ?? m.agentId;
      m.subagentType = message.subagentType ?? m.subagentType;
      m.description = message.description ?? m.description;
      m.status = message.status; // core-authoritative (replay-safe)
      m.summary = message.summary ?? m.summary;
      continue;
    }

    if (message.type !== 'tool-call') continue;

    if (isAgentTool(message)) {
      if (!message.toolUseId) continue;

      const m = ensure(message.toolUseId);
      const description = str(message.parameter?.description);
      if (description && !m.description) m.description = description;

      continue;
    }

    if (isSubagentChildTool(message) && message.parentToolUseId) {
      ensure(message.parentToolUseId);
      const toolMap = tools.get(message.parentToolUseId) as Map<string, SubagentToolCall>;
      toolMap.set(message.toolUseId ?? message.messageId, {
        toolsetName: message.toolsetName,
        toolName: message.toolName,
        parameter: message.parameter,
        reason: message.reason,
        status: toolStatus(message),
      });
    }
  }

  return order.map(id => ({
    parentToolUseId: id,
    ...(meta.get(id) as SubagentMeta),
    tools: Array.from((tools.get(id) as Map<string, SubagentToolCall>).values()),
  }));
}

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
