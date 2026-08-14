// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceSetFileExplorer } from './source-set-file-explorer';

/**
 * F-025 lists `theme` among the component's props, and it was missing — the panel came out with the
 * SDK's light defaults wherever the host put it, because the design tokens are emitted onto the chat
 * shell's root and this component is deliberately mounted nowhere near one.
 *
 * The scope is established unconditionally, not only when `theme` is passed: a host that supplies no
 * theme still needs the tokens, and that is the case that produced a white panel on a dark page.
 *
 * Two things are asserted separately because they fail separately: that the tokens are scoped at all,
 * and that the wrapper does not eat the height. The wrapper is a plain `div`, and the explorer inside
 * it is `height: 100%` — the same collapse that made the demo panel 244,846px tall.
 */

const ENDPOINT = 'https://volume.invalid/v1/source-set/x/volume';

afterEach(() => {
  cleanup();
});

function scopeRoot(): HTMLElement {
  const el = document.querySelector('.asgard-theme-scope');
  if (!(el instanceof HTMLElement)) throw new Error('the explorer is not inside a theme scope');

  return el;
}

describe('SourceSetFileExplorer theming', () => {
  it('scopes the design tokens even when no theme is given', () => {
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} label="ss" />);

    expect(scopeRoot()).toBeTruthy();
  });

  it('applies a theme override as a scoped custom property', () => {
    render(
      <SourceSetFileExplorer
        sourceSetEndpoint={ENDPOINT}
        label="ss"
        theme={{ chatbot: { primaryComponent: { mainColor: '#ff0000' } } }}
      />,
    );

    expect(scopeRoot().style.getPropertyValue('--asg-color-primary')).toBe('#ff0000');
  });

  it('passes its height through instead of collapsing the explorer inside it', () => {
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} label="ss" />);

    // A `height: auto` wrapper is what turns the explorer's `height: 100%` into "as tall as its
    // content", which is how a large directory pushed the page instead of scrolling.
    expect(scopeRoot().style.height).toBe('100%');
    expect(scopeRoot().style.minHeight).toBe('0');
  });

  it('still renders the panel itself inside the scope', () => {
    render(<SourceSetFileExplorer sourceSetEndpoint={ENDPOINT} label="ss-asgard" />);

    expect(scopeRoot().contains(screen.getByText('ss-asgard'))).toBe(true);
  });
});
