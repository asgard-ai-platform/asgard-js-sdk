// F-035 — the spec §10.2 acceptance list, verbatim, with the reason each item exists.
//
// Every one of these corresponds to a specific way the input layer breaks *without reporting anything*.
// None of them is a vague "try the keyboard", and none of them can be checked on the mock, which is green
// for all of it.

export interface Check {
  id: string;
  group: string;
  label: string;
  why: string;
}

export const CHECKS: Check[] = [
  // --- 畫面與指標 (8) ---
  {
    id: 'cursor-watch',
    group: '畫面與指標',
    label: '觀看時看得到「另一個人」的游標',
    why: 'main 串流刻意不含游標，要自己從 data channel 的 OP_CURSOR_POSITION 畫。**另開一個分頁接管**再回來看。⚠️ 不能拿 agent 驗這項：agent 走 CDP，不移動 X11 指標，本來就看不到（§7.8）',
  },
  {
    id: 'cursor-ctl',
    group: '畫面與指標',
    label: '接管後看得到自己的游標',
    why: '伺服器不送游標位置給 host，靠的是本地游標；若又寫了 cursor:none 就一個都看不到（§7.8）',
  },
  {
    id: 'firstclick',
    group: '畫面與指標',
    label: '接管後「第一下」點擊就有效',
    why: 'live 是 ontrack 當下就設的，但那時 videoWidth 還是 0，座標換算回 null → 點擊被靜默丟掉約一秒（§7.1）',
  },
  {
    id: 'click',
    group: '畫面與指標',
    label: '滑鼠點擊命中目標',
    why: 'letterbox 換算錯的話會「差一點點」，而且容器一縮放偏移量就變（§7.1）',
  },
  {
    id: 'corner',
    group: '畫面與指標',
    label: '點畫面四個角落',
    why: '黑邊上不該送事件，畫面內的極值不該被夾掉（§7.1）',
  },
  {
    id: 'drag',
    group: '畫面與指標',
    label: '按住左鍵拖曳可以選取文字',
    why: 'down/up 跨越移動；拖到畫面外再放開是卡鍵的經典來源（§7.5）',
  },
  {
    id: 'rightclick',
    group: '畫面與指標',
    label: '右鍵叫出的是遠端的選單',
    why: 'code=3；本地要 preventDefault，否則叫出自己的選單（§7）',
  },
  {
    id: 'fullscreen',
    group: '畫面與指標',
    label: '全螢幕之後再操作一次，座標仍然正確',
    why: '元素的 box 整個換了，換算必須跟著走（§7.1）',
  },

  // --- 滾輪 (2) ---
  {
    id: 'scroll-dir',
    group: '滾輪',
    label: '滾輪往下捲，遠端也往下捲',
    why: '**方向是相反的**：瀏覽器 deltaY>0 是往下，X11 的 deltaY>0 是 button 4 = 往上。不轉就是錯的（§7.6）',
  },
  {
    id: 'scroll-amount',
    group: '滾輪',
    label: '捲一格的距離是合理的，不會一下飛到底',
    why: '伺服器逐次發 XTest，直接送 Chrome 的 deltaY=100 遠端就滾一百下；要夾在 ±10 並節流（§7.6）',
  },

  // --- 鍵盤 (8) ---
  { id: 'ascii', group: '鍵盤', label: '輸入英數字', why: '最基本的一條；不通表示 IME 承接器沒收到鍵（§7.4）' },
  {
    id: 'shift',
    group: '鍵盤',
    label: 'Shift + 字母打出大寫',
    why: 'Shift 不算 chord，仍然走文字路徑；也驗 Shift 有沒有被放開（§7.3）',
  },
  {
    id: 'special',
    group: '鍵盤',
    label: 'Enter / Tab / Esc / Backspace',
    why: '功能鍵走查表，漏一個就是「按了沒反應」（§7.2）',
  },
  { id: 'arrow', group: '鍵盤', label: '方向鍵移動游標', why: '同上，且方向鍵常被本地頁面捲動吃掉（§7.2）' },
  { id: 'fkeys', group: '鍵盤', label: 'F5 重新整理、F12', why: '操作遠端瀏覽器時真的會用到（§7.2）' },
  {
    id: 'cmdA',
    group: '鍵盤',
    label: '⌘/Ctrl + A 全選',
    why: 'macOS 送的是 Meta，遠端 Chromium 等的是 Control；而且可列印字元要走 keysym 路徑，否則字元被瀏覽器吃掉（§7.3）',
  },
  {
    id: 'stuck-tab',
    group: '鍵盤',
    label: '按住 Shift 切走分頁再回來，「遠端還按著的鍵」是空的',
    why: 'macOS 按住 ⌘ 時其他鍵的 keyup 根本不發；回來後看下面的卡鍵面板（§7.5）',
  },
  {
    id: 'stuck-drag',
    group: '鍵盤',
    label: '按住左鍵拖出畫面再放開，同上',
    why: '補送 release 的座標不能用 (0,0)，否則整頁被選取（§7.5）',
  },

  // --- 中文 (2) ---
  {
    id: 'preedit',
    group: '中文',
    label: '打注音時看得到組字中的底線字與候選字窗',
    why: '承接器隱形時 preedit 也隱形、候選窗跑到角落 → 只能盲打到按 Enter。組字期間要讓承接器現身在點擊處（§7.4.1）',
  },
  {
    id: 'cjk',
    group: '中文',
    label: '注音打完按 Enter，中文進得了遠端',
    why: '送組好的字（codepoint | 0x01000000）；遠端用 XkbAddKeyKeysym 動態配 keycode，不需要裝輸入法（§7.4）',
  },

  // --- 剪貼簿 (6) ---
  {
    id: 'copy-remote',
    group: '剪貼簿',
    label: '⌘/Ctrl + C 複製遠端選取的文字',
    why: '複製完看 wire log 有沒有 clipboard/updated；只有 host 收得到（§7.3 / §7.7）',
  },
  {
    id: 'copy-local',
    group: '剪貼簿',
    label: '接著在本機任一處貼上，內容是剛剛在遠端複製的',
    why: 'clipboard/updated 之後我們會 navigator.clipboard.writeText，寫失敗只會留在 log（§7.7）',
  },
  {
    id: 'paste-key',
    group: '剪貼簿',
    label: '在本機複製一段字，⌘V 貼進遠端',
    why: '本機與遠端是兩個剪貼簿。⌘V 被攔下來改送 control/paste，不是把按鍵轉過去（§7.7）',
  },
  {
    id: 'paste-btn',
    group: '剪貼簿',
    label: '用控制列的貼上鈕貼一次',
    why: 'iOS / Android WebView 攔不到實體按鍵，那邊只剩這顆；也驗 control/paste 本身（§7.7）',
  },
  {
    id: 'paste-cjk',
    group: '剪貼簿',
    label: '貼上一段中文',
    why: 'clipboard/set 走 UTF8_STRING，跟 keysym 那條路完全無關（§7.7）',
  },
  {
    id: 'paste-remote-menu',
    group: '剪貼簿',
    label: '在遠端按右鍵 → 貼上，也貼得出來',
    why: '證明 clipboard/set 真的寫進了遠端 X11 剪貼簿，不是只有我們那顆按鈕會動（§7.7）',
  },
];

export const CHECK_GROUPS = ['畫面與指標', '滾輪', '鍵盤', '中文', '剪貼簿'] as const;
