import { ReactNode, useMemo, useState } from 'react';
import clsx from 'clsx';
import { reduceTasks, Task } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { DEFAULT_LOCALE, t } from '../../../i18n';
import styles from './task-list.module.scss';

// `isTaskTool` / `reduceTasks` / `Task` now live in `@asgard-js/core` (F-013). The in-chatbot panel
// folds the current `messages` (works in live + preview mode); external consumers rendering their
// own list use the `useTaskList()` hook / the `channel.tasks` store instead.

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
