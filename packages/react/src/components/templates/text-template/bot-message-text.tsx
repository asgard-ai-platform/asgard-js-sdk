import { CSSProperties, ReactNode, useMemo } from 'react';
import clsx from 'clsx';
import classes from './text-template.module.scss';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { StreamdownClient } from './streamdown-client';
import { holdBackPendingMarker, splitNeedsInput } from './needs-input';
import { NeedsInputCallout } from './needs-input-callout';

export interface BotMessageTextProps {
  children: string;
  /** Appended to the built-in classes — use it to add layout (width, margin) without losing the theming. */
  className?: string;
  /**
   * The text is still streaming. A last line that could still turn into a `[NEEDS_INPUT]:` marker is held
   * back until it settles, so the raw marker never flashes on screen before it becomes a callout.
   */
  streaming?: boolean;
  /**
   * A user message already follows this bot message, so a `[NEEDS_INPUT]:` callout shows its "replied"
   * state. Omitted means not replied yet.
   */
  answered?: boolean;
}

/**
 * The bot message text content — the chrome-free `.text--bot` wrapper around the streaming/markdown renderer,
 * without the surrounding `TemplateBox`, `Avatar`, or `Time`. Exported so a consumer can compose a custom
 * bot message row (e.g. via `renderMessageContent` + `TemplateBox` / `TemplateBoxContent`) without
 * re-implementing the markdown styling.
 *
 * It fills its container and intentionally has no bubble background, padding, or rounded corners.
 *
 * A `[NEEDS_INPUT]:` line (F-041) is drawn as a callout in place of the raw line. Splitting happens here
 * rather than in `TextTemplate` so a consumer-composed row gets the callout too.
 */
export function BotMessageText({
  children,
  className,
  streaming = false,
  answered = false,
}: BotMessageTextProps): ReactNode {
  const theme = useAsgardThemeContext();

  const style: CSSProperties = {
    color: theme?.botMessage?.color,
  };

  const segments = useMemo(() => splitNeedsInput(children, { streaming }), [children, streaming]);
  const hasCallout = segments.some(segment => segment.kind === 'needs-input');

  // Both branches render a keyed array: when a callout first appears mid-stream, the leading markdown keeps
  // key 0 and its already-loaded `StreamdownClient` is not remounted (which would flash unrendered text).
  const content = hasCallout
    ? segments.map((segment, index) =>
        segment.kind === 'markdown' ? (
          <StreamdownClient key={index}>{segment.text}</StreamdownClient>
        ) : (
          <NeedsInputCallout key={index} text={segment.text} answered={answered} />
        ),
      )
    : [<StreamdownClient key={0}>{streaming ? holdBackPendingMarker(children) : children}</StreamdownClient>];

  return (
    <div
      className={clsx(classes.text, classes['text--bot'], hasCallout && classes['text--segmented'], className)}
      style={style}
    >
      {content}
    </div>
  );
}
