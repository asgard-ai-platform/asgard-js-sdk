// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventType } from '@asgard-js/core';
import type {
  AsgardServiceClient,
  ChannelMetadata,
  FetchSseOptions,
  FetchSsePayload,
  SseResponse,
} from '@asgard-js/core';
import { useChannel } from './use-channel';

/**
 * BUG-006 — `resetChannel`, `initChannel`, and `restoreChannel` each wrote their own `statesObserver`;
 * only `resetChannel`'s forwarded `sandboxPhase`, so a channel created via the other two paths never
 * left the Launch HUD's `idle` state. These three tests drive each path through the same F-015
 * metadata-gated mount effect the real app uses (`initChannel`/`restoreChannel` are internal — the
 * consumer never calls them directly) and assert `sandboxPhase` reaches `'ready'` on all three.
 */

function sandboxEvent(kind: 'launch' | 'ready'): SseResponse<EventType> {
  const eventType = kind === 'launch' ? EventType.SANDBOX_LAUNCH : EventType.SANDBOX_READY;
  const factKey = kind === 'launch' ? 'sandboxLaunch' : 'sandboxReady';

  return {
    eventType,
    requestId: 'req-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: { [factKey]: { sandboxName: 'sbx-1', blueprintName: 'bp-1' } },
  } as unknown as SseResponse<EventType>;
}

interface ScriptedClient {
  client: AsgardServiceClient;
  finishSend(): void;
  finishReplay(): void;
}

/**
 * A controllable client whose metadata result picks the F-015 join branch under test.
 * Each transport emits `launching` immediately, then waits for the test to release `ready`.
 */
function scriptedClient(metadata: ChannelMetadata | null): ScriptedClient {
  let sendOptions: FetchSseOptions | undefined;
  let replayOptions: FetchSseOptions | undefined;

  const client = {
    async channelMetadata(): Promise<ChannelMetadata | null> {
      return metadata;
    },
    fetchSse(_payload: FetchSsePayload, options?: FetchSseOptions): void {
      sendOptions = options;
      options?.onSseStart?.();
      options?.onSseMessage?.(sandboxEvent('launch'));
    },
    rejoinSse(_customChannelId: string, options?: FetchSseOptions): void {
      replayOptions = options;
      options?.onSseStart?.();
      options?.onSseMessage?.(sandboxEvent('launch'));
    },
  } as unknown as AsgardServiceClient;

  return {
    client,
    finishSend(): void {
      sendOptions?.onSseMessage?.(sandboxEvent('ready'));
      sendOptions?.onSseCompleted?.();
    },
    finishReplay(): void {
      replayOptions?.onSseMessage?.(sandboxEvent('ready'));
      replayOptions?.onSseCompleted?.();
    },
  };
}

describe('useChannel — sandboxPhase wiring (BUG-006)', () => {
  it('R1: initChannel path (metadata 404 + autoResetChannel=false) tracks sandboxPhase to ready', async () => {
    const scripted = scriptedClient(null);
    const { result } = renderHook(() =>
      useChannel({ client: scripted.client, customChannelId: 'ch', autoResetChannel: false }),
    );

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    expect(result.current.sandboxPhase).toBe('idle');

    const { sendMessage } = result.current;
    if (!sendMessage) throw new Error('expected initChannel to expose sendMessage');

    const sendPromise = sendMessage({ text: 'hi' });
    await waitFor(() => expect(result.current.sandboxPhase).toBe('launching'));

    await act(async () => {
      scripted.finishSend();
      await sendPromise;
    });
    expect(result.current.sandboxPhase).toBe('ready');
  });

  it('R2: restoreChannel path (metadata 200, rejoin) tracks sandboxPhase to ready', async () => {
    const scripted = scriptedClient({ title: 'x', runState: 'IDLE', launchedSandboxes: [] });
    const { result } = renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    expect(result.current.sandboxPhase).toBe('idle');
    await waitFor(() => expect(result.current.sandboxPhase).toBe('launching'));

    act(() => scripted.finishReplay());
    expect(result.current.sandboxPhase).toBe('ready');
  });

  it('R3 (regression): opening path (metadata 404, auto-reset) still tracks sandboxPhase to ready', async () => {
    const scripted = scriptedClient(null);
    const { result } = renderHook(() =>
      useChannel({ client: scripted.client, customChannelId: 'ch', resetPayload: { text: 'hi' } }),
    );

    expect(result.current.sandboxPhase).toBe('idle');
    await waitFor(() => expect(result.current.sandboxPhase).toBe('launching'));

    act(() => scripted.finishSend());
    expect(result.current.sandboxPhase).toBe('ready');
  });
});

