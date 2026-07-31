import { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import classes from './text-template.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from './streamdown-client';

export interface BotMessageTextProps {
  children: string;
  /** Appended to the built-in classes — use it to add layout (width, margin) without losing the theming. */
  className?: string;
}

/**
 * The bot message text content — the chrome-free `.text--bot` wrapper around the streaming/markdown renderer,
 * without the surrounding `TemplateBox`, `Avatar`, or `Time`. Exported so a consumer can compose a custom
 * bot message row (e.g. via `renderMessageContent` + `TemplateBox` / `TemplateBoxContent`) without
 * re-implementing the markdown styling.
 *
 * It fills its container and intentionally has no bubble background, padding, or rounded corners.
 */
export function BotMessageText({ children, className }: BotMessageTextProps): ReactNode {
  const theme = useAsgardThemeContext();

  const style: CSSProperties = {
    color: theme?.botMessage?.color,
  };

  return (
    <div className={clsx(classes.text, classes['text--bot'], className)} style={style}>
      <StreamdownClient>{children}</StreamdownClient>
    </div>
  );
}
