// ============================================================
// Step Up 全データ同期 (stepup-sync.js)
// ------------------------------------------------------------
// 役割:
//   localStorage の学習データ(stepup-* キー)全体を、ログイン中
//   アカウントの Firestore(users/{uid}/kv/{キー名})と双方向に
//   同期する。
// 背景:
//   従来 app.js 内の Firebase 同期は「今日の計画データ
//   (stepup-v4-* の checks / customTasks / activeTaskIndex)」
//   だけで、課題進捗・学習報告・教材・内申点・どこスタ記録
//   などは他端末に反映されなかった。本モジュールが後継となり、
//   app.js 側の旧同期(saveChecksToFirebase / savePlanToFirebase
//   / startCheckSync)は本モジュールへの委譲に置き換えた。
// 競合ルール:
//   キーごとに updatedAt(ミリ秒) が新しい方を優先する。
//   例外: stepup-v4-* キーは、両方の値が JSON オブジェクトなら
//   フィールド単位でマージする(下記 mergeV4Values を参照)。部分的な
//   状態しか持たない端末の保存が、他の端末のカスタム計画(customTasks)
//   を丸ごと消してしまうのを防ぐため。
// オフライン時:
//   localStorage のみで動作し、オンライン復帰時に自動で送る。
// 前提:
//   家族全員が同じメールアドレス/パスワードでログインし、
//   同じ uid のドキュメントを共有する(従来の認証モデルと同じ)。
// ============================================================
(function () {
  'use strict';

  var META_KEY = 'stepup-sync-v2-meta'; // 同期メタ(端末ローカル。同期対象外)
  var EXCLUDE_EXACT = { 'stepup-theme': true, 'stepup-sync-meta-v1': true };
  var EXCLUDE_PREFIX = ['stepup-progress-migrated-', 'stepup-progress-backup-'];

  // リモート反映時は元の setItem/removeItem を使い、再送信ループを防ぐ。
  var origSet = localStorage.setItem.bind(localStorage);
  var origRemove = localStorage.removeItem.bind(localStorage);

  var state = {
    uid: null,
    started: false,
    unsubscribe: null,
    applyingRemote: false,
    pushTimers: {},
    lastHash: {}, // 最後にサーバーと一致を確認した値のハッシュ
    refreshTimer: null,
    authBound: false
  };

  // ---------- 対象キーの判定 ----------
  function isSyncTarget(k) {
    if (!k || typeof k !== 'string') return false;
    if (k === META_KEY) return false;
    if (EXCLUDE_EXACT[k]) return false;
    for (var i = 0; i < EXCLUDE_PREFIX.length; i++) {
      if (k.indexOf(EXCLUDE_PREFIX[i]) === 0) return false;
    }
    // 旧 familySync の syncEligibleKeys() と同じ接頭辞 + 学習報告キー
    return k.indexOf('stepup-') === 0 || k.indexOf('stepup_daily_report_') === 0;
  }

  function eligibleKeys() {
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (isSyncTarget(k)) ks.push(k);
    }
    return ks;
  }

  // ---------- メタ情報(キーごとの updatedAt を端末に保持) ----------
  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) { return {}; }
  }
  function setMeta(m) {
    try { origSet(META_KEY, JSON.stringify(m)); } catch (e) { /* 保存失敗は無視 */ }
  }
  function metaUpdatedAt(k) {
    var m = getMeta();
    return (m.updatedAt && m.updatedAt[k]) || 0;
  }
  function setMetaUpdatedAt(k, ts) {
    var m = getMeta();
    m.updatedAt = m.updatedAt || {};
    m.updatedAt[k] = ts;
    setMeta(m);
  }

  function hashOf(s) {
    if (s == null) return 'null';
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return s.length + ':' + h;
  }

  function fb() { return window.stepUpFirebase || null; }
  function kvDoc(f, k) { return f.doc(f.db, 'users', state.uid, 'kv', k); }

  function setStatus(text) {
    var el = document.querySelector('#syncStatus');
    if (el) el.textContent = text;
    var panel = el && el.closest ? el.closest('.sync-panel') : null;
    if (panel) {
      panel.classList.toggle('is-online', text.indexOf('同期中') >= 0);
      panel.classList.toggle('is-offline', text.indexOf('オフライン') >= 0);
    }
  }

  // ---------- ローカル → サーバー ----------
  function pushKey(k) {
    var f = fb();
    if (!f || !f.firestoreReady || !state.uid || !isSyncTarget(k)) return;
    var v = localStorage.getItem(k);
    var h = hashOf(v);
    if (state.lastHash[k] === h) return; // 送信済みの値と同一
    var ts = metaUpdatedAt(k) || Date.now();
    var payload = (v === null) ? { deleted: true, updatedAt: ts } : { value: v, updatedAt: ts };
    f.setDoc(kvDoc(f, k), payload).then(function () {
      state.lastHash[k] = h;
    }).catch(function (e) {
      // オフライン等で失敗した場合は lastHash を更新しない。
      // online イベント / 5秒間隔の点検で再送される。
      console.error('stepup sync push failed', k, e);
    });
  }

  function schedulePush(k) {
    if (state.pushTimers[k]) return;
    state.pushTimers[k] = setTimeout(function () {
      state.pushTimers[k] = null;
      pushKey(k);
    }, 700);
  }

  function flushAll() {
    eligibleKeys().forEach(function (k) { pushKey(k); });
  }

  // localStorage への書き込みを検知する(アプリ本体の保存処理はすべて
  // localStorage.setItem 経由のため、これで全変更を拾える)。
  function onLocalWrite(k) {
    if (state.applyingRemote || !isSyncTarget(k)) return;
    setMetaUpdatedAt(k, Date.now());
    schedulePush(k);
  }
  localStorage.setItem = function (k, v) { origSet(k, v); onLocalWrite(k); };
  localStorage.removeItem = function (k) { origRemove(k); onLocalWrite(k); };
  // 別タブで書き換えられた場合も拾う
  window.addEventListener('storage', function (e) {
    if (e.key && isSyncTarget(e.key)) onLocalWrite(e.key);
  });

  // 取りこぼし防止の定期点検(5秒間隔)
  setInterval(function () {
    if (!state.uid) return;
    eligibleKeys().forEach(function (k) {
      if (state.lastHash[k] !== undefined && state.lastHash[k] !== hashOf(localStorage.getItem(k))) {
        setMetaUpdatedAt(k, Date.now());
        schedulePush(k);
      }
    });
  }, 5000);

  // ---------- stepup-v4-* のフィールド単位マージ ----------
  // 本体の状態(stepup-v4-{日付}-{子ども})は、端末ごとに部分的な内容で
  // 保存され得る(例: チェック操作だけをした端末の状態には customTasks が
  // 無い)。キー単位の Last-Writer-Wins では、その部分状態が新しい
  // updatedAt で push された瞬間、子どもの端末にあるカスタム計画を含む
  // 状態が丸ごと上書きされて消えてしまう。
  // そこで v4 キーに限り、ローカル値とリモート値がどちらも JSON
  // オブジェクトならフィールド単位でマージする:
  //   - 片方にしか無いフィールドは残す
  //   - 両方にあるフィールドは updatedAt が新しい側の値を採用する
  // マージはリモート受信時の適用にのみ行い、マージ結果がリモート値と
  // 内容的に異なる場合(=ローカル固有のフィールドが残った場合)は、
  // 新しい updatedAt を付けて通常の push 経路で送り返し、全体を収束
  // させる。内容比較はキー順に依存しない canonical 形式で行うため、
  // 収束後はこちらから再送は発生せず、ループにはならない。
  function parseJsonObject(s) {
    if (typeof s !== 'string') return null;
    try {
      var o = JSON.parse(s);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) { /* JSON ではない */ }
    return null;
  }
  function isV4Key(k) { return typeof k === 'string' && k.indexOf('stepup-v4-') === 0; }
  function canonicalJson(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(canonicalJson).join(',') + ']';
    return '{' + Object.keys(o).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canonicalJson(o[k]);
    }).join(',') + '}';
  }
  // マージ結果のオブジェクトを返す。対象外(v4キーでない・どちらかが
  // JSONオブジェクトでない)なら null を返し、呼び出し側は従来の
  // Last-Writer-Wins にフォールバックする。
  function mergeV4Values(key, localStr, remoteStr, localTs, remoteTs) {
    if (!isV4Key(key)) return null;
    var lo = parseJsonObject(localStr);
    var ro = parseJsonObject(remoteStr);
    if (!lo || !ro) return null;
    var winner = remoteTs >= localTs ? ro : lo;
    var loser = winner === ro ? lo : ro;
    var merged = {};
    var k;
    for (k in loser) { if (Object.prototype.hasOwnProperty.call(loser, k)) merged[k] = loser[k]; }
    for (k in winner) { if (Object.prototype.hasOwnProperty.call(winner, k)) merged[k] = winner[k]; }
    return merged;
  }

  // ---------- サーバー → ローカル ----------
  function scheduleRefresh() {
    if (state.refreshTimer) return;
    state.refreshTimer = setTimeout(function () {
      state.refreshTimer = null;
      softRefresh();
    }, 1200);
  }

  function softRefresh() {
    // 入力中のフォームがある場合は再描画しない(入力内容を守る)。
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    try {
      if (document.querySelector('#family.active') && typeof window.openFamily === 'function') {
        window.openFamily();
        return;
      }
      if (document.querySelector('#mission.active') && typeof window.render === 'function') {
        window.render();
      }
    } catch (e) {
      console.error('stepup sync refresh failed', e);
    }
  }

  function start() {
    var f = fb();
    if (!f || !f.firestoreReady || !f.auth || !f.auth.currentUser) return;
    var uid = f.auth.currentUser.uid;
    if (state.started && state.uid === uid) return;
    stop();
    state.uid = uid;
    state.started = true;

    var col = f.collection(f.db, 'users', uid, 'kv');
    state.unsubscribe = f.onSnapshot(col, function (snap) {
      var changed = false;
      var remoteKeys = {};
      snap.forEach(function (d) {
        remoteKeys[d.id] = true;
        var data = d.data() || {};
        var rts = data.updatedAt || 0;
        var lts = metaUpdatedAt(d.id);
        if (rts > lts) {
          // サーバーの方が新しい → ローカルへ反映
          var pushBack = false;
          state.applyingRemote = true;
          try {
            if (data.deleted) {
              if (localStorage.getItem(d.id) !== null) origRemove(d.id);
            } else if (typeof data.value === 'string') {
              var curVal = localStorage.getItem(d.id);
              var mergedObj = mergeV4Values(d.id, curVal, data.value, lts, rts);
              if (mergedObj && canonicalJson(mergedObj) !== canonicalJson(parseJsonObject(data.value))) {
                // v4 マージの結果、ローカル固有のフィールドが残った。
                // ローカルへ反映し、下で送り返しを予約する。
                var mergedStr = JSON.stringify(mergedObj);
                if (curVal !== mergedStr) origSet(d.id, mergedStr);
                pushBack = true;
              } else if (curVal !== data.value) {
                origSet(d.id, data.value);
              }
            }
          } finally {
            state.applyingRemote = false;
          }
          if (pushBack) {
            // マージ結果はサーバーの値と内容が異なるため、このままでは
            // 他端末に届かない。updatedAt を両者より新しくして通常の
            // push 経路で送り返し、全体を同じ内容に収束させる。
            // lastHash にはサーバー値のハッシュを入れておく(ローカル値と
            // ハッシュが異なるため pushKey が送信対象と判定する)。
            setMetaUpdatedAt(d.id, Math.max(Date.now(), rts + 1));
            state.lastHash[d.id] = hashOf(data.value);
            schedulePush(d.id);
          } else {
            setMetaUpdatedAt(d.id, rts);
            state.lastHash[d.id] = hashOf(localStorage.getItem(d.id));
          }
          changed = true;
        } else if (rts === lts) {
          state.lastHash[d.id] = hashOf(localStorage.getItem(d.id));
        } else {
          // ローカルの方が新しい(オフライン中に変更した等) → 送り直す
          schedulePush(d.id);
        }
      });
      // サーバーにまだ無いローカルキーは初回アップロードする
      eligibleKeys().forEach(function (k) {
        if (!remoteKeys[k]) {
          if (!metaUpdatedAt(k)) setMetaUpdatedAt(k, Date.now());
          schedulePush(k);
        }
      });
      if (changed) scheduleRefresh();
      if (navigator.onLine) setStatus('家族と同期中');
    }, function (e) {
      console.error('stepup sync subscribe failed', e);
      setStatus('同期エラー（この端末に保存中）');
    });
  }

  function stop() {
    if (state.unsubscribe) {
      try { state.unsubscribe(); } catch (e) { /* noop */ }
      state.unsubscribe = null;
    }
    state.started = false;
    state.uid = null;
  }

  // ---------- 起動(Firebase の準備完了とログインを待つ) ----------
  function bindAuth() {
    var f = fb();
    if (!f || !f.auth || state.authBound) return;
    state.authBound = true;
    f.onAuthStateChanged(f.auth, function (user) {
      if (user) start();
      else stop();
    });
  }

  function whenReady() {
    var f = fb();
    if (f && f.firestoreReady) { bindAuth(); start(); return; }
    var n = 0;
    var t = setInterval(function () {
      n++;
      var f2 = fb();
      if (f2 && f2.firestoreReady) {
        clearInterval(t);
        bindAuth();
        start();
      } else if (n > 40) {
        clearInterval(t);
      }
    }, 300);
  }
  window.addEventListener('stepUpFirestoreReady', whenReady);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', whenReady);
  } else {
    whenReady();
  }

  window.addEventListener('online', function () { flushAll(); setStatus('家族と同期中'); });
  window.addEventListener('offline', function () { setStatus('オフライン：この端末に保存中（復帰時に同期）'); });

  // app.js 側の旧同期関数からの委譲先
  window.StepUpSync = {
    start: start,
    pushKey: function (k) { if (isSyncTarget(k)) { schedulePush(k); } },
    flushAll: flushAll
  };
})();
