// Minimal i18n for the react SDK (the SDK had none before F-005). Tiny catalog + param
// interpolation; missing key/locale falls back to en-US. Native built-in tool labels, group
// summaries, and expand titles localize through here. Bash's `description` bypasses i18n.

export type Locale = 'en-US' | 'ja-JP' | 'zh-TW';

export const DEFAULT_LOCALE: Locale = 'en-US';

type Vars = Record<string, string | number>;

const MESSAGES: Record<Locale, Record<string, string>> = {
  'en-US': {
    'tool.read': 'Read {file}',
    'tool.write': 'Wrote {file}',
    'tool.edit': 'Edited {file}',
    'tool.skill': 'Ran skill {skill}',
    'tool.webfetch': 'Fetched {host}',
    'tool.websearch': 'Searched “{query}”',
    'summary.steps': '{n} steps',
    'summary.skills': ' · Used {s} skills',
    'summary.files': ' · Processed {f} files',
    'expand.initial': 'Initial',
    'expand.result': 'Result',
    'task.title': 'Tasks',
    'task.pending': 'Pending',
    'task.in_progress': 'In progress',
    'task.completed': 'Completed',
    'subagent.title': 'Subagents',
    'subagent.running': 'Running',
    'subagent.completed': 'Completed',
    'subagent.failed': 'Failed',
    'subagent.cancelled': 'Cancelled',
    'subagent.activeTool': 'Running: {tool}',
    'subagent.toolCount': '{n} tools',
  },
  'ja-JP': {
    'tool.read': '{file} を読み込み',
    'tool.write': '{file} を作成',
    'tool.edit': '{file} を編集',
    'tool.skill': 'スキル {skill} を実行',
    'tool.webfetch': '{host} を取得',
    'tool.websearch': '「{query}」を検索',
    'summary.steps': '{n} ステップ',
    'summary.skills': ' · スキル {s} 件',
    'summary.files': ' · ファイル {f} 件',
    'expand.initial': '入力',
    'expand.result': '結果',
    'task.title': 'タスク',
    'task.pending': '待機中',
    'task.in_progress': '進行中',
    'task.completed': '完了',
    'subagent.title': 'サブエージェント',
    'subagent.running': '実行中',
    'subagent.completed': '完了',
    'subagent.failed': '失敗',
    'subagent.cancelled': 'キャンセル',
    'subagent.activeTool': '実行中：{tool}',
    'subagent.toolCount': 'ツール {n} 件',
  },
  'zh-TW': {
    'tool.read': '讀取 {file}',
    'tool.write': '寫入 {file}',
    'tool.edit': '編輯 {file}',
    'tool.skill': '執行 skill {skill}',
    'tool.webfetch': '擷取 {host}',
    'tool.websearch': '搜尋「{query}」',
    'summary.steps': '{n} 個步驟',
    'summary.skills': ' · 使用 {s} 個 skill',
    'summary.files': ' · 處理 {f} 個檔案',
    'expand.initial': '輸入',
    'expand.result': '結果',
    'task.title': '任務清單',
    'task.pending': '待處理',
    'task.in_progress': '進行中',
    'task.completed': '已完成',
    'subagent.title': '子代理',
    'subagent.running': '執行中',
    'subagent.completed': '已完成',
    'subagent.failed': '失敗',
    'subagent.cancelled': '已取消',
    'subagent.activeTool': '執行中：{tool}',
    'subagent.toolCount': '{n} 個工具',
  },
};

export function t(locale: Locale, key: string, vars?: Vars): string {
  const tmpl = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;

  return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
}

// The seven native Claude built-in tools, identified by `toolsetName === '' && toolName ∈ NATIVE`.
export const NATIVE_TOOL_NAMES = ['Bash', 'Read', 'Write', 'Edit', 'Skill', 'WebFetch', 'WebSearch'] as const;
export type NativeToolName = (typeof NATIVE_TOOL_NAMES)[number];

const NATIVE = new Set<string>(NATIVE_TOOL_NAMES);

interface ToolCallShape {
  toolsetName: string;
  toolName: string;
  parameter?: Record<string, unknown>;
  reason?: string;
}

export function isNativeBuiltin(call: Pick<ToolCallShape, 'toolsetName' | 'toolName'>): boolean {
  return call.toolsetName === '' && NATIVE.has(call.toolName);
}

const basename = (p: string): string => p.split('/').filter(Boolean).pop() || p;
const hostOf = (u: string): string => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// Label priority (F-004 §1): reason → synthesized (native) → toolName.
export function toolLabel(call: ToolCallShape, locale: Locale): string {
  if (call.reason) return call.reason; // general tools + platform built-ins

  if (isNativeBuiltin(call)) {
    const p = call.parameter ?? {};

    switch (call.toolName) {
      case 'Bash':
        return str(p.description) || str(p.command) || 'Bash'; // description is NL — shown as-is, not translated
      case 'Read':
        return t(locale, 'tool.read', { file: basename(str(p.file_path)) });
      case 'Write':
        return t(locale, 'tool.write', { file: basename(str(p.file_path)) });
      case 'Edit':
        return t(locale, 'tool.edit', { file: basename(str(p.file_path)) });
      case 'Skill':
        return t(locale, 'tool.skill', { skill: str(p.skill) });
      case 'WebFetch':
        return t(locale, 'tool.webfetch', { host: hostOf(str(p.url)) });
      case 'WebSearch':
        return t(locale, 'tool.websearch', { query: str(p.query) });
    }
  }

  return call.toolName; // fallback
}

// Group summary (F-006): `{n} steps · Used {s} skills · Processed {f} files`; a `· …` segment is
// dropped when its count is 0. s = Skill count, f = Read+Write+Edit count (native built-ins only).
export function groupSummary(calls: ToolCallShape[], locale: Locale): string {
  const isBuiltin = (c: ToolCallShape): boolean => c.toolsetName === '';
  const n = calls.length;
  const s = calls.filter(c => isBuiltin(c) && c.toolName === 'Skill').length;
  const f = calls.filter(c => isBuiltin(c) && ['Read', 'Write', 'Edit'].includes(c.toolName)).length;

  let out = t(locale, 'summary.steps', { n });
  if (s > 0) out += t(locale, 'summary.skills', { s });

  if (f > 0) out += t(locale, 'summary.files', { f });

  return out;
}

export interface ToolDiff {
  added: number;
  removed: number;
}

// Write/Edit line diff (F-007): Write = +content line count (added only); Edit = line-level LCS
// estimate of old_string ↔ new_string. Others → null.
export function toolDiff(call: ToolCallShape): ToolDiff | null {
  if (call.toolsetName !== '') return null;

  const p = call.parameter ?? {};

  if (call.toolName === 'Write') {
    const content = str(p.content);

    return { added: content ? content.split('\n').length : 0, removed: 0 };
  }

  if (call.toolName === 'Edit') return lineDiff(str(p.old_string), str(p.new_string));

  return null;
}

function lineDiff(oldStr: string, newStr: string): ToolDiff {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lcs = dp[0][0];

  return { added: n - lcs, removed: m - lcs };
}
