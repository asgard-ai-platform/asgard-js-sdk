// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFileExplorerController } from '../../../hooks/use-file-explorer-controller';
import { useSandboxBrowserController } from '../../../hooks/use-sandbox-browser-controller';
import type { ChatbotProps } from '../chatbot';
import { ChatHeaderHost } from './chat-header-host';
import { ChatHeaderRendererArgs } from './chat-header';

/**
 * BUILD-058 / issue #432. `<Chatbot renderHeader>` used to short-circuit past `<ChatHeaderHost>`
 * entirely, so `actions[]` — assembled inside that host — was never built. The built-in File Explorer
 * toggle, export, reset and close silently vanished for anyone taking over the bar, with no workaround:
 * the toggle binds `fileExplorerController.toggle`, and that controller is created inside `<Chatbot>`
 * with no injection point.
 *
 * UC-043 Main Flow 3 defines L3 as taking over the bar *including* its actions, and F-022 requires the
 * File Explorer toggle to ride on `actions` rather than an escape hatch — so the host has to mount and
 * hand its actions to the renderer.
 */

const CHATBOT_SRC = readFileSync(join(__dirname, '..', 'chatbot.tsx'), 'utf-8');

afterEach(cleanup);

describe('#432 Chatbot no longer branches around the header host', () => {
  it('has no renderHeader ternary left', () => {
    expect(CHATBOT_SRC, 'branching on renderHeader is what skipped the host and dropped actions[]').not.toMatch(
      /renderHeader \?/,
    );
    expect(CHATBOT_SRC).not.toMatch(/renderHeader\(\)/);
  });

  it('forwards renderHeader on every ChatHeaderHost call site', () => {
    const hostCalls = CHATBOT_SRC.match(/<ChatHeaderHost\b/g) ?? [];
    const forwards = CHATBOT_SRC.match(/renderHeader=\{renderHeader\}/g) ?? [];

    // Authenticated and non-authenticated paths both render a host; missing either one reintroduces
    // the gap on that path only, which is exactly the kind of thing that ships unnoticed.
    expect(hostCalls.length).toBeGreaterThanOrEqual(2);
    expect(forwards).toHaveLength(hostCalls.length);
  });
});

function Host({ renderHeader }: { renderHeader?: (args: ChatHeaderRendererArgs) => ReactNode }): ReactNode {
  const controller = useFileExplorerController();
  const browserController = useSandboxBrowserController();

  return (
    <ChatHeaderHost
      title="Demo Bot"
      fileExplorerController={controller}
      builtinFileExplorer
      sandboxBrowserController={browserController}
      builtinSandboxBrowser={false}
      renderHeader={renderHeader}
    />
  );
}

describe('#432 the L3 renderer receives the assembled actions', () => {
  it('hands over botName, title, actions and renderDefault', () => {
    let received: ChatHeaderRendererArgs | null = null;

    render(
      <Host
        renderHeader={args => {
          received = args;

          return <div data-testid="custom-header">custom</div>;
        }}
      />,
    );

    expect(screen.getByTestId('custom-header')).toBeTruthy();

    const args = received as unknown as ChatHeaderRendererArgs;
    expect(args).not.toBeNull();
    expect(args).toHaveProperty('botName');
    expect(args).toHaveProperty('title');
    expect(typeof args.renderDefault).toBe('function');
    expect(Array.isArray(args.actions)).toBe(true);
  });

  it('includes the built-in File Explorer toggle among those actions', () => {
    let ids: string[] = [];

    render(
      <Host
        renderHeader={args => {
          ids = args.actions.map(a => a.id);

          return null;
        }}
      />,
    );

    // The whole point of #432: this id was unreachable for a renderHeader consumer.
    expect(ids).toContain('file-explorer');
    expect(ids).toContain('reset');
    expect(ids).toContain('close');
  });

  it('hides the whole bar when the renderer returns null (UC-043 Main Flow 3)', () => {
    const { container } = render(<Host renderHeader={() => null} />);

    expect(container.querySelector('.asgard-chat-header')).toBeNull();
  });

  it('renders the stock bar when no renderer is provided', () => {
    const { container } = render(<Host />);

    expect(container.querySelector('.asgard-chat-header')).not.toBeNull();
  });
});

describe('#432 widening the signature is not a breaking change', () => {
  it('still accepts a zero-argument renderer (R4, behavioral half)', () => {
    // Existing consumers wrote `() => <MyHeader />`. TypeScript allows a function to accept fewer
    // parameters than its target signature, so the widening is not breaking.
    //
    // Note this file does NOT prove that: `tsconfig` excludes `*.spec.*`, verified by injecting a
    // deliberate type error here and watching `npm run typecheck:packages` still exit 0. The compile
    // half of R4 was therefore checked with a throwaway non-spec module under `src/`, which does get
    // typechecked (a canary error in it did fail the run) — see BUILD-058's Execution Log. What this
    // case covers is the runtime half: a legacy renderer still renders.
    const legacyRenderer: NonNullable<ChatbotProps['renderHeader']> = () => <div>legacy</div>;

    const { container } = render(<Host renderHeader={legacyRenderer} />);

    expect(container.textContent).toContain('legacy');
  });
});
