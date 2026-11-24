/* ============================================================
   ここから旧 shared/u-sync.js（同期の見張り役）。おかね手帳専用に取り込み
   ============================================================ */
/* ===================== 保存と同期の見張り役：4アプリ（エンタメ管理・おかね手帳・FitLife・ウリログ）で同じファイルを使う =====================
  ふつうの <script> で読み込む（window.USync）。Firebase を使うコードより前に置く。

  使い方
    エンタメ管理・おかね手帳 … u-core.js が中で使う（U.sync は USync と同じもの）
    FitLife・ウリログ        … const W = USync.wrap(Firestoreの関数一式, db, { id:"アプリ名", badge:true })
                               W.onSnapshot / W.setDoc / W.updateDoc / W.addDoc / W.deleteDoc / W.writeBatch / W.runTransaction を、
                               Firebase の同じ名前の関数と同じ書き方で使う

  やっていること
    ・読み込み（onSnapshot）が止まったら、少し待って自動でつなぎ直す（開き直さなくても戻る）
    ・書き込みが失敗したら、自動で保存し直す（同じ文書をあとから丸ごと書いたときは、古い失敗は捨てる）
      まとめ書き・トランザクションは、やり直すと二重になるおそれがあるので自動ではやり直さない（失敗を知らせるだけ）
    ・iPhoneで裏から戻ったとき・電波が戻ったとき・保存が20秒以上終わらないときは、通信をつなぎ直す
    ・端末内の保存場所が壊れたとき（iPhoneで長く裏にいたあとなど）は、未保存がなければ自動で開き直す
    ・badge:true のアプリは、保存できていない変更があるときだけ画面の下に小さく知らせる

  状態を見る
    USync.on(関数)      … 状態が変わるたびに呼ぶ（すぐ1回呼ぶ）。返り値で止める
    USync.view(同期済み) … 表示用の [種類 ok/busy/wait/err, 文字, 説明]
    USync.retry()       … 保存し直し・つなぎ直しを今すぐ行う */
window.USync = (() => {
  const SY = { pend: new Map(), fails: new Map(), lerr: new Map(), fatal: null, online: navigator.onLine !== false, at: 0, id: "app" };
  const subs = new Set();
  let emitQ = false;
  const emit = () => {
    if (emitQ) return;
    emitQ = true;
    queueMicrotask(() => {
      emitQ = false;
      subs.forEach(f => {
        try {
          f(SY);
        } catch (e) {
          console.warn(e);
        }
      });
    });
  };
  SY.on = f => {
    subs.add(f);
    f(SY);
    return () => subs.delete(f);
  };
  const hm = t => `${new Date(t).getHours()}:${String(new Date(t).getMinutes()).padStart(2, "0")}`;
  const failDocs = () => new Set([...SY.fails.values()].map(w => w.path)).size;
  SY.view = (synced = true) => {
    if (SY.fatal) return ["err", "接続エラー", "画面を開き直してください"];
    if (SY.fails.size) {
      const perm = [...SY.fails.values()].find(w => w.perm);
      return ["err", `未保存 ${failDocs()}件`, perm ? `保存できませんでした（${perm.code || "error"}）` : "自動で保存し直しています"];
    }
    if (SY.lerr.size) return ["err", "再接続中…", "読み込みが止まったので、自動でつなぎ直しています"];
    if (SY.pend.size) return SY.online ? ["busy", "保存中…", ""] : ["busy", "オフライン", "電波が戻ったら自動で保存します"];
    if (!SY.online) return ["wait", "オフライン", ""];
    if (!synced) return ["wait", "同期中…", "最新のデータを読み込んでいます"];
    return ["ok", "保存済み", SY.at ? `最後の保存 ${hm(SY.at)}` : ""];
  };

  /* 失敗の見分け：一時的なもの（電波など）は自動で保存し直す。端末内の保存場所が壊れたものは開き直す */
  const TEMP = new Set(["unavailable", "deadline-exceeded", "aborted", "internal", "unknown", "cancelled", "resource-exhausted"]);
  const BROKEN = /IndexedDB|INTERNAL ASSERTION|required state|refresh the (browser|page)|persistence layer/i;
  const isBroken = e => !!e && BROKEN.test(String(e.message || e));
  SY.isTemp = e => !!e && TEMP.has(e.code);
  const RETRY_S = [3, 10, 30, 60, 120];

  /* 画面の上に出す帯（開き直すボタンつき）・下に出す小さな知らせ。どのアプリでも同じ見た目（色は端末の明暗に合わせる） */
  const DARK = matchMedia("(prefers-color-scheme: dark)");
  const boxCss = top =>
    `position:fixed;left:50%;transform:translateX(-50%);${top ? "top:calc(10px + env(safe-area-inset-top,0px))" : "bottom:calc(84px + env(safe-area-inset-bottom,0px))"};z-index:2147483000;display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100% - 24px);border-radius:12px;padding:8px 8px 8px 16px;font:13px/1.5 system-ui,-apple-system,"Hiragino Sans",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);background:${DARK.matches ? "#f2f2f4" : "#26262b"};color:${DARK.matches ? "#1c1c1e" : "#fff"}`;
  const btnCss = "border:0;border-radius:8px;padding:6px 12px;font:700 12.5px/1.5 inherit;white-space:nowrap;cursor:pointer;background:#e8743b;color:#fff";
  function bar(id, top, text, label, onClick) {
    let el = document.getElementById(id);
    if (!text) return void (el && el.remove());
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("role", top ? "alert" : "status");
      el.innerHTML = `<span></span><button type="button"></button>`;
      document.body.appendChild(el);
    }
    el.style.cssText = boxCss(top);
    el.querySelector("span").textContent = text;
    const b = el.querySelector("button");
    b.style.cssText = btnCss;
    b.textContent = label;
    b.onclick = onClick;
  }
  function onBroken(e) {
    console.warn("保存場所のエラー", e);
    SY.fatal = e;
    emit();
    const RK = "u-reload:" + SY.id;
    let last = 0;
    try {
      last = +sessionStorage.getItem(RK) || 0;
    } catch (_) {}
    /* 未保存がなく、画面を見ているときだけ自動で開き直す（2分に1回まで） */
    if (!document.hidden && !SY.fails.size && Date.now() - last > 120000) {
      try {
        sessionStorage.setItem(RK, String(Date.now()));
      } catch (_) {}
      location.reload();
      return;
    }
    bar("u-syncerr", true, "保存先との接続が切れました。開き直すと直ります。", "開き直す", () => location.reload());
  }

  /* 書き込み1回分。full＝文書を丸ごと書く（set・delete）。丸ごと書いたら、それより前の同じ文書の失敗は不要
     once＝自動ではやり直さない（まとめ書き・トランザクション） */
  let wseq = 0;
  const lastFull = {};
  function attempt(w) {
    const tok = {};
    SY.pend.set(tok, Date.now());
    emit();
    return w.run().then(
      r => {
        SY.pend.delete(tok);
        SY.at = Date.now();
        clearTimeout(w.t);
        SY.fails.delete(w.id);
        if (w.full)
          SY.fails.forEach((f, k) => {
            if (f.path === w.path && k < w.id) {
              clearTimeout(f.t);
              SY.fails.delete(k);
            }
          });
        emit();
        return r;
      },
      e => {
        SY.pend.delete(tok);
        if (w.once || (w.full && lastFull[w.path] !== w.id)) SY.fails.delete(w.id); // やり直さないもの・あとから丸ごと書いたもの
        else {
          w.code = (e && e.code) || "error";
          w.perm = !TEMP.has(w.code);
          SY.fails.set(w.id, w);
          if (!w.perm && w.tries < RETRY_S.length) w.t = setTimeout(() => retryOne(w), RETRY_S[w.tries++] * 1000);
          console.warn("保存できませんでした", w.path, e);
        }
        if (isBroken(e)) onBroken(e);
        emit();
        throw e;
      },
    );
  }
  function retryOne(w) {
    if (!SY.fails.has(w.id)) return;
    clearTimeout(w.t);
    attempt(w).catch(() => {});
  }
  function track(path, full, run, once) {
    const w = { id: ++wseq, path, full, run, tries: 0, once: !!once };
    if (full) lastFull[path] = w.id;
    return attempt(w);
  }

  /* 読み込み（onSnapshot）を見張る。make(ok, ng) で読み込みを始めて、止める関数を返す。止まったら少し待ってつなぎ直す */
  const lsn = new Set();
  function listen(make, cb, err) {
    const L = { off: null, t: 0, n: 0, dead: false };
    L.start = () => {
      clearTimeout(L.t);
      if (L.dead) return;
      try {
        L.off && L.off();
      } catch (_) {}
      L.off = make(
        s => {
          L.n = 0;
          if (SY.lerr.delete(L)) emit();
          if (cb) cb(s);
        },
        e => {
          L.off = null;
          SY.lerr.set(L, e);
          emit();
          console.warn("読み込みが止まりました", e);
          if (err) err(e);
          if (isBroken(e)) onBroken(e);
          if (!L.dead) L.t = setTimeout(L.start, [2, 5, 15, 30, 60][Math.min(L.n++, 4)] * 1000);
        },
      );
    };
    lsn.add(L);
    L.start();
    return () => {
      L.dead = true;
      clearTimeout(L.t);
      lsn.delete(L);
      if (SY.lerr.delete(L)) emit();
      try {
        L.off && L.off();
      } catch (_) {}
    };
  }
  /* 今すぐやり直す：止まった読み込みをつなぎ直し、保存できなかったものを保存し直す（all＝あきらめたものも） */
  function redo(all) {
    lsn.forEach(L => SY.lerr.has(L) && L.start());
    SY.fails.forEach(w => (all || !w.perm) && ((w.tries = Math.min(w.tries, RETRY_S.length - 1)), retryOne(w)));
  }
  let kick = () => {};
  SY.retry = () => {
    kick(true);
    redo(true);
  };

  /* Firestore に取り付ける（1回だけ）：裏から戻ったとき・電波が戻ったとき・保存が終わらないときに通信をつなぎ直す */
  let attached = false;
  function attach(F, fs, opt) {
    if (opt && opt.id) SY.id = opt.id;
    if (attached) return;
    attached = true;
    let kickAt = 0;
    kick = async force => {
      if (!force && Date.now() - kickAt < 15000) return;
      kickAt = Date.now();
      try {
        await F.disableNetwork(fs);
      } catch (_) {}
      try {
        await F.enableNetwork(fs);
      } catch (_) {}
    };
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return void (hiddenAt = Date.now());
      if (hiddenAt && Date.now() - hiddenAt > 20000) kick();
      redo(false);
    });
    addEventListener("online", () => {
      SY.online = true;
      emit();
      F.enableNetwork(fs).catch(() => {});
      redo(false);
    });
    addEventListener("offline", () => {
      SY.online = false;
      emit();
    });
    setInterval(() => {
      if (document.hidden || !SY.online || !SY.pend.size) return;
      if (Date.now() - Math.min(...SY.pend.values()) > 20000) kick();
    }, 10000);
    /* 保存できていない変更があるときだけ、画面の下に小さく知らせる（状態表示を持たないアプリ用） */
    if (opt && opt.badge)
      SY.on(() => {
        const n = failDocs();
        bar("u-syncfail", false, n ? (SY.fails.size && [...SY.fails.values()].every(w => w.perm) ? `保存できなかった変更があります（${n}件）` : `保存できていない変更があります（${n}件）・自動で保存し直しています`) : "", "今すぐ保存", () => SY.retry());
      });
  }

  /* Firebase の関数と同じ書き方で使える版を作る（FitLife・ウリログ用） */
  function wrap(F, fs, opt) {
    attach(F, fs, opt);
    const isOpts = x => x && typeof x === "object" && typeof x.next !== "function" && !("next" in x);
    return {
      onSnapshot: (ref, ...a) => {
        const o = isOpts(a[0]) ? a.shift() : null;
        const [next, err] = a;
        return listen((ok, ng) => (o ? F.onSnapshot(ref, o, ok, ng) : F.onSnapshot(ref, ok, ng)), next, err);
      },
      setDoc: (ref, data, o) => track(ref.path, !(o && (o.merge || o.mergeFields)), () => (o ? F.setDoc(ref, data, o) : F.setDoc(ref, data))),
      updateDoc: (ref, ...a) => track(ref.path, false, () => F.updateDoc(ref, ...a)),
      deleteDoc: ref => track(ref.path, true, () => F.deleteDoc(ref)),
      /* 新しい文書：IDを先に決めてから書く（やり直しても二重にならない） */
      addDoc: (col, data) => {
        const r = F.doc(col);
        return track(r.path, true, () => F.setDoc(r, data)).then(() => r);
      },
      writeBatch: db => {
        const b = F.writeBatch(db),
          commit = b.commit.bind(b);
        b.commit = () => track(`batch-${wseq + 1}`, false, commit, true);
        return b;
      },
      runTransaction: (db, fn, o) => track(`tx-${wseq + 1}`, false, () => F.runTransaction(db, fn, o), true),
    };
  }

  return Object.assign(SY, { track, listen, attach, wrap });
})();

