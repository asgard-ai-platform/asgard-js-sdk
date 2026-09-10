// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * #470 — the built-in aside is the only place that knows which channel the panel is looking at, so it is
 * the place the sandbox relay's ownership parameter has to come from. Without it every fs call the aside
 * makes is a `400` at a relay such as `asgard-freyr-api`, and the aside opens straight onto an error.
 *
 * `createSandboxFsProviders` is deliberately **not** mocked here: what this pins is the whole path from the
 * channel context to the client call. The providers' own table (`channel-scope-forwarding.spec.ts`) proves
 * they forward what they are given; this proves the aside gives them anything at all.
 */

const panelProps: Record<string, unknown>[] = [];

vi.mock('../file-explorer/file-explorer-panel', () => ({
  FileExplorerPanel: (props: Record<string, unknown>): ReactNode => {
    panelProps.push(props);

    return null;
  },
}));

const sandboxFsList = vi.fn().mockResolvedValue({ entries: [], truncated: false });

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ({
    client: { sandboxFsList },
    channel: null,
    customChannelId: 'ch-1',
    nudge: undefined,
    isRunning: false,
    pendingConsent: null,
  }),
}));

vi.mock('../../hooks/use-derived-state', () => ({
  useLaunchedSandboxes: (): unknown[] => [],
}));

const { ChatbotFileExplorerAside } = await import('./chatbot-file-explorer');
const { useFileExplorerController } = await import('../../hooks/use-file-explorer-controller');

function Harness(): ReactNode {
  const controller = useFileExplorerController();

  return <ChatbotFileExplorerAside controller={controller} />;
}

afterEach(() => {
  cleanup();
  panelProps.length = 0;
  sandboxFsList.mockClear();
});

describe('#470 — the built-in aside scopes its fs calls to the channel', () => {
  it('passes the context channel id down to the client, not just to the panel', async () => {
    render(<Harness />);

    const listDir = panelProps[0].listDir as (sandboxName: string, path: string) => Promise<unknown>;
    await listDir('sb-1', '/work');

    expect(sandboxFsList).toHaveBeenCalledWith('sb-1', '/work', { customChannelId: 'ch-1' });
  });
});
