/* ===================== 計画：返済のざっくり俯瞰と「この月・この借入先に補填したら」 =====================
  支払い ＞ 計画。スプレッドシート（概要・一覧・月別返済計画）の代わり。
  ・上：手取り・毎月の返済・残るお金・すべて完済・利息の合計（補填ありなら、なしとの差も）
  ・表：月（行）× 借入先（列）。マスに「その月の支払額」と「払った後の残高」。マスを押すと補填を入れられる
  ・補填は「その月だけ」か「その月から毎月」。保存は設定（config/master の plan）なので、PCとスマホで同じ
  計算は支払いの返済予定表（pay.js の schedule）と同じ。補填の分だけ、その月の元金に上乗せする */
(() => {
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  const yen = v => (v == null || isNaN(v) ? "—" : (v < 0 ? "-¥" : "¥") + Math.abs(Math.round(v)).toLocaleString("ja-JP"));
  const man = v => (Math.abs(v) >= 10000 ? (Math.round(v / 1000) / 10).toLocaleString("ja-JP") + "万" : yen(v));
  const ymLabel = ym => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;
  const ymShort = ym => `${Number(ym.slice(5))}月`;
  const st = { cell: null, amt: 10000, every: false, acc: null, ym: null, tbl: false };

  const P = () => FIN.pay.plan;
  const cfgPlan = () => {
    const c = P().S.cfg;
    return { extras: [], living: 0, ...(c.plan || {}) };
  };
  /* 補填：その借入先・その月の上乗せ額（毎月の分も足す） */
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
    /* 早く完済する借入先から左に並べる */
    cols.sort((x, y) => (x.end || "9999") < (y.end || "9999") ? -1 : (x.end || "9999") > (y.end || "9999") ? 1 : 0);
    const months = [...new Set(cols.flatMap(c => Object.keys(c.by)))].sort();
    const last = cols.filter(c => c.debt).reduce((m, c) => (c.end && c.end > m ? c.end : m), "");
    return { cols, months, last: last || null, int: cols.reduce((t, c) => t + c.int, 0), stalled: cols.filter(c => c.stalled) };
  }

  /* ---------- 描画 ---------- */
  /* ---------- 描画（アプリらしく：結果を大きく・その場で補填をためす・グラフと完済の帯・表はたたむ） ---------- */
  const COL = { card: "var(--c-card)", loan: "var(--c-loan)", other: "var(--c-other)", personal: "var(--c-personal)" };
  function render() {
    const el = $("planBox");
    if (!el) return;
    const p = P();
    const plan = cfgPlan();
    const base = project(null),
      now = project(plan.extras);
    const has = plan.extras.length > 0;
    const inc = p.S.cfg.income || 0;
    const early = base.last && now.last ? monthsBetween(now.last, base.last) : 0;
    const saved = base.int - now.int;
    const debts = now.cols.filter(c => c.debt);
    if (!st.acc || !debts.find(c => c.a.id === st.acc)) st.acc = (debts.slice().sort((x, y) => (y.a.rate || 0) - (x.a.rate || 0))[0] || {}).a?.id || null;
    if (!st.ym) st.ym = now.months[0] || FIN.currentPeriod();
    el.innerHTML = `
    <div class="pv-hero">
      <span class="pv-eb">${has ? "補填を入れた計画" : "いまの条件のまま"}</span>
      <div class="pv-big"><span>すべて完済</span><b>${now.last ? ymLabel(now.last) : "見込みなし"}</b>${now.last ? `<span>あと${now.months.filter(m => m <= now.last).length}ヶ月</span>` : ""}</div>
      <div class="pv-res">
        <div><span>早まる</span><b class="num">${has && early > 0 ? `${early}ヶ月` : has ? "0ヶ月" : '<small>補填すると出ます</small>'}</b></div>
        <div><span>減る利息</span><b class="num">${has && saved > 0 ? yen(saved) : has ? "¥0" : '<small>補填すると出ます</small>'}</b></div>
        <div><span>利息の合計</span><b class="num">${yen(now.int)}</b></div>
      </div>
      ${has ? `<div class="pv-ex">${plan.extras
        .map(x => {
          const c = now.cols.find(c => c.a.id === x.acc);
          return `<span class="pv-chip">${esc(c ? c.a.name : "借入先")}・${ymShort(x.ym)}${x.every ? "から毎月" : ""} <b>+${man(x.amt)}</b><button type="button" data-pldel="${x.id}" aria-label="この補填を消す">×</button></span>`;
        })
        .join("")}<button type="button" class="pv-clr" data-plclear="1">すべて消す</button></div>` : ""}
    </div>
    ${now.stalled.length ? `<div class="warnbox">${now.stalled.map(c => esc(c.a.name)).join("・")} は返済額が利息以下のため、残高が減りません。</div>` : ""}
    <nav class="pv-tabs" aria-label="計画の画面">${[["sum", "見通し"], ["mon", "月ごと・補填"], ["drop", "毎月の返済"]].map(([k, l]) => `<button type="button" data-pvtab="${k}" aria-current="${(st.ptab || "sum") === k ? "page" : "false"}">${l}</button>`).join("")}</nav>
    ${(() => {
      let tab = st.ptab || "sum";
      if (tab === "try" || tab === "tbl") tab = st.ptab = "mon";
      if (tab === "mon") return monthHTML(base, now, plan, inc, has);
      if (tab === "try") return `<div class="pv-one"><div class="panel pv-try" id="pvTry">${tryHTML(plan, now)}</div><div class="panel pv-tl"><div class="panel-h"><h2>借入先ごとの完済</h2><span class="note">補填で縮んだ分はうすい緑</span></div>${timelineHTML(base, now, has)}</div></div>`;
      if (tab === "drop") return `<div class="pv-one"><div class="panel pv-drop"><div class="panel-h"><h2>毎月の返済が軽くなる月</h2><span class="note">手取り ${yen(inc)}<button type="button" class="pv-lk" data-inc="${FIN.currentPeriod()}">変更</button></span></div>${dropHTML(now, inc, plan)}</div>${outlookMini(now)}</div>`;
      if (tab === "tbl") return `<div class="panel pv-tbl">${tableHTML(base, now, plan, inc)}</div>`;
      return `<div class="pv-two"><div class="panel pv-chart"><div class="panel-h"><h2>借金の残高の減り方</h2><span class="note">${has ? '<i class="lg base"></i>補填なし <i class="lg now"></i>補填あり' : "いまの条件のまま"}</span></div>${chartSVG(base, now, has)}</div><div class="panel pv-tl"><div class="panel-h"><h2>借入先ごとの完済</h2><span class="note">早い順</span></div>${timelineHTML(base, now, has)}</div></div>`;
    })()}
    <div class="mu pl-note">計算は支払いの返済予定表と同じ（利息＝残高×年利×前月の日数÷365）。補填は、その月の元金に上乗せします。</div>`;
  }
  /* ---------- 月ごと・補填：月をえらぶ → その月に残るお金 → 借入先を押して補填 ---------- */
  function monthHTML(base, now, plan, inc, has) {
    const ms = now.months;
    if (!ms.length) return `<div class="panel"><div class="empty">返済中の借入先はありません</div></div>`;
    if (!st.ym || !ms.includes(st.ym)) st.ym = ms[0];
    const ym = st.ym,
      k = ms.indexOf(ym);
    const tot = m => now.cols.reduce((t, c) => t + (c.by[m]?.pay || 0), 0);
    const exOf = m => plan.extras.reduce((t, x) => t + extraFn([x], x.acc)(m), 0);
    const leftOf = m => inc - tot(m) - (plan.living || 0);
    /* PC：左に月の一覧（返済の合計・残る・補填の印） */
    let yr = "";
    const list = ms
      .map(m => {
        const h = m.slice(0, 4) !== yr ? `<div class="pm-yr">${(yr = m.slice(0, 4))}年</div>` : "";
        const lf = leftOf(m),
          ex = exOf(m);
        return `${h}<button type="button" class="pm-li${m === ym ? " on" : ""}" data-pmym="${m}"><span class="pm-m">${ymShort(m)}</span><span class="pm-p num">${man(tot(m))}</span><span class="pm-l num ${lf < 0 ? "ng" : ""}">残 ${man(lf)}</span>${ex ? `<em>+${man(ex)}</em>` : "<i></i>"}</button>`;
      })
      .join("");
    const T = tot(ym),
      EX = exOf(ym),
      L = leftOf(ym);
    const rows = now.cols
      .filter(c => c.by[ym])
      .sort((x, y) => (y.a.rate || 0) - (x.a.rate || 0));
    const topRate = rows[0] && rows[0].a.rate;
    const rowHTML = c => {
      const v = c.by[ym];
      const ex = extraFn(plan.extras, c.a.id)(ym);
      const open = st.oacc === c.a.id;
      return `<div class="pm-acc${open ? " open" : ""}">
        <button type="button" class="pm-ah" data-pmacc="${c.a.id}">
          <span class="pm-an"><b>${esc(c.a.name)}</b><small>${c.a.rate ? `年${c.a.rate}%` : "利息なし"}${c.a.rate && c.a.rate === topRate ? '<em class="pm-hi">利息が高い</em>' : ""}</small></span>
          <span class="pm-av num"><b>${yen(v.pay)}</b><small>残高 ${man(v.after)}${c.end ? `・完済 ${c.end.slice(2, 4)}/${Number(c.end.slice(5))}` : ""}</small></span>
          ${ex ? `<span class="pm-ex num">+${man(ex)}</span>` : `<span class="pm-add">補填 ＋</span>`}
        </button>
        ${open ? editHTML(c, v, plan, L + ex) : ""}
      </div>`;
    };
    const detail = `<div class="panel pm-d" id="pvTry">
      <div class="pm-nav"><button type="button" data-pmstep="-1"${k <= 0 ? " disabled" : ""} aria-label="前の月">‹</button><b>${ymLabel(ym)}</b><button type="button" data-pmstep="1"${k >= ms.length - 1 ? " disabled" : ""} aria-label="次の月">›</button></div>
      <div class="pm-money">
        <div><span>手取り</span><b class="num">${yen(inc)}</b></div>
        <div><span>− 返済${EX ? `（補填 ${man(EX)} こみ）` : ""}</span><b class="num">${yen(T)}</b></div>
        ${plan.living ? `<div><span>− 生活費</span><b class="num">${yen(plan.living)}</b></div>` : ""}
        <div class="pm-left ${L < 0 ? "ng" : ""}"><span>この月に残るお金</span><b class="num">${yen(L)}</b></div>
      </div>
      <div class="pm-lh">借入先<span>押すと補填を入れられます</span></div>
      <div class="pm-accs">${rows.map(rowHTML).join("")}</div>
    </div>`;
    return `<div class="pm">
      <div class="panel pm-list">${list}</div>
      ${detail}
    </div>
    <details class="panel pv-tbl pm-tbl"${st.tbl ? " open" : ""}><summary>借入先 × 月の表で見る</summary>${tableHTML(base, now, plan, inc)}</details>`;
  }
  /* 借入先の行を開いたところ：額・この月だけ／毎月・効果・計画に入れる */
  function editHTML(c, v, plan, room) {
    const id = c.a.id,
      ym = st.ym;
    st.acc = id;
    const others = plan.extras.filter(x => !(x.acc === id && x.ym === ym));
    const trial = st.amt > 0 ? [...others, { id: "t", acc: id, ym, amt: st.amt, every: st.every }] : others;
    const b = project(others),
      a = project(trial);
    const cb = b.cols.find(x => x.a.id === id),
      ca = a.cols.find(x => x.a.id === id);
    const e1 = cb?.end && ca?.end ? monthsBetween(ca.end, cb.end) : 0;
    const e2 = b.last && a.last ? monthsBetween(a.last, b.last) : 0;
    const sv = (cb?.int || 0) - (ca?.int || 0);
    const exist = plan.extras.find(x => x.acc === id && x.ym === ym);
    const q = [
      [10000, "1万"],
      [30000, "3万"],
      [50000, "5万"],
      ...(room > 0 ? [[Math.floor(room / 2000) * 1000, "残りの半分"], [Math.floor(room / 1000) * 1000, "残り全部"]] : []),
    ].filter(([n]) => n > 0);
    return `<div class="pm-ed">
      <div class="pm-in"><span>¥</span><input type="number" inputmode="numeric" id="plAmt" class="num" value="${st.amt || ""}" placeholder="0"></div>
      <div class="pm-q">${q.map(([n, l]) => `<button type="button" data-plq="${n}"${st.amt === n ? ' aria-pressed="true"' : ""}>${l}<small>${n >= 10000 && !/万/.test(l) ? man(n) : ""}</small></button>`).join("")}</div>
      <div class="pm-seg"><button type="button" data-plev="0" aria-pressed="${!st.every}">この月だけ</button><button type="button" data-plev="1" aria-pressed="${st.every}">この月から毎月</button></div>
      <div class="pm-eff${st.amt > 0 ? "" : " off"}">${st.amt > 0 ? `<span><b>${e1 > 0 ? `${e1}ヶ月` : "—"}</b>早く完済</span><span><b>${sv > 0 ? man(sv) : "—"}</b>利息が減る</span><span><b>${e2 > 0 ? `${e2}ヶ月` : "—"}</b>すべて早く</span>` : "額を入れると効果が出ます"}</div>
      ${st.amt > room && room >= 0 ? `<div class="pm-warn">この月に残るお金（${yen(room)}）より多いです</div>` : ""}
      <div class="pm-f">${exist ? `<button type="button" class="ghost" data-pldelcur="1">消す</button>` : ""}<button type="button" class="pri" data-plsave="1"${st.amt > 0 ? "" : " disabled"}>計画に入れる</button></div>
      <button type="button" class="pm-sch" data-pladd="1"${st.amt > 0 ? "" : " disabled"}>支払予定に「繰上げ返済」として追加</button>
    </div>`;
  }
  /* 返済の「完済の見通し」から移した数字：1年後の残高・毎月の利息 */
  function outlookMini(now) {
    const ms = now.months;
    const debts = now.cols.filter(c => c.debt);
    const at = ym => debts.reduce((t, c) => {
      const ks = Object.keys(c.by).sort();
      if (c.by[ym]) return t + c.by[ym].after;
      return t + (ym < ks[0] ? c.a.balance : 0);
    }, 0);
    const nowBal = debts.reduce((t, c) => t + (c.a.balance || 0), 0);
    const y1 = ms[11] ? at(ms[11]) : 0;
    const m1 = ms[1] || ms[0];
    const int = m1 ? debts.reduce((t, c) => t + (c.by[m1]?.int || 0), 0) : 0;
    const pay = m1 ? debts.reduce((t, c) => t + (c.by[m1]?.pay || 0), 0) : 0;
    return `<div class="panel pv-ol"><div class="pv-olg">
      <div><span>いまの残高</span><b class="num">${man(nowBal)}</b></div>
      <div><span>1年後の残高</span><b class="num">${man(y1)}</b><small class="ok">−${man(nowBal - y1)}</small></div>
      <div><span>毎月の利息</span><b class="num">${yen(int)}</b><small>返済の${pay ? Math.round((int / pay) * 100) : 0}%</small></div>
    </div></div>`;
  }
  /* 補填をためす：借入先・月・額をえらぶと、その場で効果が出る */
  function tryHTML(plan, now) {
    const debts = now.cols.filter(c => c.debt || c.a.repayType === "none");
    const c = debts.find(x => x.a.id === st.acc) || debts[0];
    if (!c) return `<div class="empty">返済中の借入先はありません</div>`;
    const months = Object.keys(c.by).sort();
    if (!c.by[st.ym]) st.ym = months.find(m => m >= st.ym) || months[0];
    const others = plan.extras.filter(x => !(x.acc === c.a.id && x.ym === st.ym));
    const trial = st.amt > 0 ? [...others, { id: "t", acc: c.a.id, ym: st.ym, amt: st.amt, every: st.every }] : others;
    const b = project(others),
      a = project(trial);
    const cb = b.cols.find(x => x.a.id === c.a.id),
      ca = a.cols.find(x => x.a.id === c.a.id);
    const v = cb?.by[st.ym];
    const e1 = cb?.end && ca?.end ? monthsBetween(ca.end, cb.end) : 0;
    const e2 = b.last && a.last ? monthsBetween(a.last, b.last) : 0;
    const sv = (cb?.int || 0) - (ca?.int || 0);
    const k = months.indexOf(st.ym);
    const exist = plan.extras.find(x => x.acc === c.a.id && x.ym === st.ym);
    const top = now.cols.filter(x => x.debt).sort((x, y) => (y.a.rate || 0) - (x.a.rate || 0))[0];
    return `<div class="panel-h"><h2>補填をためす</h2><span class="note">どこに入れると効くか</span></div>
      <div class="pt-body">
        <div class="pt-lb">借入先</div>
        <div class="pt-accs">${debts
          .map(x => `<button type="button" class="pt-acc${x.a.id === c.a.id ? " on" : ""}" data-placc="${x.a.id}" style="--ac:${COL[x.a.category] || COL.other}"><b>${esc(x.a.name)}</b><small>${x.a.rate ? `年${x.a.rate}%` : "利息なし"}・${man(x.a.balance)}</small>${top && x.a.id === top.a.id ? '<em>利息が高い</em>' : ""}</button>`)
          .join("")}</div>
        <div class="pt-row"><div class="pt-lb">月</div><div class="pt-mon"><button type="button" data-plmon="-1"${k <= 0 ? " disabled" : ""} aria-label="前の月">‹</button><b>${ymLabel(st.ym)}</b><button type="button" data-plmon="1"${k >= months.length - 1 ? " disabled" : ""} aria-label="次の月">›</button></div></div>
        ${v ? `<div class="pt-cur">この月の支払 <b class="num">${yen(v.pay)}</b>・支払前の残高 <b class="num">${yen(v.before)}</b></div>` : ""}
        <div class="pt-lb">補填する額</div>
        <div class="pt-amt"><span>¥</span><input type="number" inputmode="numeric" id="plAmt" class="num" value="${st.amt || ""}" placeholder="0"></div>
        <div class="pls-q pt-q">${[[5000, "5千"], [10000, "1万"], [30000, "3万"], [50000, "5万"], [100000, "10万"]].map(([n, l]) => `<button type="button" data-plq="${n}"${st.amt === n ? ' aria-pressed="true"' : ""}>${l}</button>`).join("")}${v ? `<button type="button" data-plq="${v.before}"${st.amt === v.before ? ' aria-pressed="true"' : ""}>全額</button>` : ""}</div>
        <div class="pls-seg"><button type="button" data-plev="0" aria-pressed="${!st.every}">この月だけ</button><button type="button" data-plev="1" aria-pressed="${st.every}">この月から毎月</button></div>
        <div class="pt-eff${st.amt > 0 ? "" : " off"}">
          <div><b class="num">${st.amt > 0 && e1 > 0 ? `${e1}ヶ月` : "—"}</b><span>${esc(c.a.name)}が早く完済</span></div>
          <div><b class="num">${st.amt > 0 && sv > 0 ? man(sv) : "—"}</b><span>減る利息</span></div>
          <div><b class="num">${st.amt > 0 && e2 > 0 ? `${e2}ヶ月` : "—"}</b><span>すべての完済が早く</span></div>
        </div>
        <div class="pt-f">${exist ? `<button type="button" class="ghost" data-pldelcur="1">この補填を消す</button>` : ""}<button type="button" class="pri" data-plsave="1"${st.amt > 0 ? "" : " disabled"}>計画に入れる</button></div>
        <button type="button" class="pt-add" data-pladd="1"${st.amt > 0 ? "" : " disabled"}>支払予定に「繰上げ返済」として追加する</button>
      </div>`;
  }
  /* 残高のグラフ：合計の残高（補填なし＝点線・補填あり＝線）と、借入先の完済の印 */
  function chartSVG(base, now, has) {
    const sum = pj => {
      const m = {};
      pj.months.forEach(ym => (m[ym] = pj.cols.filter(c => c.debt).reduce((t, c) => {
        const ks = Object.keys(c.by).sort();
        if (c.by[ym]) return t + c.by[ym].after;
        return t + (ym < ks[0] ? c.a.balance : 0);
      }, 0)));
      return m;
    };
    const endAll = [base.last, now.last].filter(Boolean).sort().pop();
    const months = (base.months.length >= now.months.length ? base.months : now.months).filter(ym => !endAll || ym <= FIN.addMonths(endAll, 1));
    if (months.length < 2) return `<div class="empty">返済中の借入先はありません</div>`;
    const sb = sum(base),
      sn = sum(now);
    const W = 640, H = 220, L = 46, R = 12, T = 12, B = 26;
    const max = Math.max(...Object.values(sb), ...Object.values(sn), 1);
    const x = i => L + ((W - L - R) * i) / (months.length - 1);
    const y = v => T + (H - T - B) * (1 - v / max);
    const path = m => months.map((ym, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[ym] ?? 0).toFixed(1)}`).join("");
    const ticks = [0, 0.5, 1].map(f => max * f);
    const yrs = months.map((ym, i) => [ym, i]).filter(([ym], i) => ym.endsWith("-01") || (i === 0 && months.findIndex(m => m.endsWith("-01")) > 4));
    const ends = now.cols.filter(c => c.debt && c.end).map(c => [c, months.indexOf(c.end)]).filter(([, i]) => i >= 0);
    return `<svg class="pv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="借金の残高の減り方">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 6}" y="${y(v) + 4}" class="ty">${man(v)}</text>`).join("")}
      ${yrs.map(([ym, i]) => `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" class="g v"/><text x="${x(i) + 3}" y="${H - 8}" class="tx">${ym.slice(0, 4)}</text>`).join("")}
      <path d="${path(sn)}L${x(months.length - 1)},${y(0)}L${x(0)},${y(0)}Z" class="ar"/>
      ${has ? `<path d="${path(sb)}" class="ln base"/>` : ""}
      <path d="${path(sn)}" class="ln now"/>
      ${ends.map(([c, i]) => `<circle cx="${x(i)}" cy="${y(sn[months[i]] ?? 0)}" r="4" class="dot"/><title>${esc(c.a.name)} 完済 ${ymLabel(c.end)}</title>`).join("")}
    </svg>`;
  }
  /* 借入先ごとの完済：いまから完済までの帯。補填で縮んだ分はうすく出す */
  function timelineHTML(base, now, has) {
    const cols = now.cols.filter(c => c.debt);
    if (!cols.length) return `<div class="empty">返済中の借入先はありません</div>`;
    const start = FIN.currentPeriod();
    const lastB = base.last || now.last;
    const span = Math.max(1, monthsBetween(start, lastB));
    return `<div class="pv-tlw">${cols
      .map(c => {
        const b = base.cols.find(x => x.a.id === c.a.id);
        const n1 = c.end ? monthsBetween(start, c.end) : span,
          n0 = b && b.end ? monthsBetween(start, b.end) : span;
        const e = has ? n0 - n1 : 0;
        return `<div class="pv-tr"><span class="pv-tn">${esc(c.a.name)}</span><span class="pv-tb"><i class="b0" style="width:${(n0 / span) * 100}%"></i><i class="b1" style="width:${(n1 / span) * 100}%;--ac:${COL[c.a.category] || COL.other}"></i></span><span class="pv-te">${c.end ? `${c.end.slice(0, 4)}/${Number(c.end.slice(5))}` : "—"}${e > 0 ? `<em>−${e}ヶ月</em>` : ""}</span></div>`;
      })
      .join("")}</div>`;
  }
  /* 毎月の返済が軽くなる月：借入先を完済した次の月から、毎月の返済がいくら減るか */
  function dropHTML(now, inc, plan) {
    const ms = now.months;
    if (!ms.length) return `<div class="empty">—</div>`;
    const tot = ym => now.cols.reduce((t, c) => t + (c.by[ym]?.pay || 0), 0);
    const rows = [];
    now.cols
      .filter(c => c.end)
      .sort((a, b) => (a.end < b.end ? -1 : 1))
      .forEach(c => {
        const nx = FIN.addMonths(c.end, 1);
        if (!ms.includes(nx)) return;
        const reg = c.by[FIN.addMonths(c.end, -1)]?.pay || c.by[c.end].pay;
        rows.push({ ym: nx, name: c.a.name, pay: tot(nx), drop: reg });
      });
    const first = tot(ms[0]); // 月ごとの表と同じく、今月から数える
    const left = v => inc - v - (plan.living || 0);
    return `<div class="pv-dl">
      <div class="pv-dr now"><span class="pv-dm">いま（${ymShort(ms[0])}〜）</span><span class="pv-dp">毎月 <b class="num">${yen(first)}</b></span><span class="pv-dleft">残る ${yen(left(first))}</span></div>
      ${rows.map(r => `<div class="pv-dr"><span class="pv-dm">${ymLabel(r.ym)}</span><span class="pv-dp">毎月 <b class="num">${yen(r.pay)}</b> <em>−${man(r.drop)}</em><small>${esc(r.name)}が完済</small></span><span class="pv-dleft">残る ${yen(left(r.pay))}</span></div>`).join("")}
      <div class="pv-liv">生活費（毎月）<input type="number" inputmode="numeric" class="num" id="plLiving" value="${plan.living || ""}" placeholder="0"><span>を引いて「残る」を出します</span></div>
    </div>`;
  }
  /* 月ごとの表（たたんでおく）：月 × 借入先の支払額と残高。マスを押すと、その借入先・その月を「補填をためす」に入れる */
  function tableHTML(base, now, plan, inc) {
    return `<div class="pl-wrap"><table class="pl-t">
      <thead><tr><th class="pl-m">月</th>${now.cols.map(c => `<th><b>${esc(c.a.name)}</b><small>${yen(c.a.balance)}</small></th>`).join("")}<th class="pl-sum">返済の合計</th><th class="pl-sum">残る</th></tr></thead>
      <tbody>${now.months
        .map((ym, k) => {
          const tot = now.cols.reduce((t, c) => t + (c.by[ym]?.pay || 0), 0);
          const left = inc - tot - (plan.living || 0);
          const yr = k === 0 || ym.endsWith("-01");
          const F = FIN.pay.fold,
            fk = "plan:" + ym.slice(0, 4),
            ff = F.isF(fk);
          const head = yr ? `<tr class="pl-yr fh" data-plyr="${fk}" role="button" tabindex="0" aria-expanded="${!ff}"><td colspan="${now.cols.length + 3}">${F.FIC(ff)} ${ym.slice(0, 4)}年</td></tr>` : "";
          if (ff) return head;
          return `${head}<tr><td class="pl-m">${ymShort(ym)}</td>${now.cols
            .map(c => {
              const v = c.by[ym];
              if (!v) return `<td class="pl-done"></td>`;
              const ex = extraFn(plan.extras, c.a.id)(ym);
              return `<td class="pl-c${ex ? " ex" : ""}${v.after === 0 ? " fin" : ""}" data-plpick="${c.a.id}|${ym}" role="button" tabindex="0"><b class="num">${man(v.pay)}</b><small class="num">${v.after === 0 ? "完済🎉" : `残 ${man(v.after)}`}</small>${ex ? `<em>+${man(ex)}</em>` : ""}</td>`;
            })
            .join("")}<td class="pl-sum num">${man(tot)}</td><td class="pl-sum num ${left < 0 ? "neg" : "ok"}">${man(left)}</td></tr>`;
        })
        .join("")}</tbody></table></div>`;
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
  /* 補填を実際の支払予定にする（その月の借入先の支払日に、元金だけの「繰上げ返済」を足す） */
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
    const pt = e.target.closest("[data-pvtab]");
    if (pt) {
      st.ptab = pt.dataset.pvtab;
      render();
      return;
    }
    const pm = e.target.closest("[data-pmym],[data-pmstep],[data-pmacc]");
    if (pm) {
      const d2 = pm.dataset;
      const ms = project(cfgPlan().extras).months;
      if (d2.pmym) st.ym = d2.pmym;
      else if (d2.pmstep) {
        const k = ms.indexOf(st.ym) + Number(d2.pmstep);
        if (ms[k]) st.ym = ms[k];
      } else if (d2.pmacc) {
        st.oacc = st.oacc === d2.pmacc ? null : d2.pmacc;
        const ex = cfgPlan().extras.find(x => x.acc === d2.pmacc && x.ym === st.ym);
        st.amt = ex ? ex.amt : 10000;
        st.every = ex ? !!ex.every : false;
      }
      if (!d2.pmacc) st.oacc = null;
      render();
      return;
    }
    const yh = e.target.closest("[data-plyr]");
    if (yh) {
      FIN.pay.fold.togF(yh.dataset.plyr);
      st.tbl = true;
      render();
      return;
    }
    const t = e.target.closest("[data-plc],[data-plclose],[data-plq],[data-plev],[data-plsave],[data-pldelcell],[data-pldel],[data-plclear],[data-pladd],[data-placc],[data-plmon],[data-plpick],[data-pldelcur]");
    if (!t) return;
    const d = t.dataset;
    const plan = cfgPlan();
    /* 補填をためす（画面の中）：借入先・月・額・毎月をえらぶ */
    const inTry = !!t.closest("#pvTry");
    if (d.placc) {
      st.acc = d.placc;
      st.amt = st.amt || 10000;
      render();
      return;
    } else if (d.plmon) {
      const c = project(plan.extras).cols.find(x => x.a.id === st.acc);
      const ms = c ? Object.keys(c.by).sort() : [];
      const k = ms.indexOf(st.ym) + Number(d.plmon);
      if (ms[k]) st.ym = ms[k];
      render();
      return;
    } else if (d.plpick) {
      [st.acc, st.ym] = d.plpick.split("|");
      st.oacc = st.acc;
      st.ptab = "mon";
      const ex = plan.extras.find(x => x.acc === st.acc && x.ym === st.ym);
      if (ex) {
        st.amt = ex.amt;
        st.every = !!ex.every;
      }
      render();
      $("pvTry")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    } else if (inTry && (d.plq || d.plev)) {
      if (d.plq) st.amt = Number(d.plq);
      else st.every = d.plev === "1";
      render();
      return;
    } else if (inTry && d.plsave) {
      const rest = plan.extras.filter(x => !(x.acc === st.acc && x.ym === st.ym));
      savePlan([...rest, { id: "x" + Date.now().toString(36), acc: st.acc, ym: st.ym, amt: st.amt, every: st.every }]);
      return;
    } else if (d.pldelcur) {
      savePlan(plan.extras.filter(x => !(x.acc === st.acc && x.ym === st.ym)));
      return;
    } else if (inTry && d.pladd) {
      st.cell = { id: st.acc, ym: st.ym };
      addToSchedule();
      return;
    }
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
      const inTry = !!e.target.closest("#pvTry");
      st.t = setTimeout(() => {
        const pos = e.target.selectionStart;
        inTry ? render() : paintCell();
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
  document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("pv-tbl")) st.tbl = e.target.open; }, true);
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