/* ============================================================
   ここから旧 shared/u-auth.js（ログインの処理）。おかね手帳専用に取り込み
   ============================================================ */
/* ===================== ログインの共通処理：4アプリ（エンタメ管理・おかね手帳・FitLife・ウリログ）で同じファイルを使う =====================
  ふつうの <script> で読み込む（window.UAuth）。ログイン画面の見た目は各アプリのまま、処理だけをここにまとめる。
  A は Firebase の auth の関数一式（import した firebase-auth.js）

  UAuth.STANDALONE          … ホーム画面のアイコンから開いているか
  UAuth.IN_LINE             … LINE の中のブラウザで開いているか（Googleログインが使えない）
  UAuth.appUrl()            … このアプリのURL（? や # を除いたもの）
  UAuth.normEmail(s)        … メールアドレスを小文字・前後の空白なしにそろえる
  UAuth.emailOk(s)          … メールアドレスの形になっているか
  UAuth.msg(err, 上書き)     … ログインのエラーを、やさしい日本語にする（アプリごとに文を上書きできる）
  UAuth.google(auth, A)     … Googleでログイン。ポップアップが使えないとき（ホーム画面から開いたときなど）は画面を切り替えてログイン
                               自分で閉じたときは false。それ以外の失敗はエラーを投げる
  UAuth.sendLink(auth, A, email, url, key)   … ログイン用のリンクをメールで送る（送ったアドレスを端末に覚えておく）
  UAuth.finishLink(auth, A, email, link, key) … メールのリンクでログインを終える（覚えたアドレスを消して、URLをもとに戻す）
  UAuth.setPassword(A, user, pw)              … パスワードを作る・変える */
