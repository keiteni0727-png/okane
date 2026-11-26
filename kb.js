/* ===================== 定数 ===================== */
/* ---------- 分類・支払い方法の初期値（マスタが無いときに使う）と色・アイコン ---------- */
const CATS = ["食費", "外食", "日用品", "交通費", "光熱費", "通信費", "サブスク", "娯楽", "美容/衣服", "医療費"];
const METHODS = ["クレカ", "電子マネー", "現金"];
const CH = { 食費: 130, 外食: 8, 日用品: 205, 交通費: 190, 光熱費: 50, 通信費: 262, サブスク: 245, 娯楽: 280, "美容/衣服": 350, 医療費: 100, クレカ: 225, 電子マネー: 355, 現金: 140, 不明: -1, その他: -1 };
const EMO = { 食費: "🛒", 外食: "🍜", 日用品: "🧴", 交通費: "🚃", 光熱費: "💡", 通信費: "📱", サブスク: "📺", 娯楽: "🎮", "美容/衣服": "👕", 医療費: "💊", クレカ: "💳", 電子マネー: "📲", 現金: "💴", 不明: "❔", その他: "…" };
const CHS = {};

/* ---------- 端末内の保存キー（localStorage） ---------- */
const KEY = "kakeibo.v1", // 明細
  KEY_BAK = KEY + ".bak"; // 明細の予備（明細が空になったときに使う）
const KR = "kakeibo.rules.v1"; // 分類ルール
const KMS = "kakeibo.master.v1"; // マスタ
const KB = "kakeibo.backup.v1"; // 取り消し用の直前の状態
const KNOWN = "kakeibo.known.v2"; // クラウドにあると分かっている月（他の端末で消された月を見分ける）
const KTAB = "kakeibo.tab"; // 最後に開いた画面（文字列のまま保存）
const KAN = "okane.an"; // 旧「分析」の中で最後に開いた画面（移行用）
const KSBC = "okane.sbc"; // PC の左メニューを折りたたんでいるか
const KANF = "okane.anfold"; // 左メニューの「家計簿」の項目をたたんでいるか
const KPF = "okane.payfold"; // 左メニューの「支払い管理」の項目をたたんでいるか
const AN = ["graph", "balance"]; // 旧「分析」にまとめていた画面（移行用）
const KBV = ["list", "graph"]; // 家計簿の画面
const PAYV = ["home", "balance"]; // 支払い管理の画面（支払い・返済）
const PAYT = ["dash", "home", "balance"]; // 支払いのデータ（pay.js）で描く画面：ホーム・支払い・返済
const KKB = "okane.kb"; // 家計簿の中で最後に開いた画面
const KPAY = "okane.pay"; // 支払い管理の中で最後に開いた画面

/* ---------- 決まった数字 ---------- */
const TOMB_LIMIT = 40; // 月の文書の削除の印がこれを超えたら、丸ごと書き直す
const MEMO_CHIPS = 8, // 入力欄の上に並べる直近のメモの数
  MEMO_LIST = 60; // 入力候補（datalist）に入れるメモの数

