import { ReactNode } from 'react';
import { t } from '../../i18n';
import { Spinner } from '../spinner';
import { ContextMenu, ContextMenuItem } from './context-menu';
import { FileExplorerContextValue, MenuTarget, useFileExplorer, withoutMutatingItems } from './file-explorer-context';
import { FileExplorerTree } from './file-explorer-tree';
import { FileView } from './file-view';
import {
  CircleAlertIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PackageOpenIcon,
  PencilIcon,
  RefreshIcon,
  ScissorsIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
  ZapIcon,
} from './icons';
import styles from './file-explorer-panel.module.scss';

/**
 * The panel frame. Owns the positioned ancestor the context menu clamps within, and **unconditionally**
 * mounts the prompt/confirm dialog and the hidden upload input.
 *
 * Mounting the dialog here rather than per-branch is deliberate: it used to live inside the panel body,
 * so the "no sandbox" branch dropped it — and because the sandbox list is repolled every 15s and drops
 * idle-recycled entries, a confirm could be stranded mid-flight, leaving its caller awaiting forever and
 * re-appearing unprompted when a sandbox returned. With it here, no assembly can reintroduce that.
 */
export function FileExplorerRoot({
  chrome = 'card',
  children,
}: {
  /** `card` = standalone card (rounded, fully bordered); `flush` = split into a chat view. */
  chrome?: 'card' | 'flush';
  children: ReactNode;
}): ReactNode {
  const { rootRef, uploadInputRef, onUploadPicked, dialog } = useFileExplorer();

  return (
    <div className={`${styles.root} ${chrome === 'flush' ? styles.flush : ''}`} ref={rootRef}>
      {children}

      <input ref={uploadInputRef} type="file" hidden onChange={onUploadPicked} />

      {dialog}
    </div>
  );
}

/** Header container. Compose {@link FileExplorerHeaderRow} / {@link FileExplorerCwd} inside it. */
export function FileExplorerHeader({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.header}>{children}</div>;
}

/** One header line — the source picker and the close button sit on this row. */
export function FileExplorerHeaderRow({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.headerRow}>{children}</div>;
}

/**
 * The source picker. Assemblies with a single fixed source (Sindri's directory tab) simply do not
 * render it — there is nothing to pick, and its absence is the composition rather than hidden UI.
 */
