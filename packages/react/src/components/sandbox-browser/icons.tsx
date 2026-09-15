import { type CSSProperties, type ReactNode } from 'react';

// F-035 — sandbox browser panel glyphs, inlined (SDK convention: no lucide-react dependency; icons are
// inlined ~byte-identical to lucide-react 0.487.0, same as file-explorer / channel-title / subagent-list).
//
// Only the glyphs this panel needs and the file-explorer set does not already export. `XIcon`,
// `ClipboardPasteIcon`, `EyeIcon`, `RefreshIcon` and `CircleAlertIcon` are imported from there instead of
// being duplicated here.

const glyphSvgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

interface IconProps {
  className?: string;
  size?: number;
  label?: string;
}

function svgProps({ className, size, label }: IconProps): Record<string, unknown> {
  return {
    className,
    width: size,
    height: size,
    ...glyphSvgProps,
    role: label ? 'img' : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : true,
  };
}

/** lucide `globe` — the panel's own identity glyph. */
export function GlobeIcon(props: IconProps): ReactNode {
  return (
    <svg {...svgProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

/** lucide `mouse-pointer-2` — "take over", matching the pointer mental model users already have. */
export function MousePointerIcon(props: IconProps): ReactNode {
  return (
    <svg {...svgProps(props)}>
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
    </svg>
  );
}

/** lucide `maximize-2` — fullscreen. */
export function MaximizeIcon(props: IconProps): ReactNode {
  return (
    <svg {...svgProps(props)}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}

/** lucide `loader-circle` — the connecting spinner. */
export function LoaderIcon(props: IconProps): ReactNode {
  return (
    <svg {...svgProps(props)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/**
 * The remote pointer drawn while watching (spec §7.8).
 *
 * Filled and outlined rather than the usual stroked glyph: it sits on top of arbitrary video, so it has to
 * stay legible against both a white page and a dark one.
 */
export function RemoteCursorGlyph({
  className,
  style,
}: {
  className?: string;
  /** Live position from the data channel, so it cannot be expressed as a class. */
  style?: CSSProperties;
}): ReactNode {
  return (
    <svg className={className} style={style} width="15" height="22" viewBox="0 0 15 22" aria-hidden>
      <path
        d="M0 0 L0 17 L4.5 13 L7.5 19 L10 18 L7 12 L12 11.5 Z"
        fill="var(--asg-sandbox-browser-cursor-fill, #fff)"
        stroke="var(--asg-sandbox-browser-cursor-stroke, #111)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