/**
 * F-032 — the reset button is two requests now (`DELETE /channel`, then an `action=NONE` opening turn),
 * and the mount-time opening of a channel that does not exist is a plain `NONE` with no delete at all.
 * What these pin is the failure path: a delete that fails must leave the screen exactly as it was.
 * Clearing the transcript while the backend still holds the old conversation is the one outcome the
 * split exists to prevent, and it is invisible in a happy-path test.
 */

interface DeleteAwareClient {
  client: AsgardServiceClient;
  sent: FetchSsePayload[];
  deleted: string[];
  finishRun(): void;
  replayMessage(text: string): void;
  finishReplay(): void;
}

function textEvent(text: string): SseResponse<EventType> {
  return {
    eventType: EventType.MESSAGE_COMPLETE,
    requestId: 'req-1',
    namespace: 'ns',
    botProviderName: 'bp',
    customChannelId: 'ch',
    fact: { messageComplete: { message: { messageId: `m-${text}`, text } } },
  } as unknown as SseResponse<EventType>;
}

function deleteAwareClient(options: {
  metadata: ChannelMetadata | null;
  onDelete?: () => Promise<void>;
}): DeleteAwareClient {
  const sent: FetchSsePayload[] = [];
  const deleted: string[] = [];
  let runOptions: FetchSseOptions | undefined;
  let replayOptions: FetchSseOptions | undefined;

  const client = {
    async channelMetadata(): Promise<ChannelMetadata | null> {
      return options.metadata;
    },
    async deleteChannel(customChannelId: string): Promise<void> {
      deleted.push(customChannelId);

      if (options.onDelete) await options.onDelete();
    },
    fetchSse(payload: FetchSsePayload, sseOptions?: FetchSseOptions): void {
      sent.push(payload);
      runOptions = sseOptions;
      sseOptions?.onSseStart?.();
    },
    rejoinSse(_customChannelId: string, sseOptions?: FetchSseOptions): void {
      replayOptions = sseOptions;
      sseOptions?.onSseStart?.();
    },
  } as unknown as AsgardServiceClient;

  return {
    client,
    sent,
    deleted,
    finishRun: () => runOptions?.onSseCompleted?.(),
    replayMessage: (text: string) => replayOptions?.onSseMessage?.(textEvent(text)),
    finishReplay: () => replayOptions?.onSseCompleted?.(),
  };
}