/* ===================== 小さな関数 ===================== */
const $ = id => document.getElementById(id);
const yen = n => "¥" + Number(n || 0).toLocaleString("ja-JP");
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const thisPeriod = () => FIN.currentPeriod(); // いまの月度
const inPeriod = (d, p) => FIN.inPeriod(d, p);
const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const esc = U.esc;
const opts = (arr, v) => arr.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("");
/* アイコンつきの選択肢。first は先頭の空の選択肢（「すべての分類」など） */
function iconOpts(list, selected, first) {
  const head = first != null ? `<option value="">${first}</option>` : "";
  return (
    head +
    list.map(x => `<option value="${esc(x)}"${x === selected ? " selected" : ""}>${emo(x)} ${esc(x)}</option>`).join("")
  );
}
/* 切り替えボタンのうち、data-<key> が value のものだけを「選択中」にする */
function markCurrent(selector, key, value) {
  document
    .querySelectorAll(selector)
    .forEach(b =>
      b.dataset[key] === value ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"),
    );
}
const uid = () => Math.random().toString(36).slice(2, 10);
const sumOf = a => a.reduce((s, i) => s + i.amount, 0);
function shiftM(m, n) {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function dcls(d) {
  return d > 0 ? "up" : d < 0 ? "dn" : "eq";
}
function dstr(d, b) {
  return (
    (d > 0 ? "▲" : d < 0 ? "▼" : "±") +
    yen(Math.abs(d)) +
    (d && b ? "（" + (d > 0 ? "+" : "-") + Math.round((Math.abs(d) / b) * 100) + "%）" : "")
  );
}
const dow = d => new Date(d + "T00:00:00").getDay();
const short = v => (v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + "万" : yen(v));
const isWide = () => window.matchMedia("(min-width:900px)").matches;
const norm = s =>
  String(s || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
const nn = v => (v === "" || v == null || isNaN(Number(v)) ? null : Math.round(Number(v)));
const cj = v =>
  JSON.stringify(v, (k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.keys(x)
          .sort()
          .reduce((o, y) => ((o[y] = x[y]), o), {})
      : x,
  );
const inM = m => items.filter(i => i.date.startsWith(m));
const mapOf = arr => Object.fromEntries(arr.map(i => [i.id, cj(i)]));

/* ---------- 端末内の保存の読み書き（使えない環境でも止まらないように） ---------- */
function lsRaw(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function lsGet(k, fallback) {
  try {
    const s = localStorage.getItem(k);
    return s === null ? fallback : JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}
function lsSet(k, v, raw) {
  try {
    localStorage.setItem(k, raw ? v : JSON.stringify(v));
    return true;
  } catch (e) {
    return false;
  }
}
function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
}

/* ---------- 色・アイコン・ラベル ---------- */
function hashHue(n) {
  let h = 0;
  for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function mFind(n) {
  if (!MASTER) return null;
  return MASTER.cats.find(x => x.n === n) || MASTER.mets.find(x => x.n === n) || null;
}
function hue(n) {
  const m = mFind(n);
  if (m && typeof m.h === "number") return m.h;
  if (n in CH) return CH[n];
  return hashHue(n);
}
function satOf(n) {
  const m = mFind(n);
  if (m && typeof m.s === "number") return m.s;
  return n in CHS ? CHS[n] : null;
}
function hs(n) {
  const h = hue(n),
    st = satOf(n);
  return `--h:${h < 0 ? 0 : h};${h < 0 ? "--s:8%;" : st != null ? `--s:${st}%;` : ""}`;
}
const emo = n => {
  const m = mFind(n);
  return (m && m.e) || EMO[n] || "🏷️";
};
function chip(n, e) {
  return `<span class="chip${e ? " out" : ""}" style="${hs(n)}">${e ? emo(n) + " " : ""}${esc(n)}</span>`;
}
const mchip = n => chip(n, 1);
function ico(n, sm) {
  return `<span class="ico${sm ? " sm" : ""}" style="${hs(n)}" aria-hidden="true">${emo(n)}</span>`;
}
function bcol(n) {
  const h = hue(n),
    st = satOf(n);
  return h < 0 ? "hsl(220 8% 58%)" : st != null ? `hsl(${h} ${st + 10}% 40%)` : `hsl(${h} 62% 62%)`;
}

/* ===================== 状態 ===================== */
/* データ（クラウドと端末に保存するもの） */
let items = []; // 明細 {id, date, amount, category, method, memo, ruled?}
let rules = []; // 分類ルール
let MASTER = null; // 分類・支払い方法のマスタ {cats:[{n,e,h,s?}], mets:[...]}
let restored = 0; // 起動時に予備から復元した件数

/* 画面全体 */
const view = {
  tab: "list", // list / graph / rules（スマホの設定画面）
  prevTab: "list", // 設定を閉じたときに戻る画面
  armed: null, // 「2回押す」削除で、1回押されて待っているもの
};
/* 表示中の月度 "YYYY-MM"（支払いの画面と共通。保存は暦の月ごとのまま） */
Object.defineProperty(view, "month", { get: () => FIN.period, set: v => (FIN.period = v) });
/* 明細画面 */
const ledger = {
  filter: { q: "", c: "", m: "" }, // 検索・分類・支払い方法の絞り込み
  shown: [], // 絞り込み後に一覧に出ている明細
  sel: new Set(), // チェックした明細のID
  editId: null, // その場で編集中の明細のID
  draft: null, // 編集中の内容
  dayAdd: null, // 日付の行の＋で開いた入力欄 {date, draft}
};
/* 日ごとの折りたたみ（この端末に覚える）。たたんでいる日付の一覧 */
const KDF = "okane.dayfold";
const dayFold = new Set(lsGet(KDF, []) || []);
function saveDayFold() {
  lsSet(KDF, [...dayFold].sort().slice(-400));
}
/* グラフ画面 */
const graph = { by: "category", per: "3", sel: "", m: "" }; // 集計の単位・期間・絞り込んだ項目・選んだ月/日
/* 設定 */
const setting = {
  tab: "home", // 設定の画面 home（一覧）/ rules / cats / mets / inc / paym / gen
  kind: "cats", // マスタの種類 cats / mets
  merge: null, // マスタの統合の確認 {kind, old, nn}
  preview: null, // 既存データへの適用の対象一覧 {rid, rows, off}
  editRule: null, // 編集中のルールのID
  edit: { rules: false, master: false, paym: false }, // 右上の「編集」を押しているか（行ごとの変更・削除を出す）
};

/* ===================== 保存と同期 ===================== */
/* ---------- 端末内の控え ---------- */
function load() {
  items = lsGet(KEY, []);
  if (!Array.isArray(items)) items = [];
  if (!items.length) {
    const b = lsGet(KEY_BAK, []);
    if (Array.isArray(b) && b.length) {
      items = b;
      lsSet(KEY, b);
      restored = b.length;
    }
  }
}
function saveLocal() {
  const ok = lsSet(KEY, items) && (!items.length || lsSet(KEY_BAK, items));
  if (!ok) setMsg("この端末への保存に失敗しました。", 1);
}
function save() {
  saveLocal();
  queuePush();
}
function saveMasterLocal() {
  lsSet(KMS, MASTER);
}
function saveMaster() {
  saveMasterLocal();
  queuePush();
}
function saveRulesLocal() {
  lsSet(KR, rules);
}
function saveRules() {
  saveRulesLocal();
  queuePush();
}
/* 取り消し用に、変更前の明細を控える */
function snap() {
  lsSet(KB, items);
}

/* ---------- マスタ・ルールの形をそろえる ---------- */
const mkE = n => {
  const o = { n, e: EMO[n] || "🏷️", h: n in CH ? CH[n] : hashHue(n) };
  if (n in CHS) o.s = CHS[n];
  return o;
};
function normMaster(m) {
  const f = a =>
    (Array.isArray(a) ? a : [])
      .filter(x => x && typeof x.n === "string" && x.n.trim())
      .map(x => {
        const o = {
          n: x.n,
          e: String(x.e || "🏷️"),
          h: typeof x.h === "number" ? x.h : x.n in CH ? CH[x.n] : hashHue(x.n),
        };
        const st = typeof x.s === "number" ? x.s : x.n in CHS ? CHS[x.n] : null;
        if (st != null) o.s = st;
        return o;
      });
  const o = { cats: f(m && m.cats), mets: f(m && m.mets) };
  if (!o.cats.length) o.cats = CATS.map(mkE);
  if (!o.mets.length) o.mets = METHODS.map(mkE);
  return o;
}
function applyMaster() {
  CATS.splice(0, CATS.length, ...MASTER.cats.map(x => x.n));
  METHODS.splice(0, METHODS.length, ...MASTER.mets.map(x => x.n));
}
function learn(i) {
  let ch = false;
  if (i.category && !CATS.includes(i.category)) {
    MASTER.cats.push(mkE(i.category));
    ch = true;
  }
  if (i.method && !METHODS.includes(i.method)) {
    MASTER.mets.push(mkE(i.method));
    ch = true;
  }
  if (ch) {
    applyMaster();
    saveMasterLocal();
  }
}
function normRule(r) {
  if (!r || typeof r !== "object") return null;
  const auto = r.auto !== false;
  if (r.kind === "memo")
    return {
      id: r.id,
      kind: "set",
      kw: r.kw || "",
      mode: "contains",
      cat: "",
      met: "",
      min: null,
      max: null,
      set: { memo: "", category: r.to || "", method: "" },
      auto,
    };
  if (r.kind === "set")
    return {
      id: r.id,
      kind: "set",
      kw: r.kw || "",
      mode: r.mode || "contains",
      cat: r.cat || "",
      met: r.met || "",
      min: nn(r.min),
      max: nn(r.max),
      set: {
        memo: (r.set && r.set.memo) || "",
        category: (r.set && r.set.category) || "",
        method: (r.set && r.set.method) || "",
      },
      auto,
    };
  return { id: r.id, kind: "split", from: r.from, amt: Number(r.amt) || 0, to: r.to, max: Number(r.max) || 1, auto };
}

/* ---------- クラウドとの同期（リアルタイム）
  ・クラウドのデータを正とし、変更はすぐ保存。他の端末には onSnapshot でその場で届く
  ・保存先 data/users/<id>/ の文書: m-YYYY-MM（その月の明細）, rules（分類ルール）, master（分類・支払い方法のマスタ）
  ・月の文書は {v:2, items:{明細ID: 明細 | null}}。明細ごとに update で書くので、
    2台で同じ月の別の明細を同時に編集しても消し合わない（null は削除の印）。旧形式 {items:[...]} も読める
  ・端末内の保存（localStorage）は、開いた直後と接続できないときの表示用の控え */
/* 保存中・未保存・自動での保存し直し・読み込みのつなぎ直しは、共通の U.sync（u-core.js）が行う。
   クラウドから届く内容には、自分がまだ送信中の変更も入っている（Firebase がそうしてくれる）ので、そのまま反映してよい */
let col = null, // data/users/<id> のコレクション
  live = false; // 最初の読み込みが終わった
let shown = {}, // shown[月] = {明細ID: 内容}：クラウドにある（または送信済みの）内容
  fmt2 = {}, // その月の文書が新形式か
  tomb = {}, // その月の文書にある削除の印の数
  rShown = null, // クラウドにあるルール・マスタ（比べて、違うときだけ送る）
  mShown = null;
function saveKnown() {
  lsSet(KNOWN, Object.keys(shown));
}
const write = fn =>
  fn().catch(e => {
    if (!["unavailable", "deadline-exceeded", "aborted", "internal", "unknown", "cancelled"].includes(e?.code))
      toast(`保存できませんでした（${e?.code || "error"}）。開き直してからもう一度お試しください`);
  });
function pushMonth(m) {
  const cur = mapOf(inM(m)),
    prev = shown[m],
    key = "m-" + m;
  const ids = new Set([...Object.keys(cur), ...Object.keys(prev || {})]);
  const diff = {};
  ids.forEach(id => {
    if (cur[id] !== (prev || {})[id]) diff[id] = cur[id] ? JSON.parse(cur[id]) : null;
  });
  if (prev && !Object.keys(diff).length) return;
  if (!Object.keys(cur).length) {
    if (!prev) return;
    delete shown[m];
    write(() => col.doc(key).delete());
    return;
  }
  shown[m] = cur;
  if (!prev || !fmt2[m] || (tomb[m] || 0) > TOMB_LIMIT) {
    // 文書がない・旧形式・削除の印が多い → 丸ごと書き直す
    fmt2[m] = true;
    tomb[m] = 0;
    const all = Object.fromEntries(Object.entries(cur).map(([id, j]) => [id, JSON.parse(j)]));
    write(() => col.doc(key).set({ v: 2, items: all }));
  } else write(() => col.doc(key).update({ items: diff }));
}
function queuePush() {
  // 変更のたびに呼ぶ。クラウドと違うところだけ送る
  if (!live) return;
  new Set([...items.map(i => i.date.slice(0, 7)), ...Object.keys(shown)]).forEach(pushMonth);
  saveKnown();
  const rj = cj(rules);
  if (rj !== rShown) {
    rShown = rj;
    const d = JSON.parse(rj);
    write(() => col.doc("rules").set({ rules: d }));
  }
  const mjs = cj(MASTER);
  if (mjs !== mShown) {
    mShown = mjs;
    const d = JSON.parse(mjs);
    write(() => col.doc("master").set({ master: d }));
  }
}
function applyMonth(m, x, doRender) {
  // クラウドの月の内容を画面に反映
  let arr = [];
  fmt2[m] = false;
  tomb[m] = 0;
  if (x && Array.isArray(x.items)) arr = x.items;
  else if (x && x.items && typeof x.items === "object") {
    fmt2[m] = true;
    const v = Object.values(x.items);
    arr = v.filter(Boolean);
    tomb[m] = v.length - arr.length;
  }
  if (arr.length) shown[m] = mapOf(arr);
  else delete shown[m];
  if (cj(mapOf(arr)) === cj(mapOf(inM(m)))) return false;
  items = items.filter(i => !i.date.startsWith(m)).concat(arr);
  if (doRender) {
    saveLocal();
    items.forEach(learn);
    render();
  }
  return true;
}
async function initSync() {
  try {
    const { db: d, uid: id } = await U.store();
    if (!d || !id) throw 0;
    col = d.collection("data/users/" + id);
    col.onSnapshot(onRemote);
  } catch (e) {}
}
function onRemote(snap) {
  let changed = false,
    rr = null,
    mr = null;
  const remote = {};
  snap.docs.forEach(d => {
    const x = d.data() || {};
    if (d.id === "rules") {
      if (Array.isArray(x.rules)) rr = x.rules;
    } else if (d.id === "master") {
      if (x.master && Array.isArray(x.master.cats)) mr = x.master;
    } else if (d.id.startsWith("m-")) remote[d.id.slice(2)] = x;
  });
  const known = live ? [] : lsGet(KNOWN, []); // 前回までにクラウドにあった月
  new Set([...Object.keys(remote), ...Object.keys(shown), ...(live ? [] : known)]).forEach(m => {
    if (applyMonth(m, remote[m] || null, false)) changed = true;
  });
  if (rr) {
    rShown = cj(rr);
    const nr = rr.map(normRule).filter(Boolean);
    if (cj(nr) !== cj(rules)) {
      rules = nr;
      changed = true;
    }
  }
  if (mr) {
    mShown = cj(mr);
    if (cj(mr) !== cj(MASTER)) {
      MASTER = normMaster(mr);
      applyMaster();
      changed = true;
    }
  }
  if (changed) {
    saveLocal();
    saveRulesLocal();
    saveMasterLocal();
    items.forEach(learn);
    render();
  }
  saveKnown();
  if (!live) {
    // 最初の読み込みが終わったら、端末にしかない月・ルール・マスタを送る
    live = true;
    queuePush();
  }
}

/* ===================== ルールと集計（計算だけ。画面は変えない） ===================== */
/* ---------- 分類ルール ---------- */
function kwHit(it, r) {
  const kws = String(r.kw || "")
    .split(/[,、，]/)
    .map(norm)
    .filter(Boolean);
  if (!kws.length) return true;
  const m = norm(it.memo);
  return kws.some(k => (r.mode === "exact" ? m === k : r.mode === "prefix" ? m.startsWith(k) : m.includes(k)));
}
function applyRule(it, r) {
  if (r.kind === "set") {
    if (!kwHit(it, r)) return null;
    if (r.cat && it.category !== r.cat) return null;
    if (r.met && it.method !== r.met) return null;
    if (r.min != null && it.amount < r.min) return null;
    if (r.max != null && it.amount > r.max) return null;
    const x = { ...it };
    if (r.set.memo) x.memo = r.set.memo;
    if (r.set.category) x.category = r.set.category;
    if (r.set.method) x.method = r.set.method;
    return x.memo === it.memo && x.category === it.category && x.method === it.method ? null : [x];
  }
  if (it.category !== r.from || (it.ruled || []).includes(r.id) || it.amount < r.amt || !(r.amt > 0)) return null;
  const n = Math.min(Math.floor(it.amount / r.amt), r.max || 1),
    mv = n * r.amt,
    rem = it.amount - mv,
    ru = [...(it.ruled || []), r.id];
  if (rem <= 0) return [{ ...it, category: r.to, ruled: ru }];
  return [
    { ...it, amount: rem, ruled: ru },
    { ...it, id: it.id + "-" + r.id, amount: mv, category: r.to, memo: r.to, ruled: ru },
  ];
}
function runRules(list) {
  let out = list,
    changed = 0;
  const act = rules.filter(r => r.auto !== false);
  [...act.filter(r => r.kind === "set"), ...act.filter(r => r.kind === "split")].forEach(r => {
    out = out.flatMap(it => {
      const x = applyRule(it, r);
      if (x) {
        changed++;
        return x;
      }
      return [it];
    });
  });
  return { out, changed };
}
function kindOf(r) {
  if (r.kind === "split") return ["split", "分割"];
  if (r.set.memo) return ["name", "名称統合"];
  return ["", "分類・支払い変更"];
}
function descRule(r) {
  if (r.kind === "split")
    return `<q>${esc(r.from)}</q>の明細が${yen(r.amt)}以上なら、${yen(r.amt)}を<q>${esc(r.to)}</q>に分ける（最大${r.max}個、残りは元の分類）`;
  const c = [];
  if (r.kw)
    c.push(
      `メモが<q>${esc(r.kw)}</q>${r.mode === "exact" ? "と完全に一致" : r.mode === "prefix" ? "で始まる" : "を含む"}`,
    );
  if (r.cat) c.push(`分類が<q>${esc(r.cat)}</q>`);
  if (r.met) c.push(`支払い方法が<q>${esc(r.met)}</q>`);
  if (r.min != null) c.push(`${yen(r.min)}以上`);
  if (r.max != null) c.push(`${yen(r.max)}以下`);
  const a = [];
  if (r.set.memo) a.push(`メモを<q>${esc(r.set.memo)}</q>`);
  if (r.set.category) a.push(`分類を<q>${esc(r.set.category)}</q>`);
  if (r.set.method) a.push(`支払い方法を<q>${esc(r.set.method)}</q>`);
  return c.join("、") + " → " + a.join("、") + "に変更";
}

/* ---------- グラフの集計 ---------- */
function periodMonths() {
  if (graph.per === "cur") return [view.month];
  const ym = items.map(i => FIN.periodOf(i.date)).sort(),
    firstM = ym[0] || view.month,
    end = view.month;
  let start = graph.per === "all" ? firstM : shiftM(end, -(Number(graph.per) - 1));
  if (start < firstM) start = firstM;
  if (start > end) start = end;
  const out = [];
  for (let m = start; m <= end; m = shiftM(m, 1)) out.push(m);
  return out;
}
/* 月度の1日目からの累計 */
function cumDays(arr, p) {
  const dim = FIN.periodDays(p),
    d = new Array(dim).fill(0);
  arr.forEach(i => {
    const k = FIN.dayIndex(i.date, p);
    if (k >= 0 && k < dim) d[k] += i.amount;
  });
  let c = 0;
  return d.map(v => (c += v));
}
/* グラフ画面で使う数字をまとめて計算する（絞り込みが期間外になったら外す） */
function graphData() {
  const cur = graph.per === "cur",
    ms = periodMonths(),
    set = new Set(ms),
    n = ms.length,
    key = i => (graph.by === "method" ? i.method : i.category);
  const inP = items.filter(i => set.has(FIN.periodOf(i.date))),
    sum = {};
  inP.forEach(i => {
    const k = key(i);
    sum[k] = (sum[k] || 0) + i.amount;
  });
  const rows = Object.entries(sum).sort((a, b) => b[1] - a[1]),
    names = rows.map(r => r[0]);
  if (graph.sel && !names.includes(graph.sel)) graph.sel = "";
  if (graph.m && !(graph.m.length === 7 ? set.has(graph.m) : set.has(FIN.periodOf(graph.m)))) graph.m = "";
  const sel = graph.sel,
    pm = shiftM(view.month, -1),
    match = i => !sel || key(i) === sel;
  const base = inP.filter(match),
    tot = sumOf(base);
  const curI = items.filter(i => inPeriod(i.date, view.month) && match(i)),
    prevI = items.filter(i => inPeriod(i.date, pm) && match(i));
  const ck = {}, // 当月・前月の項目ごとの合計
    pk = {};
  items.forEach(i => {
    const m = FIN.periodOf(i.date),
      k = key(i);
    if (m === view.month) ck[k] = (ck[k] || 0) + i.amount;
    else if (m === pm) pk[k] = (pk[k] || 0) + i.amount;
  });
  return {
    cur, // 期間が「当月」
    ms, // 期間の月
    n,
    key,
    rows, // [項目, 期間の合計]（多い順）
    names,
    sel,
    base, // 期間内で、絞り込んだ項目の明細
    tot,
    avg: tot / n,
    curI,
    prevI,
    cv: sumOf(curI),
    pv: sumOf(prevI),
    ck,
    pk,
    pm,
    cm: +view.month.slice(5),
    pmn: +pm.slice(5),
    color: sel ? bcol(sel) : "var(--u-accent)", // 線・棒の色
  };
}

/* ---------- メモ候補 ---------- */
function recentMemos(cat, n) {
  const seen = new Set(),
    out = [],
    arr = items.filter(i => i.memo && !/\(自動分割\)/.test(i.memo)).sort((a, b) => b.date.localeCompare(a.date));
  const pass = f => {
    for (const i of arr) {
      if (out.length >= n) break;
      if (seen.has(i.memo) || !f(i)) continue;
      seen.add(i.memo);
      out.push(i.memo);
    }
  };
  if (cat) pass(i => i.category === cat);
  pass(() => true);
  return out;
}
