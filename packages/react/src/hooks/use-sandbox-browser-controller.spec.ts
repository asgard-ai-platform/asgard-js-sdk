// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSandboxBrowserController } from './use-sandbox-browser-controller';

// F-035 — the controller mirrors `useFileExplorerController`, and so do its two failure modes: an unstable
// object identity (issue #427) and a request that cannot re-fire for the same target.

describe('useSandboxBrowserController', () => {
  it('starts closed with nothing selected and nothing requested', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    expect(result.current.open).toBe(false);
    expect(result.current.activeSandboxName).toBeNull();
    expect(result.current.requestedBrowser).toBeNull();
  });

  it('honours initial options, so a host can render the panel already open', () => {
    const { result } = renderHook(() => useSandboxBrowserController({ open: true, activeSandboxName: 'sbx-1' }));

    expect(result.current.open).toBe(true);
    expect(result.current.activeSandboxName).toBe('sbx-1');
  });

  it('opens, closes and toggles', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.openBrowser());
    expect(result.current.open).toBe(true);

    act(() => result.current.closeBrowser());
    expect(result.current.open).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });

  it('requestBrowser opens the panel, selects the sandbox and records the request', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.requestBrowser('sbx-1'));

    expect(result.current.open).toBe(true);
    expect(result.current.activeSandboxName).toBe('sbx-1');
    expect(result.current.requestedBrowser).toMatchObject({ sandboxName: 'sbx-1' });
  });

  // Notify-not-force: the intent is recorded either way, but the panel does not prise itself open.
  it('routes the intent without opening when reveal is false', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.requestBrowser('sbx-1', { reveal: false }));

    expect(result.current.open).toBe(false);
    expect(result.current.activeSandboxName).toBe('sbx-1');
    expect(result.current.requestedBrowser).toMatchObject({ sandboxName: 'sbx-1' });
  });

  // Without the nonce, a second card for the sandbox already on screen produces an identical object, the
  // panel's effect never re-runs, and the card looks broken.
  it('bumps the nonce so a repeat request for the same sandbox re-fires', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.requestBrowser('sbx-1'));
    const first = result.current.requestedBrowser?.nonce ?? 0;

    act(() => result.current.requestBrowser('sbx-1'));
    const second = result.current.requestedBrowser?.nonce ?? 0;

    expect(second).toBeGreaterThan(first);
  });

  it('clears a pending request when the user hand-picks a different sandbox', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.requestBrowser('sbx-1'));
    act(() => result.current.selectSandbox('sbx-2'));

    expect(result.current.activeSandboxName).toBe('sbx-2');
    expect(result.current.requestedBrowser).toBeNull();
  });

  it('keeps a pending request when the selection lands on the same sandbox', () => {
    const { result } = renderHook(() => useSandboxBrowserController());

    act(() => result.current.requestBrowser('sbx-1'));
    act(() => result.current.selectSandbox('sbx-1'));

    expect(result.current.requestedBrowser).toMatchObject({ sandboxName: 'sbx-1' });
  });

  // The panel's connection effect depends on this object, so churn here means reconnecting the stream on
  // every render of whatever holds the controller.
  it('keeps a stable identity across renders that change nothing', () => {
    const { result, rerender } = renderHook(() => useSandboxBrowserController());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('produces a new identity when the state actually moves', () => {
    const { result } = renderHook(() => useSandboxBrowserController());
    const first = result.current;

    act(() => result.current.openBrowser());

    expect(result.current).not.toBe(first);
  });

  it('keeps its action identities stable, so consumers can depend on them', () => {
    const { result, rerender } = renderHook(() => useSandboxBrowserController());
    const { openBrowser, closeBrowser, toggle, selectSandbox, requestBrowser } = result.current;

    rerender();
    act(() => result.current.openBrowser());

    expect(result.current.openBrowser).toBe(openBrowser);
    expect(result.current.closeBrowser).toBe(closeBrowser);
    expect(result.current.toggle).toBe(toggle);
    expect(result.current.selectSandbox).toBe(selectSandbox);
    expect(result.current.requestBrowser).toBe(requestBrowser);
  });
});
