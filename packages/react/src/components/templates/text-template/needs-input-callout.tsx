import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { t } from '../../../i18n';
import { StreamdownClient } from './streamdown-client';
import classes from './needs-input-callout.module.scss';

// F-041 — the callout a `[NEEDS_INPUT]:` line turns into (recognition in `needs-input.ts`). The line means
// "this turn is stuck on you", so the reader needs to see at a glance that it is not part of the answer
// above it. Look chosen by PM on 2026-11-23: a primary left bar and a light primary fill, a small title row,
// then the content. Once a user message follows the bot message it settles into a neutral "replied" state,
// so a rejoined transcript is not lined with callouts still calling for the user; it is never collapsed —
// the line is usually one sentence, and collapsing it would cost a click.

// Inlined glyphs, ~byte-identical to lucide-react 0.487.0 `message-square-reply` / `check` (SDK convention:
// no lucide-react dependency).
const glyphSvgProps = {
  width: 13,
  height: 13,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function ReplyIcon(): ReactNode {
  return (
    <svg {...glyphSvgProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="m10 7-3 3 3 3" />
      <path d="M17 13v-1a2 2 0 0 0-2-2H7" />
    </svg>
  );
}

function CheckIcon(): ReactNode {
  return (
    <svg {...glyphSvgProps}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export interface NeedsInputCalloutProps {
  /** What follows the marker, as markdown; empty when the model wrote the marker alone. */
  text: string;
  /** A user message already follows this bot message. */
  answered: boolean;
}

export function NeedsInputCallout({ text, answered }: NeedsInputCalloutProps): ReactNode {
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const label = t(locale, answered ? 'needsInput.answered' : 'needsInput.label');

  return (
    <div
      role="note"
      aria-label={label}
      className={clsx(classes.callout, answered && classes['callout--answered'], 'asgard-needs-input-callout')}
    >
      <div className={classes.callout__title}>
        {answered ? <CheckIcon /> : <ReplyIcon />}
        {label}
      </div>
      {text !== '' && <StreamdownClient>{text}</StreamdownClient>}
    </div>
  );
}