describe('useChannel — deleteChannel and the two-step reset (F-032)', () => {
  it('R5: a mount onto a non-existent channel opens with action=NONE and never deletes', async () => {
    const scripted = deleteAwareClient({ metadata: null });
    renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    await waitFor(() => expect(scripted.sent).toHaveLength(1));

    expect(scripted.sent[0].action).toBe('NONE');
    expect(scripted.deleted).toEqual([]);

    act(() => scripted.finishRun());
  });

  it('R2: the reset button deletes first, then opens with action=NONE', async () => {
    const scripted = deleteAwareClient({ metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] } });
    const { result } = renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => scripted.finishReplay());

    await act(async () => {
      result.current.resetChannel?.();
      await waitFor(() => expect(scripted.sent).toHaveLength(1));
    });

    expect(scripted.deleted).toEqual(['ch']);
    expect(scripted.sent[0].action).toBe('NONE');

    act(() => scripted.finishRun());
  });

  it('R4: a failed delete keeps the channel and conversation, resets the flags, and reports once', async () => {
    const errors: unknown[] = [];
    const scripted = deleteAwareClient({
      metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] },
      onDelete: async () => {
        throw new Error('teardown failed');
      },
    });
    const { result } = renderHook(() =>
      useChannel({ client: scripted.client, customChannelId: 'ch', onSseError: e => errors.push(e) }),
    );

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => {
      scripted.replayMessage('先前的對話');
      scripted.finishReplay();
    });
    await waitFor(() => expect(result.current.conversation?.messages?.size).toBe(1));

    const channelBefore = result.current.channel;
    const conversationBefore = result.current.conversation;

    await act(async () => {
      result.current.resetChannel?.();
      await waitFor(() => expect(errors).toHaveLength(1));
    });

    // The transcript is still on screen and still backed by the same live channel.
    expect(result.current.channel).toBe(channelBefore);
    expect(result.current.conversation).toBe(conversationBefore);
    expect(result.current.conversation?.messages?.size).toBe(1);
    // No opening turn went out — the backend still holds the old conversation.
    expect(scripted.sent).toEqual([]);
    // And the UI is usable again rather than stuck behind a spinner.
    expect(result.current.isResetting).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect((errors[0] as Error).message).toBe('teardown failed');
  });

  it('R7: the exposed deleteChannel deletes only — no opening turn, conversation untouched', async () => {
    const scripted = deleteAwareClient({ metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] } });
    const { result } = renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => {
      scripted.replayMessage('先前的對話');
      scripted.finishReplay();
    });
    await waitFor(() => expect(result.current.conversation?.messages?.size).toBe(1));

    const conversationBefore = result.current.conversation;

    await act(async () => {
      await result.current.deleteChannel?.();
    });

    expect(scripted.deleted).toEqual(['ch']);
    expect(scripted.sent).toEqual([]);
    expect(result.current.conversation).toBe(conversationBefore);
    expect(result.current.channel).not.toBeNull();
  });

  it('R2: two resets in the same tick issue one delete, not two', async () => {
    // The header button guards on `isResetting`, which is React state: both clicks read the old `false`.
    // Before the two-step split that just meant two welcome runs; now the loser's DELETE would land after
    // the winner opened the new conversation and take it with it.
    const scripted = deleteAwareClient({ metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] } });
    const { result } = renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => scripted.finishReplay());

    await act(async () => {
      result.current.resetChannel?.();
      result.current.resetChannel?.();
      await waitFor(() => expect(scripted.sent).toHaveLength(1));
    });

    expect(scripted.deleted).toEqual(['ch']);

    act(() => scripted.finishRun());
  });

  it('R2: a throwing onBeforeSendMessage does not strand the re-entrancy guard', async () => {
    // The guard is a ref, so nothing resets it on a re-render: a throw before the try would leave reset
    // permanently dead for this component, and silently — the second click simply does nothing.
    const scripted = deleteAwareClient({ metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] } });
    let explode = true;
    const { result } = renderHook(() =>
      useChannel({
        client: scripted.client,
        customChannelId: 'ch',
        onBeforeSendMessage: () => {
          if (explode) throw new Error('consumer callback blew up');

          return { text: '' };
        },
      }),
    );

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => scripted.finishReplay());

    await act(async () => {
      result.current.resetChannel?.();
      await Promise.resolve();
    });
    expect(scripted.deleted).toEqual([]);

    // The callback recovers; the next reset must still work.
    explode = false;
    await act(async () => {
      result.current.resetChannel?.();
      await waitFor(() => expect(scripted.deleted).toEqual(['ch']));
    });

    act(() => scripted.finishRun());
  });

  it('R7: a failed delete surfaces to the caller of the exposed deleteChannel', async () => {
    const scripted = deleteAwareClient({
      metadata: { title: 'x', runState: 'IDLE', launchedSandboxes: [] },
      onDelete: async () => {
        throw new Error('teardown failed');
      },
    });
    const { result } = renderHook(() => useChannel({ client: scripted.client, customChannelId: 'ch' }));

    await waitFor(() => expect(result.current.channel).not.toBeNull());
    act(() => scripted.finishReplay());

    await expect(result.current.deleteChannel?.()).rejects.toThrow('teardown failed');
  });
});
