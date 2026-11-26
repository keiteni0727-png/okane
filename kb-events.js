/* ===================== 操作 ===================== */
/* ---------- 「2回押す」方式（confirm() が使えないため。1回目は文字を変えて待ち、true を返す） ---------- */
function arm(key, btn, label) {
  if (view.armed === key) {
    view.armed = null;
    return false;
  }
  view.armed = key;
  btn.textContent = label;
  btn.classList.add("armed");
  return true;
}

/* 手入力の初期値：マスタの先頭の分類・支払い方法 */
function blank() {
  return { date: today(), amount: 0, category: CATS[0], method: METHODS[0], memo: "" };
}
/* ---------- 明細の編集・削除 ---------- */
function saveEdit() {
  if (!ledger.draft || !(ledger.draft.amount > 0) || !ledger.draft.date) {
    setMsg("金額と日付を確認してください", 1);
    return;
  }
  const k = items.findIndex(i => i.id === ledger.editId);
  if (k >= 0) {
    items[k] = { ...ledger.draft, id: ledger.editId };
    learn(items[k]);
    view.month = FIN.periodOf(ledger.draft.date);
    save();
  }
  ledger.editId = null;
  ledger.draft = null;
  render();
}
function deleteItem(id) {
  snap();
  items = items.filter(i => i.id !== id);
  ledger.editId = null;
  ledger.draft = null;
  save();
  toast("削除しました", true);
  render();
}
function undoLast() {
  const b = lsGet(KB, null);
  if (!b) return;
  items = b;
  lsDel(KB);
  save();
  render();
  toast("元に戻しました");
}

/* ---------- 選んだ明細の一括変更・合算・削除 ---------- */
function quickSet(f, v) {
  if (!v || !ledger.sel.size) return;
  snap();
  let k = 0;
  items = items.map(i => (ledger.sel.has(i.id) ? (k++, { ...i, [f]: v }) : i));
  save();
  ledger.sel.clear();
  toast(k + "件の" + (f === "category" ? "分類" : "支払い方法") + "を「" + v + "」に変更しました", true);
  render();
}
function openBulk() {
  const a = selItems();
  if (!a.length) return;
  $("bd").value = "";
  $("bn").value = "";
  $("bmsg").textContent = "";
  view.armed = null;
  $("bsum").textContent = a.length + "件・合計 " + yen(sumOf(a));
  $("rulepanel").hidden = true;
  $("bulk").hidden = false;
  $("rbk").hidden = false;
}
function applyBulk() {
  const d = $("bd").value,
    n = $("bn").value.trim();
  if (!d && !n) {
    $("bmsg").textContent = "変更する項目を選んでください";
    return;
  }
  snap();
  let k = 0;
  items = items.map(i => {
    if (!ledger.sel.has(i.id)) return i;
    k++;
    const x = { ...i };
    if (d) x.date = d;
    if (n) x.memo = n;
    return x;
  });
  save();
  closePanels();
  ledger.sel.clear();
  toast(k + "件を更新しました", true);
  render();
}
function mergeSel() {
  const a = selItems().sort((x, y) => y.date.localeCompare(x.date));
  if (a.length < 2) {
    toast("2件以上を選んでください");
    return;
  }
  const memos = [...new Set(a.map(i => i.memo).filter(Boolean))];
  const out = { ...a[0], amount: sumOf(a), memo: memos.join("、") };
  delete out.ruled;
  snap();
  items = items.filter(i => !ledger.sel.has(i.id) || i.id === out.id).map(i => (i.id === out.id ? out : i));
  save();
  closePanels();
  ledger.sel.clear();
  toast(a.length + "件を合算しました（" + yen(out.amount) + "）", true);
  render();
}
function deleteSel() {
  snap();
  const n = ledger.sel.size;
  items = items.filter(i => !ledger.sel.has(i.id));
  ledger.sel.clear();
  save();
  toast(n + "件を削除しました", true);
  render();
}
function showInList(k) {
  ledger.filter = { q: "", c: graph.by === "category" ? k : "", m: graph.by === "method" ? k : "" };
  ledger.filter.q = "";
  ledger.sel.clear();
  setTab("list");
  render();
  window.scrollTo(0, $("lhead").getBoundingClientRect().top + window.scrollY - 60);
}

