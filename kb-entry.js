/* ===================== 家計簿：明細の入力シート（追加・編集） =====================
  画面の下から出るシート（PCは真ん中）。金額は中の電卓で打つ（入力欄に重ならない）。
  分類・支払い方法はボタンで1回で選ぶ。日付は「今日／昨日／ほかの日」。メモは直近の候補から選べる。
  kb.js / kb-view.js / kb-events.js の関数（items・save・render など）をそのまま使う */
const entry = { open: false, mode: "add", id: null, d: null, expr: "", catTouched: false };

/* ---------- 開く・閉じる ---------- */
function openEntry(date, id) {
  UI.calcClose && UI.calcClose();
  if (id) {
    const src = items.find(i => i.id === id);
    if (!src) return;
    Object.assign(entry, { mode: "edit", id, d: { ...src }, expr: String(src.amount || ""), catTouched: true });
  } else {
    const last = items.length ? [...items].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
    Object.assign(entry, {
      mode: "add",
      id: null,
      d: { ...blank(), date: date || today(), method: last && METHODS.includes(last.method) ? last.method : METHODS[0] },
      expr: "",
      catTouched: false,
    });
  }
  entry.open = true;
  view.armed = null;
  document.documentElement.classList.add("esopen");
  renderEntry();
}
function closeEntry() {
  entry.open = false;
  document.documentElement.classList.remove("esopen");
  $("kbSheet").hidden = true;
  $("kbSheet").innerHTML = "";
}

/* ---------- 金額の式（＋−×÷）：かけ算・わり算を先に計算する ---------- */
function evalExpr(s) {
  const t = String(s || "").match(/\d+|[+\-×÷]/g);
  if (!t) return 0;
  const nums = [],
    ops = [];
  let cur = null;
  t.forEach(x => {
    if (/\d/.test(x)) cur = Number(x);
    else if (cur != null) {
      nums.push(cur);
      ops.push(x);
      cur = null;
    }
  });
  if (cur != null) nums.push(cur);
  else ops.pop(); // 最後が記号なら無視
  if (!nums.length) return 0;
  const n2 = [nums[0]],
    o2 = [];
  ops.forEach((o, i) => {
    const b = nums[i + 1];
    if (o === "×") n2[n2.length - 1] *= b;
    else if (o === "÷") n2[n2.length - 1] = b ? n2[n2.length - 1] / b : 0;
    else {
      n2.push(b);
      o2.push(o);
    }
  });
  let v = n2[0];
  o2.forEach((o, i) => (v = o === "+" ? v + n2[i + 1] : v - n2[i + 1]));
  return Math.max(0, Math.round(v));
}
const entryAmt = () => evalExpr(entry.expr);
function entryKey(k) {
  let e = entry.expr;
  if (k === "C") e = "";
  else if (k === "⌫") e = e.slice(0, -1);
  else if (k === "=") e = String(evalExpr(e) || "");
  else if (/[+\-×÷]/.test(k)) {
    if (!e) return;
    e = /[+\-×÷]$/.test(e) ? e.slice(0, -1) + k : e + k;
  } else {
    if (e.replace(/.*[+\-×÷]/, "").length >= 9) return; // 1つの数は9桁まで
    if ((k === "00" || k === "000") && !/\d$/.test(e)) return;
    e += k;
  }
  entry.expr = e;
  paintEntryAmt();
}

/* ---------- 描画 ---------- */
function renderEntry() {
  const el = $("kbSheet");
  const x = entry.d;
  const td = today(),
    yd = FIN.ds(new Date(FIN.pd(td).getTime() - 864e5));
  const other = x.date !== td && x.date !== yd;
  const memos = recentMemos(x.category, 8);
  const key = (k, cls = "") => `<button type="button" class="es-k ${cls}" data-ek="${k}">${k === "⌫" ? '<span aria-label="1文字消す">⌫</span>' : k}</button>`;
  el.innerHTML = `<div class="es-scrim" data-ex="1"></div>
  <div class="es" role="dialog" aria-modal="true" aria-label="${entry.mode === "add" ? "支出を記録" : "明細を編集"}">
    <div class="es-h"><b>${entry.mode === "add" ? "支出を記録" : "明細を編集"}</b><button type="button" class="es-x" data-ex="1" aria-label="閉じる">×</button></div>
    <div class="es-body">
      <div class="es-l">
        <div class="es-amt" id="esAmt"></div>
        <div class="es-pad">${["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", "00", "000"]
          .map(k => key(k === "−" ? "-" : k, /[C⌫]/.test(k) ? "fn" : /[÷×−+=]/.test(k) ? "op" : ""))
          .join("")
          .replace('data-ek="-">-', 'data-ek="-">−')}</div>
      </div>
      <div class="es-r">
        <div class="es-sec"><span class="es-lb">分類</span><div class="es-cats">${CATS.map(
          c => `<button type="button" class="es-c${x.category === c ? " on" : ""}" data-ecat="${esc(c)}" style="${hs(c)}"><span class="es-ce">${emo(c)}</span><span class="es-cn">${esc(c)}</span></button>`,
        ).join("")}</div></div>
        <div class="es-sec"><span class="es-lb">支払い方法</span><div class="es-mets">${METHODS.map(
          m => `<button type="button" class="es-m${x.method === m ? " on" : ""}" data-emet="${esc(m)}">${emo(m)} ${esc(m)}</button>`,
        ).join("")}</div></div>
        <div class="es-sec"><span class="es-lb">日付</span><div class="es-days">
          <button type="button" class="es-m${x.date === td ? " on" : ""}" data-edate="${td}">今日 <small>${md(td)}</small></button>
          <button type="button" class="es-m${x.date === yd ? " on" : ""}" data-edate="${yd}">昨日 <small>${md(yd)}</small></button>
          <label class="es-m es-other${other ? " on" : ""}">${other ? md(x.date) : "ほかの日"}<input type="date" id="esDate" value="${esc(x.date)}" aria-label="ほかの日を選ぶ"></label>
        </div></div>
        <div class="es-sec"><span class="es-lb">メモ</span><input type="text" id="esMemo" class="es-memo" value="${esc(x.memo || "")}" placeholder="何に使った？（お店・品物など）" autocomplete="off" enterkeyhint="done">
          ${memos.length ? `<div class="es-mcs">${memos.map(m => `<button type="button" class="es-mc${m === x.memo ? " on" : ""}" data-ememo="${esc(m)}">${esc(m)}</button>`).join("")}</div>` : ""}</div>
      </div>
    </div>
    <div class="es-f">${entry.mode === "edit" ? `<button type="button" class="es-del" data-edel="1">削除</button>` : ""}<button type="button" class="es-save" id="esSave" data-esave2="1"></button></div>
  </div>`;
  el.hidden = false;
  paintEntryAmt();
}
/* 金額の表示と、保存ボタンの文字（キーを押すたびに、ここだけ描き直す） */
function paintEntryAmt() {
  const a = entryAmt();
  const hasOp = /[+\-×÷]/.test(entry.expr);
  $("esAmt").innerHTML = `<span class="es-ae" aria-hidden="true">${emo(entry.d.category)}</span><span class="es-y">¥</span><b class="num${a ? "" : " zero"}">${a.toLocaleString("ja-JP")}</b>${hasOp ? `<small class="es-ex">${esc(entry.expr)}</small>` : ""}`;
  const b = $("esSave");
  b.disabled = !a;
  b.textContent = a ? `${entry.mode === "add" ? "記録する" : "保存する"}　${yen(a)}` : "金額を入れてください";
}

