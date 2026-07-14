import { describe, it, expect, vi } from 'vitest';
import Channel from './channel';
import Conversation from './conversation';
import { EventType } from '../constants/enum';
import type { ChannelStates, FetchSseOptions, FetchSsePayload, IAsgardServiceClient, SseResponse } from '../types';

// F-016 channel title store. Titles are seeded from `metadata.title` (constructor `initialTitle`) and
// then updated by the ephemeral `channel.title.update` event folded in the SSE stream.

function titleUpdateEvent(title: string): SseResponse<EventType.CHANNEL_TITLE_UPDATE> {
  return {
    eventType: EventType.CHANNEL_TITLE_UPDATE,
    fact: { channelTitleUpdate: { title } },
  } as unknown as SseResponse<EventType.CHANNEL_TITLE_UPDATE>;
}

function sandboxReadyEvent(sandboxName: string): SseResponse<EventType.SANDBOX_READY> {
  return {
    eventType: EventType.SANDBOX_READY,
    fact: { sandboxReady: { sandboxName, blueprintName: 'default' } },
  } as unknown as SseResponse<EventType.SANDBOX_READY>;
}

// Minimal client: captures the stream handlers from a POST run so a test can push events by hand.
class FakeClient implements IAsgardServiceClient {
  handlers?: FetchSseOptions;
  fetchSse(_payload: FetchSsePayload, options?: FetchSseOptions): void {
    this.handlers = options;
    options?.onSseStart?.();
  }
}

function makeChannel(
  initialTitle?: string | null,
  statesObserver?: (states: ChannelStates) => void,
): { client: FakeClient; channel: Channel } {
  const client = new FakeClient();
  const channel = Channel.create({
    client,
    customChannelId: 'c',
    conversation: new Conversation({ messages: new Map() }),
    initialTitle,
    statesObserver,
  });

  return { client, channel };
}

describe('Channel title store (F-016)', () => {
  it('seeds the title from initialTitle (metadata)', () => {
    const { channel } = makeChannel('還原的頻道');
    expect(channel.channelTitle.getSnapshot()).toBe('還原的頻道');
  });

  it('defaults to null when no initialTitle is given (unnamed)', () => {
    const { channel } = makeChannel();
    expect(channel.channelTitle.getSnapshot()).toBeNull();
  });

  it('updates from a channel.title.update event, on the store and on ChannelStates', () => {
    let states: ChannelStates | undefined;
    const { client, channel } = makeChannel(null, s => {
      states = s;
    });

    void channel.sendMessage({ text: 'hi' }); // captures the stream handlers
    client.handlers?.onSseMessage?.(titleUpdateEvent('上週各通路訂單分析'));

    expect(channel.channelTitle.getSnapshot()).toBe('上週各通路訂單分析');
    expect(states?.title).toBe('上週各通路訂單分析');
  });

  it('does not re-notify title subscribers when the title is unchanged (distinctUntilChanged)', () => {
    const { client, channel } = makeChannel(null);
    void channel.sendMessage({ text: 'hi' });

    const listener = vi.fn();
    channel.channelTitle.subscribe(listener);

    client.handlers?.onSseMessage?.(titleUpdateEvent('Same'));
    client.handlers?.onSseMessage?.(titleUpdateEvent('Same'));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Channel sandbox-name store (sandbox Files/Browser foundation)', () => {
  it('starts null and folds sandbox.ready into the store + ChannelStates', () => {
    let states: ChannelStates | undefined;
    const { client, channel } = makeChannel(null, s => {
      states = s;
    });

    expect(channel.sandboxName.getSnapshot()).toBeNull();

    void channel.sendMessage({ text: 'hi' });
    client.handlers?.onSseMessage?.(sandboxReadyEvent('sbx-42'));

    expect(channel.sandboxName.getSnapshot()).toBe('sbx-42');
    expect(states?.sandboxName).toBe('sbx-42');
  });

  it('does not re-notify subscribers when the sandbox name is unchanged', () => {
    const { client, channel } = makeChannel(null);
    void channel.sendMessage({ text: 'hi' });

    const listener = vi.fn();
    channel.sandboxName.subscribe(listener);

    client.handlers?.onSseMessage?.(sandboxReadyEvent('sbx-42'));
    client.handlers?.onSseMessage?.(sandboxReadyEvent('sbx-42'));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
