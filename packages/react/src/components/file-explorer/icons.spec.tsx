import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import * as icons from './icons';

/**
 * F-021 — guards the hand-inlined File Explorer glyphs against silent drift.
 *
 * `icons.tsx` copies each glyph out of lucide by hand (the SDK carries no `lucide-react`
 * dependency). Nothing else in the toolchain looks at path data, so a mistyped coordinate, a
 * wrong variant (`trash` vs `trash-2`), a mirrored path or a merged sub-path all ship silently —
 * that class of bug produced five defects during F-021 Cycle 2 before this guard existed.
 *
 * EXPECTED is the geometry of the matching glyph in **lucide-react 0.487.0**, the version the
 * chat-kit prototype pins (`references/asgard-chat-kit-prototype`), extracted from that package's
 * `__iconNode` tables. It is frozen here on purpose: the test must not read the submodule, which
 * needs an explicit `git submodule update --init` and is absent in a fresh clone.
 *
 * Note the version pin is deliberate and not automatically the newest lucide. `streamdown` pulls in
 * 0.542.0, where `clipboard-paste` was redrawn; matching the prototype means staying on 0.487.0's
 * geometry. See `requirements/tasks/BUILD-025-file-explorer-icon-guard.md`.
 *
 * To add a glyph: copy it from lucide 0.487.0 into `icons.tsx`, then add its geometry here.
 */
const GEOMETRY_ATTRS = [
  'd',
  'points',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
] as const;

const EXPECTED: Record<string, string[]> = {
  ArrowLeftIcon: ['path{d=m12 19-7-7 7-7}', 'path{d=M19 12H5}'], // lucide `arrow-left`
  ChevronDownIcon: ['path{d=m6 9 6 6 6-6}'], // lucide `chevron-down`
  ChevronRightIcon: ['path{d=m9 18 6-6-6-6}'], // lucide `chevron-right`
  CircleAlertIcon: ['circle{cx=12,cy=12,r=10}', 'line{x1=12,y1=8,x2=12,y2=12}', 'line{x1=12,y1=16,x2=12.01,y2=16}'], // lucide `alert-circle`
  CircleCheckIcon: ['circle{cx=12,cy=12,r=10}', 'path{d=m9 12 2 2 4-4}'], // lucide `circle-check`
  ClipboardPasteIcon: [
    'path{d=M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z}',
    'path{d=M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10}',
    'path{d=m17 10 4 4-4 4}',
  ], // lucide `clipboard-paste`
  CodeIcon: ['path{d=m18 16 4-4-4-4}', 'path{d=m6 8-4 4 4 4}', 'path{d=m14.5 4-5 16}'], // lucide `code-2`
  CopyIcon: [
    'rect{x=8,y=8,width=14,height=14,rx=2,ry=2}',
    'path{d=M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2}',
  ], // lucide `copy`
  DownloadIcon: [
    'path{d=M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4}',
    'polyline{points=7 10 12 15 17 10}',
    'line{x1=12,y1=15,x2=12,y2=3}',
  ], // lucide `download`
  EyeIcon: [
    'path{d=M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0}',
    'circle{cx=12,cy=12,r=3}',
  ], // lucide `eye`
  FileIcon: ['path{d=M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z}', 'path{d=M14 2v4a2 2 0 0 0 2 2h4}'], // lucide `file`
  FilePlusIcon: [
    'path{d=M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z}',
    'path{d=M14 2v4a2 2 0 0 0 2 2h4}',
    'path{d=M9 15h6}',
    'path{d=M12 18v-6}',
  ], // lucide `file-plus`
  FileWarningIcon: [
    'path{d=M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z}',
    'path{d=M12 9v4}',
    'path{d=M12 17h.01}',
  ], // lucide `file-warning`
  FolderIcon: [
    'path{d=M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z}',
  ], // lucide `folder`
  FolderOpenIcon: [
    'path{d=m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2}',
  ], // lucide `folder-open`
  FolderPlusIcon: [
    'path{d=M12 10v6}',
    'path{d=M9 13h6}',
    'path{d=M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z}',
  ], // lucide `folder-plus`
  FolderTreeIcon: [
    'path{d=M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z}',
    'path{d=M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z}',
    'path{d=M3 5a2 2 0 0 0 2 2h3}',
    'path{d=M3 3v13a2 2 0 0 0 2 2h3}',
  ], // lucide `folder-tree`
  FolderUpIcon: [
    'path{d=M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z}',
    'path{d=M12 10v6}',
    'path{d=m9 13 3-3 3 3}',
  ], // lucide `folder-up`
  LockIcon: ['rect{x=3,y=11,width=18,height=11,rx=2,ry=2}', 'path{d=M7 11V7a5 5 0 0 1 10 0v4}'], // lucide `lock`
  PackageOpenIcon: [
    'path{d=M12 22v-9}',
    'path{d=M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z}',
    'path{d=M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13}',
    'path{d=M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z}',
  ], // lucide `package-open`
  PencilIcon: [
    'path{d=M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z}',
    'path{d=m15 5 4 4}',
  ], // lucide `pencil`
  RefreshIcon: [
    'path{d=M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8}',
    'path{d=M21 3v5h-5}',
    'path{d=M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16}',
    'path{d=M8 16H3v5}',
  ], // lucide `refresh-cw`
  ScissorsIcon: [
    'circle{cx=6,cy=6,r=3}',
    'path{d=M8.12 8.12 12 12}',
    'path{d=M20 4 8.12 15.88}',
    'circle{cx=6,cy=18,r=3}',
    'path{d=M14.8 14.8 20 20}',
  ], // lucide `scissors`
  TrashIcon: [
    'path{d=M3 6h18}',
    'path{d=M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6}',
    'path{d=M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2}',
    'line{x1=10,y1=11,x2=10,y2=17}',
    'line{x1=14,y1=11,x2=14,y2=17}',
  ], // lucide `trash-2`
  UploadIcon: [
    'path{d=M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4}',
    'polyline{points=17 8 12 3 7 8}',
    'line{x1=12,y1=3,x2=12,y2=15}',
  ], // lucide `upload`
  XIcon: ['path{d=M18 6 6 18}', 'path{d=m6 6 12 12}'], // lucide `x`
  ZapIcon: [
    'path{d=M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z}',
  ], // lucide `zap`
};

/** Serialize an icon's rendered children as `tag{attr=value,...}`, keeping document order. */
function geometryOf(node: ReactNode): string[] {
  const markup = renderToStaticMarkup(node as React.ReactElement);
  const inner = markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

  return [...inner.matchAll(/<(path|polyline|line|circle|rect)\s([^>]*?)\/?>/g)].map(([, tag, attrs]) => {
    const parsed = new Map([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    const geo = GEOMETRY_ATTRS.filter(k => parsed.has(k)).map(k => `${k}=${parsed.get(k) as string}`);

    return `${tag}{${geo.join(',')}}`;
  });
}

type IconComponent = (props: { size?: number }) => ReactNode;

describe('File Explorer glyphs match lucide 0.487.0 (the chat-kit prototype pin)', () => {
  const exported = Object.entries(icons).filter(([name]) => name.endsWith('Icon')) as Array<[string, IconComponent]>;

  it('covers every exported glyph — a new icon must be added to EXPECTED', () => {
    expect(exported.map(([name]) => name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(exported)('%s', (name, Icon) => {
    expect(geometryOf(Icon({ size: 16 }))).toEqual(EXPECTED[name]);
  });
});
