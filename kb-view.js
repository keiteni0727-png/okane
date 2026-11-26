/* ===================== 描画 ===================== */
/* ---------- 画面の切り替え ---------- */
let prevPay = false;
function setTab(t, fromPop) {
  if (t === "kb") t = KBV.includes(lsRaw(KKB)) ? lsRaw(KKB) : "list"; // 家計簿は前回の画面を開く
  if (t === "pay") t = "home"; // 旧「支払い管理」からの移行
  if (t === "an") t = AN.includes(lsRaw(KAN)) ? lsRaw(KAN) : "graph"; // 旧「分析」からの移行
  if (t === "rules") {
    openRules();
    return;
  }
  closePanels();
  /* ページの履歴：ホームから開くたびに積む（明細とグラフの切り替えは積まずに置きかえる） */
  if (!fromPop && view.tab !== t) {
    const st = history.state || { d: 0 };
    if (KBV.includes(t) && KBV.includes(view.tab)) history.replaceState({ t, d: st.d || 0 }, "");
    else if (t === "dash") history.replaceState({ t, d: 0 }, "");
    else history.pushState({ t, d: (st.d || 0) + 1 }, "");
  }
  if (t === "rules" && view.tab !== "rules") view.prevTab = view.tab;
  view.tab = t;
  document.body.dataset.tab = t;
  markTabs(t);
  gearPressed(String(t === "rules"));
  if (t === "rules") renderRules();
  else lsSet(KTAB, t, true);
  if (KBV.includes(t)) lsSet(KKB, t, true);
  if (PAYV.includes(t)) lsSet(KPAY, t, true);
  if (AN.includes(t)) lsSet(KAN, t, true);
  const wasPay = prevPay;
  prevPay = PAYT.includes(t);
  if (prevPay && !wasPay && FIN.pay.enter) FIN.pay.enter();
  FIN.pay.show && FIN.pay.show(PAYT.includes(t) ? t : "none");
  scrollTo(0, 0);
  if ($("month")) renderMonthBar();
}
/* 下のメニュー・左メニュー・分類内の切り替えで、いまの画面に印をつける（分類のボタンにも） */
function markTabs(t) {
  markCurrent(".tabbar [data-tab], .sb [data-tab], .anseg [data-tab]", "tab", t);
  /* スマホの上の帯：今いる画面のアイコン（左メニューと同じもの） */
  const key = t === "rules" ? "gear" : KBV.includes(t) ? "list" : t === "dash" ? "dash" : t === "balance" ? "repay" : "home";
  const ic = document.querySelector(`.sb .mic.${key}`);
  const hc = $("hcur");
  if (hc && ic) hc.innerHTML = `<span class="mic ${key}" aria-hidden="true">${ic.innerHTML}</span><span class="hname">${TAB_NAME[t] || ""}</span>`;
  document
    .querySelectorAll('[data-tab="kb"]')
    .forEach(b => (KBV.includes(t) ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
}
/* 上の帯：今いる画面の名前（エンタメ管理と同じく、アイコンと名前を出す） */
const TAB_NAME = { dash: "ホーム", list: "家計簿", home: "支払い", graph: "家計簿のグラフ", balance: "返済", rules: "設定" };
/* 家計簿の一番上の支出カード：総額の行だけ出して、内訳・件数などはたたむ（最初はたたむ。この端末に保存） */
const KSUMF = "okane.sumfold";
const sumFolded = () => lsRaw(KSUMF) !== "0";
/* 左メニューの分類の項目（家計簿＝明細・グラフ／支払い管理＝今月の支払い・借入・返済）をたたむ／開く。印はエンタメ管理と同じ「›」 */
/* （左メニューの分類のたたみは、メニューを4つに並べ直したのでなくした） */
/* PC：左メニューの折りたたみ */
function setSidebar(c) {
  document.body.classList.toggle("sbc", c);
  const b = $("sbtog");
  b.setAttribute("aria-label", c ? "メニューを開く" : "メニューを折りたたむ");
  b.setAttribute("aria-expanded", String(!c));
}
function gearPressed(v) {
  $("gear").setAttribute("aria-pressed", v);
  $("sbgear").setAttribute("aria-pressed", v);
}
/* 設定：スマホ・PCとも真ん中に出すパネル。page を渡すとその画面から開く（エンタメ管理と同じ形） */
function openRules(page) {
  closePanels();
  setting.tab = page || "home";
  setting.edit = { rules: false, master: false, paym: false };
  $("rulepanel").hidden = false;
  $("rbk").hidden = false;
  document.documentElement.classList.add("setopen");
  gearPressed("true");
  renderRules();
  renderSettings();
}
function closePanels() {
  $("rulepanel").hidden = true;
  $("bulk").hidden = true;
  $("rbk").hidden = true;
  document.documentElement.classList.remove("setopen");
  setting.preview = null;
  gearPressed("false");
}

/* ---------- 全体・メッセージ ---------- */
/* fromAll：FIN.renderAll から呼ばれたとき（支払いの画面はそちらで描く） */
/* 上の月度の切り替え：支払い・残高と計画の画面は支払いの月度、ほかは家計簿の月度（別々に動かす） */
const payTab = () => view.tab === "home" || view.tab === "balance";
const barMonth = () => (payTab() && FIN.pay.period ? FIN.pay.period() : view.month);
function setBarMonth(m) {
  if (payTab() && FIN.pay.setPeriod) {
    FIN.pay.setPeriod(m);
    renderMonthBar();
  } else {
    view.month = m;
    render();
  }
}
function renderMonthBar() {
  const cur = barMonth();
  $("month").innerHTML = periodChoices(cur)
    .map(m => `<option value="${m}"${m === cur ? " selected" : ""}>${FIN.periodLabel(m)}</option>`)
    .join("");
  $("mcur").disabled = cur === thisPeriod();
}
function render(fromAll) {
  renderMonthBar();
  const mi = items.filter(i => inPeriod(i.date, view.month)).sort((a, b) => b.date.localeCompare(a.date));
  const pm = shiftM(view.month, -1),
    pi = items.filter(i => inPeriod(i.date, pm));
  renderSummary(mi, pi);
  renderStreak();
  renderList(mi);
  renderRules();
  renderSettings();
  renderGraph();
  updateSel();
  fillMemos();
  if (!fromAll && PAYT.includes(view.tab) && FIN.pay.render) FIN.pay.render(); // 現金の支出が変わる（ホームの今月の支出も）
}
/* 月度の選択肢：明細・支払いのある月度から、いまの12か月度先まで（新しい順に最大120） */
function periodChoices(shown) {
  const cur = thisPeriod();
  const all = [
    shown || view.month,
    cur,
    ...items.map(i => FIN.periodOf(i.date)),
    ...(FIN.pay.months ? FIN.pay.months() : []),
  ].sort();
  const hi = [shiftM(cur, 12), shown || view.month].sort().pop();
  const out = [];
  for (let m = hi; m >= all[0] && out.length < 120; m = shiftM(m, -1)) out.push(m);
  return out;
}
function setMsg(t, err) {
  const m = $("msg");
  m.textContent = t || "";
  m.className = err ? "err" : "mu";
}
function setM(t, err) {
  const d = $("mmsg");
  d.textContent = t || "";
  d.className = err ? "err" : "mu";
}
function setR(t, err) {
  $("rmsg").textContent = t;
  $("rmsg").className = err ? "err" : "mu";
}
/* 通知は共通部品（U.toast）。undo が true なら「元に戻す」で直前の状態に戻す */
function toast(t, undo) {
  U.toast(t, { undo: undo ? undoLast : null });
}

/* ---------- 当月サマリ ---------- */
function renderSummary(mi, pi) {
  const sum = sumOf(mi),
    psum = sumOf(pi),
    d = sum - psum;
  const [ps, pe] = FIN.periodRange(view.month);
  const dim = FIN.periodDays(view.month),
    isCur = view.month === thisPeriod();
  const days = isCur ? FIN.dayIndex(today(), view.month) + 1 : dim;
  const by = {};
  mi.forEach(i => (by[i.category] = (by[i.category] || 0) + i.amount));
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 5),
    rest = rows.slice(5).reduce((s, r) => s + r[1], 0);
  if (rest > 0) top.push(["その他", rest]);
  const bm = {};
  mi.forEach(i => (bm[i.method] = (bm[i.method] || 0) + i.amount));
  const meths = Object.entries(bm).sort((a, b) => b[1] - a[1]);
  const delta = psum ? `<span class="delta ${dcls(d)}">前月比 ${dstr(d, psum)}</span>` : "";
  const sf = sumFolded();
  $("summary").classList.toggle("folded", sf);
  $("summary").innerHTML =
    `<div class="sumtop"><div><div class="eyebrow">${FIN.periodLabel(view.month)}の支出<span class="rng">${md(ps)}〜${md(pe)}</span></div><div class="totrow"><span class="total">${yen(sum)}</span>${delta}</div></div><button type="button" class="u-btn icon sm soft sumtog" id="sumtog" aria-expanded="${!sf}" aria-label="${sf ? "支出の内訳を開く" : "支出の内訳をたたむ"}">${FOLD_IC}</button></div><div class="sumbody">` +
    (sum
      ? `<div class="stack" role="img" aria-label="分類の内訳">${top.map(([c, v]) => `<span title="${esc(c)} ${yen(v)}（${Math.round((v / sum) * 100)}%）" style="flex:${v};background:${bcol(c)}"></span>`).join("")}</div>
    <div class="legend">${top.map(([c, v]) => `<span><i style="background:${bcol(c)}"></i>${emo(c)} ${esc(c)} <b class="num">${Math.round((v / sum) * 100)}%</b></span>`).join("")}</div>`
      : `<div class="mu mt10">この月度の明細はまだありません。${isWide() ? "左上の「＋ 追加」" : "右上の＋"}から追加してください。</div>`) +
    `<div class="kpis"><div><span>件数</span><b>${mi.length}件</b></div><div><span>1日平均</span><b>${yen(Math.round(sum / days))}</b></div><div><span>前月</span><b>${yen(psum)}</b></div></div>` +
    (meths.length
      ? `<div class="meths">${meths.map(([k, v]) => `<span class="chip out" style="${hs(k)}">${emo(k)} ${esc(k)} <b class="num">${yen(v)}</b></span>`).join("")}</div>`
      : "") +
    `</div>`;
}

/* ---------- 家計簿：毎日の記録（今日の記録・記録カレンダー） ---------- */
function renderStreak() {
  const el = $("kbStreak");
  if (!el) return;
  const td = today();
  const by = {};
  items.forEach(i => (by[i.date] = (by[i.date] || 0) + i.amount));
  const has = d => by[d] != null;
  const ti = items.filter(i => i.date === td);
  const m = thisPeriod();
  const [ps, pe] = FIN.periodRange(m);
  const days = [];
  for (let x = ps; x <= pe; x = FIN.ds(new Date(FIN.pd(x).getTime() + 864e5))) days.push(x);
  const past = days.filter(x => x <= td);
  const rec = past.filter(has).length;
  const mx = Math.max(1, ...past.map(x => by[x] || 0));
  const lv = x => (by[x] ? 1 + Math.min(3, Math.floor(((by[x] || 0) / mx) * 4)) : 0);
  const lead = (FIN.pd(ps).getDay() + 6) % 7; // 月曜はじまり
  /* いま見ている月度の合計と前月比（家計簿の一番上。支出カードと1枚にまとめた） */
  const vm = view.month;
  const vi = items.filter(i => inPeriod(i.date, vm)),
    vp = items.filter(i => inPeriod(i.date, shiftM(vm, -1)));
  const vs = sumOf(vi),
    vps = sumOf(vp),
    dv = vs - vps;
  const [vs0, ve0] = FIN.periodRange(vm);
  el.innerHTML = `<div class="st-top"><div class="st-today"><span class="st-eb">${FIN.periodLabel(vm)}の支出 <span class="num">${md(vs0)}〜${md(ve0)}</span></span><span class="st-tot"><b class="num">${yen(vs)}</b>${vps ? `<span class="delta ${dcls(dv)}">前月比 ${dstr(dv, vps)}</span>` : ""}</span>
    <span class="st-sub">${vm === m ? (ti.length ? `今日 <b class="num">${yen(sumOf(ti))}</b>（${ti.length}件）記録済み ✓` : "今日はまだ記録がありません") : `${vi.length}件`}</span></div><button type="button" class="st-calbtn" data-stcal="1" aria-label="記録カレンダーを開く"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></button></div>
    <div class="st-cal" role="img" aria-label="${FIN.periodLabel(m)}の記録カレンダー：${past.length}日中${rec}日記録"><div class="st-wd">${"月火水木金土日".split("").map(w => `<span>${w}</span>`).join("")}</div>
    <div class="st-grid">${"<i></i>".repeat(lead)}${days.map(x => `<button type="button" class="st-d l${lv(x)}${x === td ? " td" : ""}${x > td ? " fu" : ""}" data-jump="${x}" title="${x.slice(5).replace("-", "/")} ${by[x] ? yen(by[x]) : "記録なし"}"${x > td ? " disabled" : ""}>${+x.slice(8)}</button>`).join("")}</div>
    <div class="st-foot"><span>${FIN.periodLabel(m)}は <b class="num">${past.length}日中 ${rec}日</b> 記録</span><span class="st-lg"><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 多い</span></div></div>`;
}
/* ホームの入口に出す数字：いまの月度の支出・件数・1日平均 */
function spendNums() {
  const m = thisPeriod();
  const mi = items.filter(i => inPeriod(i.date, m));
  const sum = sumOf(mi);
  return { sum, n: mi.length, avg: Math.round(sum / (FIN.dayIndex(today(), m) + 1)) };
}
/* ---------- ホームの「今月の支出」：いまの月度の合計・前月比・多い分類・1日平均（家計簿のまとめ） ---------- */
function dashSpendHTML() {
  const m = thisPeriod();
  const mi = items.filter(i => inPeriod(i.date, m)),
    pi = items.filter(i => inPeriod(i.date, shiftM(m, -1)));
  const sum = sumOf(mi),
    psum = sumOf(pi);
  const days = FIN.dayIndex(today(), m) + 1;
  /* 前の月度の同じ日までと比べる（月の途中でも公平に） */
  const [pps] = FIN.periodRange(shiftM(m, -1));
  const pSame = sumOf(pi.filter(i => FIN.dayIndex(i.date, shiftM(m, -1)) < days));
  const by = {};
  mi.forEach(i => (by[i.category] = (by[i.category] || 0) + i.amount));
  const top = Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const mx = top.length ? top[0][1] : 1;
  const d = sum - pSame;
  if (!mi.length) return `<div class="ds-empty">この月度の明細はまだありません。右上の＋から記録できます。</div>`;
  return `<div class="ds-top"><div><span class="lb">${FIN.periodLabel(m)}の支出</span><b class="num">${yen(sum)}</b></div>
    <div class="ds-cmp ${d > 0 ? "up" : "down"}"><span class="lb">前の月度の同じ日まで</span><b class="num">${d > 0 ? "＋" : "−"}${yen(Math.abs(d))}</b><span class="s">${pps ? yen(pSame) : ""}</span></div></div>
    <div class="ds-cats">${top.map(([c, v]) => `<div class="ds-c"><span class="ds-n">${emo(c)} ${esc(c)}</span><span class="ds-b"><i style="width:${(v / mx) * 100}%;background:${bcol(c)}"></i></span><b class="num">${yen(v)}</b></div>`).join("")}</div>
    <div class="ds-foot"><span>1日平均 <b class="num">${yen(Math.round(sum / days))}</b></span><span>${mi.length}件</span><span>前の月度 合計 <b class="num">${yen(psum)}</b></span></div>`;
}

/* ---------- 明細の絞り込み（分類・支払い方法）：「絞り込み」ボタンで出るパネルの中身 ---------- */
UI.filter.define("kb", {
  cfg() {
    const mi = ledger.mi || [];
    const cnt = (k, v) => mi.filter(i => i[k] === v).length;
    const used = (k, list) => list.filter(v => cnt(k, v) || ledger.filter[k === "category" ? "c" : "m"] === v);
    return {
      rows: [
        { k: "c", label: "分類", cur: ledger.filter.c, all: mi.length, opts: used("category", CATS).map(v => ({ v, label: `${emo(v)} ${v}`, n: cnt("category", v) })) },
        { k: "m", label: "支払い方法", cur: ledger.filter.m, all: mi.length, opts: used("method", METHODS).map(v => ({ v, label: `${emo(v)} ${v}`, n: cnt("method", v) })) },
      ],
      n: (ledger.shown || []).length,
      unit: "件",
    };
  },
  pick(k, v) {
    ledger.filter[k] = v || "";
    render();
  },
  reset() {
    ledger.filter.c = "";
    ledger.filter.m = "";
    render();
  },
});

/* ---------- 明細一覧・編集フォーム・追加前の確認 ---------- */
function renderList(mi) {
  const q = ledger.filter.q.trim().toLowerCase();
  const fl = mi.filter(
    i =>
      (!ledger.filter.c || i.category === ledger.filter.c) &&
      (!ledger.filter.m || i.method === ledger.filter.m) &&
      (!q || ((i.memo || "") + i.category + i.method + i.amount).toLowerCase().includes(q)),
  );
  ledger.mi = mi;
  const conds = [ledger.filter.c, ledger.filter.m].filter(Boolean).map(v => `${emo(v)} ${v}`);
  const selOn = ledger.selMode || ledger.sel.size > 0;
  $("list").classList.toggle("selmode", selOn);
  $("fbarK").innerHTML = `<div class="fline">${UI.filter.btn("kb", conds.length)}<button type="button" class="selbtn${selOn ? " on" : ""}" data-selmode="1" aria-pressed="${selOn}">${selOn ? "選択をやめる" : "選択"}</button><span class="fcnt">${fl.length}件<b class="num">${yen(sumOf(fl))}</b></span></div>`;
  $("fsum").innerHTML = UI.filter.sum("kb", conds);
  ledger.shown = fl;
  if (UI.filter.isOpen("kb")) UI.filter.refresh();
  /* 並べる日付：絞り込みなし＝月度の初日から今日まで（過去の月度は最後の日まで）全部。記録のない日もわかるように出す。絞り込み中は明細のある日だけ */
  const fon = !!(ledger.filter.c || ledger.filter.m || q);
  const days = new Set(fl.map(i => i.date));
  if (!fon) {
    const [ps, pe] = FIN.periodRange(view.month);
    const last = [pe, today()].sort()[0];
    for (let d = ps; d <= last; d = FIN.ds(new Date(FIN.pd(d).getTime() + 864e5))) days.add(d);
  }
  if (ledger.dayAdd && inPeriod(ledger.dayAdd.date, view.month)) days.add(ledger.dayAdd.date);
  const by = {};
  fl.forEach(i => (by[i.date] = by[i.date] || []).push(i));
  const td = today();
  let html = "";
  [...days].sort().reverse().forEach(d => {
    const l = by[d] || [],
      w = dow(d),
      adding = ledger.dayAdd && ledger.dayAdd.date === d,
      fold = l.length && dayFold.has(d) && !adding;
    html += `<div data-day="${d}" class="day ${["sun", "", "", "", "", "", "sat"][w]}${l.length ? "" : " empty"}${d === td ? " today" : ""}"><button type="button" class="dtog" data-dfold="${d}"${l.length ? ` aria-expanded="${!fold}"` : ""}>${l.length ? FOLD_IC : '<i class="fic-sp"></i>'}<span class="dd">${d.slice(5).replace("-", "/")} <small>（${"日月火水木金土"[w]}）</small>${d === td ? '<em class="tdy">今日</em>' : ""}</span>${l.length ? `<span class="dn">${l.length}件</span>` : ""}</button><span class="dsum">${l.length ? yen(sumOf(l)) : "0件"}</span></div>`;
    if (adding) html += addForm(d);
    if (fold) return;
    l.forEach(i => {
      html +=
        i.id === ledger.editId
          ? editForm(i)
          : `<div class="it it3${ledger.sel.has(i.id) ? " on" : ""}" data-edit="${i.id}"><input type="checkbox" class="ck" data-ck="${i.id}" aria-label="選択"${ledger.sel.has(i.id) ? " checked" : ""}>${ico(i.category)}<div class="itm3"><b class="i-t">${esc(i.memo && i.memo !== i.category ? i.memo : i.category)}</b><span class="i-s">${i.memo && i.memo !== i.category ? `<span class="i-c" style="${hs(i.category)}">${esc(i.category)}</span>` : ""}<span class="i-m">${emo(i.method)} ${esc(i.method)}</span></span></div><span class="amt">${yen(i.amount)}</span></div>`;
    });
  });
  $("list").innerHTML = html || `<div class="mu empty">${fon ? "条件に合う明細はありません" : "この月度はまだ始まっていません"}</div>`;
}
/* 日付の行の＋で開く入力欄（日付はその日） */
function addForm(d) {
  const x = ledger.dayAdd.draft;
  return `<div class="rv addf" data-a="${d}">
  <label class="fl">日付<input type="date" data-af="date" value="${esc(x.date)}"></label>
  <label class="fl">金額<span class="yen"><input type="number" data-af="amount" value="${x.amount || ""}" placeholder="0" inputmode="numeric"></span></label>
  <label class="fl">分類<select data-af="category">${opts(CATS, x.category)}</select></label>
  <label class="fl">支払い方法<select data-af="method">${opts(METHODS, x.method)}</select></label>
  ${memoChips(x.category, x.memo)}<label class="fl full">メモ<input type="text" data-af="memo" list="memos" value="${esc(x.memo)}" placeholder="上の候補から選ぶか入力"></label>
  <div class="row sp full"><span></span><div class="row"><button class="ghost" data-acancel="1">キャンセル</button><button class="pri" data-asave="1">追加</button></div></div></div>`;
}
function editForm(i) {
  return `<div class="rv" data-e="${i.id}">
  <label class="fl">日付<input type="date" data-ef="date" value="${esc(ledger.draft.date)}"></label>
  <label class="fl">金額<span class="yen"><input type="number" data-ef="amount" value="${ledger.draft.amount || ""}" placeholder="0" inputmode="numeric"></span></label>
  <label class="fl">分類<select data-ef="category">${opts(CATS, ledger.draft.category)}</select></label>
  <label class="fl">支払い方法<select data-ef="method">${opts(METHODS, ledger.draft.method)}</select></label>
  ${memoChips(ledger.draft.category, ledger.draft.memo)}<label class="fl full">メモ<input type="text" data-ef="memo" list="memos" value="${esc(ledger.draft.memo)}" placeholder="上の候補から選ぶか入力"></label>
  <div class="row sp full"><button class="ghost" data-del="${i.id}">削除</button><div class="row"><button class="ghost" data-ecancel="1">キャンセル</button><button class="pri" data-esave="1">保存</button></div></div></div>`;
}
function fillMemos() {
  $("memos").innerHTML = recentMemos("", MEMO_LIST)
    .map(m => `<option value="${esc(m)}">`)
    .join("");
}
function memoChips(cat, cur) {
  const a = recentMemos(cat, MEMO_CHIPS);
  return a.length
    ? `<div class="mcs" role="group" aria-label="直近のメモ"><span class="lb">直近</span>${a.map(m => `<button type="button" class="mc${m === cur ? " on" : ""}" data-memo="${esc(m)}">${esc(m)}</button>`).join("")}</div>`
    : "";
}
function selItems() {
  return items.filter(i => ledger.sel.has(i.id));
}
function updateSel() {
  [...ledger.sel].forEach(id => {
    if (!items.some(i => i.id === id)) ledger.sel.delete(id);
  });
  const a = selItems(),
    on = a.length > 0;
  $("selbar").hidden = !on;
  document.body.classList.toggle("sel", on);
  if (on) {
    $("selcnt").textContent = a.length + "件選択";
    $("selsum").textContent = yen(sumOf(a));
    $("qc").innerHTML = iconOpts(CATS, undefined, "分類を変更…");
    $("qm").innerHTML = iconOpts(METHODS, undefined, "支払い方法を変更…");
    $("qmerge").disabled = a.length < 2;
    $("qdel").textContent = "削除";
    $("qdel").classList.remove("armed");
    if (view.armed === "qdel") view.armed = null;
  }
}

/* ---------- グラフ ---------- */
/* グラフの上：集計の単位・期間はボタンで選ぶ（中身は今までのプルダウンと同じ値）。スマホは見るグラフをタブで1つずつ */
const GPER = [["cur", "当月"], ["3", "3か月"], ["6", "6か月"], ["12", "12か月"], ["all", "全期間"]];
const GTAB = [["sum", "内訳"], ["trend", "推移"], ["pace", "ペース"], ["wd", "曜日"]];
function renderGraphCtl() {
  $("gchips").innerHTML = `<div class="gseg" role="group" aria-label="集計の単位">${[["category", "分類別"], ["method", "支払い方法別"]].map(([v, l]) => `<button type="button" data-gby="${v}" aria-pressed="${graph.by === v}">${l}</button>`).join("")}</div>
    <div class="gseg gper" role="group" aria-label="期間">${GPER.map(([v, l]) => `<button type="button" data-gper="${v}" aria-pressed="${graph.per === v}">${l}</button>`).join("")}</div>`;
  const tab = graph.tab || "sum";
  $("gtabs").innerHTML = GTAB.map(([v, l]) => `<button type="button" data-gtab="${v}" aria-current="${tab === v ? "page" : "false"}">${l}</button>`).join("");
  $("v-graph").dataset.gtab = tab;
}
function renderGraph() {
  renderGraphCtl();
  const g = graphData();
  $("gsel").innerHTML = iconOpts(g.names, g.sel, "すべての項目");
  $("gavg").innerHTML = graphSummaryHTML(g);
  $("gtrend").innerHTML = g.cur ? dailyHTML(g) : monthlyHTML(g);
  $("gdet").innerHTML = graphDetailHTML(g);
  $("gpace").innerHTML = paceHTML(g);
  $("gwd").innerHTML = weekdayHTML(g);
}
function donutSVG(parts, total) {
  const R = 52,
    C = 2 * Math.PI * R;
  let off = 0;
  const segs = parts
    .map(([k, v]) => {
      const len = (v / total) * C,
        gap = parts.length > 1 ? Math.min(2, len * 0.4) : 0;
      const el = `<circle r="${R}" cx="66" cy="66" fill="none" stroke="${bcol(k)}" stroke-width="20" stroke-dasharray="${Math.max(0.01, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 66 66)"><title>${esc(k)} ${yen(v)}（${Math.round((v / total) * 100)}%）</title></circle>`;
      off += len;
      return el;
    })
    .join("");
  return `<svg class="donut" viewBox="0 0 132 132" role="img" aria-label="構成比"><circle r="${R}" cx="66" cy="66" fill="none" stroke="var(--u-bg)" stroke-width="20"/>${segs}<text x="66" y="61" text-anchor="middle" class="dk">合計</text><text x="66" y="80" text-anchor="middle" class="dv">${short(total)}</text></svg>`;
}
/* 左：期間・合計の枠、構成比ドーナツ、項目ごとの前月比 */
function graphSummaryHTML(g) {
  const { cur, ms, n, sel, rows, tot, cv, pv, cm, pmn } = g;
  const tile = (a, b, c) => `<div><span>${a}</span><b>${b}</b>${c || ""}</div>`;
  const dl = (d, b) => `<small class="dl ${dcls(d)}">${b ? dstr(d, b) : "前月データなし"}</small>`;
  const period = cur
    ? FIN.periodLabel(view.month) + `（${md(FIN.periodRange(view.month)[0])}〜${md(FIN.periodRange(view.month)[1])}）`
    : `${FIN.periodLabel(ms[0])}〜${+ms[n - 1].slice(5)}月度（${n}か月度）`;
  let h =
    `<div class="row sp"><span class="mu">${period}</span>${sel ? `<button class="ghost" data-g="">← すべての項目</button>` : ""}</div>` +
    (sel
      ? `<div class="row sp gselh"><span class="row">${ico(sel, 1)}<b>${esc(sel)}</b></span><button class="btn-s" data-gview="${esc(sel)}">この項目の明細を見る</button></div>`
      : "") +
    `<div class="tiles">` +
    (cur
      ? tile(cm + "月度の合計", yen(cv), dl(cv - pv, pv)) +
        tile(pmn + "月度", yen(pv)) +
        tile("件数", g.curI.length + "件")
      : tile("月度の平均", yen(Math.round(g.avg))) +
        tile("期間合計", yen(tot)) +
        tile(cm + "月度", yen(cv), dl(cv - pv, pv))) +
    `</div>`;
  if (!sel && tot) {
    const top = rows.slice(0, 7),
      rest = rows.slice(7).reduce((s, r) => s + r[1], 0);
    if (rest > 0) top.push(["その他", rest]);
    const mx = Math.max(1, ...rows.map(r => r[1]));
    h +=
      `<div class="gh">構成比と${cur ? "前月比" : "月平均"}<small>タップでその項目だけ表示</small></div><div class="donutwrap">${donutSVG(top, tot)}<div class="lg2 col">${top.map(([k, v]) => `<span><i style="background:${bcol(k)}"></i>${esc(k)} <b class="num">${Math.round((v / tot) * 100)}%</b></span>`).join("")}</div></div>` +
      `<div class="mt8">${rows.map(([k, v]) => itemRowHTML(g, k, v, mx)).join("")}</div>`;
  }
  if (!tot) h += '<div class="mu mt12">この期間の明細はありません。</div>';
  return h;
}
/* 項目ごとの行：割合の棒、金額（期間なら月平均）、当月の前月比 */
function itemRowHTML(g, k, v, mx) {
  const { cur, n, tot, ck, pk, cm } = g;
  const d = (ck[k] || 0) - (pk[k] || 0),
    p = pk[k] || 0,
    shownV = cur ? v : Math.round(v / n);
  const pct = p && d ? " " + (d > 0 ? "+" : "-") + Math.round((Math.abs(d) / p) * 100) + "%" : !p && d ? " 新規" : "";
  return `<div class="irow" data-g="${esc(k)}">${ico(k, 1)}<div class="cell"><div class="nm"><span>${esc(k)}</span><small>${Math.round((v / tot) * 100)}%</small></div><div class="track"><span style="width:${Math.max(2, (v / mx) * 100)}%;background:${bcol(k)}"></span></div></div><div class="rt">${yen(shownV)}${cur ? "" : `<small class="permo">/月度</small>`}<span class="dl ${dcls(d)}">${cm}月度 ${d === 0 ? "±0" : (d > 0 ? "▲" : "▼") + yen(Math.abs(d))}${pct}</span></div></div>`;
}
/* 右：当月を選んだときは日別の棒 */
function dailyHTML(g) {
  const dim = FIN.periodDays(view.month),
    dv = new Array(dim).fill(0);
  g.curI.forEach(i => {
    const k = FIN.dayIndex(i.date, view.month);
    if (k >= 0 && k < dim) dv[k] += i.amount;
  });
  const vm = Math.max(1, ...dv);
  const bars = dv
    .map((v, k) => {
      const dd = FIN.dateAt(view.month, k);
      return `<div class="col" data-gm="${dd}" title="${md(dd)} ${yen(v)}"><span style="background:${g.color};height:${(v / vm) * 100}%;opacity:${!graph.m || graph.m === dd ? 1 : 0.35}"></span></div>`;
    })
    .join("");
  /* 目盛りは月度の最初・5日おき・最後（日付で出す） */
  const labels = dv
    .map((v, k) => `<div>${[0, 5, 10, 15, 20, 25, dim - 1].includes(k) ? md(FIN.dateAt(view.month, k)) : ""}</div>`)
    .join("");
  return `<div class="gh">日別の支出<small>棒をタップでその日の明細</small></div><div class="chart daily">${bars}</div><div class="xlab">${labels}</div>`;
}
/* 右：期間を選んだときは月別推移（項目で積み上げ） */
function monthlyHTML(g) {
  const { ms, base, avg, sel, rows, key } = g;
  const vals = ms.map(m => sumOf(base.filter(i => inPeriod(i.date, m)))),
    vm = Math.max(1, ...vals, avg);
  const stackKeys = sel ? [] : rows.slice(0, 6).map(r => r[0]);
  const bars = ms
    .map((m, k) => {
      const op = !graph.m || graph.m === m ? 1 : 0.35,
        ttl = `${FIN.periodLabel(m)} ${yen(vals[k])}`;
      if (sel)
        return `<div class="col" data-gm="${m}" title="${ttl}"><span style="background:${bcol(sel)};height:${(vals[k] / vm) * 100}%;opacity:${op}"></span></div>`;
      const by = {};
      base
        .filter(i => inPeriod(i.date, m))
        .forEach(i => {
          const kk = stackKeys.includes(key(i)) ? key(i) : "その他";
          by[kk] = (by[kk] || 0) + i.amount;
        });
      const segs = [...stackKeys, "その他"]
        .filter(kk => by[kk])
        .map(
          kk =>
            `<i style="height:${(by[kk] / vals[k]) * 100}%;background:${bcol(kk)}" title="${+m.slice(5)}月度 ${esc(kk)} ${yen(by[kk])}"></i>`,
        )
        .join("");
      return `<div class="col" data-gm="${m}" title="${ttl}"><span class="stk" style="height:${(vals[k] / vm) * 100}%;opacity:${op}">${segs}</span></div>`;
    })
    .join("");
  const labels = ms
    .map(
      (m, k) => `<div data-gm="${m}" class="${graph.m === m ? "on" : ""}">${+m.slice(5)}月<br>${short(vals[k])}</div>`,
    )
    .join("");
  const legend = sel
    ? ""
    : `<div class="lg2">${[...stackKeys, "その他"]
        .filter(kk => kk !== "その他" || rows.length > 6)
        .map(kk => `<span><i style="background:${bcol(kk)}"></i>${esc(kk)}</span>`)
        .join("")}</div>`;
  return (
    `<div class="gh">月別推移${sel ? "" : "（項目ごとの積み上げ）"}<small>点線は平均 ${yen(Math.round(avg))}</small></div><div class="chart"><div class="avg" style="bottom:${(avg / vm) * 100}%"></div>${bars}</div>` +
    `<div class="xlab">${labels}</div>` +
    legend
  );
}
/* 棒を選んだときの、その月・日の明細 */
function graphDetailHTML(g) {
  const { base, sel, cur } = g;
  if (!graph.m) return `<div class="mu mt8">棒をタップすると、その${cur ? "日" : "月度"}の明細を表示します</div>`;
  const det = base
    .filter(i => (graph.m.length === 10 ? i.date === graph.m : inPeriod(i.date, graph.m)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const lbl = graph.m.length === 10 ? md(graph.m) : FIN.periodLabel(graph.m);
  return (
    `<div class="row sp mt14"><b>${lbl}の明細${sel ? "（" + esc(sel) + "）" : ""}</b><span class="amt">${yen(sumOf(det))}</span></div>` +
    (det.length
      ? det
          .map(
            i =>
              `<div class="it ro">${ico(i.category, 1)}<div class="itm"><div class="memo">${esc(i.memo || i.category)}</div><div class="tag"><span class="mu">${i.date.slice(5).replace("-", "/")}</span>${chip(i.category)}${mchip(i.method)}</div></div><span class="amt">${yen(i.amount)}</span></div>`,
          )
          .join("")
      : '<div class="mu">明細なし</div>')
  );
}
/* 当月のペース：前月との累計比較と月末見込み */
function paceHTML(g) {
  const { curI, prevI, pm, pv, cm, pmn, color } = g;
  const cA = cumDays(curI, view.month),
    pA = cumDays(prevI, pm),
    isNow = view.month === thisPeriod(),
    upto = isNow ? FIN.dayIndex(today(), view.month) + 1 : cA.length;
  const cS = cA.slice(0, upto),
    ym = Math.max(1, ...cS, ...pA),
    span = Math.max(cA.length, pA.length) - 1, // 横軸は長い方の月度に合わせる
    X = d => ((d / span) * 300).toFixed(1),
    Y = v => (130 - (v / ym) * 124).toFixed(1);
  const pts = a => a.map((v, k) => `${X(k)},${Y(v)}`).join(" ");
  const same = pA[Math.min(upto, pA.length) - 1] || 0,
    now = cS[cS.length - 1] || 0,
    diff = now - same;
  const grid = [0.25, 0.5, 0.75]
    .map(
      f =>
        `<line x1="0" x2="300" y1="${(130 - f * 124).toFixed(1)}" y2="${(130 - f * 124).toFixed(1)}" stroke="var(--u-line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    )
    .join("");
  return (
    `<div class="gh">${cm}月度のペース（前の月度との累計比較）</div><div class="pace"><span class="yl">${short(ym)}</span><svg viewBox="0 0 300 130" preserveAspectRatio="none" role="img" aria-label="累計支出の比較">` +
    grid +
    `<line x1="0" x2="300" y1="130" y2="130" stroke="var(--u-strong)" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    (pv
      ? `<polyline points="${pts(pA)}" fill="none" stroke="var(--u-sub)" stroke-width="2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"><title>${pmn}月の累計</title></polyline>`
      : "") +
    `<polyline points="${pts(cS)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${cm}月の累計</title></polyline></svg></div>` +
    `<div class="xlab"><div class="l">${md(FIN.periodRange(view.month)[0])}</div><div>10日目</div><div>20日目</div><div class="r">${md(FIN.periodRange(view.month)[1])}</div></div>` +
    `<div class="lg2"><span><i class="ln" style="background:${color}"></i>${cm}月度</span>${pv ? `<span><i class="dash"></i>${pmn}月度</span>` : ""}</div>` +
    (pv
      ? `<div class="pnote">${upto}日目時点で前の月度の同じ日より <b class="dl ${dcls(diff)}">${diff >= 0 ? "＋" : "−"}${yen(Math.abs(diff))}</b>${isNow ? `。このままだと月度末は約 <b>${yen(Math.round((now / upto) * cA.length))}</b>` : ""}</div>`
      : "")
  );
}
/* 曜日別の支出（月曜はじまり） */
function weekdayHTML(g) {
  const { base, tot, cur, color } = g;
  if (!tot) return "";
  const wd = [0, 0, 0, 0, 0, 0, 0];
  base.forEach(i => (wd[dow(i.date)] += i.amount));
  const wm = Math.max(1, ...wd);
  return (
    `<div class="gh">曜日別の支出<small>${cur ? "当月" : "期間"}の合計</small></div>` +
    [1, 2, 3, 4, 5, 6, 0]
      .map(
        w =>
          `<div class="wdr"><span class="wd${w === 0 ? " sun" : w === 6 ? " sat" : ""}">${"日月火水木金土"[w]}</span><div class="track"><span style="width:${Math.max(wd[w] ? 2 : 0, (wd[w] / wm) * 100)}%;background:${color}"></span></div><span>${yen(wd[w])}</span></div>`,
      )
      .join("")
  );
}

/* ---------- 設定：項目の切り替え・マスタ ---------- */
const SET_IC = {
  theme: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  rules: '<path d="M4 6h16M4 12h10M4 18h6"/><path d="m15 16 2 2 4-4"/>',
  cats: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  mets: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  inc: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  paym: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  gen: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/>',
  save: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="m9.5 13.5 2 2 3.5-4"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
};
const setIc = k => `<svg class="seti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SET_IC[k]}</svg>`;
const SET_CV = `<svg class="setcv" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
const SET_PG = { home: "設定", rules: "自動分類ルール", cats: "分類", mets: "明細の支払い方法", inc: "収入と給料日", paym: "支払いの方法", gen: "支払予定の作成" };
const SET_EDIT = { rules: "rules", cats: "master", mets: "master", paym: "paym" };
const PAY_PG = ["inc", "paym", "gen"];
/* 設定の一覧（家計簿の設定・支払い管理の設定・共通） */
function renderSetHome() {
  const th = U.theme();
  const cfg = (FIN.pay.cfg && FIN.pay.cfg()) || {};
  const row = (k, lab, val) => `<button type="button" class="setrow" data-stab="${k}">${setIc(k)}<span class="setl">${lab}</span><span class="setv">${val}</span>${SET_CV}</button>`;
  const sv = $("saveSt");
  $("st-home").innerHTML = `<div class="setsec">家計簿の設定</div>
    <div class="setgrp">${row("cats", "分類", CATS.length)}${row("mets", "明細の支払い方法", METHODS.length)}${row("rules", "自動分類ルール", `${rules.length}件`)}</div>
    <div class="setsec">支払い・返済の設定</div>
    <div class="setgrp">${row("inc", "収入と給料日", `${cfg.income ? yen(cfg.income) + "・" : ""}${FIN.paydayNum()}日`)}${row("paym", "支払いの方法", (cfg.methods || []).length)}${row("gen", "支払予定の作成", "作り直す・作成")}</div>
    <div class="setsec">共通</div>
    <div class="setgrp"><div class="setrow static">${setIc("theme")}<span class="setl">テーマ</span><div class="seg thseg" role="group" aria-label="テーマ">${[["auto", "自動"], ["light", "ライト"], ["dark", "ダーク"]].map(([v, l]) => `<button type="button" data-theme="${v}"${th === v ? ' aria-current="page"' : ""}>${l}</button>`).join("")}</div></div>
    <div class="setrow static">${setIc("save")}<span class="setl">保存と同期</span><span class="setv"><span class="${sv ? sv.className : "savest"}">${sv ? esc(sv.textContent) : ""}</span></span></div><button type="button" class="setrow danger" data-logout="1">${setIc("out")}<span class="setl">ログアウト</span></button></div>`;
}
function renderSettings() {
  const pg = SET_PG[setting.tab] ? setting.tab : "home";
  $("stTitle").textContent = SET_PG[pg];
  document.querySelector("#rulepanel .setback").hidden = pg === "home";
  const ek = SET_EDIT[pg] || "";
  const eb = $("stEdit");
  eb.hidden = !ek;
  eb.dataset.setedit = ek;
  if (ek) paintSetEdit(ek, setting.edit[ek]);
  $("st-home").hidden = pg !== "home";
  $("st-rules").hidden = pg !== "rules";
  $("st-master").hidden = pg !== "cats" && pg !== "mets";
  $("st-pay").hidden = !PAY_PG.includes(pg);
  document.querySelectorAll("#st-pay [data-pg]").forEach(e => (e.hidden = e.dataset.pg !== pg));
  $("mMethods").classList.toggle("editing", setting.edit.paym);
  if (pg === "home") renderSetHome();
  if (pg === "cats" || pg === "mets") {
    setting.kind = pg;
    renderMaster();
  }
  if (PAY_PG.includes(pg) && FIN.pay.renderSettings) FIN.pay.renderSettings();
}
/* 設定のその項目を開いているか（支払いの設定を描き直すかどうか） */
const settingsOpen = tab => !$("rulepanel").hidden && (tab === "pay" ? PAY_PG.includes(setting.tab) : setting.tab === tab);
function mUse(kind, n) {
  const f = kind === "cats" ? "category" : "method";
  const c = items.filter(i => i[f] === n).length;
  const r = rules.filter(x =>
    kind === "cats"
      ? x.cat === n || x.from === n || x.to === n || (x.set && x.set.category === n)
      : x.met === n || (x.set && x.set.method === n),
  ).length;
  return { c, r };
}
function renderMaster() {
  const L = MASTER[setting.kind];
  $("maddn").placeholder = setting.kind === "cats" ? "新しい分類の名前" : "新しい支払い方法の名前";
  const ed = setting.edit.master;
  paintSetEdit("master", ed);
  $("mlist").classList.toggle("editing", ed);
  $("mlist").innerHTML = L.map((x, i) => {
    const u = mUse(setting.kind, x.n),
      used = u.c + u.r > 0;
    if (!ed)
      return `<div class="mrow view" data-sortrow data-mi="${i}">${GRIP("kbm")}<span class="me" style="${hs(x.n)}" aria-hidden="true">${esc(x.e)}</span><span class="mn">${esc(x.n)}</span><span class="cnt">明細 ${u.c}件${u.r ? ` ・ ルール ${u.r}件` : ""}</span></div>`;
    return `<div class="mrow${used ? " used" : ""}" data-sortrow data-mi="${i}">${GRIP("kbm")}<input type="text" class="me" data-me="${i}" value="${esc(x.e)}" maxlength="4" style="${hs(x.n)}" aria-label="${esc(x.n)}のアイコン"><input type="text" class="mn" data-mn="${i}" value="${esc(x.n)}" aria-label="名前"><button class="ghost mdel" data-mdel="${i}"${used ? ` title="使用中のため削除できません" aria-disabled="true"` : ""}>削除</button><div class="info"><span class="cnt">明細 ${u.c}件${u.r ? ` ・ ルール ${u.r}件` : ""}</span></div></div>`;
  }).join("");
  $("mconf").innerHTML = setting.merge
    ? `<div class="mcf">「${esc(setting.merge.old)}」を「${esc(setting.merge.nn)}」に統合します。明細 ${mUse(setting.merge.kind, setting.merge.old).c}件の${setting.merge.kind === "cats" ? "分類" : "支払い方法"}が「${esc(setting.merge.nn)}」に変わり、「${esc(setting.merge.old)}」はマスタから消えます。<div class="row"><button class="pri" data-mcok="1">統合する</button><button class="ghost" data-mcno="1">やめる</button></div></div>`
    : "";
}

/* ---------- 設定：分類ルール ---------- */
function selOpts(el, arr, first) {
  const v = el.value;
  el.innerHTML = iconOpts(arr, undefined, first);
  if ([...el.options].some(o => o.value === v)) el.value = v;
}
/* 右上の「編集」ボタン（押すと「完了」） */
function paintSetEdit(k, on) {
  document.querySelectorAll(`[data-setedit="${k}"]`).forEach(b => {
    b.textContent = on ? "完了" : "編集";
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}
function renderRules() {
  paintSetEdit("rules", setting.edit.rules);
  selOpts($("rcat"), CATS, "指定しない");
  selOpts($("rmet"), METHODS, "指定しない");
  selOpts($("scat"), CATS, "変更しない");
  selOpts($("smet"), METHODS, "変更しない");
  selOpts($("rf"), CATS);
  selOpts($("rt"), CATS);
  if (!$("rf").dataset.init) {
    $("rf").value = CATS[0];
    $("rt").value = CATS[1];
    $("rf").dataset.init = "1";
  }
  $("rules").innerHTML = rules.length
    ? rules
        .map(r => {
          const [kc, kl] = kindOf(r);
          return `<div class="rule"><div class="top"><span class="kind ${kc}">${kl}</span><label class="ckl"><input type="checkbox" class="ck" data-rauto="${r.id}"${r.auto !== false ? " checked" : ""}> 新規に自動適用</label></div>
    <div class="rdesc">${descRule(r)}</div>
    <div class="acts">${setting.edit.rules ? `<button class="u-btn sm editbtn" data-redit="${r.id}" aria-label="ルールを変更">変更</button><button class="ghost delbtn" data-rdel="${r.id}">削除</button>` : `<button data-rprev="${r.id}">既存データに適用…</button>`}</div>
    ${setting.preview && setting.preview.rid === r.id ? previewHTML() : ""}</div>`;
        })
        .join("")
    : '<div class="mu">ルールはまだありません。下のフォームから追加できます。</div>';
}
function chgHTML(it, x) {
  if (x.length === 2) return `${chip(x[1].category)} に<em>${yen(x[1].amount)}</em>を分割、残り${yen(x[0].amount)}`;
  const o = x[0],
    p = [];
  if (o.memo !== it.memo) p.push(`メモ → <em>${esc(o.memo)}</em>`);
  if (o.category !== it.category) p.push(`${chip(it.category)} → ${chip(o.category)}`);
  if (o.method !== it.method) p.push(`${mchip(it.method)} → ${mchip(o.method)}`);
  if (x.length === 1 && o.category !== it.category && o.amount === it.amount && !p.length)
    p.push(`→ ${chip(o.category)}`);
  return p.join(" ・ ");
}
function previewHTML() {
  const n = setting.preview.rows.length - setting.preview.off.size;
  if (!setting.preview.rows.length)
    return `<div class="pv"><div class="mu">今あるデータに対象の明細はありません。</div><div class="row mt8"><button class="ghost" data-rcancel="1">閉じる</button></div></div>`;
  return `<div class="pv"><div class="row sp mb6"><b>対象 ${setting.preview.rows.length}件</b><button class="ghost" data-pvall="1">${setting.preview.off.size ? "すべて選ぶ" : "すべて外す"}</button></div>
  <div class="pvl">${setting.preview.rows.map(({ it, x }) => `<div class="pvr" data-pv="${esc(it.id)}"><input type="checkbox" class="ck" tabindex="-1"${setting.preview.off.has(it.id) ? "" : " checked"} aria-label="適用する"><div class="cell"><div class="nm">${esc(it.memo || it.category)}</div><div class="chg">${it.date.slice(2).replace(/-/g, "/")} ・ ${chgHTML(it, x)}</div></div><span class="amt">${yen(it.amount)}</span></div>`).join("")}</div>
  <div class="row mt8"><button class="pri grow" data-rgo="1"${n ? "" : " disabled"}>選んだ${n}件に適用</button><button class="ghost" data-rcancel="1">やめる</button></div></div>`;
}
function rkUpdate() {
  const k = $("rk").value;
  document.querySelectorAll("#rform [data-k]").forEach(e => (e.hidden = e.dataset.k !== k));
}

