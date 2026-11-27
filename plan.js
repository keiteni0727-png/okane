/* ===================== 計画：返済のざっくり俯瞰と「この月・この口座に補填したら」 =====================
  支払い ＞ 計画。スプレッドシート（概要・一覧・月別返済計画）の代わり。
  ・上：手取り・毎月の返済・残るお金・すべて完済・利息の合計（補填ありなら、なしとの差も）
  ・表：月（行）× 口座（列）。マスに「その月の支払額」と「払った後の残高」。マスを押すと補填を入れられる
  ・補填は「その月だけ」か「その月から毎月」。保存は設定（config/master の plan）なので、PCとスマホで同じ
  計算は支払いの返済予定表（pay.js の schedule）と同じ。補填の分だけ、その月の元金に上乗せする */
(() => {
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  const yen = v => (v == null || isNaN(v) ? "—" : (v < 0 ? "-¥" : "¥") + Math.abs(Math.round(v)).toLocaleString("ja-JP"));
  const man = v => (Math.abs(v) >= 10000 ? (Math.round(v / 1000) / 10).toLocaleString("ja-JP") + "万" : yen(v));
  const ymLabel = ym => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;
  const ymShort = ym => `${Number(ym.slice(5))}月`;
  const st = { cell: null, amt: 10000, every: false };

  const P = () => FIN.pay.plan;
  const cfgPlan = () => {
    const c = P().S.cfg;
    return { extras: [], living: 0, ...(c.plan || {}) };
  };
  /* 補填：その口座・その月の上乗せ額（毎月の分も足す） */
  const extraFn = (extras, id) => ym =>
    extras.filter(x => x.acc === id && (x.every ? ym >= x.ym : ym === x.ym)).reduce((t, x) => t + (x.amt || 0), 0);

  /* ---------- 計算 ---------- */
  function project(extras) {
    const p = P();
    const accs = p
      .accList()
      .filter(a => a.active !== false && a.category !== "personal" && (a.balance || 0) > 0);
    const cols = accs.map(a => {
      if (p.isDebt(a)) {
        const s = p.schedule(a, extras ? { extra: extraFn(extras, a.id) } : {});
        const by = {};
        s.rows.forEach(r => {
          const ym = r.bm || r.date.slice(0, 7);
          const o = (by[ym] = by[ym] || { pay: 0, pr: 0, int: 0, after: r.after, before: r.before });
          o.pay += r.payment + (a.extra || 0);
          o.pr += r.principal;
          o.int += r.interest;
          o.after = r.after;
        });
        const last = s.rows[s.rows.length - 1];
        return { a, by, end: last && last.after === 0 ? (last.bm || last.date.slice(0, 7)) : null, int: s.rows.reduce((t, r) => t + r.interest, 0), stalled: s.stalled, debt: true };
      }
      /* 定額・利息なし（奨学金など）：残高がなくなるまで毎月同じ額 */
      const by = {};
      let bal = a.balance || 0,
        ym = p.nextStart().slice(0, 7);
      for (let n = 0; n < 600 && bal > 0; n++) {
        const pay = Math.min(bal, (a.payment || 0) + extraFn(extras || [], a.id)(ym));
        if (pay <= 0) break;
        by[ym] = { pay, pr: pay, int: 0, before: bal, after: bal - pay };
        bal -= pay;
        ym = FIN.addMonths(ym, 1);
      }
      return { a, by, end: bal <= 0 ? FIN.addMonths(ym, -1) : null, int: 0, debt: false };
    });
    /* 早く完済する口座から左に並べる */
    cols.sort((x, y) => (x.end || "9999") < (y.end || "9999") ? -1 : (x.end || "9999") > (y.end || "9999") ? 1 : 0);
    const months = [...new Set(cols.flatMap(c => Object.keys(c.by)))].sort();
    const last = cols.filter(c => c.debt).reduce((m, c) => (c.end && c.end > m ? c.end : m), "");
    return { cols, months, last: last || null, int: cols.reduce((t, c) => t + c.int, 0), stalled: cols.filter(c => c.stalled) };
  }

  /* ---------- 描画 ---------- */
  function render() {
    const el = $("planBox");
    if (!el) return;
    const p = P();
    const plan = cfgPlan();
    const base = project(null),
      now = project(plan.extras);
    const has = plan.extras.length > 0;
    const inc = p.S.cfg.income || 0;
    const m0 = now.months[0];
    const pay0 = m0 ? now.cols.reduce((t, c) => t + (c.by[m0]?.pay || 0), 0) : 0;
    const left0 = inc - pay0 - (plan.living || 0);
    const early = base.last && now.last ? monthsBetween(now.last, base.last) : 0;
    const saved = base.int - now.int;
    const kpi = (lb, v, s, cls = "") => `<div class="pl-k ${cls}"><span class="lb">${lb}</span><b class="num">${v}</b>${s ? `<span class="s">${s}</span>` : ""}</div>`;
    el.innerHTML = `
    <div class="pl-top">
      ${kpi("手取り（毎月）", yen(inc), `<button type="button" class="pl-lk" data-inc="${FIN.currentPeriod()}">変更</button>`)}
      ${kpi(`${m0 ? ymShort(m0) : ""}の返済`, yen(pay0), "家賃などあわせて引かれる額こみ")}
      ${kpi("残るお金", yen(left0), `生活費 <input type="number" inputmode="numeric" class="pl-liv num" id="plLiving" value="${plan.living || ""}" placeholder="0"> を引いた額`, left0 < 0 ? "neg" : "ok")}
      ${kpi("すべて完済", now.last ? ymLabel(now.last) : "見込みなし", has && early ? `<b class="pl-good">${early}ヶ月早く</b>（補填なし ${ymLabel(base.last)}）` : now.last ? `あと${monthsBetween(FIN.currentPeriod(), now.last)}ヶ月` : "", "main")}
      ${kpi("利息の合計", yen(now.int), has && saved > 0 ? `<b class="pl-good">${yen(saved)} 減る</b>（補填なし ${yen(base.int)}）` : "いまの条件のまま")}
    </div>
    ${now.stalled.length ? `<div class="warnbox">${now.stalled.map(c => esc(c.a.name)).join("・")} は返済額が利息以下のため、残高が減りません。</div>` : ""}
    <div class="pl-bar">
      <div class="pl-hint">マスを押すと、その月・その口座に<b>補填</b>（上乗せ）を入れて試せます</div>
      ${has ? `<div class="pl-ex">${plan.extras
        .map(x => {
          const c = now.cols.find(c => c.a.id === x.acc);
          return `<span class="pl-chip">${esc(c ? c.a.name : "口座")} ${ymShort(x.ym)}${x.every ? "から毎月" : ""} <b>+${man(x.amt)}</b><button type="button" data-pldel="${x.id}" aria-label="この補填を消す">×</button></span>`;
        })
        .join("")}<button type="button" class="pl-clr" data-plclear="1">補填をすべて消す</button></div>` : ""}
    </div>
    <div class="pl-wrap"><table class="pl-t">
      <thead><tr><th class="pl-m">月</th>${now.cols
        .map(c => {
          const b = base.cols.find(x => x.a.id === c.a.id);
          const e = b && b.end && c.end ? monthsBetween(c.end, b.end) : 0;
          return `<th><b>${esc(c.a.name)}</b><small>${yen(c.a.balance)}</small><small class="pl-end">${c.end ? `完済 ${c.end.slice(2, 4)}/${Number(c.end.slice(5))}` : c.debt ? "完済なし" : ""}${e > 0 ? ` <em>−${e}ヶ月</em>` : ""}</small></th>`;
        })
        .join("")}<th class="pl-sum">返済の合計</th><th class="pl-sum">残るお金</th></tr></thead>
      <tbody>${now.months
        .map((ym, k) => {
          const tot = now.cols.reduce((t, c) => t + (c.by[ym]?.pay || 0), 0);
          const left = inc - tot - (plan.living || 0);
          const yr = k === 0 || ym.endsWith("-01");
          return `${yr ? `<tr class="pl-yr"><td colspan="${now.cols.length + 3}">${ym.slice(0, 4)}年</td></tr>` : ""}<tr><td class="pl-m">${ymShort(ym)}</td>${now.cols
            .map(c => {
              const v = c.by[ym];
              if (!v) return `<td class="pl-done"></td>`;
              const ex = extraFn(plan.extras, c.a.id)(ym);
              const fin = v.after === 0;
              return `<td class="pl-c${ex ? " ex" : ""}${fin ? " fin" : ""}" data-plc="${c.a.id}|${ym}" role="button" tabindex="0"><b class="num">${man(v.pay)}</b><small class="num">${fin ? "完済🎉" : `残 ${man(v.after)}`}</small>${ex ? `<em>+${man(ex)}</em>` : ""}</td>`;
            })
            .join("")}<td class="pl-sum num">${man(tot)}</td><td class="pl-sum num ${left < 0 ? "neg" : "ok"}">${man(left)}</td></tr>`;
        })
        .join("")}</tbody></table></div>
    <div class="mu pl-note">利息は 残高 × 年利 × 前月の日数 ÷ 365。今期の登録済みの支払は、そのまま使っています。残るお金＝手取り − 返済の合計 − 生活費。</div>`;
  }
  function monthsBetween(a, b) {
    return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  }

  /* ---------- 補填を入れるシート ---------- */
  function openCell(id, ym) {
    st.cell = { id, ym };
    const ex = cfgPlan().extras.find(x => x.acc === id && x.ym === ym);
    st.amt = ex ? ex.amt : 10000;
    st.every = ex ? !!ex.every : false;
    paintCell();
  }
  function paintCell() {
    const host = $("planSheet");
    if (!st.cell) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    const { id, ym } = st.cell;
    const plan = cfgPlan();
    const others = plan.extras.filter(x => !(x.acc === id && x.ym === ym));
    const trial = st.amt > 0 ? [...others, { id: "t", acc: id, ym, amt: st.amt, every: st.every }] : others;
    const before = project(others),
      after = project(trial);
    const cb = before.cols.find(c => c.a.id === id),
      ca = after.cols.find(c => c.a.id === id);
    const v = cb?.by[ym];
    const early = cb?.end && ca?.end ? monthsBetween(ca.end, cb.end) : 0;
    const saved = (cb?.int || 0) - (ca?.int || 0);
    const allEarly = before.last && after.last ? monthsBetween(after.last, before.last) : 0;
    host.innerHTML = `<div class="pls-scrim" data-plclose="1"></div><div class="pls" role="dialog" aria-label="補填">
      <div class="pls-h"><b>${esc(cb?.a.name || "")}・${ymLabel(ym)}</b><button type="button" class="pls-x" data-plclose="1" aria-label="閉じる">×</button></div>
      ${v ? `<div class="pls-cur"><span>この月の支払 <b class="num">${yen(v.pay)}</b></span><span>支払前の残高 <b class="num">${yen(v.before)}</b></span></div>` : ""}
      <label class="pls-lb">補填する額（元金に上乗せ）</label>
      <div class="pls-in"><span>¥</span><input type="number" inputmode="numeric" id="plAmt" class="num" value="${st.amt || ""}" placeholder="0"></div>
      <div class="pls-q">${[[5000, "5千"], [10000, "1万"], [30000, "3万"], [50000, "5万"], [100000, "10万"]].map(([n, l]) => `<button type="button" data-plq="${n}"${st.amt === n ? ' aria-pressed="true"' : ""}>${l}</button>`).join("")}${v ? `<button type="button" data-plq="${v.before}">全額</button>` : ""}</div>
      <div class="pls-seg" role="group"><button type="button" data-plev="0" aria-pressed="${!st.every}">この月だけ</button><button type="button" data-plev="1" aria-pressed="${st.every}">この月から毎月</button></div>
      <div class="pls-eff">${st.amt > 0
        ? `<div><span>${esc(cb?.a.name || "")}の完済</span><b>${ca?.end ? ymLabel(ca.end) : "—"}</b>${early > 0 ? `<em>${early}ヶ月早く</em>` : ""}</div>
           <div><span>減る利息</span><b class="num">${yen(saved)}</b></div>
           <div><span>すべて完済</span><b>${after.last ? ymLabel(after.last) : "—"}</b>${allEarly > 0 ? `<em>${allEarly}ヶ月早く</em>` : ""}</div>`
        : `<div class="mu">額を入れると、完済がどれだけ早まるか出ます</div>`}</div>
      <div class="pls-f">${plan.extras.some(x => x.acc === id && x.ym === ym) ? `<button type="button" class="ghost" data-pldelcell="1">補填を消す</button>` : "<span></span>"}<button type="button" class="pri" data-plsave="1"${st.amt > 0 ? "" : " disabled"}>この補填で計画する</button></div>
      <div class="pls-f2"><button type="button" class="ghost sm" data-pladd="1"${st.amt > 0 ? "" : " disabled"}>支払予定に「繰上げ返済」として追加</button></div>
    </div>`;
    host.hidden = false;
  }
  async function savePlan(extras, living) {
    const p = P();
    const cur = cfgPlan();
    p.S.cfg.plan = { extras, living: living ?? cur.living };
    render();
    await p.saveCfg();
  }
  /* 補填を実際の支払予定にする（その月の口座の支払日に、元金だけの「繰上げ返済」を足す） */
  async function addToSchedule() {
    const p = P();
    const { id, ym } = st.cell;
    const a = p.S.accounts[id];
    if (!a || !(st.amt > 0)) return;
    const [y, m] = ym.split("-").map(Number);
    const day = Math.min(a.payDay || 27, new Date(y, m, 0).getDate());
    const it = {
      id: p.uid(),
      name: `${a.name} 繰上げ返済`,
      accountId: id,
      category: a.category,
      kind: "normal",
      amount: st.amt,
      principal: st.amt,
      interest: 0,
      date: `${ym}-${String(day).padStart(2, "0")}`,
      method: a.method || "振込",
      status: "planned",
      memo: "繰上げ返済",
      applied: false,
      source: "plan",
    };
    const sm = p.putItem(it);
    st.cell = null;
    paintCell();
    p.render();
    p.toast(`${esc(a.name)}に ${yen(st.amt)} の繰上げ返済を ${ymLabel(ym)} の支払予定に追加しました`);
    await p.saveMonth(sm);
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-plc],[data-plclose],[data-plq],[data-plev],[data-plsave],[data-pldelcell],[data-pldel],[data-plclear],[data-pladd]");
    if (!t) return;
    const d = t.dataset;
    const plan = cfgPlan();
    if (d.plc) {
      const [id, ym] = d.plc.split("|");
      openCell(id, ym);
    } else if (d.plclose) {
      st.cell = null;
      paintCell();
    } else if (d.plq) {
      st.amt = Number(d.plq);
      paintCell();
    } else if (d.plev) {
      st.every = d.plev === "1";
      paintCell();
    } else if (d.plsave) {
      const { id, ym } = st.cell;
      const rest = plan.extras.filter(x => !(x.acc === id && x.ym === ym));
      st.cell = null;
      paintCell();
      savePlan([...rest, { id: "x" + Date.now().toString(36), acc: id, ym, amt: st.amt, every: st.every }]);
    } else if (d.pldelcell) {
      const { id, ym } = st.cell;
      st.cell = null;
      paintCell();
      savePlan(plan.extras.filter(x => !(x.acc === id && x.ym === ym)));
    } else if (d.pldel) savePlan(plan.extras.filter(x => x.id !== d.pldel));
    else if (d.plclear) savePlan([]);
    else if (d.pladd) addToSchedule();
  });
  document.addEventListener("input", e => {
    if (e.target.id === "plAmt") {
      st.amt = Math.max(0, Number(e.target.value) || 0);
      clearTimeout(st.t);
      /* 打っている途中は入力欄を作り直さない（効果の欄だけ少し待って描き直す） */
      st.t = setTimeout(() => {
        const pos = e.target.selectionStart;
        paintCell();
        const n = $("plAmt");
        if (n) {
          n.focus();
          try {
            n.setSelectionRange(pos, pos);
          } catch (_) {}
        }
      }, 350);
    }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "plLiving") savePlan(cfgPlan().extras, Math.max(0, Number(e.target.value) || 0));
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && st.cell) {
      st.cell = null;
      paintCell();
    }
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-plc]")) e.target.click();
  });
  FIN.plan = { render, project };
})();