window.UAuth = (() => {
  const STANDALONE = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const IN_LINE = / Line\//i.test(navigator.userAgent);
  const appUrl = () => location.origin + location.pathname;
  const normEmail = s => String(s || "").trim().toLowerCase();
  const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const ERR = {
    "auth/invalid-email": "メールアドレスの形がちがうみたい",
    "auth/missing-password": "パスワードを入れてね",
    "auth/weak-password": "パスワードは6文字以上にしてね",
    "auth/email-already-in-use": "このメールアドレスはもう登録されているよ。「ログイン」から入ってね",
    "auth/invalid-credential": "メールアドレスかパスワードがちがうみたい",
    "auth/wrong-password": "メールアドレスかパスワードがちがうみたい",
    "auth/user-not-found": "メールアドレスかパスワードがちがうみたい",
    "auth/too-many-requests": "何度も失敗したので、少し時間をおいてね",
    "auth/network-request-failed": "ネットにつながっていないみたい",
    "auth/operation-not-allowed": "Firebaseで、このログイン方法がまだオンになっていないみたい",
    "auth/unauthorized-domain": "このURLがFirebaseの「承認済みドメイン」に入っていないみたい",
    "auth/unauthorized-continue-uri": "このURLがFirebaseの「承認済みドメイン」に入っていないみたい",
    "auth/invalid-action-code": "このリンクは使えません（期限切れか使用ずみ）。もう一度メールを送ってね",
    "auth/expired-action-code": "リンクの期限が切れています。もう一度メールを送ってね",
    "auth/quota-exceeded": "今日はメールを送れる回数の上限です。明日また試すか、Googleでログインしてね",
    "auth/account-exists-with-different-credential": "このメールアドレスは別の方法で登録ずみです。メールのリンクでログインしてね",
    "auth/requires-recent-login": "安全のため、一度ログアウトして、もう一度ログインしてから設定してね",
  };
  const msg = (e, over) => (over && over[e?.code]) || ERR[e?.code] || `うまくいかなかったよ（${e?.code || e?.message || "不明"}）`;
  async function google(auth, A) {
    const pv = new A.GoogleAuthProvider();
    pv.setCustomParameters({ prompt: "select_account" });
    try {
      await A.signInWithPopup(auth, pv);
      return true;
    } catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e?.code)) {
        await A.signInWithRedirect(auth, pv);
        return true;
      }
      if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(e?.code)) return false;
      throw e;
    }
  }
  async function sendLink(auth, A, email, url, key) {
    email = normEmail(email);
    await A.sendSignInLinkToEmail(auth, email, { url: url || appUrl(), handleCodeInApp: true });
    try {
      localStorage.setItem(key, email);
    } catch (_) {}
    return email;
  }
  async function finishLink(auth, A, email, link, key) {
    await A.signInWithEmailLink(auth, normEmail(email), link);
    try {
      localStorage.removeItem(key);
    } catch (_) {}
    if (location.search || location.hash) history.replaceState(null, "", appUrl());
  }
  async function setPassword(A, user, pw) {
    if ((user.providerData || []).some(p => p.providerId === "password")) await A.updatePassword(user, pw);
    else await A.linkWithCredential(user, A.EmailAuthProvider.credential(user.email, pw));
  }
  return { STANDALONE, IN_LINE, appUrl, normEmail, emailOk, msg, google, sendLink, finishLink, setPassword };
})();

/* ============================================================
   ここから旧 shared/u-core.js（共通の土台・動作）。おかね手帳専用に取り込み
   ============================================================ */
/* ===================== 共通の土台（動作）：おかね手帳・エンタメ管理で同じファイルを使う =====================
  アプリごとの設定は、このファイルより前に window.U_APP で渡す
    id   … アプリの名前（"okane" / "entame"）
    fb   … Firebase の設定（firebaseConfig）
    root … Firebase での保存場所。uid を受け取ってパスを返す関数（省略時は users/<uid>）
  U.esc(文字) … HTMLに入れる文字をエスケープ
  U.ls.get(キー) / U.ls.set(キー, 値) … 端末に覚える小さな設定（localStorage）
  U.copy(文字) … クリップボードにコピー（できたら true）
  U.toast(文, { html, undo, ms }) … 画面の下に短く通知
  U.store() … 保存先（Firebase）につなぐ。ログインしていなければログイン画面を出す。何度呼んでも接続は1回だけ
    返り値 { kind, db, uid, logout }
      kind … "fb"＝Firebase / "none"＝つながらない
      db   … doc(path) と collection(path) を持つ
      uid  … 利用者のID（つながらないときは null） */
const U = { app: Object.assign({ id: "app", fb: null, root: null }, window.U_APP || {}), FB_VER: "12.15.0" };
/* ---------- 表示（ライト／ダーク）：auto＝端末に合わせる。アプリごと・端末ごとに覚える ----------
   開いた瞬間に白く光らないよう、各アプリの index.html の head でも同じ処理を先に行う */
