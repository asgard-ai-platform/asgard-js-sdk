import { ReactNode, useMemo, useState } from 'react';
// Aliased: this route's own component is also called `FileExplorer`.
import {
  AsgardTemplateContextProvider,
  Chatbot,
  FileExplorer as FileExplorerParts,
  FileExplorerPanel,
  FsSource,
  useFileExplorerController,
  type Locale,
} from '@asgard-js/react';
import '@asgard-js/react/style';
import { HttpError, LaunchedSandbox, SandboxFsListResult } from '@asgard-js/core';
import { DemoWrapper } from '../../components/demo-wrapper';

const MOCK_ENDPOINT = `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard`;

/**
 * Verification route for the F-021 File Explorer side panel.
 *
 * Cycle 1: the live-sandbox dropdown, the lazy tree (workingDirectory root), FileView markdown preview ↔
 * textarea edit + save (dirty dot), and the open-file intent. Cycle 2: the mutation toolbar + right-click
 * context menu + copy/cut/paste clipboard (standalone panel over a mutable in-memory fs), and the empty-state
 * Nudge (built-in Chatbot on an empty-sandbox channel; clicking Nudge fills the dropdown via the mock).
 */
const SANDBOXES: LaunchedSandbox[] = [
  {
    sandboxName: 'sbx-demo',
    sandboxBlueprintName: 'demo-workspace',
    workingDirectory: '/home/user/project',
    editorServerEnabled: true,
    browserEnabled: false,
  },
];

// The chatbot theme defaults to a 375px-wide mobile shell, which leaves the built-in aside (flex 0 0 20rem,
// max-width 60%) too cramped to inspect. Widen it the same way the all-features-wide route does.
const WIDE_CHATBOT_THEME = { chatbot: { width: '100%', height: '100%' } };

/**
 * A source that is not a sandbox: one fixed root, always present, nothing to pick between. Stands in for a
 * host like Sindri's directory file page, which has no conversation and no sandbox at all.
 */
const FIXED_SOURCE: FsSource = {
  id: 'sbx-demo',
  label: 'fixed-source',
  rootPath: '/home/user/project',
};

interface MemEntry {
  name: string;
  isDir: boolean;
  sizeBytes: number;
}

const DIRS: Record<string, MemEntry[]> = {
  '/home/user/project': [
    { name: 'src', isDir: true, sizeBytes: 0 },
    { name: 'README.md', isDir: false, sizeBytes: 92 },
    { name: 'notes.txt', isDir: false, sizeBytes: 34 },
  ],
  '/home/user/project/src': [
    { name: 'index.ts', isDir: false, sizeBytes: 48 },
    { name: 'app.tsx', isDir: false, sizeBytes: 60 },
  ],
};

const FILES: Record<string, string> = {
  '/home/user/project/README.md':
    '# Demo Workspace\n\n這是 **File Explorer** 展示用的 in-memory 檔案。\n\n- 點資料夾展開\n- 點檔案預覽\n- 切到編輯打字（右上角出現未存圓點）\n- 工具列 / 右鍵選單：新增、重新命名、刪除、複製貼上',
  '/home/user/project/notes.txt': 'plain text note — 切到編輯試打字。',
  '/home/user/project/src/index.ts': 'export const greet = (n: string) => `hi ${n}`;\n',
  '/home/user/project/src/app.tsx': 'export function App() {\n  return <div>hello</div>;\n}\n',
};

function parentOf(path: string): string {
  const norm = path.replace(/\/+$/, '');
  const i = norm.lastIndexOf('/');

  return i > 0 ? norm.slice(0, i) : '/';
}