export function FileExplorerSourceSelect(): ReactNode {
  const { sources, activeSourceId, controller, locale } = useFileExplorer();

  return (
    <label className={styles.selectWrap}>
      <span className={styles.selectCaret}>
        <ChevronRightIcon size={14} />
      </span>
      <select
        className={styles.select}
        value={activeSourceId ?? ''}
        onChange={e => controller.selectSource(e.target.value)}
        aria-label={t(locale, 'fileExplorer.selectSandbox')}
      >
        {sources.map(s => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The close (X) button; renders nothing unless the provider was given an `onClose`. */
export function FileExplorerCloseButton(): ReactNode {
  const { onClose, locale } = useFileExplorer();
  if (!onClose) return null;

  return (
    <button
      type="button"
      className={styles.closeBtn}
      onClick={onClose}
      aria-label={t(locale, 'fileExplorer.close')}
      title={t(locale, 'header.close')}
    >
      <XIcon size={16} />
    </button>
  );
}

/** The current working directory line. `children` overrides the text for sources with no meaningful cwd. */
export function FileExplorerCwd({ children }: { children?: ReactNode }): ReactNode {
  const { activeSource } = useFileExplorer();
  const text = children ?? activeSource?.rootPath ?? '';

  return (
    <div className={styles.cwd} title={typeof text === 'string' ? text : undefined}>
      {text}
    </div>
  );
}

/**
 * The action toolbar. Hides itself while a file is open, mirroring the built-in panel.
 *
 * The button order is the consumer spec's own ordered action set (`asgard-sindri-pm`
 * `docs/spec/asgard-sindri/panels.md`, restated verbatim in its F-004 AC3: new file, new folder, upload,
 * download / copy, cut, paste, rename, delete / refresh), whose three lines land on the three separator groups
 * below. Every action here is the same context action the right-click menu calls — both entry points offering
 * the same set is the requirement, and sharing the action is what keeps them equal as the set grows. New file
 * and rename were the two the toolbar was missing, which failed that AC on 2026-08-12.
 */
export function FileExplorerToolbar(): ReactNode {
  const ctx = useFileExplorer();
  const {
    providers,
    openFile,
    selectedEntry,
    clipboard,
    targetDir,
    pasteLabel,
    locale,
    actNewFile,
    actNewFolder,
    actUpload,
    actDownload,
    actRename,
    actDelete,
    actPaste,
    setClipboard,
    bumpRefresh,
    readOnly,
  } = ctx;
  const { saveFile, createFile, mkdir, upload, download, move, remove } = providers;
  const canCreateFile = Boolean(createFile ?? saveFile);

  if (openFile) return null;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t(locale, 'fileExplorer.toolbar')}>
      {/*
        `readOnly` removes the mutating actions rather than grey them out — see the prop's own doc. They
        are wrapped in two groups rather than eight conditionals so the separator leaves with the group
        it separates; a lone divider between Download and Refresh is what happens otherwise.
      */}
      {!readOnly && (
        <>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => actNewFile(targetDir)}
            disabled={!canCreateFile}
            aria-label={t(locale, 'fileExplorer.newFile')}
            title={t(locale, 'fileExplorer.newFile')}
          >
            <FilePlusIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => actNewFolder(targetDir)}
            disabled={!mkdir}
            aria-label={t(locale, 'fileExplorer.newFolder')}
            title={t(locale, 'fileExplorer.newFolder')}
          >
            <FolderPlusIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => actUpload(targetDir)}
            disabled={!upload}
            aria-label={t(locale, 'fileExplorer.upload')}
            title={t(locale, 'fileExplorer.upload')}
          >
            <UploadIcon size={16} />
          </button>
        </>
      )}
      <button
        type="button"
        className={styles.toolBtn}
        onClick={() => selectedEntry && actDownload(selectedEntry)}
        disabled={!download || !selectedEntry || selectedEntry.isDir}
        aria-label={t(locale, 'fileExplorer.download')}
        title={t(locale, 'fileExplorer.download')}
      >
        <DownloadIcon size={16} />
      </button>
      {!readOnly && (
        <>
          <span className={styles.toolSep} aria-hidden />
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => selectedEntry && setClipboard({ op: 'copy', entry: selectedEntry })}
            disabled={!selectedEntry}
            aria-label={t(locale, 'fileExplorer.copy')}
            title={t(locale, 'fileExplorer.copy')}
          >
            <CopyIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => selectedEntry && setClipboard({ op: 'cut', entry: selectedEntry })}
            disabled={!selectedEntry}
            aria-label={t(locale, 'fileExplorer.cut')}
            title={t(locale, 'fileExplorer.cut')}
          >
            <ScissorsIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void actPaste(targetDir)}
            disabled={!clipboard}
            aria-label={t(locale, 'fileExplorer.paste')}
            title={pasteLabel}
          >
            <ClipboardPasteIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => selectedEntry && actRename(selectedEntry)}
            disabled={!move || !selectedEntry}
            aria-label={t(locale, 'fileExplorer.rename')}
            title={t(locale, 'fileExplorer.rename')}
          >
            <PencilIcon size={16} />
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${styles.toolDanger}`}
            onClick={() => selectedEntry && actDelete(selectedEntry)}
            disabled={!remove || !selectedEntry}
            aria-label={t(locale, 'fileExplorer.delete')}
            title={t(locale, 'fileExplorer.delete')}
          >
            <TrashIcon size={16} />
          </button>
        </>
      )}
      <span className={styles.toolSpacer} />
      <button
        type="button"
        className={styles.toolBtn}
        onClick={bumpRefresh}
        aria-label={t(locale, 'fileExplorer.refresh')}
        title={t(locale, 'fileExplorer.refresh')}
      >
        <RefreshIcon size={16} />
      </button>
    </div>
  );
}

/** Body container — the tree and the single-file view share this slot. */
export function FileExplorerBody({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.body}>{children}</div>;
}

/** The single-file view; renders nothing until a file is opened. */
export function FileExplorerView(): ReactNode {
  const { openFile, activeSourceId, providers, controller, setOpenFile, actDownload, readOnly, locale } =
    useFileExplorer();

  if (!openFile || !activeSourceId) return null;

  return (
    <FileView
      sandboxName={activeSourceId}
      file={openFile}
      readFile={providers.readFile}
      // Both: `readOnly` changes what the viewer offers, and withholding the saver makes a stray save
      // impossible even if something slipped past that.
      readOnly={readOnly}
      locale={locale}
      onSaveFile={readOnly ? undefined : providers.saveFile}
      watchFile={providers.watchFile}
      onDirtyChange={controller.setEditingDirty}
      // The tree's own download, not a second path: same provider call, so the bytes and the saved name are
      // whatever the tree would have produced for this entry.
      onDownload={() => actDownload(openFile)}
      downloadDisabled={!providers.download}
      onBack={() => {
        controller.setEditingDirty(false);
        setOpenFile(null);
      }}
    />
  );
}

/** Grouped context-menu items for one right-click target. */
function buildSections(ctx: FileExplorerContextValue, target: MenuTarget): ContextMenuItem[][] {
  const {
    providers,
    expanded,
    clipboard,
    rootPath,
    pasteLabel,
    locale,
    bumpRefresh,
    toggleExpand,
    setOpenFile,
    setClipboard,
    actNewFile,
    actNewFolder,
    actRename,
    actDelete,
    actPaste,
    actUpload,
    actDownload,
  } = ctx;
  const { saveFile, createFile, mkdir, remove, move, upload, download } = providers;
  const canCreateFile = Boolean(createFile ?? saveFile);
  const root = rootPath ?? '/';

  const refreshSec: ContextMenuItem[] = [
    {
      key: 'refresh',
      label: t(locale, 'fileExplorer.refresh'),
      icon: <RefreshIcon size={15} />,
      onSelect: bumpRefresh,
    },
  ];

  if (target.kind === 'file') {
    const e = target.entry;

    return [
      [
        {
          key: 'open',
          label: t(locale, 'fileExplorer.open'),
          icon: <EyeIcon size={15} />,
          onSelect: () => setOpenFile(e),
        },
        {
          key: 'download',
          label: t(locale, 'fileExplorer.download'),
          icon: <DownloadIcon size={15} />,
          onSelect: () => actDownload(e),
          disabled: !download,
        },
        {
          key: 'rename',
          label: t(locale, 'fileExplorer.rename'),
          icon: <PencilIcon size={15} />,
          onSelect: () => actRename(e),
          disabled: !move,
        },
      ],
      [
        {
          key: 'copy',
          label: t(locale, 'fileExplorer.copy'),
          icon: <CopyIcon size={15} />,
          onSelect: () => setClipboard({ op: 'copy', entry: e }),
        },
        {
          key: 'cut',
          label: t(locale, 'fileExplorer.cut'),
          icon: <ScissorsIcon size={15} />,
          onSelect: () => setClipboard({ op: 'cut', entry: e }),
        },
      ],
      [
        {
          key: 'delete',
          label: t(locale, 'fileExplorer.delete'),
          icon: <TrashIcon size={15} />,
          danger: true,
          onSelect: () => actDelete(e),
          disabled: !remove,
        },
      ],
      refreshSec,
    ];
  }

  if (target.kind === 'dir') {
    const e = target.entry;
    const isExpanded = expanded.has(e.path);

    return [
      [
        {
          key: 'toggle',
          label: t(locale, isExpanded ? 'fileExplorer.collapse' : 'fileExplorer.expand'),
          icon: isExpanded ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />,
          onSelect: () => toggleExpand(e.path),
        },
      ],
      [
        {
          key: 'newfile',
          label: t(locale, 'fileExplorer.newFile'),
          icon: <FilePlusIcon size={15} />,
          onSelect: () => actNewFile(e.path),
          disabled: !canCreateFile,
        },
        {
          key: 'newfolder',
          label: t(locale, 'fileExplorer.newFolder'),
          icon: <FolderPlusIcon size={15} />,
          onSelect: () => actNewFolder(e.path),
          disabled: !mkdir,
        },
        {
          key: 'upload',
          label: t(locale, 'fileExplorer.upload'),
          icon: <UploadIcon size={15} />,
          onSelect: () => actUpload(e.path),
          disabled: !upload,
        },
        {
          key: 'paste',
          label: pasteLabel,
          icon: <ClipboardPasteIcon size={15} />,
          onSelect: () => void actPaste(e.path),
          disabled: !clipboard,
        },
      ],
      [
        {
          key: 'rename',
          label: t(locale, 'fileExplorer.rename'),
          icon: <PencilIcon size={15} />,
          onSelect: () => actRename(e),
          disabled: !move,
        },
        {
          key: 'copy',
          label: t(locale, 'fileExplorer.copy'),
          icon: <CopyIcon size={15} />,
          onSelect: () => setClipboard({ op: 'copy', entry: e }),
        },
        {
          key: 'cut',
          label: t(locale, 'fileExplorer.cut'),
          icon: <ScissorsIcon size={15} />,
          onSelect: () => setClipboard({ op: 'cut', entry: e }),
        },
      ],
      [
        {
          key: 'delete',
          label: t(locale, 'fileExplorer.delete'),
          icon: <TrashIcon size={15} />,
          danger: true,
          onSelect: () => actDelete(e),
          disabled: !remove,
        },
      ],
      refreshSec,
    ];
  }

  return [
    [
      {
        key: 'newfile',
        label: t(locale, 'fileExplorer.newFile'),
        icon: <FilePlusIcon size={15} />,
        onSelect: () => actNewFile(root),
        disabled: !canCreateFile,
      },
      {
        key: 'newfolder',
        label: t(locale, 'fileExplorer.newFolder'),
        icon: <FolderPlusIcon size={15} />,
        onSelect: () => actNewFolder(root),
        disabled: !mkdir,
      },
      {
        key: 'paste',
        label: pasteLabel,
        icon: <ClipboardPasteIcon size={15} />,
        onSelect: () => void actPaste(root),
        disabled: !clipboard,
      },
    ],
    refreshSec,
  ];
}

/** The right-click menu; renders nothing unless one is open (and never over the file view). */
export function FileExplorerContextMenu(): ReactNode {
  const ctx = useFileExplorer();
  const { menu, openFile, closeMenu, readOnly } = ctx;

  if (openFile || !menu) return null;

  // Filtering the built sections, rather than branching inside `buildSections`, is what keeps the menu
  // and the toolbar hiding the same set: both read one list of mutating keys.
  const sections = buildSections(ctx, menu.target);

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      sections={readOnly ? withoutMutatingItems(sections) : sections}
      onClose={closeMenu}
    />
  );
}

/**
 * The "Read only" marker for the header row (F-025). An explorer whose actions are simply absent looks
 * broken; naming the reason is the difference between "you cannot" and "it is not working".
 *
 * Renders nothing unless the provider was given `readOnly`, so an assembly can place it unconditionally.
 */
export function FileExplorerReadOnlyBadge(): ReactNode {
  const { readOnly, locale } = useFileExplorer();

  if (!readOnly) return null;

  return <span className={styles.readOnlyBadge}>{t(locale, 'fileExplorer.readOnly')}</span>;
}

/**
 * The "no source to browse" state. When the provider was given an `onNudge` it also offers to wake an
 * idle sandbox (F-021 AC4) — a source list that can legitimately be empty is a sandbox trait, so an
 * assembly whose source always exists never renders this.
 */
export function FileExplorerEmptyState(): ReactNode {
  const { onNudge, nudging, nudgeDisabled, locale, handleNudge } = useFileExplorer();

  return (
    <>
      <div className={styles.emptyClose}>
        <FileExplorerCloseButton />
      </div>
      <div className={styles.emptyState}>
        <PackageOpenIcon size={30} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>{t(locale, 'fileExplorer.noSandboxTitle')}</div>
        <div className={styles.emptyDesc}>{t(locale, 'fileExplorer.noSandboxDesc')}</div>
        {onNudge && (
          <button type="button" className={styles.nudgeBtn} onClick={handleNudge} disabled={nudging || nudgeDisabled}>
            {nudging ? (
              <>
                <Spinner size={15} /> {t(locale, 'fileExplorer.waking')}
              </>
            ) : (
              <>
                <ZapIcon size={15} /> {t(locale, 'fileExplorer.wakeSandbox')}
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * The failure line (F-025). Sits between the header and the toolbar, states what went wrong in one
 * sentence, and can be dismissed. Renders nothing when there is nothing to say.
 */
export function FileExplorerNotice(): ReactNode {
  const { notice, dismissNotice, locale } = useFileExplorer();

  if (!notice) return null;

  return (
    <div className={styles.notice} role="status">
      <CircleAlertIcon size={14} />
      <span className={styles.noticeText}>{notice}</span>
      <button
        type="button"
        className={styles.noticeDismiss}
        onClick={dismissNotice}
        aria-label={t(locale, 'fileExplorer.dismissNotice')}
        title={t(locale, 'fileExplorer.dismissNotice')}
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

/**
 * Toolbar + tree/view + context menu — every behavior of the explorer below the header.
 *
 * **Assemble this rather than its parts.** Sindri's directory tab and the built-in sandbox panel differ
 * only in their header (source picker vs. a fixed directory); sharing this subtree is what keeps their
 * behavior identical over time instead of merely identical today.
 */
export function FileExplorerWorkspace(): ReactNode {
  return (
    <>
      <FileExplorerNotice />
      <FileExplorerToolbar />
      <FileExplorerBody>
        <FileExplorerTree />
        <FileExplorerView />
      </FileExplorerBody>
      <FileExplorerContextMenu />
    </>
  );
}