/* ---------- 分類ルール ---------- */
function openPreview(rid) {
  const r = rules.find(x => x.id === rid);
  if (!r) return;
  const rows = items
    .map(it => {
      const x = applyRule(it, r);
      return x ? { it, x } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.it.date.localeCompare(a.it.date));
  setting.preview = { rid, rows, off: new Set() };
  renderRules();
  const el = document.querySelector(`[data-rprev="${rid}"]`);
  if (el) el.closest(".rule").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function applyPreview() {
  if (!setting.preview) return;
  const r = rules.find(x => x.id === setting.preview.rid);
  if (!r) return;
  const ids = new Set(setting.preview.rows.map(x => x.it.id).filter(id => !setting.preview.off.has(id)));
  if (!ids.size) return;
  snap();
  let k = 0;
  items = items.flatMap(it => {
    if (!ids.has(it.id)) return [it];
    const x = applyRule(it, r);
    if (x) {
      k++;
      return x;
    }
    return [it];
  });
  items.forEach(learn);
  save();
  setting.preview = null;
  setR(k + "件に適用しました");
  toast(k + "件にルールを適用しました", true);
  render();
}
function resetForm() {
  setting.editRule = null;
  ["rw", "rmin", "rmax", "snm", "ra"].forEach(id => ($(id).value = ""));
  ["rcat", "rmet", "scat", "smet"].forEach(id => ($(id).value = ""));
  $("rmode").value = "contains";
  $("rm").value = "1";
  $("rftitle").textContent = "ルールを追加";
  $("radd").textContent = "ルールを追加";
  $("rfcancel").hidden = true;
}
function startEdit(id) {
  const r = rules.find(x => x.id === id);
  if (!r) return;
  renderRules();
  setting.editRule = id;
  $("rk").value = r.kind;
  rkUpdate();
  if (r.kind === "set") {
    $("rw").value = r.kw;
    $("rmode").value = r.mode;
    $("rcat").value = r.cat;
    $("rmet").value = r.met;
    $("rmin").value = r.min ?? "";
    $("rmax").value = r.max ?? "";
    $("snm").value = r.set.memo;
    $("scat").value = r.set.category;
    $("smet").value = r.set.method;
  } else {
    $("rf").value = r.from;
    $("rt").value = r.to;
    $("ra").value = r.amt;
    $("rm").value = r.max;
  }
  $("rftitle").textContent = "ルールを編集";
  $("radd").textContent = "変更を保存";
  $("rfcancel").hidden = false;
  $("rform").scrollIntoView({ behavior: "smooth", block: "start" });
}
function saveRuleForm() {
  let r;
  const old = setting.editRule && rules.find(x => x.id === setting.editRule);
  if ($("rk").value === "set") {
    r = {
      id: setting.editRule || "r" + uid(),
      kind: "set",
      kw: $("rw").value.trim(),
      mode: $("rmode").value,
      cat: $("rcat").value,
      met: $("rmet").value,
      min: nn($("rmin").value),
      max: nn($("rmax").value),
      set: { memo: $("snm").value.trim(), category: $("scat").value, method: $("smet").value },
      auto: old ? old.auto !== false : true,
    };
    if (!r.kw && !r.cat && !r.met && r.min == null && r.max == null) {
      setR("条件を1つ以上入力してください", 1);
      return;
    }
    if (!r.set.memo && !r.set.category && !r.set.method) {
      setR("変更内容を1つ以上入力してください", 1);
      return;
    }
  } else {
    const amt = Math.round(Number($("ra").value) || 0),
      mx = Math.max(1, Math.round(Number($("rm").value) || 1));
    if (amt <= 0 || $("rf").value === $("rt").value) {
      setR("金額と分類を確認してください", 1);
      return;
    }
    r = {
      id: setting.editRule || "r" + uid(),
      kind: "split",
      from: $("rf").value,
      amt,
      to: $("rt").value,
      max: mx,
      auto: old ? old.auto !== false : true,
    };
  }
  const was = !!setting.editRule;
  if (was) rules = rules.map(x => (x.id === setting.editRule ? r : x));
  else rules.push(r);
  saveRules();
  resetForm();
  setting.preview = null;
  setR(was ? "ルールを更新しました" : "ルールを追加しました");
  renderRules();
  openPreview(r.id);
}
function undoForRules() {
  const b = lsGet(KB, null);
  if (!b) {
    setR("取り消せる変更がありません", 1);
    return;
  }
  items = b;
  lsDel(KB);
  save();
  setR("直前の変更を取り消しました");
  render();
}
function ruleFromSel() {
  const a = selItems();
  if (!a.length) return;
  const memos = [...new Set(a.map(i => i.memo).filter(Boolean))];
  openRules("rules");
  resetForm();
  $("rk").value = "set";
  rkUpdate();
  $("rw").value = memos.join(",");
  $("rmode").value = "exact";
  $("snm").value = memos[0] || "";
  setR("選んだ明細のメモをキーワードに入れました。統一後の名称や分類を決めて追加してください。");
  $("rform").scrollIntoView({ block: "start" });
  $("snm").focus();
}

/* ---------- マスタ ---------- */
function mRenameApply(kind, old, nn) {
  const f = kind === "cats" ? "category" : "method",
    L = MASTER[kind],
    idx = L.findIndex(x => x.n === old),
    ex = L.findIndex(x => x.n === nn);
  if (idx < 0) return;
  const k = items.filter(i => i[f] === old).length;
  items = items.map(i => (i[f] === old ? { ...i, [f]: nn } : i));
  rules = rules.map(r => {
    const x = JSON.parse(JSON.stringify(r));
    if (kind === "cats") {
      if (x.cat === old) x.cat = nn;
      if (x.from === old) x.from = nn;
      if (x.to === old) x.to = nn;
      if (x.set && x.set.category === old) x.set.category = nn;
    } else {
      if (x.met === old) x.met = nn;
      if (x.set && x.set.method === old) x.set.method = nn;
    }
    return x;
  });
  if (ex >= 0) L.splice(idx, 1);
  else L[idx].n = nn;
  if (kind === "cats" && ledger.filter.c === old) ledger.filter.c = nn;
  if (kind === "mets" && ledger.filter.m === old) ledger.filter.m = nn;
  if (graph.sel === old) graph.sel = nn;
  if (ledger.draft && ledger.draft[f] === old) ledger.draft[f] = nn;
  applyMaster();
  saveMasterLocal();
  saveRulesLocal();
  save();
  setM(
    ex >= 0
      ? `「${old}」を「${nn}」に統合しました（明細 ${k}件）`
      : `「${old}」を「${nn}」に変更しました（明細 ${k}件）`,
  );
  render();
}
function mRename(i, nn) {
  const L = MASTER[setting.kind],
    old = L[i] && L[i].n;
  nn = String(nn || "").trim();
  if (!old) return;
  if (!nn) {
    setM("名前を空にはできません", 1);
    renderMaster();
    return;
  }
  if (nn === old) return;
  if (L.some(x => x.n === nn)) {
    setting.merge = { kind: setting.kind, old, nn };
    renderMaster();
    return;
  }
  mRenameApply(setting.kind, old, nn);
}
/* 分類・支払い方法の並び替え：⠿を押さえたまま上下に動かす（しくみは共通の u-core.js、エンタメ管理と同じ動き） */
SORT_DONE.kbm = (box, rows) => {
  const L = MASTER[setting.kind];
  const nl = rows.map(x => L[+x.dataset.mi]).filter(Boolean);
  if (nl.length === L.length && nl.some((x, k) => x !== L[k])) {
    L.splice(0, L.length, ...nl);
    applyMaster();
    saveMaster();
  }
  render();
};
function mDelete(i, btn) {
  const L = MASTER[setting.kind],
    x = L[i];
  if (!x) return;
  const u = mUse(setting.kind, x.n);
  if (u.c + u.r) {
    setM(
      `「${x.n}」は明細${u.c}件${u.r ? `・ルール${u.r}件` : ""}で使われているため削除できません。名前を別の項目と同じにすると統合できます。`,
      1,
    );
    return;
  }
  if (L.length <= 1) {
    setM("最後の1件は削除できません", 1);
    return;
  }
  if (arm("m" + setting.kind + i, btn, "もう一度押すと削除")) return;
  L.splice(i, 1);
  applyMaster();
  saveMaster();
  setM(`「${x.n}」を削除しました`);
  render();
}
function mAdd() {
  const n = $("maddn").value.trim(),
    e = $("madde").value.trim();
  if (!n) {
    setM("名前を入力してください", 1);
    return;
  }
  if (CATS.includes(n) || METHODS.includes(n)) {
    setM(`「${n}」は既にあります`, 1);
    return;
  }
  MASTER[setting.kind].push({ n, e: e || "🏷️", h: n in CH ? CH[n] : hashHue(n) });
  applyMaster();
  saveMaster();
  $("maddn").value = "";
  $("madde").value = "";
  setM(`「${n}」を追加しました`);
  render();
}

/* ===================== イベント ===================== */
/* ---------- クリック：画面ごとの処理に振り分ける。各処理は、受け持ったら true を返す ---------- */
/* ---------- 追加（右上の＋・左メニューの＋）：今の画面に合わせて、明細・支払・口座を追加 ---------- */
function doAdd() {
  if (view.tab === "home" || view.tab === "balance") {
    if (FIN.pay.add) FIN.pay.add(view.tab === "home" ? "pay" : "acc");
    return;
  }
  /* 家計簿：入力シートを開く（日付は今日） */
  openEntry(today());
}
function paintTheme() {
  markCurrent("[data-theme]", "theme", U.theme());
}
document.addEventListener("u-theme", paintTheme);
document.addEventListener("click", e => {
  if (e.target.closest(".pay, #st-pay, #kbSheet")) return; // 支払いの部品は pay.js、入力シートは kb-entry.js が受け持つ
  if (clickListCheck(e)) return;
  const t = e.target.closest("button,[data-edit],[data-day],[data-memo],[data-gm],[data-g],.pvr") || e.target;
  /* 画面全体（body）へのクリックは無視する（body の data-tab を画面の切り替えと取り違えないように） */
  if (t === document.body || t === document.documentElement) return;
  const d = t.dataset || {};
  [clickHeader, clickLedger, clickSelection, clickGraph, clickRules, clickMaster].some(
    f => f(t, d),
  );
});
/* 明細一覧：丸いチェック・選択中に行をタップしたときは、選択だけ切り替える */
function clickListCheck(e) {
  if (!e.target.closest("#list")) return false;
  const ck = e.target.closest("[data-ck]");
  if (ck) {
    const id = ck.dataset.ck;
    ck.checked ? ledger.sel.add(id) : ledger.sel.delete(id);
    ledger.editId = null;
    ledger.draft = null;
    render();
    return true;
  }
  const row = e.target.closest("[data-edit]");
  if (row && (ledger.sel.size || ledger.selMode)) {
    const id = row.dataset.edit;
    ledger.sel.has(id) ? ledger.sel.delete(id) : ledger.sel.add(id);
    render();
    return true;
  }
  return false;
}
/* ヘッダー・下部メニュー・設定の開閉・通知 */
function clickHeader(t, d) {
  if (t.id === "hAdd" || t.id === "sbAdd" || t.id === "fab" || t.id === "kbRec") {
    doAdd();
  } else if (d.stcal) {
    $("kbStreak").classList.toggle("cal");
  } else if (d.jump) {
    /* 記録カレンダーの日付：その日の明細へ（いまの月度の一覧に移る） */
    if (view.tab !== "list") setTab("list");
    if (!inPeriod(d.jump, view.month)) {
      view.month = thisPeriod();
      render();
    }
    const row = document.querySelector(`#list [data-day="${d.jump}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (t.id === "hback") {
    /* 戻る：ホームから開いたページなら、ブラウザの履歴で戻る（スマホの「戻る」と同じ動き） */
    if (history.state && history.state.d > 0) history.back();
    else setTab("dash");
  } else if (d.theme) {
    U.setTheme(d.theme);
  } else if (d.setedit === "rules" || d.setedit === "master" || d.setedit === "paym") {
    setting.edit[d.setedit] = !setting.edit[d.setedit];
    setting.merge = null;
    view.armed = null;
    if (d.setedit === "rules") renderRules();
    else if (d.setedit === "master") renderMaster();
    else {
      $("mMethods").classList.toggle("editing", setting.edit.paym);
      paintSetEdit("paym", setting.edit.paym);
    }
  } else if (d.logout) {
    U.store().then(s => (s.logout ? s.logout() : toast("この環境ではログアウトできません")));
  } else if (d.tab) {
    setTab(d.tab);
    window.scrollTo(0, 0);
  } else if (t.id === "mprev" || t.id === "mnext") {
    setBarMonth(shiftM(barMonth(), t.id === "mprev" ? -1 : 1));
  } else if (t.id === "mcur") {
    setBarMonth(thisPeriod());
  } else if (t.id === "hTheme") {
    /* 表示の切り替えは共通部品（u-ui.js）が行う */
  } else if (t.id === "sumtog" || (t.closest && t.closest("#summary .sumtop") && !t.closest("a,input,select"))) {
    t = $("sumtog");
    const f = !sumFolded();
    lsSet(KSUMF, f ? "1" : "0", true);
    $("summary").classList.toggle("folded", f);
    t.setAttribute("aria-expanded", String(!f));
    t.setAttribute("aria-label", f ? "支出の内訳を開く" : "支出の内訳をたたむ");
  } else if (t.id === "sbtog") {
    const c = !document.body.classList.contains("sbc");
    setSidebar(c);
    lsSet(KSBC, c ? "1" : "", true);
  } else if (t.id === "gear" || t.id === "sbgear") {
    if ($("rulepanel").hidden) openRules();
    else closePanels();
  } else if (t.id === "rclose" || t.id === "rbk" || t.id === "bclose") {
    closePanels();
  } else if (t.id === "syncnow") {
    U.sync.retry();
  } else return false;
  return true;
}
/* 明細：絞り込みの解除・その場の編集・削除・メモ候補 */
function openDayAdd(date) {
  const last = items.length ? [...items].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  ledger.dayAdd = { date, draft: { ...blank(), date, method: last && METHODS.includes(last.method) ? last.method : METHODS[0] } };
  ledger.editId = null;
  ledger.draft = null;
  dayFold.delete(date);
  saveDayFold();
  render();
  const f = document.querySelector(`.addf[data-a="${date}"]`);
  if (f) {
    const hd = (document.querySelector(".appbar")?.offsetHeight || 56) + ($("lhead")?.offsetHeight || 0) + 8;
    const day = f.previousElementSibling || f;
    scrollBy(0, day.getBoundingClientRect().top - hd);
    f.querySelector('[data-af="amount"]')?.focus({ preventScroll: true });
  }
}
function saveDayAdd() {
  const x = ledger.dayAdd && ledger.dayAdd.draft;
  if (!x || !(x.amount > 0) || !x.date) {
    toast("金額と日付を入れてください");
    return;
  }
  const nw = runRules([{ ...x, id: uid() }]);
  items = items.concat(nw.out);
  nw.out.forEach(learn);
  save();
  if (!inPeriod(x.date, view.month)) view.month = FIN.periodOf(x.date);
  ledger.dayAdd = null;
  toast(`${md(x.date)} に ${yen(x.amount)} を追加しました${nw.changed ? "（ルールで変更）" : ""}`);
  render();
}
function clickLedger(t, d) {
  if (d.selmode) {
    /* 「選択」：まとめて変更・削除するときだけ丸を出す */
    ledger.selMode = !(ledger.selMode || ledger.sel.size);
    if (!ledger.selMode) ledger.sel.clear();
    render();
  } else if (d.dadd) {
    openEntry(d.dadd);
  } else if (d.dfold) {
    if (ledger.sel.size) {
      const ids = ledger.shown.filter(i => i.date === d.dfold),
        all = ids.every(i => ledger.sel.has(i.id));
      ids.forEach(i => (all ? ledger.sel.delete(i.id) : ledger.sel.add(i.id)));
    } else if (t.hasAttribute("aria-expanded")) {
      dayFold.has(d.dfold) ? dayFold.delete(d.dfold) : dayFold.add(d.dfold);
      saveDayFold();
    } else return true;
    render();
  } else if (d.asave) {
    saveDayAdd();
  } else if (d.acancel) {
    ledger.dayAdd = null;
    render();
  } else if (d.del) {
    if (!arm(d.del, t, "もう一度押すと削除")) deleteItem(d.del);
  } else if (ledger.sel.size && d.day) {
    const ids = ledger.shown.filter(i => i.date === d.day),
      all = ids.every(i => ledger.sel.has(i.id));
    ids.forEach(i => (all ? ledger.sel.delete(i.id) : ledger.sel.add(i.id)));
    render();
  } else if (d.memo !== undefined) {
    const row = t.closest(".rv");
    if (row && row.dataset.a && ledger.dayAdd) {
      ledger.dayAdd.draft.memo = d.memo;
      render();
    } else if (row && row.dataset.e && ledger.draft) {
      ledger.draft.memo = d.memo;
      render();
    }
  } else if (d.esave) {
    saveEdit();
  } else if (d.ecancel) {
    ledger.editId = null;
    ledger.draft = null;
    view.armed = null;
    render();
  } else if (d.edit) {
    openEntry(null, d.edit);
  } else return false;
  return true;
}
/* 選んだ明細の操作（下部バー・詳細編集） */
function clickSelection(t) {
  if (t.id === "selend") {
    ledger.sel.clear();
    ledger.selMode = false;
    render();
  } else if (t.id === "qmerge") {
    mergeSel();
  } else if (t.id === "qrule") {
    ruleFromSel();
  } else if (t.id === "qdel") {
    if (!arm("qdel", t, "もう一度押すと" + ledger.sel.size + "件を削除")) deleteSel();
  } else if (t.id === "selpost") {
    openBulk();
  } else if (t.id === "bapply") {
    applyBulk();
  } else return false;
  return true;
}
/* グラフ：棒・項目を選ぶ、明細画面で見る */
function clickGraph(t, d) {
  if (d.gm) {
    graph.m = graph.m === d.gm ? "" : d.gm;
    renderGraph();
  } else if (d.gview !== undefined) {
    showInList(d.gview);
  } else if (d.g !== undefined) {
    graph.sel = d.g;
    graph.m = "";
    renderGraph();
  } else return false;
  return true;
}
/* 設定：項目の切り替えと分類ルール */
function clickRules(t, d) {
  if (d.stab) {
    setting.tab = d.stab;
    setting.merge = null;
    setting.preview = null;
    setting.edit = { rules: false, master: false, paym: false };
    renderRules();
    renderSettings();
    $("stBody").scrollTop = 0;
  } else if (d.rdel) {
    if (arm(d.rdel, t, "もう一度押すと削除")) return true;
    rules = rules.filter(r => r.id !== d.rdel);
    if (setting.preview && setting.preview.rid === d.rdel) setting.preview = null;
    if (setting.editRule === d.rdel) resetForm();
    saveRules();
    renderRules();
  } else if (d.rprev) {
    openPreview(d.rprev);
  } else if (d.rcancel) {
    setting.preview = null;
    renderRules();
  } else if (d.rgo) {
    applyPreview();
  } else if (d.pvall) {
    const pv = setting.preview;
    if (!pv) return true;
    const allOn = pv.off.size === 0;
    pv.rows.forEach(r => (allOn ? pv.off.add(r.it.id) : pv.off.delete(r.it.id)));
    renderRules();
  } else if (t.classList && t.classList.contains("pvr")) {
    const pv = setting.preview;
    if (pv) {
      pv.off.has(d.pv) ? pv.off.delete(d.pv) : pv.off.add(d.pv);
      renderRules();
    }
  } else if (d.redit) {
    startEdit(d.redit);
  } else if (t.id === "rfcancel") {
    resetForm();
    renderRules();
  } else if (t.id === "radd") {
    saveRuleForm();
  } else if (t.id === "rundo") {
    undoForRules();
  } else return false;
  return true;
}
/* 設定：マスタ */
function clickMaster(t, d) {
  if (d.mk) {
    setting.kind = d.mk;
    setting.merge = null;
    setM("");
    renderMaster();
  } else if (d.mdel !== undefined) {
    mDelete(+d.mdel, t);
  } else if (d.mcok) {
    const c = setting.merge;
    setting.merge = null;
    if (c) mRenameApply(c.kind, c.old, c.nn);
  } else if (d.mcno) {
    setting.merge = null;
    render();
  } else if (t.id === "maddb") {
    mAdd();
  } else return false;
  return true;
}

/* ---------- 選択・入力欄の変更 ---------- */
document.addEventListener("change", e => {
  if (e.target.closest(".pay, #st-pay")) return;
  const t = e.target,
    d = t.dataset || {},
    v = t.value;
  if (t.id === "month") {
    setBarMonth(v);
  } else if (d.af === "category" && ledger.dayAdd) {
    ledger.dayAdd.draft.category = v;
    render();
  } else if (t.id === "qc") {
    quickSet("category", v);
  } else if (t.id === "qm") {
    quickSet("method", v);
  } else if (t.id === "gby") {
    graph.by = v;
    graph.sel = "";
    renderGraph();
  } else if (t.id === "gper") {
    graph.per = v;
    renderGraph();
  } else if (t.id === "gsel") {
    graph.sel = v;
    renderGraph();
  } else if (d.rauto) {
    const r = rules.find(x => x.id === d.rauto);
    if (r) {
      r.auto = t.checked;
      saveRules();
    }
  } else if (t.id === "rk") {
    rkUpdate();
  } else if (d.mn !== undefined) {
    mRename(+d.mn, v);
  } else if (d.me !== undefined) {
    const x = MASTER[setting.kind][+d.me];
    if (x) {
      x.e = v.trim() || "🏷️";
      saveMaster();
      render();
    }
  }
});

/* ---------- 文字の入力 ---------- */
document.addEventListener("input", e => {
  if (e.target.closest(".pay, #st-pay")) return;
  const t = e.target,
    d = t.dataset || {};
  const val = f => (f === "amount" ? Math.round(Number(t.value) || 0) : t.value);
  if (t.id === "fq") {
    ledger.filter.q = t.value;
    render();
  } else if (d.ef && ledger.draft) {
    /* 明細の編集フォーム */
    ledger.draft[d.ef] = val(d.ef);
  } else if (d.af && ledger.dayAdd) {
    /* 日付の行の＋で開いた入力欄 */
    ledger.dayAdd.draft[d.af] = val(d.af);
  }
});

/* ---------- Enter：マスタの名前・アイコンは確定、追加欄は追加、明細の編集フォームは保存 ---------- */
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
  if (e.target.closest && e.target.closest(".pay, #st-pay")) return;
  const t = e.target,
    d = t.dataset || {};
  if (d.mn !== undefined || d.me !== undefined) {
    e.preventDefault();
    t.blur();
  } else if (t.id === "maddn") {
    e.preventDefault();
    mAdd();
  } else if (d.af) {
    const b = document.querySelector("[data-asave]");
    if (b) {
      e.preventDefault();
      b.click();
    }
  } else if (d.ef) {
    const b = document.querySelector("[data-esave]");
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});

/* ---------- トップへ戻る：1画面ぶん下に進んだら出す ---------- */
(() => {
  const b = $("toTop");
  let raf = 0;
  const upd = () => {
    raf = 0;
    const show = scrollY > innerHeight * 0.9;
    b.classList.toggle("hide", !show);
    b.tabIndex = show ? 0 : -1;
    b.setAttribute("aria-hidden", String(!show));
  };
  addEventListener(
    "scroll",
    () => {
      if (!raf) raf = requestAnimationFrame(upd);
    },
    { passive: true },
  );
  b.addEventListener("click", () =>
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }),
  );
  upd();
})();

/* ===================== 支払いから呼ぶ関数 ===================== */
Object.assign(FIN.kb, {
  render,
  setTab,
  settingsOpen,
  dashSpend: () => dashSpendHTML(),
  spendNums: () => spendNums(),
  /* その月度に現金で払った額（支払いの「残るお金」から引く） */
  cashIn: p => sumOf(items.filter(i => i.method === FIN.CASH && inPeriod(i.date, p))),
});

/* ===================== 起動 ===================== */
/* 端末内の控えから開く（クラウドに接続する前の表示に使う） */
{
  const m = lsGet(KMS, null);
  MASTER = m ? normMaster(m) : null;
}
if (!MASTER) MASTER = { cats: CATS.map(mkE), mets: METHODS.map(mkE) };
applyMaster();
rules =
  lsRaw(KR) === null
    ? [] // はじめて開いたとき
    : lsGet(KR, []);
if (!Array.isArray(rules)) rules = [];
rules = rules.map(normRule).filter(Boolean);
rkUpdate();
{
  view.tab = "dash"; // 開いたときはいつもホーム（完済への道のり・今日やること）
}
setSidebar(lsRaw(KSBC) === "1");
paintTheme();
history.replaceState({ t: view.tab, d: 0 }, "");
/* スマホ・ブラウザの「戻る」：前に開いていたページへ */
addEventListener("popstate", e => setTab((e.state && e.state.t) || "dash", true));
setTab(view.tab, true);
load();
items.forEach(learn);
render();
if (restored) setMsg("バックアップから" + restored + "件を復元しました。");
initSync();