function baseOf(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function addEntry(dir: string, name: string, isDir: boolean, sizeBytes: number): void {
  const list = DIRS[dir] ?? (DIRS[dir] = []);
  if (!list.some(e => e.name === name)) list.push({ name, isDir, sizeBytes });
}

function removeEntry(dir: string, name: string): void {
  if (DIRS[dir]) DIRS[dir] = DIRS[dir].filter(e => e.name !== name);
}

function copyTree(src: string, dst: string): void {
  if (src in FILES) {
    FILES[dst] = FILES[src];
    addEntry(parentOf(dst), baseOf(dst), false, FILES[dst].length);

    return;
  }

  for (const key of Object.keys(DIRS)) {
    if (key === src || key.startsWith(`${src}/`)) DIRS[dst + key.slice(src.length)] = DIRS[key].map(e => ({ ...e }));
  }

  for (const key of Object.keys(FILES)) {
    if (key.startsWith(`${src}/`)) FILES[dst + key.slice(src.length)] = FILES[key];
  }

  addEntry(parentOf(dst), baseOf(dst), true, 0);
}

function removeTree(path: string): void {
  delete FILES[path];
  for (const key of Object.keys(FILES)) if (key.startsWith(`${path}/`)) delete FILES[key];
  for (const key of Object.keys(DIRS)) if (key === path || key.startsWith(`${path}/`)) delete DIRS[key];
  removeEntry(parentOf(path), baseOf(path));
}

/**
 * The sandbox's own upload limit (F-031 / EXT-003). The demo uses the **target** 64MB so the pre-flight
 * check is exercisable; production is still 8MB until asgard-core#230 raises it, which is why the cap is
 * injected rather than hardcoded in the SDK.
 */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** Attempts per destination, so "fails the first time" is expressible. */
const UPLOAD_ATTEMPTS = new Map<string, number>();
let uploadFilesSeen = 0;

/**
 * Batch upload against the mock, reproducing the **three** backend behaviors that the component would
 * otherwise be written wrongly against. Without them the queue looks correct in the source and is never
 * actually exercised:
 *
 * 1. A write creates its parent directories, so a nested relative path just works (`os.MkdirAll` in
 *    `file_write.go`). Nothing pre-creates the levels.
 * 2. `create_only` on an existing path answers `409` — which is what makes the conflict dialog reachable.
 * 3. Every 9th file fails its first attempt with `503`. This one is here on purpose: without it neither
 *    the exponential back-off nor the AIMD slow-down ever runs in the demo.
 */
async function uploadManyMock(
  _sandbox: string,
  dirPath: string,
  relPath: string,
  file: File,
  options: { createOnly: boolean; signal: AbortSignal; lastAttempt: boolean },
): Promise<void> {
  const dst = `${dirPath.replace(/\/$/, '')}/${relPath}`;
  const attempt = (UPLOAD_ATTEMPTS.get(dst) ?? 0) + 1;

  UPLOAD_ATTEMPTS.set(dst, attempt);

  if (attempt === 1) {
    uploadFilesSeen += 1;

    if (uploadFilesSeen % 9 === 0) throw new HttpError(503, 'Service Unavailable');
  }

  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');

  if (options.createOnly && dst in FILES) throw new HttpError(409, 'Conflict');

  // (1) The backend creates the parent directories itself.
  const parts = relPath.split('/');
  let cursor = dirPath.replace(/\/$/, '');

  for (const segment of parts.slice(0, -1)) {
    const child = `${cursor}/${segment}`;
    if (!(child in DIRS)) DIRS[child] = [];

    addEntry(cursor, segment, true, 0);
    cursor = child;
  }

  FILES[dst] = `（上傳的檔案：${file.name}，${file.size} bytes）`;
  addEntry(cursor, baseOf(dst), false, file.size);
}

/**
 * Write to the mock sandbox fs from *outside* the panel, the way an agent would. Deliberately a raw
 * `PUT fs/file` rather than the panel's own save, so the reload we observe can only have come from
 * `fs/watch` (F-021 AC3).
 */
async function writeExternally(path: string): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([`agent 在 ${new Date().toLocaleTimeString()} 改寫了這個檔案。`]));

  await fetch(`${MOCK_ENDPOINT}/sandbox/sbx-demo/fs/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: form,
  });
}

export function FileExplorer(): ReactNode {
  const controller = useFileExplorerController({ open: true });
  // A second, independent controller so the composed panel below does not fight the one above.
  const composedController = useFileExplorerController({ activeSourceId: FIXED_SOURCE.id });
  // Two more so the batch-upload pair below does not fight each other or the panels above.
  const batchWideController = useFileExplorerController({ activeSourceId: FIXED_SOURCE.id });
  const batchNarrowController = useFileExplorerController({ activeSourceId: FIXED_SOURCE.id });
  // The standalone panels sit outside any Chatbot, so nothing supplies a locale and they would render
  // en-US only. Acceptance happens in zh-TW, and a missing key is invisible in English (the code's own
  // fallback *is* the English string), so the switch has to exist here.
  const [batchLocale, setBatchLocale] = useState<Locale>('zh-TW');

  const providers = useMemo(
    () => ({
      listDir: async (_sandbox: string, path: string): Promise<SandboxFsListResult> => ({
        entries: (DIRS[path] ?? []).map(e => ({ ...e, mtimeUnix: 1_700_000_000, mode: e.isDir ? 493 : 420 })),
        truncated: false,
      }),
      readFile: async (_sandbox: string, path: string): Promise<string> => FILES[path] ?? '',
      saveFile: async (_sandbox: string, path: string, text: string): Promise<void> => {
        FILES[path] = text;
        addEntry(parentOf(path), baseOf(path), false, text.length);
      },
      mkdir: async (_sandbox: string, path: string): Promise<void> => {
        if (!(path in DIRS)) DIRS[path] = [];

        addEntry(parentOf(path), baseOf(path), true, 0);
      },
      remove: async (_sandbox: string, path: string): Promise<void> => removeTree(path),
      copy: async (_sandbox: string, src: string, dst: string): Promise<void> => copyTree(src, dst),
      move: async (_sandbox: string, src: string, dst: string): Promise<void> => {
        copyTree(src, dst);
        removeTree(src);
      },
      upload: async (_sandbox: string, dir: string, file: File): Promise<void> => {
        const dst = `${dir.replace(/\/$/, '')}/${file.name}`;
        FILES[dst] = `（上傳的檔案：${file.name}）`;
        addEntry(dir, file.name, false, FILES[dst].length);
      },
      uploadMany: uploadManyMock,
      // A real download rather than a no-op: the toolbar and the file viewer both route here, and the only
      // way to see that either produced the *original* file name is to let the browser save one.
      download: async (_sandbox: string, path: string, name: string): Promise<void> => {
        const url = URL.createObjectURL(new Blob([FILES[path] ?? ''], { type: 'application/octet-stream' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
      },
    }),
    [],
  );

  return (
    <DemoWrapper
      title="File Explorer Side Panel (F-021)"
      description="Cycle 1：dropdown + lazy tree（workingDirectory root）、FileView 預覽↔編輯/存檔、open-file intent。Cycle 2：工具列 + 右鍵選單 + 複製/剪下/貼上（獨立面板走可變 in-memory fs），以及空狀態 Nudge（builtin Chatbot 空 sandbox 頻道，按下喚醒後透過 mock 補回 dropdown）。"
    >
      {/* DemoWrapper's `.content` is a flex *row* — without this single block wrapper every child below
          becomes a row item and the panel gets squeezed to ~1px. */}
      <div style={{ width: '100%', minWidth: 0 }}>
        <div
          style={{
            width: '100%',
            maxWidth: '32rem',
            height: '660px',
          }}
        >
          <FileExplorerPanel
            sandboxes={SANDBOXES}
            controller={controller}
            listDir={providers.listDir}
            readFile={providers.readFile}
            saveFile={providers.saveFile}
            mkdir={providers.mkdir}
            remove={providers.remove}
            copy={providers.copy}
            move={providers.move}
            upload={providers.upload}
            uploadMany={providers.uploadMany}
            download={providers.download}
            maxUploadBytes={MAX_UPLOAD_BYTES}
          />
        </div>
        <div style={{ marginTop: '1rem', maxWidth: '48rem' }}>
          <h4>Cycle 2：工具列 / 右鍵選單</h4>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            上方工具列（左起）：新增檔案 / 新增資料夾 / 上傳 / 下載 ｜ 複製 / 剪下 / 貼上 / 重新命名 / 刪除 ……
            最右：重新整理 —— 與右鍵選單<strong>同一組動作</strong>。樹上<strong>右鍵</strong>叫出情境選單（依檔案 /
            資料夾 / 空白處給不同項目）；複製或剪下後貼到目標資料夾（剪下＋貼上＝搬移）。
          </p>
          <h4>open-file intent</h4>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            模擬 agent 推來的 <code>sandbox://…/open-file</code> 卡片：點下去呼叫 <code>controller.requestFile</code>
            ，面板會在預覽區開啟該檔（與卡片抵達走同一條路）。
          </p>
          <button
            type="button"
            data-testid="simulate-open-file"
            onClick={() => controller.requestFile('sbx-demo', '/home/user/project/README.md')}
            style={{ padding: '0.4rem 0.75rem', cursor: 'pointer' }}
          >
            模擬 open-file 卡片 → README.md
          </button>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}>批次上傳（F-031）——寬窄並排</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          上傳鈕會先問<strong>檔案還是資料夾</strong>（兩者能力不同：挑資料夾拿不到空資料夾，挑檔案拿不到資料夾）；
          從桌面<strong>拖進樹裡</strong>則走 <code>webkitGetAsEntry()</code> 遞迴，連空資料夾都保留。 並排兩個 shell
          是刻意的：預設 theme 是 375px 行動版寬度，而實裝的消費端都是 full-bleed， 只驗一種等於沒驗到另一種會壞的版面。
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          mock 複製了後端三個真實行為，否則限流與衝突在 demo 上永遠走不到：<strong>write 自動遞迴建父目錄</strong>、
          <strong>
            <code>create_only</code> 撞名回 409
          </strong>
          （於是會跳出衝突對話框）、<strong>每第 9 個檔的第一次嘗試回 503</strong>
          （於是指數退避與 AIMD 降速真的會跑，面板會顯示「伺服器忙碌，已降到同時 N 個」）。 單檔上限填的是
          <strong>目標值 64MB</strong>；上線值仍是 8MB，所以大檔那一條要等 asgard-core#230。
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>locale：</span>
          {(['zh-TW', 'en-US', 'ja-JP'] as Locale[]).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setBatchLocale(l)}
              style={{
                padding: '0.15rem 0.5rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: l === batchLocale ? 700 : 400,
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <AsgardTemplateContextProvider locale={batchLocale}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 28rem', minWidth: 0, height: '560px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                寬（full-bleed，實裝形態）
              </div>
              <div style={{ height: '520px' }}>
                <FileExplorerPanel
                  sandboxes={SANDBOXES}
                  controller={batchWideController}
                  listDir={providers.listDir}
                  readFile={providers.readFile}
                  saveFile={providers.saveFile}
                  mkdir={providers.mkdir}
                  remove={providers.remove}
                  copy={providers.copy}
                  move={providers.move}
                  upload={providers.upload}
                  uploadMany={providers.uploadMany}
                  download={providers.download}
                  maxUploadBytes={MAX_UPLOAD_BYTES}
                  uploadConcurrency={3}
                />
              </div>
            </div>
            <div style={{ flex: '0 0 343px', height: '560px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                窄（343px，預設 theme 寬度）
              </div>
              <div style={{ width: '343px', height: '520px' }}>
                <FileExplorerPanel
                  sandboxes={SANDBOXES}
                  controller={batchNarrowController}
                  listDir={providers.listDir}
                  readFile={providers.readFile}
                  saveFile={providers.saveFile}
                  mkdir={providers.mkdir}
                  remove={providers.remove}
                  copy={providers.copy}
                  move={providers.move}
                  upload={providers.upload}
                  uploadMany={providers.uploadMany}
                  download={providers.download}
                  maxUploadBytes={MAX_UPLOAD_BYTES}
                  uploadConcurrency={3}
                />
              </div>
            </div>
          </div>
        </AsgardTemplateContextProvider>

        <h3 style={{ marginTop: '1.5rem' }}>自行組裝零件（單一固定來源，沒有選台）</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          同一組零件、換一個標頭：<code>FileExplorer.Provider</code> 收下一個非 sandbox 的來源，標頭只放名稱、
          <strong>不組 </strong>
          <code>SourceSelect</code>——「沒有選台」是這個組裝根本沒有那顆零件，不是把 UI 藏起來。標頭以下整個
          <code>FileExplorer.Workspace</code> 與上方預設組合<strong>共用同一份實作</strong>，所以工具列、樹、
          右鍵選單、預覽編輯的行為兩邊一致。
        </p>
        <div style={{ width: '100%', maxWidth: '32rem', height: '520px' }}>
          <FileExplorerParts.Provider sources={[FIXED_SOURCE]} controller={composedController} providers={providers}>
            <FileExplorerParts.Root>
              <FileExplorerParts.Header>
                <FileExplorerParts.HeaderRow>
                  <strong style={{ fontSize: '0.85rem' }}>{FIXED_SOURCE.label}</strong>
                </FileExplorerParts.HeaderRow>
                <FileExplorerParts.Cwd />
              </FileExplorerParts.Header>
              <FileExplorerParts.Workspace />
            </FileExplorerParts.Root>
          </FileExplorerParts.Provider>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}>Built-in aside（fileExplorer=&quot;builtin&quot;）</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          真實 <code>&lt;Chatbot fileExplorer=&quot;builtin&quot;&gt;</code>：標題列右側的資料夾鈕 toggle 出右側
          aside（切進 chat 殼內、不 fixed），dropdown 由 <code>launchedSandboxes$</code>（metadata mock）驅動；工具列 /
          右鍵選單透過真實 fs mock 端點（mkdir / item / all / copy / move）操作。
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          帶 <code>enableUpload</code> + <code>enableDocumentUpload</code>（Odin 就是這樣掛的），所以 chat 殼本身也是個
          drop target：檔案拖進聊天區會變成 composer 附件。兩個都要開，否則 <code>.txt</code> 先被 MIME
          檢查擋掉，就走不到附件那一步。issue #446 的檢查點是拖進 aside
          <strong>不會兩件事都發生</strong>——面板任何位置（工具列、header、上傳進度面板都算）放下只會上傳，chatbot 的
          全域「拖曳檔案到此」浮層不會跟面板自己的「上傳到 …」高亮同時亮。
        </p>
        <div style={{ height: '560px' }}>
          <Chatbot
            title="File Explorer（builtin）"
            config={{ botProviderEndpoint: MOCK_ENDPOINT }}
            customChannelId="file-explorer-demo"
            fileExplorer="builtin"
            enableUpload
            enableDocumentUpload
            locale="zh-TW"
            theme={WIDE_CHATBOT_THEME}
          />
        </div>

        <h4 style={{ marginTop: '1rem' }}>watch-and-reload（F-021 AC3）</h4>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          在上面的 builtin aside 裡開啟 <code>notes.txt</code> 的預覽，然後按這顆鈕：它繞過面板、直接對 mock 端點
          <code>PUT fs/file</code>（等同 agent 在 sandbox 裡改檔）。mock 的 <code>fs/watch</code> SSE 推一則
          <code>change</code>，FileView 隨即重讀、內容就地換掉——不必按重新整理。編輯中（右上有未存圓點）時會
          <strong>跳過</strong>重載，不會蓋掉還沒存的內容。
        </p>
        <button
          type="button"
          data-testid="simulate-agent-write"
          onClick={() => void writeExternally('/home/user/project/notes.txt')}
          style={{ padding: '0.4rem 0.75rem', cursor: 'pointer' }}
        >
          模擬 agent 寫入 notes.txt
        </button>

        <h3 style={{ marginTop: '1.5rem' }}>空狀態 Nudge（F-021 AC4）</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          這個頻道的 metadata 一開始<strong>沒有</strong>執行中的 sandbox：開啟 aside 會看到「目前沒有執行中的
          sandbox」＋
          <strong>喚醒 sandbox</strong> 按鈕。按下去送出 <code>action=NUDGE</code>
          （空白、不可見的一輪、聊天室不顯示回覆）， mock 回 <code>sandbox.launch → ready</code>，SDK 自動 refetch
          metadata，dropdown 隨即補回。
        </p>
        <div style={{ height: '480px' }}>
          <Chatbot
            title="File Explorer（Nudge 空狀態）"
            config={{ botProviderEndpoint: MOCK_ENDPOINT }}
            customChannelId="file-explorer-empty-demo"
            fileExplorer="builtin"
            theme={WIDE_CHATBOT_THEME}
          />
        </div>
      </div>
    </DemoWrapper>
  );
}
