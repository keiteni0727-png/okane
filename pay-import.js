/* ===================== Notionからの取り込み（支払いの履歴） =====================
  設定 → 支払い・返済の設定 → 「Notionから取り込む」で、Notionから書き出したCSVを選ぶ。
  ・支払済（Yes）で、今日までの行だけを取り込む（未来の予定・未払は取り込まない）
  ・サブカテゴリ（a_SMBCゴールド など）を口座に当てはめる。当てはまらない口座は、画面で選び直せる
  ・元金・利息・支払前残高をそのまま記録する。いまの残高は変えない（imported の印をつけ、残高に反映済みとしない）
  ・すでにアプリにある支払（同じ口座・近い日付・同じ金額）は二重に取り込まない
  列：支出,金額,カテゴリ,サブカテゴリ,支払日,支払方法,支払済,メモ,支払い対象,支払予定,元金,利息,支払前残高 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  const yen = v => (v == null || isNaN(v) ? "—" : "¥" + Math.round(v).toLocaleString("ja-JP"));
  const imp = { rows: null, map: {}, file: "" };

  /* ---------- CSV を読む（ダブルクォート・改行入りのセルに対応） ---------- */
  function parseCSV(text) {
    const out = [];
    let row = [],
      cell = "",
      q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        out.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (cell || row.length) {
      row.push(cell);
      out.push(row);
    }
    const head = out.shift() || [];
    return out.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, k) => [h.trim(), (r[k] || "").trim()])));
  }
  const money = s => {
    const v = String(s || "").replace(/[￥¥,\s円]/g, "");
    return v === "" || isNaN(v) ? null : Number(v);
  };
  const isoDate = s => {
    const m = String(s || "").match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  };
  const norm = s => String(s || "").replace(/^[a-z]_/i, "").replace(/[\s　（）()]/g, "").toLowerCase();
  /* 延滞の行の名前「エポス（9月）」「SMBC(11月)」から、元の名前と月を取り出す */
  const lateBase = s => String(s || "").replace(/\s*[（(].*$/, "").trim();
  const lateMonth = s => {
    const m = String(s || "").match(/[（(]\s*(\d{1,2})\s*月/);
    return m ? Number(m[1]) : null;
  };
  const subName = r => String(r["サブカテゴリ"] || "").replace(/^[a-z]_/i, "").trim();

  /* ---------- 取り込む行を作る ---------- */
  function build(rows) {
    const P = FIN.pay.imp;
    const today = FIN.today();
    const out = [];
    rows.forEach(r => {
      const date = isoDate(r["支払日"]);
      if (!date || date > today) return; // 未来分は取り込まない
      if (String(r["支払済"]).toLowerCase() !== "yes") return; // 支払った分だけ
      const amount = money(r["金額"]);
      if (!amount) return;
      const sub = subName(r);
      const cat = String(r["カテゴリ"] || "").replace(/^[a-z]_/i, "");
      out.push({
        date,
        name: String(r["支出"] || sub || "支払").trim(),
        amount,
        principal: money(r["元金"]),
        interest: money(r["利息"]),
        before: money(r["支払前残高"]),
        method: r["支払方法"] || "",
        memo: (r["メモ"] || "").replace(/\s*\n\s*/g, " / "),
        sub,
        late: cat === "延滞",
        catLabel: cat,
        /* 支払い対象 = No：その月は払わずに延滞にした請求（翌月の「○○（N月）」の延滞の行で払っている） */
        deferred: String(r["支払い対象"] || "").toLowerCase() === "no" && cat !== "延滞",
        base: lateBase(r["支出"]),
        billMonth: lateMonth(r["支出"]),
      });
    });
    return out;
  }
  /* サブカテゴリ → 口座（同じ名前の口座があれば自動で当てはめる） */
  function autoMap(list) {
    const accs = FIN.pay.imp.accList();
    const subs = [...new Set(list.map(x => x.sub).filter(Boolean))];
    subs.forEach(s => {
      if (imp.map[s] !== undefined) return;
      const hit = accs.find(a => norm(a.name) === norm(s)) || accs.find(a => norm(a.name).includes(norm(s)) || norm(s).includes(norm(a.name)));
      imp.map[s] = hit ? hit.id : "";
    });
    return subs;
  }
  /* すでにアプリにある支払と同じものか（同じ口座または同じ名前・前後3日・同じ金額） */
  function isDup(x, accId, existing) {
    const t = new Date(x.date).getTime();
    return existing.some(
      i =>
        Math.abs(new Date(i.date).getTime() - t) <= 3 * 864e5 &&
        Math.abs((i.amount || 0) - x.amount) < 1 &&
        ((accId && i.accountId === accId) || norm(i.name) === norm(x.name)),
    );
  }
  function plan() {
    const P = FIN.pay.imp;
    const existing = P.allItems();
    const list = build(imp.rows || []);
    /* 延滞の組み合わせ：延滞の行（○○（N月））ごとに、元の請求（支払い対象 No・同じ名前・それより前）を1つ探す */
    const used = new Set();
    list.forEach(x => {
      if (!x.late) return;
      const cand = list.filter(
        o => o.deferred && !used.has(o) && o.date < x.date && (norm(o.base) === norm(x.base) || norm(o.sub).includes(norm(x.base)) || norm(x.base).includes(norm(o.sub || o.base))),
      );
      const byMonth = cand.filter(o => x.billMonth && (Number(o.date.slice(5, 7)) === x.billMonth || Number(o.date.slice(5, 7)) === (x.billMonth % 12) + 1));
      const o = (byMonth.length ? byMonth : cand).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (o) {
        used.add(o);
        x.orig = o;
        o.lateRow = x;
        if (!x.sub) x.sub = o.sub; // 延滞の行は元の請求の口座で取り込む
      }
    });
    const subs = autoMap(list);
    let dup = 0,
      skip = 0;
    list.forEach(x => (x.id = FIN.pay.imp.uid() + Math.random().toString(36).slice(2, 5)));
    const items = [];
    list.forEach(x => {
      const accId = x.sub ? imp.map[x.sub] : "";
      if (accId === "skip") return skip++;
      if (isDup(x, accId, existing)) return dup++;
      const a = accId && P.S.accounts[accId];
      const src = x.orig || x; // 延滞の行は、元の請求の元金・利息・残高を使う
      const pr = src.principal,
        inr = src.interest;
      const other = pr != null && inr != null ? Math.max(0, src.amount - pr - inr) : null;
      x.id = x.id || P.uid();
      if (x.lateRow) x.lateRow.id = x.lateRow.id || P.uid();
      const fee = x.orig ? Math.max(0, x.amount - x.orig.amount) : 0;
      items.push({
        id: x.id,
        name: x.name,
        date: x.date,
        amount: x.amount,
        accountId: a ? accId : null,
        category: a ? a.category || "other" : x.late ? "other" : "other",
        method: x.method,
        /* 元の請求で延滞の行が見つかったもの＝「延滞→翌月へ」、延滞の行＝「延滞分」として支払済 */
        status: x.lateRow ? "deferred" : "paid",
        ...(x.lateRow ? { deferredTo: x.lateRow.id } : { paidDate: x.date }),
        kind: x.late ? "late" : "normal",
        ...(x.orig ? { origin: x.orig.id, dueDate: x.orig.date, lateFee: fee || null } : {}),
        principal: a ? pr : null,
        interest: a ? inr : null,
        other: a ? other : null,
        balanceBefore: a ? src.before : null,
        memo: x.memo,
        applied: false,
        imported: true, // 取り込んだ履歴：いまの残高には反映しない
        source: "notion",
      });
    });
    return { list, subs, items, dup, skip };
  }

  /* ---------- 画面 ---------- */
  function render() {
    const el = $("impBox");
    if (!el) return;
    if (!imp.rows) {
      el.innerHTML = `<label class="imp-drop"><input type="file" id="impFile" accept=".csv,text/csv"><b>CSVファイルを選ぶ</b><span>Notionのデータベースを「CSV」で書き出したファイル</span></label>`;
      return;
    }
    const P = FIN.pay.imp;
    const p = plan();
    const accs = P.accList();
    const opt = s =>
      `<select data-impmap="${esc(s)}"><option value="">口座なし（金額だけ記録）</option>${accs.map(a => `<option value="${a.id}"${imp.map[s] === a.id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}<option value="skip"${imp.map[s] === "skip" ? " selected" : ""}>取り込まない</option></select>`;
    const cnt = s => p.items.filter(i => p.list.find(x => x.date === i.date && x.name === i.name && x.sub === s)).length;
    const first = p.items.length ? p.items.reduce((m, i) => (i.date < m ? i.date : m), p.items[0].date) : null;
    const last = p.items.length ? p.items.reduce((m, i) => (i.date > m ? i.date : m), p.items[0].date) : null;
    el.innerHTML = `<div class="imp-sum"><b>${esc(imp.file)}</b>
      <div>取り込む支払 <b class="num">${p.items.length}件</b>${first ? `（${first.replace(/-/g, "/")}〜${last.replace(/-/g, "/")}）` : ""}・支払った合計 <b class="num">${yen(p.items.filter(i => i.status === "paid").reduce((t, i) => t + i.amount, 0))}</b></div>
      ${p.items.some(i => i.status === "deferred") ? `<div>うち延滞にして翌月に払った請求 <b class="num">${p.items.filter(i => i.status === "deferred").length}件</b>（翌月の「○○（N月）」の行と組み合わせ、延滞利息も記録します）</div>` : ""}
      <div class="mu">すでにアプリにある分 ${p.dup}件・取り込まない口座 ${p.skip}件は除きます。未来の分・未払の分は取り込みません。</div></div>
      <div class="imp-h">口座の当てはめ</div>
      <div class="imp-map">${p.subs.map(s => `<div class="imp-r"><span class="imp-s">${esc(s)}</span>${opt(s)}</div>`).join("")}</div>
      <div class="mu imp-note">元金・利息・支払前残高も記録し、返済の進み具合（借りた合計・増えた額・返した割合）と口座の履歴に反映します。いまの残高は変わりません。</div>
      <div class="row sp imp-acts"><button class="ghost" data-impcancel="1">やめる</button><button class="pri" data-impgo="1"${p.items.length ? "" : " disabled"}>${p.items.length}件を取り込む</button></div>`;
  }
  async function go() {
    const P = FIN.pay.imp;
    const p = plan();
    if (!p.items.length) return;
    const yms = [...new Set(p.items.map(i => i.date.slice(0, 7)))];
    const before = P.snapOf(yms, []);
    p.items.forEach(i => P.putItem(i));
    P.render();
    const ok = await P.saveMonths(yms);
    imp.rows = null;
    imp.map = {};
    render();
    U.toast(`${p.items.length}件の支払の履歴を取り込みました${ok ? "" : "（保存し直しを待っています）"}`, {
      undo: async () => {
        Object.entries(before.m).forEach(([ym, v]) => (P.S.months[ym] = v || { items: [] }));
        P.render();
        await P.saveMonths(yms);
      },
    });
  }

  document.addEventListener("change", async e => {
    if (e.target.id === "impFile" && e.target.files[0]) {
      const f = e.target.files[0];
      imp.file = f.name;
      imp.rows = parseCSV(await f.text());
      imp.map = {};
      render();
    } else if (e.target.dataset.impmap !== undefined) {
      imp.map[e.target.dataset.impmap] = e.target.value;
      render();
    }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-impgo],[data-impcancel]");
    if (!b) return;
    if (b.dataset.impgo) go();
    else {
      imp.rows = null;
      render();
    }
  });
  FIN.payImport = { render, parseCSV, build, plan, _imp: imp };
})();
