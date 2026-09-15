// F-035 — the sandbox browser panel's public surface.
//
// The controller hook is exported from `hooks/index.ts` alongside `useFileExplorerController`, not here, so
// the two three-piece patterns stay symmetrical.

export { SandboxBrowserPanel } from './sandbox-browser-panel';
export type { SandboxBrowserPanelProps } from './sandbox-browser-panel';

// Exported because a consumer drawing its own overlays on the picture needs the same letterbox solution the
// panel uses; computing it a second way puts their overlay somewhere other than where a click lands.
export { fromRemoteCoords, toRemoteCoords } from './coords';
export type { ElementPoint, RemotePoint, VideoGeometry } from './coords';