U.THEME_KEY = "u-theme:" + U.app.id;
U.THEME_NAME = { auto: "自動（端末に合わせる）", light: "ライト", dark: "ダーク" };
U.theme = () => {
  try {
    const v = localStorage.getItem(U.THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch (_) {
    return "auto";
  }
};
U.applyTheme = (v = U.theme()) => {
  const r = document.documentElement;
  if (v === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", v);
  /* iPhoneの上の帯などの色も合わせる */
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = v === "light" ? "#ffffff" : v === "dark" ? "#16181d" : m.dataset.orig;
  });
};
U.setTheme = v => {
  try {
    if (v === "auto") localStorage.removeItem(U.THEME_KEY);
    else localStorage.setItem(U.THEME_KEY, v);
  } catch (_) {}
  U.applyTheme(v);
  /* 表示の切り替えボタンや設定の印は、この知らせで描き直す */
  document.dispatchEvent(new Event("u-theme"));
};
U.applyTheme();
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  U.esc = esc;
  /* 検索用に文字をそろえる（大文字小文字・全角半角・カタカナ→ひらがな、記号や空白は無視） */
  U.norm = t =>
    String(t || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[\s・、。!！?？〜~\-－]/g, "");

  /* ---------- 端末に覚える小さな設定（localStorage に JSON で）。使えない端末では何もしない ---------- */
  U.ls = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(k) || "null");
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  /* ---------- 文字をコピー。iPhoneでも動くよう、まず選択してコピー → だめなら clipboard。できたら true ---------- */
  U.copy = async text => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {}
    ta.remove();
    if (ok) return true;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  };

  /* ---------- Firebase ---------- */
  /* ログイン画面：Googleでログインのみ。ポップアップが使えないとき（ホーム画面から開いたとき等）は画面を切り替えてログイン */
  function loginForm(auth, mod, msg) {
    let host = document.getElementById("u-login");
    if (!host) {
      host = document.createElement("div");
      host.id = "u-login";
      host.className = "u-login";
      document.body.appendChild(host);
    }
    host.innerHTML = `<form><h3>ログイン</h3>
      <p>Googleアカウントでログインしてください。一度ログインすると、この端末では次からログイン不要です。</p>
      <button type="submit" class="u-google"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Googleでログイン</button>${msg ? `<p class="u-login-err" role="alert">${esc(msg)}</p>` : ""}</form>`;
    host.querySelector("form").onsubmit = async ev => {
      ev.preventDefault();
      const btn = host.querySelector("button");
      btn.disabled = true;
      /* Googleログインの処理は4アプリ共通の shared/u-auth.js */
      try {
        if (!(await window.UAuth.google(auth, mod))) btn.disabled = false;
      } catch (e) {
        loginForm(auth, mod, `ログインできませんでした。もう一度お試しください。（${(e && e.code) || "error"}）`);
      }
    };
  }
  /* ---------- 保存と同期の見張り：共通の shared/u-sync.js（4アプリ共通）。U.sync は USync と同じもの ---------- */
  const SY = (U.sync = window.USync);
  const { track, listen } = SY;
  const wid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function fbStore() {
    const base = `https://www.gstatic.com/firebasejs/${U.FB_VER}/`;
    const [A, Au, F] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js"),
    ]);
    const app = A.initializeApp(U.app.fb);
    const auth = Au.getAuth(app);
    await Au.setPersistence(auth, Au.browserLocalPersistence).catch(() => {});
    /* 端末内の控えは「1つのタブだけ」が使う。同じサイトの別アプリ（エンタメ管理・おかね手帳）や2つ目のタブは、
       控えを使わずメモリだけで動く（タブどうしで控えを取り合って、読み込みや保存が止まるのを防ぐ） */
    let fs;
    try {
      fs = F.initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }),
      });
    } catch (e) {
      fs = F.getFirestore(app);
    }
    /* 画面を切り替えてログインした後の戻り。失敗したときは理由を表示 */
    let redirErr = null;
    await Au.getRedirectResult(auth).catch(e => (redirErr = e));
    const user = await new Promise(res => {
      const off = Au.onAuthStateChanged(auth, u => {
        if (u) {
          off();
          res(u);
        } else loginForm(auth, Au, redirErr ? `ログインできませんでした。もう一度お試しください。（${redirErr.code || "error"}）` : "");
      });
    });
    document.getElementById("u-login")?.remove();

    /* 裏から戻ったとき・電波が戻ったときのつなぎ直しなどを取り付ける */
    SY.attach(F, fs, { id: U.app.id });

    const root = U.app.root ? U.app.root(user.uid) : `users/${user.uid}`;
    const snap = d => ({ id: d.id, exists: d.exists(), data: () => d.data() });
    const doc = path => {
      const full = `${root}/${path}`;
      const ref = F.doc(fs, full);
      return {
        id: ref.id,
        get: async () => snap(await F.getDoc(ref)),
        set: (data, opt) => track(full, !(opt && opt.merge), () => (opt ? F.setDoc(ref, data, opt) : F.setDoc(ref, data))),
        /* 渡した項目だけ書きかえる。{items:{id:中身}} なら items の中の id ごとに丸ごと入れ替え（null は削除の印として残す） */
        update: data => {
          const args = [];
          Object.entries(data).forEach(([k, v]) => {
            if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length)
              Object.entries(v).forEach(([k2, v2]) => args.push(new F.FieldPath(k, k2), v2));
            else args.push(new F.FieldPath(k), v);
          });
          if (!args.length) return Promise.resolve();
          return track(full, false, () =>
            F.updateDoc(ref, ...args).catch(e => {
              if (e && e.code === "not-found") return F.setDoc(ref, data, { merge: true });
              throw e;
            }),
          );
        },
        delete: () => track(full, true, () => F.deleteDoc(ref)),
        onSnapshot: (cb, err) => listen((ok, ng) => F.onSnapshot(ref, d => ok(snap(d)), ng), cb, err),
      };
    };
    const db = {
      doc,
      /* まとめ書き：[[パス, 中身], …] を1回の通信で書く（取り込み用。1回に500件まで） */
      setMany: list =>
        track(`batch-${wid()}`, false, () => {
          const b = F.writeBatch(fs);
          list.forEach(([path, data]) => b.set(F.doc(fs, `${root}/${path}`), data));
          return b.commit();
        }),
      collection: name => ({
        doc: id => doc(`${name}/${id}`),
        /* opt.meta＝true なら「端末に残っていた古いデータか（fromCache）」が変わったときも呼ぶ */
        onSnapshot: (cb, err, opt) =>
          listen(
            (ok, ng) =>
              F.onSnapshot(
                F.collection(fs, `${root}/${name}`),
                { includeMetadataChanges: !!(opt && opt.meta) },
                q => {
                  const docs = q.docs.map(snap);
                  ok({ docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), fromCache: q.metadata.fromCache });
                },
                ng,
              ),
            cb,
            err,
          ),
      }),
    };
    return {
      kind: "fb",
      db,
      uid: user.uid,
      logout: async () => {
        await Au.signOut(auth);
        location.reload();
      },
    };
  }

  /* ---------- 通知：画面の下に短く出す ----------
    U.toast(文, { html, undo, ms })
      html … true なら文をHTMLとして入れる（呼ぶ側で esc 済みのものだけ）
      undo … 関数を渡すと「元に戻す」ボタンを付ける
      ms   … 出しておく時間（省略時は文の長さに合わせて 2.5〜6秒、undo つきは 8秒） */
  let toastT = null;
  U.toastClose = () => {
    clearTimeout(toastT);
    document.querySelectorAll(".u-toast").forEach(e => e.remove());
  };
  U.toast = (msg, { html = false, undo = null, ms } = {}) => {
    U.toastClose();
    const el = document.createElement("div");
    el.className = "u-toast" + (undo ? " undo" : "");
    el.setAttribute("role", "status");
    const sp = document.createElement("span");
    if (html) sp.innerHTML = msg;
    else sp.textContent = msg;
    el.append(sp);
    if (undo) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "元に戻す";
      b.onclick = ev => {
        ev.stopPropagation();
        U.toastClose();
        undo();
      };
      el.append(b);
    }
    document.body.appendChild(el);
    const len = (html ? sp.textContent : msg).length;
    toastT = setTimeout(U.toastClose, ms ?? (undo ? 8000 : Math.min(6000, Math.max(2500, len * 90))));
  };

  let conn = null;
  U.store = () =>
    conn ||
    (conn = (async () => {
      try {
        if (U.app.fb) return await fbStore();
      } catch (e) {
        return { kind: "none", db: null, uid: null, logout: null, error: e };
      }
      return { kind: "none", db: null, uid: null, logout: null };
    })());

  /* ---------- パスワード管理アプリ（1Password・Bitwarden・LastPass など）の候補ボタンを、ログイン以外の入力欄では出さない ----------
     パスワード・メールアドレス・ユーザー名の欄（ログイン画面）はそのまま。画面を描き直して増えた入力欄にも付ける */
  const pmLogin = el => el.type === "password" || el.type === "email" || /username|password|email/.test(el.getAttribute("autocomplete") || "");
  const pmMark = root => {
    const l = root.matches && root.matches("input,textarea") ? [root] : [];
    if (root.querySelectorAll) l.push(...root.querySelectorAll("input,textarea"));
    l.forEach(el => {
      if (el.hasAttribute("data-1p-ignore") || pmLogin(el)) return;
      el.setAttribute("data-1p-ignore", "");
      el.setAttribute("data-lpignore", "true");
      el.setAttribute("data-bwignore", "");
      el.setAttribute("data-form-type", "other");
      /* 自動で出る候補の一覧もしまっておく（1Password は候補を自動では開かなくなる）。もともと指定がある欄はそのまま */
      if (!el.hasAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
    });
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && pmMark(n)))).observe(document.documentElement, { childList: true, subtree: true });
  pmMark(document);
})();

