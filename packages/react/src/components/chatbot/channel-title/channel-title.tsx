import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useChannelTitle } from '../../../hooks/use-derived-stores';
import styles from './channel-title.module.scss';

export interface ChannelTitleRenderArgs {
  /** Current channel title; `null` = unnamed. */
  title: string | null;
  /** Render the default title row (compose it inside a custom wrapper). */
  renderDefault: () => ReactNode;
}

export interface ChannelTitleProps {
  /** Placeholder shown when the channel is unnamed (default `新對話`). */
  untitledLabel?: string;
  /** Escape hatch: return a node to replace the default row, or `null` to hide the whole row. */
  renderTitle?: (args: ChannelTitleRenderArgs) => ReactNode;
  /** Shortcut to hide the whole row (equivalent to `renderTitle` returning `null`). */
  hidden?: boolean;
}

// Channel title row (F-017) at the top of the chat thread — a chrome element (like RunningIndicator /
// TaskList), NOT a message block. Reads the live title from the F-016 `channelTitle$` store via
// `useChannelTitle()` (seeded from `GET /channel/metadata`, updated by `channel.title.update`). Pure
// presentation over that value; UI follows the pinned prototype `ChannelTitle` (asgard-chat-kit @
// 5480a67), adapted to the SDK's CSS-variable theming. Semantically distinct from the bot-name header
// `title` prop. Renders nothing when there is no live channel (preview mode) or when `hidden`.
export function ChannelTitle({ untitledLabel = '新對話', renderTitle, hidden }: ChannelTitleProps): ReactNode {
  const { channelTitleStore } = useAsgardContext();
  const title = useChannelTitle();

  // No live channel (preview / no store) or explicitly hidden → do not render the row at all.
  if (hidden || !channelTitleStore) return null;

  const isUntitled = title == null || title.trim() === '';
  const label = isUntitled ? untitledLabel : title;

  const renderDefault = (): ReactNode => (
    <div className={clsx('asgard-channel-title', styles.channel_title)}>
      <svg
        className={styles.channel_title__icon}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2
        // Title change → new key → remount → fade-in (conveys the live title.update; the animation is
        // disabled under prefers-reduced-motion in the stylesheet).
        key={isUntitled ? '__untitled__' : title}
        className={clsx(styles.channel_title__text, isUntitled && styles['channel_title__text--untitled'])}
        title={isUntitled ? undefined : title ?? undefined}
      >
        {label}
      </h2>
    </div>
  );

  const content = renderTitle ? renderTitle({ title, renderDefault }) : renderDefault();

  return content ?? null;
}

export default ChannelTitle;
