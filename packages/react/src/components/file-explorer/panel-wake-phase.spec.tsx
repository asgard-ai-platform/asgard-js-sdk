// @vitest-environment jsdom
import { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SandboxWakePhase } from '@asgard-js/core';
import { useFileExplorerController } from '../../hooks/use-file-explorer-controller';
import { t } from '../../i18n';
import { FileExplorerPanel } from './file-explorer-panel';
import { FsListResult } from './types';

/**
 * F-038 — `wakePhase` makes the channel's shared wake the panel's only record of "waking / failed". A host
 * that does not pass it (agent-hub-web assembles its own panel) keeps the panel's old local spinner.
 */

const listDir = async (): Promise<FsListResult> => ({ entries: [], truncated: false });

const wakeLabel = t('en-US', 'fileExplorer.wakeSandbox');
const wakingLabel = t('en-US', 'fileExplorer.waking');
const failedLabel = t('en-US', 'fileExplorer.wakeFailed');

afterEach(() => {
  cleanup();
});

function Panel({ onNudge, wakePhase }: { onNudge: () => Promise<void>; wakePhase?: SandboxWakePhase }): ReactNode {
  const controller = useFileExplorerController();

  return (
    <FileExplorerPanel
      sandboxes={[]}
      controller={controller}
      listDir={listDir}
      onNudge={onNudge}
      wakePhase={wakePhase}
    />
  );
}

const never = (): Promise<void> => new Promise<void>(() => undefined);

describe('FileExplorerPanel wakePhase', () => {
  it('without wakePhase, keeps tracking its own nudge (backward compatible)', async () => {
    render(<Panel onNudge={never} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: wakeLabel }));
    });

    expect(screen.getByRole('button', { name: wakingLabel })).toHaveProperty('disabled', true);
  });

  it('with wakePhase, shows only what the store says — no second local record', async () => {
    render(<Panel onNudge={never} wakePhase="idle" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: wakeLabel }));
    });

    expect(screen.queryByRole('button', { name: wakingLabel })).toBeNull();
  });

  it('shows waking from the store even though this panel never nudged', () => {
    render(<Panel onNudge={never} wakePhase="waking" />);

    expect(screen.getByRole('button', { name: wakingLabel })).toHaveProperty('disabled', true);
  });

  it('shows the failed hint with the button usable again', () => {
    render(<Panel onNudge={never} wakePhase="failed" />);

    expect(screen.getByText(failedLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: wakeLabel })).toHaveProperty('disabled', false);
  });
});