/* ===== アプリ共通：折りたたみの印と、⠿を押さえて動かす並び替え（エンタメ管理・おかね手帳で共通） ===== */
/* ---------- 折りたたみの印：どこでも同じ「›」。たたんでいると右向き、開くと下向き（CSSで回す） ---------- */
const FOLD_IC = `<svg class="fic" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/* ---------- 並び替え：⠿（data-grip="種類"）を押さえたまま上下に動かす。マウス・指どちらでも。どの画面も同じ動き ----------
   動かす行は data-sortrow、同じ親の中だけで動く。離したら SORT_DONE[種類](親, 行の並び) を呼ぶ */
const GRIP = kind => `<span class="mgrip" data-grip="${kind}" aria-hidden="true" title="押さえたまま上下に動かして並び替え">⠿</span>`;
const SORT_DONE = {};
let gDrag = null;
document.addEventListener("pointerdown", e => {
  const g = e.target.closest("[data-grip]");
  if (!g || e.button > 0) return;
  const row = g.closest("[data-sortrow]");
  if (!row) return;
  const box = row.parentElement;
  e.preventDefault();
  try {
    g.setPointerCapture(e.pointerId);
  } catch (_) {}
  gDrag = { row, box, kind: g.dataset.grip, sc: row.closest(".mlist") || row.closest(".sheet") };
  row.classList.add("dragging");
  box.classList.add("sorting");
});
document.addEventListener("pointermove", e => {
  if (!gDrag) return;
  const { row, box, sc } = gDrag;
  if (sc) {
    const r = sc.getBoundingClientRect();
    if (e.clientY < r.top + 40) sc.scrollTop -= 8;
    else if (e.clientY > r.bottom - 40) sc.scrollTop += 8;
  }
  const rows = [...box.children].filter(x => x.matches("[data-sortrow]") && x !== row);
  const next = rows.find(x => {
    const b = x.getBoundingClientRect();
    return e.clientY < b.top + b.height / 2;
  });
  /* 最後へ動かすときは、最後の行のすぐ後ろ（行のあとにあるボタンなどより前）に入れる */
  const ref = next || (rows.length ? rows[rows.length - 1].nextSibling : null);
  if (ref !== row && ref !== row.nextSibling) box.insertBefore(row, ref);
});
/* 離したあとに続けて来るクリックは捨てる（描き直しで消えた⠿へのクリックが「外を押した」扱いになり、編集が閉じてしまうため） */
let gripEat = 0;
document.addEventListener(
  "click",
  e => {
    if (!gripEat || Date.now() - gripEat > 150) return;
    gripEat = 0;
    e.stopImmediatePropagation();
    e.preventDefault();
  },
  true,
);
const gripEnd = () => {
  if (!gDrag) return;
  gripEat = Date.now();
  const { row, box, kind } = gDrag;
  row.classList.remove("dragging");
  box.classList.remove("sorting");
  gDrag = null;
  const fn = SORT_DONE[kind];
  if (fn) fn(box, [...box.children].filter(x => x.matches("[data-sortrow]")));
};
document.addEventListener("pointerup", gripEnd);
document.addEventListener("pointercancel", gripEnd);

/* ============================================================
   ここから旧 shared/u-ui.js（共通の画面部品）。おかね手帳専用に取り込み
   ============================================================ */
/* ===================== 共通の画面部品：おかね手帳・エンタメ管理で同じファイルを使う（u-core.js のあとに読み込む） =====================
  U.TOUCH        … 指で操作する端末か（スマホ・iPad）
  U.sheetMode()  … 下から出すシートの形にする画面幅か（スマホ）。U.noSheet を true にしたアプリは、スマホでも欄のすぐ下に出す
  U.lock(on)     … シートなどを開いている間、後ろの画面をスクロールさせない（iPhoneでも効くよう body を固定）。U.lockY は固定前の位置
  表示の切り替えボタン（#hTheme）… 自動 → ライト → ダーク → 自動。押したときの処理とアイコンはここで行う
  U.pick         … プルダウン（select）を開くと、端末標準ではなく同じ見た目の一覧を出す。スマホは下から、PCは欄のすぐ下
    U.pick.close() … 開いている一覧を閉じる
    U.pick.onOpen  … 一覧を開く直前に呼ぶ関数（ほかの部品を閉じるときに使う）
    data-native を付けた select は端末標準のまま */
U.TOUCH = matchMedia("(hover:none) and (pointer:coarse)").matches;
U.sheetMode = () => !U.noSheet && matchMedia("(max-width:699px)").matches;
/* 欄のすぐ下に出した一覧を、画面の大きさの変化・スクロールで閉じてよいか（スマホでキーボードが出たとき・一覧の中の欄に入力中は閉じない） */
U.popKeep = box => U.TOUCH || !!(document.activeElement && document.activeElement.closest && document.activeElement.closest(box));
U.IC = {
  check: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
};

/* ---------- 後ろの画面を止める ---------- */
U.lockY = null;
U.lock = on => {
  const b = document.body.style;
  if (on && U.lockY === null) {
    U.lockY = scrollY;
    Object.assign(b, { position: "fixed", top: `-${U.lockY}px`, left: "0", right: "0", width: "100%" });
  } else if (!on && U.lockY !== null) {
    const y = U.lockY;
    U.lockY = null;
    Object.assign(b, { position: "", top: "", left: "", right: "", width: "" });
    scrollTo(0, y);
  }
};

/* ---------- 表示の切り替えボタン ---------- */
(() => {
  const IC = {
    auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`,
    light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  };
  const paint = () =>
    document.querySelectorAll("#hTheme").forEach(b => {
      const v = U.theme();
      b.innerHTML = IC[v];
      b.setAttribute("aria-label", `表示：${U.THEME_NAME[v]}（押すと切り替え）`);
      b.title = `表示：${U.THEME_NAME[v]}`;
    });
  document.addEventListener("u-theme", paint);
  document.addEventListener("click", e => {
    if (!e.target.closest || !e.target.closest("#hTheme")) return;
    const nx = { auto: "light", light: "dark", dark: "auto" }[U.theme()];
    U.setTheme(nx);
    U.toast(`表示：${U.THEME_NAME[nx]}`);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();

/* ---------- プルダウン：選択の一覧 ----------
   使いにくくならない工夫：
   ・今の値にチェックを付け、開いたときにその位置までスクロール
   ・項目が10個を超えるときだけ上に「探す」欄（スマホでは自動でキーボードを出さない）
   ・選んだらすぐ閉じる。外を押す・✕・Escでも閉じる
   ・開いた直後の指の離れで下の項目を選ばないよう、0.3秒は選べない
   ・PCは ↑↓ で項目を移動、Enterで決定。スマホは開いている間、後ろの画面がスクロールしない */
U.pick = (() => {
  const esc = U.esc;
  const SEL = "select:not([data-native])";
  let cur = null,
    at = 0,
    t0 = null;
  const api = { onOpen: null };
  /* 一覧の見出し：aria-label、なければ欄の名前（label の文字） */
  function title(sel) {
    const a = sel.getAttribute("aria-label");
    if (a) return a;
    const l = (sel.id && document.querySelector(`label[for="${sel.id}"]`)) || sel.closest("label");
    const t = l ? [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim() : "";
    return t || "選ぶ";
  }
  function close(refocus) {
    const s = cur;
    cur = null;
    document.getElementById("pkPop")?.remove();
    document.documentElement.classList.remove("pkopen");
    if (s && refocus && !U.TOUCH && s.isConnected) s.focus();
  }
  function rows() {
    const opts = [...cur.options].filter(o => !o.hidden);
    return opts
      .map(o => {
        const on = cur.selectedIndex === o.index;
        return `<button type="button" class="dd-row${on ? " on" : ""}" role="option" aria-selected="${on}" data-pki="${o.index}"${o.disabled ? " disabled" : ""}><span class="dd-l">${esc(o.textContent)}</span>${on ? U.IC.check : ""}</button>`;
      })
      .join("");
  }
  function open(sel) {
    close();
    if (api.onOpen) api.onOpen();
    cur = sel;
    at = Date.now();
    const tt = title(sel);
    const sheet = U.sheetMode();
    const box = document.createElement("div");
    box.id = "pkPop";
    box.className = sheet ? "sheetmode" : "popmode";
    box.innerHTML = `<div class="dd-scrim" data-pkclose="1"></div><div class="dd-box" role="dialog" aria-label="${esc(tt)}">
      ${sheet ? `<div class="dd-h"><b>${esc(tt)}</b><span>選ぶと閉じます</span><button type="button" class="dd-x" data-pkclose="1" aria-label="閉じる">${U.IC.x}</button></div>` : ""}
      <div class="dd-list" role="listbox" id="pkList">${rows()}</div></div>`;
    document.body.appendChild(box);
    if (sheet) document.documentElement.classList.add("pkopen");
    else {
      /* PC：欄のすぐ下（下に場所がなければ上）に出す */
      const r = sel.getBoundingClientRect(),
        b = box.querySelector(".dd-box");
      const w = Math.min(Math.max(r.width, 220), 420);
      b.style.width = w + "px";
      b.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
      const below = innerHeight - r.bottom - 12,
        above = r.top - 12;
      if (below >= 240 || below >= above) {
        b.style.top = r.bottom + 6 + "px";
        b.style.maxHeight = Math.min(420, below) + "px";
      } else {
        b.style.bottom = innerHeight - r.top + 6 + "px";
        b.style.maxHeight = Math.min(420, above) + "px";
      }
    }
    const on = box.querySelector(".dd-row.on");
    if (on) on.scrollIntoView({ block: "center" });
    if (!U.TOUCH) (on || box.querySelector(".dd-row"))?.focus();
  }
  function pick(i) {
    const s = cur;
    if (!s || Date.now() - at < 300) return;
    close();
    if (s.selectedIndex !== i) {
      s.selectedIndex = i;
      s.dispatchEvent(new Event("input", { bubbles: true }));
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (!U.TOUCH && s.isConnected) s.focus();
  }
  const hit = e => e.target.closest && e.target.closest(SEL);
  /* PC：標準の選択を開かせずに、こちらの一覧を出す */
  document.addEventListener(
    "mousedown",
    e => {
      const s = hit(e);
      if (!s || e.button !== 0 || s.disabled) return;
      e.preventDefault();
      s.focus();
      open(s);
    },
    true,
  );
  /* スマホ：指を動かさずに離したときだけ開く（スクロールのつもりで触れたときは開かない） */
  document.addEventListener(
    "touchstart",
    e => {
      const s = hit(e);
      t0 = s && e.touches.length === 1 ? { s, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "touchend",
    e => {
      const s = hit(e);
      if (!s || s.disabled) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t0 || t0.s !== s || Math.abs(t.clientX - t0.x) > 10 || Math.abs(t.clientY - t0.y) > 10) return;
      open(s);
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "click",
    e => {
      /* PC：プルダウンを押したときのクリック（一覧が開いたあと、画面全体に届く）は捨てる */
      if (cur && Date.now() - at < 800 && !(e.target.closest && e.target.closest("#pkPop .dd-box"))) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (!e.target.closest || !e.target.closest("#pkPop")) return;
      e.stopPropagation();
      const r = e.target.closest("[data-pki]");
      if (r) pick(+r.dataset.pki);
      else if (e.target.closest("[data-pkclose]")) close(true);
    },
    true,
  );
  /* キーボード：選択欄で Enter・Space・↑↓ を押すと開く。一覧の中は ↑↓・Home・End で移動、Escで閉じる。
     アプリ側の一覧（編集画面のプルダウン・絞り込みの選択肢）も同じ動き */
  document.addEventListener(
    "keydown",
    e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.matches && t.matches(SEL) && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key) && !cur) {
        e.preventDefault();
        e.stopPropagation();
        open(t);
        return;
      }
      if (cur && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      const box = t.closest(".dd-box,.fsh-sub");
      if (!box || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const rs = [...box.querySelectorAll(".dd-row")];
      if (!rs.length) return;
      e.preventDefault();
      const i = rs.indexOf(t.closest(".dd-row"));
      const n = e.key === "Home" ? 0 : e.key === "End" ? rs.length - 1 : i < 0 ? 0 : Math.max(0, Math.min(rs.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      rs[n].focus();
      rs[n].scrollIntoView({ block: "nearest" });
    },
    true,
  );
  /* PC：画面の大きさが変わったり、後ろをスクロールしたら閉じる（欄からずれるため） */
  addEventListener("resize", () => cur && !U.sheetMode() && !U.popKeep("#pkPop") && close());
  document.addEventListener("scroll", e => cur && !U.sheetMode() && !(e.target.closest && e.target.closest("#pkPop")) && !(U.TOUCH && document.activeElement && document.activeElement.closest && document.activeElement.closest("#pkPop")) && close(), true);
  api.close = close;
  api.isOpen = () => !!cur;
  return api;
})();

/* ============================================================
   ここから ui.js 本体
   ============================================================ */
/* ===================== おかね手帳の画面部品（エンタメ管理と同じ形にそろえたもの） =====================
  ・プルダウンの一覧・表示の切り替え・後ろの画面を止める処理は、エンタメ管理と共通の shared/u-ui.js
  ・UI.filter … 「絞り込み」ボタンと、ボタンのすぐ下に出る絞り込みパネル・条件のラベル
  ・UI.calc   … 金額欄の電卓キーボード。スマホは画面の下に、PCは欄のすぐ下に出る（PCはキーボードでも式を打てる）
  家計簿（kb.js）・支払い（pay.js）より先に読み込む */
const UI = {};
(() => {
  const esc = U.esc;
  const { TOUCH } = U;
  const CHECK = U.IC.check,
    X_IC = U.IC.x;
  const CHEV = `<svg class="fsh-cv" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
  UI.CHECK = CHECK;

  /* プルダウンの一覧を開くときは電卓をしまう */
  U.pick.onOpen = () => calcClose();
  const pkClose = () => U.pick.close();

  /* ===================== 絞り込み：ボタン・条件のラベル・パネル =====================
     UI.filter.define(id, { cfg, pick, reset })
       cfg()  … { rows: [{ k, label, opts: [{ v, label, n }], cur }], n（絞り込み後の件数）, unit }
       pick(k, v) … 選んだとき（画面の描き直しは呼ぶ側で）
       reset() … 条件をすべて外す
     UI.filter.btn(id, 条件の数) … 「絞り込み」ボタン
     UI.filter.sum(id, [条件の名前]) … 条件のラベル（2つまで＋他◯件・解除） */
  const FIC = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
  const defs = {};
  const fst = { id: "", sub: "", first: false, subFirst: false, at: 0 };
  UI.filter = {
    define(id, o) {
      defs[id] = o;
    },
    isOpen: id => fst.id === id,
    btn: (id, n) =>
      `<div class="fbar"><button type="button" class="u-btn fb fsh-b${n ? " on" : ""}" data-fsh="${id}" aria-haspopup="dialog" aria-expanded="${fst.id === id}">${FIC}<span class="v">絞り込み</span>${n ? `<b class="fsh-n">${n}</b>` : ""}</button></div>`,
    sum: (id, conds) =>
      conds.length
        ? `<div class="fsum"><div class="fsum-l">${conds
            .slice(0, 2)
            .map(t => `<button type="button" class="u-chip on fchip" data-fsh="${id}" title="${esc(t)}"><span>${esc(t)}</span></button>`)
            .join("")}${conds.length > 2 ? `<button type="button" class="u-chip fmore" data-fsh="${id}">他${conds.length - 2}件</button>` : ""}</div><button type="button" class="u-btn sm txt clear" data-fshreset="${id}">解除</button></div>`
        : "",
    refresh: () => fRender(),
    close: () => fClose(),
  };
  function fHost() {
    let h = document.getElementById("fshHost");
    if (!h) {
      h = document.createElement("div");
      h.id = "fshHost";
      document.body.appendChild(h);
    }
    return h;
  }
  function fRender() {
    const h = fHost();
    const d = defs[fst.id];
    if (!d) {
      h.innerHTML = "";
      document.documentElement.classList.remove("fshopen");
      return;
    }
    const c = d.cfg();
    const nConds = c.rows.filter(r => r.cur !== "").length;
    const body = c.rows
      .map(r => {
        const open = fst.sub === r.k;
        const curLab = (r.opts.find(o => o.v === r.cur) || {}).label;
        const val = r.cur === "" ? "すべて" : curLab || r.cur;
        return `<div class="fsh-it${open ? " open" : ""}"><button type="button" class="fsh-row" data-fshsub="${r.k}" aria-expanded="${open}"><span class="fsh-k">${esc(r.label)}</span><span class="fsh-v${r.cur !== "" ? " on" : ""}">${esc(val)}</span>${CHEV}</button>${
          open
            ? `<div class="fsh-sub${fst.subFirst ? " in" : ""}" role="group" aria-label="${esc(r.label)}"><div class="fsh-subh"><b>${esc(r.label)}</b><span class="fsh-hint">選ぶと閉じます</span></div><div class="fsh-subb dd-list" role="listbox">${[{ v: "", label: "すべて", n: r.all }, ...r.opts]
                .map(o => {
                  const on = o.v === r.cur;
                  return `<button type="button" class="dd-row${on ? " on" : ""}" role="option" aria-selected="${on}" data-fshk="${r.k}" data-fshv="${esc(o.v)}"><span class="dd-l">${o.html || esc(o.label)}${o.n != null ? `<small>${o.n}</small>` : ""}</span>${on ? CHECK : ""}</button>`;
                })
                .join("")}</div></div>`
            : ""
        }</div>`;
      })
      .join("");
    const sc = h.querySelector(".fsh-body")?.scrollTop || 0;
    h.innerHTML = `<div class="fsh-scrim" data-fshclose="1"></div><div class="fsh${fst.first ? " in" : ""}" role="dialog" aria-label="絞り込み">
      <div class="fsh-h"><b>絞り込み</b>${nConds ? `<button type="button" class="u-btn sm txt fsh-reset" data-fshreset="${fst.id}">リセット</button>` : ""}<button type="button" class="u-btn icon sm soft fsh-x" data-fshclose="1" aria-label="閉じる">${X_IC}</button></div>
      <div class="fsh-body">${body}</div>
      <div class="fsh-f"><button type="button" class="u-btn pri wide fsh-go" data-fshclose="1">${c.n}${c.unit}を表示</button></div></div>`;
    const b = h.querySelector(".fsh-body");
    if (b) b.scrollTop = sc;
    fst.first = fst.subFirst = false;
    document.documentElement.classList.add("fshopen");
    fPlace();
    document.querySelectorAll(`[data-fsh="${fst.id}"].fsh-b`).forEach(x => x.setAttribute("aria-expanded", "true"));
  }
  /* パネルを「絞り込み」ボタンのすぐ下に置く（スマホは幅いっぱい、下のメニューにかからない高さまで） */
  function fPlace() {
    const sh = document.querySelector("#fshHost .fsh");
    const b = [...document.querySelectorAll(`.fsh-b[data-fsh="${fst.id}"]`)].find(x => x.offsetParent);
    if (!sh || !b) return;
    const r = b.getBoundingClientRect();
    sh.style.top = r.bottom + 6 + "px";
    if (innerWidth >= 900) {
      sh.style.left = Math.max(8, Math.min(r.left, innerWidth - 388)) + "px";
      sh.style.maxHeight = innerHeight - r.bottom - 22 + "px";
    } else {
      sh.style.removeProperty("left");
      const nav = document.querySelector(".tbwrap");
      const nr = nav && nav.getBoundingClientRect();
      const bottom = nr && nr.height ? nr.top - 8 : innerHeight - 12;
      sh.style.maxHeight = Math.max(240, bottom - r.bottom - 6) + "px";
    }
  }
  addEventListener("resize", () => fst.id && fPlace());
  function fOpen(id) {
    calcClose();
    pkClose();
    /* ボタンが画面の上に隠れていたら、見えるところまで戻してから開く */
    const b = [...document.querySelectorAll(`.fsh-b[data-fsh="${id}"]`)].find(x => x.offsetParent);
    if (b) {
      const r = b.getBoundingClientRect(),
        hd = document.querySelector(".appbar")?.getBoundingClientRect().bottom || 60;
      if (r.top < hd + 4) scrollBy(0, r.top - hd - 12);
    }
    fst.id = id;
    fst.sub = "";
    fst.first = true;
    fRender();
    if (!TOUCH) document.querySelector("#fshHost .fsh-row")?.focus();
  }
  function fClose() {
    if (!fst.id) return;
    const id = fst.id;
    fst.id = fst.sub = "";
    fRender();
    document.querySelectorAll(`.fsh-b[data-fsh="${id}"]`).forEach(x => x.setAttribute("aria-expanded", "false"));
    if (!TOUCH) document.querySelector(`.fsh-b[data-fsh="${id}"]`)?.focus();
  }
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest("[data-fsh],[data-fshclose],[data-fshsub],[data-fshk],[data-fshreset]");
    if (!t) return;
    const d = t.dataset;
    if (d.fshreset !== undefined) {
      const o = defs[d.fshreset];
      if (o) o.reset();
      if (fst.id) {
        fst.sub = "";
        fRender();
      }
    } else if (d.fsh !== undefined) {
      if (fst.id === d.fsh && t.classList.contains("fsh-b")) fClose();
      else fOpen(d.fsh);
    } else if (d.fshclose) fClose();
    else if (d.fshsub !== undefined) {
      fst.sub = fst.sub === d.fshsub ? "" : d.fshsub;
      fst.subFirst = !!fst.sub;
      fst.at = Date.now();
      fRender();
      const on = document.querySelector("#fshHost .fsh-sub .dd-row.on");
      if (on) on.scrollIntoView({ block: "nearest" });
      if (!TOUCH) (on || document.querySelector("#fshHost .fsh-sub .dd-row"))?.focus();
    } else if (d.fshk !== undefined) {
      /* 開いた直後の指の離れで、下に出てきた選択肢を押してしまわないように少し待つ */
      if (Date.now() - fst.at < 300) return;
      const o = defs[fst.id];
      const k = d.fshk;
      fst.sub = "";
      if (o) o.pick(k, d.fshv);
      fRender();
      if (!TOUCH) document.querySelector(`#fshHost .fsh-row[data-fshsub="${k}"]`)?.focus();
    }
  });
  document.addEventListener(
    "keydown",
    e => {
      if (e.key === "Escape" && fst.id) {
        e.preventDefault();
        e.stopPropagation();
        if (fst.sub) {
          fst.sub = "";
          fRender();
        } else fClose();
      }
    },
    true,
  );

  /* ===================== 電卓キーボード（金額欄） =====================
     対象：inputmode="numeric" の数字の欄（給料日など上限のある欄と data-nocalc は除く）
     ・入力した式（例 1200+300×2）の答えを、そのまま欄に入れていく（欄の input のイベントも出す）
     ・スマホは端末のキーボードを出さず、画面の下に電卓を出す。PCは欄のすぐ下に出し、数字・＋−＊／・Enter でも打てる */
  const CALC_SEL = 'input[type="number"][inputmode="numeric"]:not([max]):not([data-nocalc])';
  const OPS = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  const cs = { el: null, id: "", expr: "", fresh: true, start: "" };
  UI.calcSel = CALC_SEL;
  /* スマホ：端末のキーボードを出さない（描き直して増えた欄にも付ける） */
  const markNoKb = root => {
    if (!TOUCH) return;
    const l = root.matches && root.matches(CALC_SEL) ? [root] : [];
    if (root.querySelectorAll) l.push(...root.querySelectorAll(CALC_SEL));
    l.forEach(el => {
      if (el.dataset.calc) return;
      el.dataset.calc = "1";
      el.setAttribute("inputmode", "none");
    });
  };
  const isCalc = el => el && el.matches && (el.matches(CALC_SEL) || (el.dataset && el.dataset.calc === "1" && el.type === "number"));
  if (TOUCH) {
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && markNoKb(n)))).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => markNoKb(document));
    markNoKb(document);
  }
  const fmt = s => s.replace(/\d+/g, n => Number(n).toLocaleString("ja-JP")).replace(/[+\-*/]/g, o => ` ${OPS[o]} `);
  function evalExpr(s) {
    s = s.replace(/[+\-*/]+$/, "");
    if (!s) return null;
    const tk = s.match(/\d+|[+\-*/]/g) || [];
    /* × ÷ を先に計算する */
    const st = [];
    let op = "+";
    for (const t of tk) {
      if (/\d/.test(t)) {
        const n = Number(t);
        if (op === "*") st.push(st.pop() * n);
        else if (op === "/") st.push(n ? st.pop() / n : st.pop());
        else st.push(op === "-" ? -n : n);
      } else op = t;
    }
    return Math.round(st.reduce((a, b) => a + b, 0));
  }
  const hasOp = s => /\d[+\-*/]/.test(s);
  function cLabel(el) {
    const l = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    const t = l ? [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim() : "";
    return t || el.getAttribute("aria-label") || "金額";
  }
  function cBox() {
    let b = document.getElementById("calc");
    if (b) return b;
    b = document.createElement("div");
    b.id = "calc";
    b.setAttribute("role", "group");
    b.setAttribute("aria-label", "電卓");
    const k = (v, l, c) => `<button type="button" tabindex="-1" class="cky${c ? " " + c : ""}" data-cky="${v}">${l}</button>`;
    b.innerHTML = `<div class="c-h"><span class="c-lab" id="calcLab"></span><button type="button" tabindex="-1" class="c-nav" data-cnav="-1" aria-label="前の欄">‹</button><button type="button" tabindex="-1" class="c-nav" data-cnav="1" aria-label="次の欄">›</button><button type="button" tabindex="-1" class="c-done" data-cky="ok">完了</button></div>
      <div class="c-disp"><div class="c-expr" id="calcExpr"></div><div class="c-res" id="calcRes"></div></div>
      <div class="c-keys">${[
        k("C", "C", "fn"), k("bs", "⌫", "fn"), k("/", "÷", "op"), k("*", "×", "op"),
        k("7", "7"), k("8", "8"), k("9", "9"), k("-", "−", "op"),
        k("4", "4"), k("5", "5"), k("6", "6"), k("+", "+", "op"),
        k("1", "1"), k("2", "2"), k("3", "3"), k("=", "=", "eq"),
        k("0", "0"), k("00", "00"), k("000", "000"), k("ok", "完了", "go"),
      ].join("")}</div>
      <div class="c-hint">キーボードでも打てます（＋ − ＊ ／・Enter）</div>`;
    /* 押しても欄から離れないように（PCで欄の文字入れが続けられるように） */
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", e => {
      const n = e.target.closest("[data-cnav]");
      if (n) return cNav(+n.dataset.cnav);
      const t = e.target.closest("[data-cky]");
      if (t) cKey(t.dataset.cky);
    });
    document.body.appendChild(b);
    return b;
  }
  function cPaint() {
    const r = evalExpr(cs.expr);
    document.getElementById("calcExpr").textContent = cs.expr ? fmt(cs.expr) : "0";
    document.getElementById("calcRes").textContent = hasOp(cs.expr) && r != null ? "= ¥" + r.toLocaleString("ja-JP") : "";
  }
  /* 答えを欄に入れて、欄のイベントを出す（金額の合計などがその場で変わる） */
  function cWrite() {
    let el = cs.el;
    if (el && !el.isConnected && cs.id) el = cs.el = document.getElementById(cs.id);
    if (!el || !el.isConnected) return;
    const r = evalExpr(cs.expr);
    const v = r == null ? "" : String(Math.max(0, r));
    if (el.value === v) return;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function cKey(k) {
    if (!cs.el) return;
    if (k === "ok") return calcClose(true);
    if (/^\d+$/.test(k)) {
      if (cs.fresh) cs.expr = "";
      cs.fresh = false;
      const m = cs.expr.match(/(\d*)$/)[1];
      if (m === "0") cs.expr = cs.expr.slice(0, -1) + (k.replace(/^0+/, "") || "0");
      else if (!m && /^0+$/.test(k)) cs.expr += "0";
      else if (m.length + k.length <= 12) cs.expr += k;
    } else if (OPS[k]) {
      cs.fresh = false;
      if (!cs.expr) return;
      cs.expr = /[+\-*/]$/.test(cs.expr) ? cs.expr.slice(0, -1) + k : cs.expr + k;
    } else if (k === "bs") {
      cs.fresh = false;
      cs.expr = cs.expr.slice(0, -1);
    } else if (k === "C") {
      cs.fresh = false;
      cs.expr = "";
    } else if (k === "=") {
      const r = evalExpr(cs.expr);
      cs.expr = r == null ? "" : String(Math.max(0, r));
      cs.fresh = true;
    }
    cPaint();
    cWrite();
  }
  /* 同じ画面（シートの中など）の、前・次の金額欄へ */
  function cTargets() {
    const root = cs.el.closest(".sheet,.pop,.rv,.view,section") || document;
    return [...root.querySelectorAll(CALC_SEL + ',input[data-calc="1"]')].filter(x => x.offsetParent && !x.disabled);
  }
  function cNav(d) {
    if (!cs.el) return;
    const l = cTargets(),
      i = l.indexOf(cs.el),
      n = l[i + d];
    if (n) n.focus();
  }
  function cPlace() {
    const b = cBox(),
      el = cs.el;
    if (!el) return;
    if (TOUCH) {
      b.className = "sheet-m";
      document.documentElement.style.setProperty("--calch", b.offsetHeight + "px");
      /* 欄が電卓に隠れないように動かす（シートの中はシートを、ほかは画面を） */
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(),
          lim = innerHeight - b.offsetHeight - 16,
          top = (document.querySelector(".appbar")?.getBoundingClientRect().bottom || 56) + 8;
        const sc = el.closest(".sheet,.pop");
        const d = r.bottom > lim ? r.bottom - lim : r.top < top ? r.top - top : 0;
        if (!d) return;
        if (sc && sc.scrollHeight > sc.clientHeight) sc.scrollTop += d;
        else scrollBy(0, d);
      });
    } else {
      b.className = "pop-m";
      const w = b.offsetWidth,
        h = b.offsetHeight;
      let r = el.getBoundingClientRect();
      /* 上にも下にも入らないときは、欄の下に入るように画面を動かす */
      if (innerHeight - r.bottom - 12 < h && r.top - 12 < h && !cs.moved) {
        cs.moved = true;
        const top = (document.querySelector(".appbar")?.getBoundingClientRect().bottom || 56) + 8;
        const d = Math.min(r.bottom + h + 18 - innerHeight, r.top - top);
        const sc = el.closest(".sheet,.pop");
        if (d > 0) {
          if (sc && sc.scrollHeight > sc.clientHeight) sc.scrollTop += d;
          else scrollBy(0, d);
          r = el.getBoundingClientRect();
        }
      }
      let top = innerHeight - r.bottom - 12 >= h ? r.bottom + 6 : r.top - 12 >= h ? r.top - h - 6 : r.bottom + 6;
      /* どんなときも画面の中に収める */
      top = Math.max(8, Math.min(top, innerHeight - h - 8));
      b.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
      b.style.top = top + "px";
    }
  }
  function calcOpen(el) {
    const same = cs.el === el || (cs.el && cs.id && cs.id === el.id && !cs.el.isConnected);
    if (same && document.documentElement.classList.contains("calcopen")) {
      cs.el = el;
      cPlace();
      return;
    }
    if (cs.el && cs.el !== el) calcClose(false, true);
    pkClose();
    cs.el = el;
    cs.id = el.id || "";
    cs.expr = el.value && /^\d+$/.test(el.value) ? String(Number(el.value)) : "";
    cs.start = el.value;
    cs.fresh = true;
    cs.moved = false;
    const b = cBox();
    document.getElementById("calcLab").textContent = cLabel(el);
    b.hidden = false;
    document.documentElement.classList.add("calcopen");
    el.classList.add("calcon");
    const l = cTargets();
    b.querySelector('[data-cnav="-1"]').disabled = l.indexOf(el) <= 0;
    b.querySelector('[data-cnav="1"]').disabled = l.indexOf(el) >= l.length - 1;
    cPaint();
    cPlace();
  }
  /* 閉じる：式は答えにまとめて、変わっていれば change も出す */
  function calcClose(blur, keep) {
    const el = cs.el;
    if (!el) return;
    if (/[+\-*/]/.test(cs.expr)) cWrite();
    cs.el = null;
    el.classList.remove("calcon");
    if (el.isConnected && el.value !== cs.start) el.dispatchEvent(new Event("change", { bubbles: true }));
    if (keep) return;
    const b = document.getElementById("calc");
    if (b) b.hidden = true;
    document.documentElement.classList.remove("calcopen");
    if (blur && TOUCH && el.isConnected) el.blur();
  }
  UI.calcClose = () => calcClose();
  document.addEventListener("focusin", e => {
    if (isCalc(e.target)) calcOpen(e.target);
    else if (cs.el && !e.target.closest("#calc")) calcClose();
  });
  /* PC：ほかの所へ移ったら閉じる */
  document.addEventListener("focusout", e => {
    if (TOUCH || e.target !== cs.el) return;
    setTimeout(() => {
      if (cs.el && document.activeElement !== cs.el && !isCalc(document.activeElement)) calcClose();
    });
  });
  /* スマホ：欄と電卓の外を押したら閉じる */
  document.addEventListener(
    "pointerdown",
    e => {
      if (!cs.el || !e.target.closest) return;
      if (e.target.closest("#calc") || isCalc(e.target)) return;
      calcClose(true);
    },
    true,
  );
  /* 開いている欄を押し直したとき（スマホで閉じたあと、もう一度押したとき） */
  document.addEventListener("click", e => {
    if (isCalc(e.target) && !cs.el) calcOpen(e.target);
  });
  /* PC：キーボードで式を打つ */
  document.addEventListener(
    "keydown",
    e => {
      if (!cs.el || e.target !== cs.el || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const k = e.key;
      let c = null;
      if (/^[0-9]$/.test(k)) c = k;
      else if (k === "+" || k === "-" || k === "*" || k === "/") c = k;
      else if (k === "x" || k === "X") c = "*";
      else if (k === "Backspace") c = "bs";
      else if (k === "Delete") c = "C";
      else if (k === "=") c = "=";
      else if (k === "Enter") {
        /* 確定して閉じる（Enterで保存する画面は、そのまま保存まで進む） */
        if (/[+\-*/]/.test(cs.expr)) cKey("=");
        calcClose();
        return;
      } else if (k === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        calcClose();
        return;
      } else if (k === "Tab") {
        calcClose();
        return;
      } else if (k === "ArrowUp" || k === "ArrowDown" || k === "." || k === "e" || k === "E") {
        e.preventDefault();
        return;
      }
      if (c) {
        e.preventDefault();
        cKey(c);
      }
    },
    true,
  );
  addEventListener("resize", () => cs.el && cPlace());
  document.addEventListener("scroll", e => cs.el && !TOUCH && !(e.target.closest && e.target.closest("#calc")) && cPlace(), true);
})();
