import { FileExplorerProvider } from './file-explorer-context';
import { FileExplorerTree } from './file-explorer-tree';
import {
  FileExplorerBody,
  FileExplorerCloseButton,
  FileExplorerContextMenu,
  FileExplorerCwd,
  FileExplorerEmptyState,
  FileExplorerHeader,
  FileExplorerHeaderRow,
  FileExplorerNotice,
  FileExplorerRoot,
  FileExplorerSourceSelect,
  FileExplorerToolbar,
  FileExplorerView,
  FileExplorerWorkspace,
} from './file-explorer-parts';

export { FileExplorerPanel } from './file-explorer-panel';
export type { FileExplorerPanelProps, FsListDir } from './file-explorer-panel';
export { FileView } from './file-view';
export type { FileViewProps } from './file-view';
// The item shape hosts return from an explorer's extra-actions hook (BUILD-064). Only the type is public:
// the menu itself is rendered by the explorer, so a host describes items rather than mounting one.
export type { ContextMenuItem } from './context-menu';
export { createSandboxFsProviders } from './create-sandbox-fs-providers';
export type { SandboxFsProviders, SandboxFsProvidersOptions } from './create-sandbox-fs-providers';
export type {
  FsEntry,
  FsListResult,
  FsMutatePath,
  FsMutateSrcDst,
  FsProviders,
  FsReadFile,
  FsSaveFile,
  FsSource,
  FsUpload,
  FsUploadMany,
  FsWatchFile,
} from './types';
export { sandboxAsSource, sandboxesAsSources } from './types';

export { FileExplorerProvider, useFileExplorer } from './file-explorer-context';
export type { FileExplorerContextValue, FileExplorerProviderProps } from './file-explorer-context';

/**
 * The File Explorer as assemblable parts. `FileExplorerPanel` is the ready-made sandbox assembly; reach
 * for these only when you need a different header — and compose `FileExplorer.Workspace` rather than its
 * pieces, so every assembly shares one implementation of the explorer's behavior.
 *
 * ```tsx
 * <FileExplorer.Provider sources={[dir]} controller={c} providers={p}>
 *   <FileExplorer.Root>
 *     <FileExplorer.Header>
 *       <FileExplorer.HeaderRow>{dir.label}</FileExplorer.HeaderRow>
 *     </FileExplorer.Header>
 *     <FileExplorer.Workspace />
 *   </FileExplorer.Root>
 * </FileExplorer.Provider>
 * ```
 */
export const FileExplorer = {
  Provider: FileExplorerProvider,
  Root: FileExplorerRoot,
  Header: FileExplorerHeader,
  HeaderRow: FileExplorerHeaderRow,
  SourceSelect: FileExplorerSourceSelect,
  CloseButton: FileExplorerCloseButton,
  Cwd: FileExplorerCwd,
  Notice: FileExplorerNotice,
  Toolbar: FileExplorerToolbar,
  Body: FileExplorerBody,
  Tree: FileExplorerTree,
  View: FileExplorerView,
  ContextMenu: FileExplorerContextMenu,
  EmptyState: FileExplorerEmptyState,
  Workspace: FileExplorerWorkspace,
} as const;
