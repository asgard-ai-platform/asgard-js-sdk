import { ReactNode, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ConversationMessage, ConversationToolCallMessage } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { DEFAULT_LOCALE, t } from '../../../i18n';
import styles from './task-list.module.scss';

const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate']);

// TaskCreate/TaskUpdate are native tool calls (toolsetName === '') but semantically increment a
// single task list — route them OUT of the tool-call group and fold them here (F-010).
export function isTaskTool(message: ConversationMessage): boolean {
  return message.type === 'tool-call' && message.toolsetName === '' && TASK_TOOLS.has(message.toolName);
}

export interface Task {
  id: string;
  subject: string;
  activeForm?: string;
  description?: string;
  // pending | in_progress | completed | (unknown status kept as-is, rendered neutrally — F-010)
  status: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// INFERRED BACKEND CONTRACT (F-010): the spec keys off `sidecar.task.id` / `sidecar.statusChange.to`,
// which are not yet on the SDK event type. Until the backend contract lands we read the task id,
// status, subject, activeForm, and description from `parameter` (documented assumption; the
// react-demo mock matches this shape). `reduceTasks` is pure + replay-safe (fold over arrival order).
export function reduceTasks(messages: ConversationMessage[]): Task[] {
  const byId = new Map<string, Task>();
  const order: string[] = [];

  for (const message of messages) {
    if (!isTaskTool(message)) continue;

    const call = message as ConversationToolCallMessage;
    if (!call.isComplete) continue; // fold the `.complete` events

    const p = call.parameter ?? {};
    const id = str(p.id) ?? str(p.taskId) ?? call.messageId;

    if (!byId.has(id)) order.push(id);

    if (call.toolName === 'TaskCreate') {
      byId.set(id, {
        id,
        subject: str(p.subject) ?? str(p.content) ?? '',
        activeForm: str(p.activeForm),
        description: str(p.description),
        status: str(p.status) ?? 'pending',
      });
    } else {
      // TaskUpdate — status authoritative from parameter.status
      const existing = byId.get(id);
      byId.set(id, {
        id,
        subject: existing?.subject ?? str(p.subject) ?? '',
        activeForm: str(p.activeForm) ?? existing?.activeForm,
        description: str(p.description) ?? existing?.description,
        status: str(p.status) ?? existing?.status ?? 'pending',
      });
    }
  }

  return order.map(id => byId.get(id)).filter((task): task is Task => Boolean(task));
}

function StatusGlyph({ status }: { status: string }): ReactNode {
  if (status === 'in_progress') {
    return (
      <svg
        className={clsx(styles.task_list__glyph, styles['task_list__glyph--running'])}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
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
      </svg>
    );
  }

  if (status === 'completed') {
    return (
      <svg
        className={clsx(styles.task_list__glyph, styles['task_list__glyph--completed'])}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12l5 5L20 6" />
      </svg>
    );
  }

  // pending / unknown — hollow dim circle
  return (
    <svg
      className={styles.task_list__glyph}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.5"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function TaskRow({ task }: { task: Task }): ReactNode {
  const [open, setOpen] = useState(false);
  const isRunning = task.status === 'in_progress';
  // in_progress shows the present-continuous activeForm; otherwise the imperative subject.
  const label = (isRunning && task.activeForm) || task.subject;
  const hasDescription = !!task.description;

  return (
    <div className={styles.task_list__row}>
      <button
        type="button"
        className={styles.task_list__row_header}
        onClick={(): void => {
          if (hasDescription) setOpen(o => !o);
        }}
        aria-expanded={hasDescription ? open : undefined}
      >
        <StatusGlyph status={task.status} />
        <span
          className={clsx(
            styles.task_list__label,
            isRunning && styles['task_list__label--running'],
            task.status === 'completed' && styles['task_list__label--completed'],
          )}
        >
          {label}
        </span>
      </button>
      {open && hasDescription && <div className={styles.task_list__description}>{task.description}</div>}
    </div>
  );
}

// Docked task tray above the thread↔input seam (F-010). Run-level live state (like RunningIndicator),
// not a message block. Hidden when there are no tasks.
export function TaskList(): ReactNode {
  const { messages } = useAsgardContext();
  const { locale = DEFAULT_LOCALE } = useAsgardTemplateContext();

  const tasks = useMemo(() => reduceTasks(Array.from(messages?.values() ?? [])), [messages]);

  if (tasks.length === 0) return null;

  return (
    <div className={clsx('asgard-task-list', styles.task_list)}>
      <div className={styles.task_list__title}>
        {t(locale, 'task.title')} · {tasks.length}
      </div>
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  );
}
