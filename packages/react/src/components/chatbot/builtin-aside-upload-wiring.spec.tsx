// @vitest-environment jsdom
import { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * BUG-008 附帶項 — the built-in aside forwards the batch upload providers.
 *
 * `<Chatbot fileExplorer="builtin">` lists the panel's props by hand, and two of them were missing:
 * `uploadMany` and `maxUploadBytes`. Nothing threw — the panel simply fell back to the legacy
 * single-file `upload`, whose signature carries neither `createOnly` nor `signal`, so the batch silently
 * degraded to concurrency 1, overwrote collisions instead of asking, and could not be cancelled.
 *
 * Consumers that assemble their own `FileExplorer.Provider` hand over the whole `providers` object and
 * never hit this, which is why the chat side tested clean — the defect lives in the hand-written list,
 * so that list is what this pins.
 */

const panelProps: Record<string, unknown>[] = [];

vi.mock('../file-explorer/file-explorer-panel', () => ({
  FileExplorerPanel: (props: Record<string, unknown>): ReactNode => {
    panelProps.push(props);

    return null;
  },
}));

vi.mock('../../context/asgard-service-context', () => ({
  useAsgardContext: (): Record<string, unknown> => ({
    // `createSandboxFsProviders` only closes over the client; nothing is called during render.
    client: {},
    channel: null,
    nudge: undefined,
    isRunning: false,
    pendingConsent: null,
  }),
}));

vi.mock('../../hooks/use-derived-state', () => ({
  useLaunchedSandboxes: (): unknown[] => [],
}));

const { ChatbotFileExplorerAside, SANDBOX_MAX_UPLOAD_BYTES } = await import('./chatbot-file-explorer');
const { useFileExplorerController } = await import('../../hooks/use-file-explorer-controller');

function Harness({ maxUploadBytes }: { maxUploadBytes?: number }): ReactNode {
  const controller = useFileExplorerController();

  return <ChatbotFileExplorerAside controller={controller} maxUploadBytes={maxUploadBytes} />;
}

afterEach(() => {
  cleanup();
  panelProps.length = 0;
});

describe('BUG-008 R10 — the built-in aside gets the same batch upload as a hand-assembled provider', () => {
  it('forwards uploadMany, so the pool is not degraded to one at a time', () => {
    render(<Harness />);

    expect(panelProps).toHaveLength(1);
    expect(typeof panelProps[0].uploadMany).toBe('function');
    // The legacy single-file provider stays wired too: it is what a source offering only `upload` uses.
    expect(typeof panelProps[0].upload).toBe('function');
  });

  it('supplies the sandbox per-file cap by default, and lets the consumer override it', () => {
    render(<Harness />);
    expect(panelProps[0].maxUploadBytes).toBe(SANDBOX_MAX_UPLOAD_BYTES);

    cleanup();
    panelProps.length = 0;

    render(<Harness maxUploadBytes={8 * 1024 * 1024} />);
    expect(panelProps[0].maxUploadBytes).toBe(8 * 1024 * 1024);
  });
});
