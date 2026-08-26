import {
  CSSProperties,
  DragEvent,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AsgardSourceSetClient } from '@asgard-js/core';
import { ContextMenu, type ContextMenuItem } from '../file-explorer/context-menu';
import type { FsEntry } from '../file-explorer/types';
import {
  formatUploadSize,
  isFileDrag,
  planFromDataTransfer,
  planFromFileList,
  UploadConflictDialog,
  UploadProgress,
  type UploadLabels,
  type UploadPlanSource,
  type UploadReason,
} from '../upload-queue';
import { type Locale, t } from '../../i18n';
import { Spinner } from '../spinner';
import { SourceSetFileView } from './file-view';
import { SourceSetTree } from './tree';
import { useSourceSetDialog } from './dialog';
import {
  ClipboardPasteIcon,
  CircleAlertIcon,
  CopyIcon,
  DownloadIcon,
  FilePlusIcon,
  FolderPlusIcon,
  FolderUpIcon,
  PencilIcon,
  RefreshIcon,
  ScissorsIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from './icons';
import { useSourceSetExplorer } from './use-source-set-explorer';
import styles from './source-set-explorer.module.scss';

/**
 * Overrides for the tokens this component paints with.
 *
 * Deliberately the same `--asg-*` tokens the in-sandbox explorer uses, so the two look identical wherever
 * a host mounts both (F-025 R16). Every one has a `var()` fallback in the stylesheet, so a host that sets
 * nothing still gets a fully painted component rather than a transparent box.
 */
export interface SourceSetExplorerTheme {
  surface?: string;
  textPrimary?: string;
  textSecondary?: string;
  border?: string;
  primary?: string;
  error?: string;
  fontFamily?: string;
  fontFamilyMono?: string;
}

export interface SourceSetFileExplorerProps {
  /**
   * The volume endpoint, e.g. `{EDGE}/ns/{ns}/source-set/{name}/volume` or a BFF relay such as
   * `{PLATFORM_API}/v1/source-set/{id}/volume`.
   */
  sourceSetEndpoint: string;
  /** Sent as `X-API-KEY`. Omit against a BFF relay — the relay holds the volume key. */
  apiKey?: string;
  /** Merged into every request, e.g. `{ Authorization: 'Bearer …' }`. */
  customHeaders?: Record<string, string>;
  /** Lock the tree to a subtree of the volume. Defaults to the volume root. */
  rootPath?: string;
  /** Expand to, and select, this path on mount. */
  initialPath?: string;
  /** Hide every mutating action, including the file view's edit entry point. */
  readOnly?: boolean;
  locale?: Locale;
  theme?: SourceSetExplorerTheme;
  /** Ceiling on one directory's auto-paging walk (F-026). */
  maxEntries?: number;
  /**
   * Ceiling on concurrent uploads within one batch — the upper bound the back-off works below, not a
   * fixed rate. Defaults to 3.
   *
   * There is no batch endpoint: two hundred files is two hundred `PUT volume/file` requests, and firing
   * them at once is what a relay in front of the volume cannot survive. Injected rather than fixed
   * because a BFF relay and the edge server tolerate different amounts.
   */
  uploadConcurrency?: number;
  /**
   * Host-supplied context-menu actions, rendered as their own section after `Rename` / `Delete` and
   * before `Refresh`. Called with the currently selected entry, or `null` when nothing is selected —
   * the same target every built-in action resolves against.
   *
   * Not called at all while `readOnly` (F-025 R10): a read-only volume offers no gesture that can never
   * complete, and that applies to the host's section as much as to the built-in ones.
   */
  extraEntryActions?: (entry: FsEntry | null) => ContextMenuItem[];
  /**
   * Decoration for the right of each entry's name — a badge, a status marker. Return `null` to leave a
   * row as it was.
   *
   * Purely visual: it adds no click target of its own, so a click still reaches the row. Unlike
   * {@link SourceSetFileExplorerProps.extraEntryActions} it keeps rendering while `readOnly`, because a
   * status marker is information rather than an operation.
   */
  entryBadge?: (entry: FsEntry) => ReactNode;
  onError?: (error: unknown) => void;
}

interface ExplorerAction {
  key: string;
  labelKey: string;
  label?: string;
  icon: ReactNode;
  run: () => void;
  disabled: boolean;
  /**
   * Whether this action changes the volume. `readOnly` drops every one of them (R10).
   *
   * Copy and cut count even though neither writes on its own: their only purpose is to feed paste, so
   * leaving them behind on a read-only volume offers a gesture that can never complete.
   */
  mutating: boolean;
  danger?: boolean;
}

function themeStyle(theme?: SourceSetExplorerTheme): CSSProperties {
  if (!theme) return {};

  const vars: Record<string, string> = {};
  const set = (name: string, value?: string): void => {
    if (value) vars[name] = value;
  };

  set('--asg-color-surface', theme.surface);
  set('--asg-color-text-primary', theme.textPrimary);
  set('--asg-color-text-secondary', theme.textSecondary);
  set('--asg-color-border', theme.border);
  set('--asg-color-primary', theme.primary);
  set('--asg-color-error', theme.error);
  set('--asg-font-family', theme.fontFamily);
  set('--asg-font-family-mono', theme.fontFamilyMono);

  return vars as CSSProperties;
}

/**
 * A File Explorer mounted directly on a SourceSet volume (F-025).
 *
 * Nothing here knows about chat: no `useAsgardContext`, no sandbox, no channel, no Nudge. Give it an
 * endpoint and either an `apiKey` or `customHeaders` and it renders — which is what lets the same
 * component serve Platform's SourceSet and SkillSet screens and Agent Hub's Directory screen on props
 * alone.
 *
 * There is no watch: a volume is served by several replicas and exposes no change stream, so freshness
 * comes from the refresh button rather than a subscription.
 */
export function SourceSetFileExplorer(props: SourceSetFileExplorerProps): ReactNode {
  const {
    sourceSetEndpoint,
    apiKey,
    customHeaders,
    rootPath = '',
    initialPath,
    readOnly = false,
    locale = 'en-US',
    theme,
    maxEntries,
    uploadConcurrency,
    extraEntryActions,
    entryBadge,
    onError,
  } = props;

  // `customHeaders` is almost always an object literal at the call site, so identity alone would rebuild
  // the client — and the whole tree with it — on every host render.
  const headerKey = customHeaders ? JSON.stringify(customHeaders) : '';
  const client = useMemo(
    () =>
      new AsgardSourceSetClient({
        sourceSetEndpoint,
        apiKey,
        customHeaders: headerKey ? (JSON.parse(headerKey) as Record<string, string>) : undefined,
      }),
    [sourceSetEndpoint, apiKey, headerKey],
  );

  const { dialog, requestInput, requestConfirm } = useSourceSetDialog(locale);
  const explorer = useSourceSetExplorer({
    client,
    rootPath,
    initialPath,
    locale,
    maxEntries,
    uploadConcurrency,
    readOnly,
    onError,
    requestInput,
    requestConfirm,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The folder picker. Reaches every file in a tree, but never an empty folder — only a drag can. */
  const dirInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [uploadMenu, setUploadMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);

  const { selected, clipboard, openFile, targetDir, uploads, startUpload } = explorer;
  const hasSelection = selected != null;
  const selectedIsFile = hasSelection && !selected.isDir;

  // `webkitdirectory` is not a React DOM attribute; setting it on the element avoids both a cast and an
  // unknown-prop warning, and `HTMLInputElement` declares it, so this stays fully typed.
  useEffect(() => {
    if (dirInput.current) dirInput.current.webkitdirectory = true;
  }, []);

  /**
   * Where this batch lands. Read when the picker opens rather than when it returns: `targetDir` follows
   * the selection, and the destination the user asked for is the one that was current when they asked.
   */
  const uploadDir = useRef(rootPath);

  const openPicker = useCallback(
    (input: HTMLInputElement | null): void => {
      uploadDir.current = targetDir;
      input?.click();
    },
    [targetDir],
  );

  /**
   * Reads a picked `FileList` and starts the batch.
   *
   * The copy on the first line is not incidental. `input.files` is **live**: clearing `input.value`
   * empties the very `FileList` you are holding, so reading it afterwards finds nothing and the batch
   * silently never starts. And the value does have to be cleared, or picking the same file twice in a
   * row fires no `change` at all. Copy first, then clear.
   */
  const takePicked = useCallback(
    (input: HTMLInputElement, source: UploadPlanSource): void => {
      const picked = input.files ? Array.from(input.files) : [];

      input.value = '';
      if (picked.length === 0) return;

      startUpload(uploadDir.current, planFromFileList(picked, source));
    },
    [startUpload],
  );

  /**
   * "Files or folder?" — asked rather than assumed, because the two pickers see different things: a
   * folder pick reaches every file in the tree but no empty folder, and a file pick sees no folders at
   * all. One definition, rendered both as the toolbar button's menu and as two flat context-menu rows.
   */
  const uploadEntries = useMemo(
    (): ContextMenuItem[] =>
      readOnly
        ? []
        : [
            {
              key: 'upload-files',
              label: t(locale, 'sourceSetExplorer.uploadFiles'),
              icon: <UploadIcon size={15} />,
              onSelect: () => openPicker(fileInput.current),
            },
            {
              key: 'upload-folder',
              label: t(locale, 'sourceSetExplorer.uploadFolder'),
              icon: <FolderUpIcon size={15} />,
              onSelect: () => openPicker(dirInput.current),
            },
          ],
    [readOnly, locale, openPicker],
  );

  /**
   * Anchored off the toolbar button's own ref rather than a click event, so `ExplorerAction.run` stays
   * the plain `() => void` every other action is — the context menu renders those same functions and has
   * no event to hand them.
   */
  const uploadButton = useRef<HTMLButtonElement>(null);
  const openUploadMenu = useCallback((): void => {
    const button = uploadButton.current?.getBoundingClientRect();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!button) return;

    setUploadMenu({ x: button.left - (bounds?.left ?? 0), y: button.bottom - (bounds?.top ?? 0) + 2 });
  }, []);

  /**
   * The one action table (R5). The toolbar and the context menu both render *this*, so the two cannot
   * drift apart into different sets or different disabled rules — the parity is structural rather than
   * something two call sites have to keep agreeing on.
   */
  const actions = useMemo((): ExplorerAction[] => {
    const all: ExplorerAction[] = [
      {
        key: 'newFile',
        labelKey: 'sourceSetExplorer.newFile',
        icon: <FilePlusIcon size={15} />,
        run: () => void explorer.newFile(),
        disabled: false,
        mutating: true,
      },
      {
        key: 'newFolder',
        labelKey: 'sourceSetExplorer.newFolder',
        icon: <FolderPlusIcon size={15} />,
        run: () => void explorer.newFolder(),
        disabled: false,
        mutating: true,
      },
      {
        key: 'upload',
        labelKey: 'sourceSetExplorer.upload',
        icon: <UploadIcon size={15} />,
        run: openUploadMenu,
        disabled: false,
        mutating: true,
      },
      {
        key: 'download',
        labelKey: 'sourceSetExplorer.download',
        icon: <DownloadIcon size={15} />,
        run: () => void explorer.download(),
        disabled: !selectedIsFile,
        mutating: false,
      },
      {
        key: 'copy',
        labelKey: 'sourceSetExplorer.copy',
        icon: <CopyIcon size={15} />,
        run: explorer.copy,
        disabled: !hasSelection,
        mutating: true,
      },
      {
        key: 'cut',
        labelKey: 'sourceSetExplorer.cut',
        icon: <ScissorsIcon size={15} />,
        run: explorer.cut,
        disabled: !hasSelection,
        mutating: true,
      },
      {
        key: 'paste',
        labelKey: 'sourceSetExplorer.paste',
        label: clipboard ? t(locale, 'sourceSetExplorer.pasteNamed', { name: clipboard.entry.name }) : undefined,
        icon: <ClipboardPasteIcon size={15} />,
        run: () => void explorer.paste(),
        disabled: clipboard == null,
        mutating: true,
      },
      {
        key: 'rename',
        labelKey: 'sourceSetExplorer.rename',
        icon: <PencilIcon size={15} />,
        run: () => void explorer.rename(),
        disabled: !hasSelection,
        mutating: true,
      },
      {
        key: 'delete',
        labelKey: 'sourceSetExplorer.delete',
        icon: <TrashIcon size={15} />,
        run: () => void explorer.remove(),
        disabled: !hasSelection,
        mutating: true,
        danger: true,
      },
      {
        key: 'refresh',
        labelKey: 'sourceSetExplorer.refresh',
        icon: <RefreshIcon size={15} />,
        run: explorer.refresh,
        disabled: false,
        mutating: false,
      },
    ];

    return readOnly ? all.filter(action => !action.mutating) : all;
  }, [explorer, readOnly, hasSelection, selectedIsFile, clipboard, locale, openUploadMenu]);

  const labelOf = useCallback((action: ExplorerAction): string => action.label ?? t(locale, action.labelKey), [locale]);

  const openMenu = useCallback((event: MouseEvent): void => {
    event.preventDefault();
    const host = event.currentTarget.closest<HTMLElement>(`.${styles.root}`);
    const bounds = host?.getBoundingClientRect();
    setMenu({ x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) });
  }, []);

  const closeMenu = useCallback((): void => setMenu(null), []);

  // Grouping only — the menu carries exactly the built-in actions the toolbar does, plus whatever
  // section the host contributes.
  const menuSections = useMemo((): ContextMenuItem[][] => {
    const group = (keys: string[]): ContextMenuItem[] =>
      actions
        .filter(action => keys.includes(action.key))
        .map(action => ({
          key: action.key,
          label: labelOf(action),
          icon: action.icon,
          disabled: action.disabled,
          danger: action.danger,
          onSelect: action.run,
        }));

    // The host's section sits between the mutating pair and `Refresh`, which stays the closer. A host
    // that returns nothing drops out through the same filter every built-in group goes through.
    const extra = !readOnly && extraEntryActions ? extraEntryActions(selected) : [];

    // Upload is the one action the toolbar renders as a menu rather than a command, so here it expands
    // into its two rows instead of nesting a second menu inside this one. Same two `uploadEntries` the
    // toolbar menu shows, so the pair cannot drift.
    return [
      [...group(['newFile', 'newFolder']), ...uploadEntries],
      group(['download', 'copy', 'cut', 'paste']),
      group(['rename', 'delete']),
      extra,
      group(['refresh']),
    ].filter(section => section.length > 0);
  }, [actions, labelOf, readOnly, extraEntryActions, selected, uploadEntries]);

  /**
   * This explorer's copy for the shared upload UI, drawn from `sourceSetExplorer.*`.
   *
   * The components themselves hold no strings: the chat explorer mounts the same ones against
   * `fileExplorer.*`, so neither namespace can be baked in (F-025).
   */
  const uploadLabels = useMemo<UploadLabels>(
    () => ({
      region: t(locale, 'sourceSetExplorer.uploadProgress'),
      uploading: t(locale, 'sourceSetExplorer.uploading'),
      cancelled: t(locale, 'sourceSetExplorer.uploadCancelled'),
      doneWithFailures: t(locale, 'sourceSetExplorer.uploadDoneWithFailures'),
      done: t(locale, 'sourceSetExplorer.uploadDone'),
      cancel: t(locale, 'sourceSetExplorer.cancel'),
      retry: (count): string => t(locale, 'sourceSetExplorer.uploadRetry', { count: String(count) }),
      dismiss: t(locale, 'sourceSetExplorer.uploadDismiss'),
      throttled: (limit, max): string =>
        t(locale, 'sourceSetExplorer.uploadThrottled', { limit: String(limit), max: String(max) }),
      emptyDirsHint: t(locale, 'sourceSetExplorer.uploadEmptyDirsHint'),
      reason: (reason: UploadReason): string => {
        switch (reason.code) {
          // Unreachable while this explorer injects no cap — the volume streams writes and has none. It
          // is rendered anyway because the cap is a queue parameter, so a host that ever sets one gets a
          // sentence rather than a blank cell.
          case 'too-large':
            return t(locale, 'sourceSetExplorer.uploadTooLarge', {
              max: formatUploadSize(reason.maxBytes),
              size: formatUploadSize(reason.size),
            });
          case 'exists-skipped':
            return t(locale, 'sourceSetExplorer.uploadExistsSkipped');
          case 'cancelled':
            return t(locale, 'sourceSetExplorer.uploadCancelled');
          default:
            if (reason.status === 403) return t(locale, 'sourceSetExplorer.uploadForbidden');

            if (reason.status === 413) return t(locale, 'sourceSetExplorer.uploadTooLargeForServer');

            if (reason.status === 429) return t(locale, 'sourceSetExplorer.uploadServerBusy');

            if (reason.status !== undefined && reason.status >= 500) {
              return t(locale, 'sourceSetExplorer.uploadServerError', { status: String(reason.status) });
            }

            return reason.message || t(locale, 'sourceSetExplorer.uploadUnknownError');
        }
      },
      conflictTitle: t(locale, 'sourceSetExplorer.uploadConflictTitle'),
      skip: t(locale, 'sourceSetExplorer.uploadSkip'),
      keepBoth: t(locale, 'sourceSetExplorer.uploadKeepBoth'),
      overwrite: t(locale, 'sourceSetExplorer.uploadOverwrite'),
      applyToRest: (count): string => t(locale, 'sourceSetExplorer.uploadApplyToRest', { count: String(count) }),
      allSkip: t(locale, 'sourceSetExplorer.uploadAllSkip'),
      allKeepBoth: t(locale, 'sourceSetExplorer.uploadAllKeepBoth'),
      allOverwrite: t(locale, 'sourceSetExplorer.uploadAllOverwrite'),
      cancelBatch: t(locale, 'sourceSetExplorer.uploadCancelBatch'),
    }),
    [locale],
  );

  /**
   * Accepts files dragged in **from outside the browser** only. Dragging nodes around inside the tree
   * stays unsupported (moving is cut-and-paste, F-025), which is also why the highlight covers the whole
   * body rather than the row under the cursor.
   *
   * Spread on the panel root so the toolbar and the progress panel behave like the tree does — the
   * progress panel covers the tree's own bottom edge mid-batch, and it is as much "the explorer" to the
   * person dragging.
   */
  const dropZone = useMemo(() => {
    /** Will this panel serve the drag? Only a served drag is claimed; anything else passes through. */
    const serves = (event: DragEvent<HTMLElement>): boolean => !readOnly && !openFile && isFileDrag(event.dataTransfer);

    /**
     * Take the event out of circulation. `preventDefault()` alone only suppresses the browser default —
     * the event keeps bubbling, and a host page around this panel may be a drop target of its own
     * (asgard-js-sdk#446 was exactly that on the chat side: one drop both uploaded and attached).
     */
    const claim = (event: DragEvent<HTMLElement>): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    return {
      onDragEnter: (event: DragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(true);
      },
      onDragOver: (event: DragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(true);
      },
      onDragLeave: (event: DragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        // Claimed before the guard below, not after: moving between two rows inside the panel also fires
        // `dragleave`, and letting that reach a host would decrement a counter this panel never let it
        // increment — leaving the host's own overlay stuck on.
        claim(event);

        // Only the container's own leave counts; bubbling from a child row would flicker the state.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;

        setDropping(false);
      },
      onDrop: (event: DragEvent<HTMLElement>): void => {
        if (!serves(event)) return;

        claim(event);
        setDropping(false);

        const dir = targetDir;
        // `DataTransfer` does not survive the await inside, so hand it over synchronously.
        const dataTransfer = event.dataTransfer;

        void planFromDataTransfer(dataTransfer).then(plan => startUpload(dir, plan));
      },
    };
  }, [readOnly, openFile, targetDir, startUpload]);

  return (
    // The drop zone is the whole panel, not the tree alone: the handlers decide for themselves whether
    // this panel serves the drag, and a drop it does not serve passes through untouched.
    <div className={styles.root} style={themeStyle(theme)} ref={rootRef} {...dropZone}>
      <div className={styles.toolbar} role="toolbar" aria-label={t(locale, 'sourceSetExplorer.toolbar')}>
        {actions.map(action => (
          <button
            key={action.key}
            type="button"
            ref={action.key === 'upload' ? uploadButton : undefined}
            className={`${styles.toolBtn} ${action.danger ? styles.toolBtnDanger : ''}`}
            // R5: an action that needs a selection goes inert, it does not disappear — a toolbar whose
            // buttons come and go makes the user hunt for the one they just used.
            disabled={action.disabled}
            aria-label={labelOf(action)}
            title={labelOf(action)}
            onClick={action.run}
          >
            {action.icon}
          </button>
        ))}
        {explorer.busy && <Spinner size={13} />}
      </div>

      {explorer.error && (
        <div className={styles.errorBar} role="alert">
          <CircleAlertIcon size={13} />
          <span className={styles.errorText}>{explorer.error}</span>
          <button
            type="button"
            className={styles.errorDismiss}
            aria-label={t(locale, 'sourceSetExplorer.dismissError')}
            onClick={explorer.dismissError}
          >
            <XIcon size={13} />
          </button>
        </div>
      )}

      <div className={`${styles.body} ${dropping ? styles.bodyDropping : ''}`}>
        {dropping && (
          <div className={styles.dropOverlay}>
            {t(locale, 'sourceSetExplorer.dropToUpload', { dir: targetDir === '' ? '/' : `/${targetDir}` })}
          </div>
        )}
        {openFile ? (
          <SourceSetFileView
            // Keyed on the refresh token so the toolbar's refresh re-reads the open file too (R8).
            key={`${openFile.path}:${explorer.refreshToken}`}
            file={openFile}
            readFile={explorer.readFile}
            onSaveFile={explorer.saveFile}
            editable={!readOnly}
            onDownload={() => void explorer.download()}
            onBack={explorer.closeFile}
            locale={locale}
          />
        ) : (
          <SourceSetTree
            listings={explorer.listings}
            expanded={explorer.expanded}
            selected={selected}
            rootPath={rootPath}
            locale={locale}
            onSelect={explorer.select}
            onToggle={explorer.toggleExpand}
            onOpen={explorer.open}
            onContextMenu={openMenu}
            entryBadge={entryBadge}
          />
        )}
      </div>

      {/* Docked below the tree rather than over it: browsing while a batch runs is the normal case. */}
      <UploadProgress
        items={uploads.items}
        running={uploads.running}
        cancelled={uploads.cancelled}
        limit={uploads.limit}
        ceiling={uploads.ceiling}
        source={uploads.source}
        labels={uploadLabels}
        onCancel={uploads.cancel}
        onRetryFailed={uploads.retryFailed}
        onDismiss={uploads.dismiss}
      />

      {uploads.conflict && (
        <UploadConflictDialog ask={uploads.conflict} labels={uploadLabels} onAnswer={uploads.answerConflict} />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menuSections} onClose={closeMenu} />}

      {uploadMenu && (
        <ContextMenu x={uploadMenu.x} y={uploadMenu.y} sections={[uploadEntries]} onClose={() => setUploadMenu(null)} />
      )}

      {/* The multi-file picker stays first: it is the one an assembly reaches for by element type. */}
      <input
        ref={fileInput}
        type="file"
        multiple
        className={styles.fileInput}
        onChange={event => takePicked(event.target, 'files')}
      />
      <input
        ref={dirInput}
        type="file"
        multiple
        className={styles.fileInput}
        onChange={event => takePicked(event.target, 'directory')}
      />

      {dialog}
    </div>
  );
}