/* ---------- 保存・削除 ---------- */
function entrySave() {
  const a = entryAmt();
  if (!a || !entry.d.date) return;
  const memo = ($("esMemo")?.value || "").trim();
  const x = { ...entry.d, amount: a, memo };
  if (entry.mode === "edit") {
    const k = items.findIndex(i => i.id === entry.id);
    if (k >= 0) {
      snap();
      items[k] = { ...x, id: entry.id };
      learn(items[k]);
      save();
      toast("保存しました", true);
    }
  } else {
    const nw = runRules([{ ...x, id: uid() }]);
    items = items.concat(nw.out);
    nw.out.forEach(learn);
    save();
    toast(`${md(x.date)} に ${yen(a)} を記録しました${nw.changed ? "（ルールで変更）" : ""}`);
  }
  if (!inPeriod(x.date, view.month)) view.month = FIN.periodOf(x.date);
  closeEntry();
  render();
}

/* ---------- 操作 ---------- */
document.addEventListener("click", e => {
  const host = e.target.closest("#kbSheet");
  if (!host) return;
  const b = e.target.closest("[data-ek],[data-ex],[data-ecat],[data-emet],[data-edate],[data-ememo],[data-esave2],[data-edel]");
  if (!b) return;
  const d = b.dataset;
  e.stopPropagation();
  if (d.ek) entryKey(d.ek);
  else if (d.ex) closeEntry();
  else if (d.esave2) entrySave();
  else if (d.edel) {
    if (!arm("es-del", b, "もう一度押すと削除")) {
      const id = entry.id;
      closeEntry();
      deleteItem(id);
    }
  } else {
    entry.d.memo = ($("esMemo")?.value || "").trim();
    if (d.ecat) {
      entry.d.category = d.ecat;
      entry.catTouched = true;
    } else if (d.emet) entry.d.method = d.emet;
    else if (d.edate) entry.d.date = d.edate;
    else if (d.ememo) {
      entry.d.memo = d.ememo;
      /* メモの候補を選んだら、そのメモで前に使った分類にそろえる（自分で分類を選んでいなければ） */
      const prev = [...items].sort((a, c) => (a.date < c.date ? 1 : -1)).find(i => i.memo === d.ememo);
      if (prev && !entry.catTouched) entry.d.category = prev.category;
    }
    renderEntry();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "esDate" && e.target.value) {
    entry.d.memo = ($("esMemo")?.value || "").trim();
    entry.d.date = e.target.value;
    renderEntry();
  }
});
document.addEventListener("input", e => {
  if (e.target.id === "esMemo") entry.d.memo = e.target.value;
});
/* PC：キーボードでも金額を打てる（メモを書いているときは文字入力のまま） */
document.addEventListener("keydown", e => {
  if (!entry.open) return;
  if (e.key === "Escape") return closeEntry();
  const inMemo = e.target.id === "esMemo";
  if (e.key === "Enter") {
    if (inMemo) e.target.blur();
    else if (/[+\-×÷]/.test(entry.expr)) entryKey("=");
    else entrySave();
    e.preventDefault();
    return;
  }
  if (inMemo || e.target.matches("input,textarea,select")) return;
  const map = { "*": "×", "/": "÷", Backspace: "⌫", Delete: "C" };
  const k = map[e.key] || e.key;
  if (/^[0-9]$/.test(k) || ["+", "-", "×", "÷", "⌫", "C", "="].includes(k)) {
    entryKey(k);
    e.preventDefault();
  }
});
