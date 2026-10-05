import { SandboxWakePhase, SandboxWakeResult } from '@asgard-js/core';
import { useCallback } from 'react';
import { useAsgardContext } from '../context/asgard-service-context';
import { useSandboxWakeState } from './use-derived-state';

export interface UseSandboxWakeReturn {
  /** The channel's one shared wake (F-038): `waking` / `failed` here is the same everywhere it is read. */
  phase: SandboxWakePhase;
  /**
   * Wake through `channel.wakeSandbox` — joins a wake already in flight, never sends a second nudge.
   * Omit `sandboxName` when any sandbox will do. Resolves `blocked` outside a live channel.
   */
  wake: (sandboxName?: string) => Promise<SandboxWakeResult>;
}

/**
 * Read and drive the channel's shared sandbox wake (F-038) from inside the Asgard provider. The payload of
 * the nudge is collected through `onBeforeSendMessage`, exactly like the built-in `nudge` (BUG-004).
 */
export function useSandboxWake(): UseSandboxWakeReturn {
  const { channel, wakeSandbox } = useAsgardContext();
  const { phase } = useSandboxWakeState(channel);

  const wake = useCallback(
    async (sandboxName?: string): Promise<SandboxWakeResult> => (wakeSandbox ? wakeSandbox(sandboxName) : 'blocked'),
    [wakeSandbox],
  );

  return { phase, wake };
}
