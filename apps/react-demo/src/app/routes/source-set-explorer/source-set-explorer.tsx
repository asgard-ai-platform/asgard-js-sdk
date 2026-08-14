import { ReactNode, useEffect, useState } from 'react';
import { AsgardThemeContextValue, SourceSetFileExplorer } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { installVolumeMock, MOCK_VOLUME_ENDPOINT } from './volume-mock';
import styles from './source-set-explorer.module.scss';

/**
 * Verification route for F-025 / F-026 — the File Explorer mounted on a SourceSet volume, with no chat.
 *
 * Two shells side by side, because the two widths fail differently: a narrow column is where the
 * toolbar and the header row run out of room, and a full-bleed one is where alignment and the tree's
 * long paths show. Checking one is not checking the other (FRONTEND_RULE_COMMON §4.3+).
 *
 * By default it talks to an in-memory volume through a `fetch` interceptor, so the route is useful
 * without credentials. Point `VITE_SOURCE_SET_ENDPOINT` at a real `…/volume` (plus a key or a bearer
 * token) and the same component talks to dev instead — no code change,
 * which is the integration story TASK-004 has to demonstrate.
 */

const ENV_ENDPOINT = import.meta.env.VITE_SOURCE_SET_ENDPOINT as string | undefined;
const ENV_API_KEY = import.meta.env.VITE_SOURCE_SET_API_KEY as string | undefined;
const ENV_TOKEN = import.meta.env.VITE_SOURCE_SET_TOKEN as string | undefined;
const ENV_ROOT_PATH = import.meta.env.VITE_SOURCE_SET_ROOT_PATH as string | undefined;

const usingMock = !ENV_ENDPOINT;
const endpoint = ENV_ENDPOINT ?? MOCK_VOLUME_ENDPOINT;
const customHeaders = ENV_TOKEN ? { Authorization: `Bearer ${ENV_TOKEN}` } : undefined;

// Two extremes rather than a palette: the SDK's own defaults are light, so the only theme worth
// checking by eye is one that would make an unscoped panel obviously wrong — white on black.
const THEMES: { label: string; value?: Partial<AsgardThemeContextValue> }[] = [
  { label: '預設（淺）', value: undefined },
  {
    label: '深色',
    value: {
      chatbot: {
        backgroundColor: '#1f1f1f',
        borderColor: '#434343',
        mainColor: '#f5f5f5',
        secondaryColor: '#8c8c8c',
        primaryComponent: { mainColor: '#7c8cff' },
      },
    },
  },
];

export function SourceSetExplorerRoute(): ReactNode {
  const [readOnly, setReadOnly] = useState(false);
  const [rootPath, setRootPath] = useState(ENV_ROOT_PATH ?? '');
  const [lastError, setLastError] = useState<string | null>(null);
  const [themeIdx, setThemeIdx] = useState(0);
  const [mockReady, setMockReady] = useState(!usingMock);

  useEffect(() => {
    if (!usingMock) return;

    const uninstall = installVolumeMock();
    setMockReady(true);

    return uninstall;
  }, []);

  const shared = {
    sourceSetEndpoint: endpoint,
    apiKey: ENV_API_KEY,
    customHeaders,
    rootPath: rootPath || undefined,
    readOnly,
    theme: THEMES[themeIdx].value,
    onError: (error: unknown): void => setLastError(error instanceof Error ? error.message : String(error)),
  };

  return (
    <DemoWrapper
      title="SourceSet File Explorer (F-025 / F-026)"
      description="與聊天完全無關的檔案總管，直接掛在 SourceSet volume 上。預設用攔截 fetch 的 in-memory volume；設了 VITE_SOURCE_SET_ENDPOINT 就改打真實 dev。"
    >
      <div className={styles.stack}>
        <div className={styles.bar}>
          <label className={styles.check}>
            <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />
            readOnly（隱藏所有變更動作 + 顯示唯讀標記）
          </label>
          <label className={styles.check}>
            rootPath
            <select value={rootPath} onChange={e => setRootPath(e.target.value)}>
              <option value="">(volume root)</option>
              <option value="docs">docs</option>
              <option value="skills">skills</option>
            </select>
          </label>
          <label className={styles.check}>
            theme
            <select value={themeIdx} onChange={e => setThemeIdx(Number(e.target.value))}>
              {THEMES.map((preset, i) => (
                <option key={preset.label} value={i}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.hint}>
            {usingMock ? 'in-memory volume' : `real: ${endpoint}`} · 展開 <code>docs/archive</code>（1,200
            筆，會分頁續抓） 或 <code>docs/vast</code>（10,600 筆，超過上限，會顯示「還有 N 個未載入」）·
            在已有檔案的目錄新增同名檔案 → 409
          </span>
        </div>

        {lastError && <div className={styles.errorBar}>onError: {lastError}</div>}

        {mockReady && (
          <div className={styles.shells}>
            <section className={styles.narrow}>
              <h3 className={styles.shellTitle}>窄版 · 360px（側欄 / 內嵌）</h3>
              <div className={styles.narrowBox}>
                <SourceSetFileExplorer {...shared} label="ss-asgard" locale="zh-TW" />
              </div>
            </section>
            <section className={styles.wide}>
              <h3 className={styles.shellTitle}>寬版 · 撐滿（詳情頁 Files tab）</h3>
              <div className={styles.wideBox}>
                <SourceSetFileExplorer {...shared} label="ss-asgard" locale="en-US" />
              </div>
            </section>
          </div>
        )}
      </div>
    </DemoWrapper>
  );
}

export default SourceSetExplorerRoute;
