/* ============================================================
   Step Up Version 7.1
   7月30日時点 課題進捗 一括反映スクリプト【最終統合版】（1回だけ実行）
   ------------------------------------------------------------
   ・既存のlocalStorageは削除しません
   ・実行前に自動でバックアップを取得します（window.stepUpBackup_20260730 に保持）
   ・対象の課題だけを更新し、それ以外のデータには触れません
   ・何度実行しても同じ結果になるよう作られています（重複登録なし）
   ・総ページ数が不明な課題は、割合を計算せず文字列のまま反映します
   ・「先生課題 物理」はDay単位のまま管理し、Day1・Day2のみ完了にします
   ・サマースクールは「種別：ワーク」「説明：5教科が1冊にまとまった教材」として登録します
   ============================================================ */
(function(){
 'use strict';

 // ---------- 0. 実行前バックアップ ----------
 const backup = {};
 for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  backup[k] = localStorage.getItem(k);
 }
 window.stepUpBackup_20260730 = backup;
 console.log('%c[バックアップ完了] window.stepUpBackup_20260730 に ' + Object.keys(backup).length + ' 件のキーを保存しました。',
  'color:#146aff;font-weight:bold');
 console.log('元に戻したい場合は、このスクリプトの下にある restoreStepUpBackup_20260730() を実行してください。');

 window.restoreStepUpBackup_20260730 = function(){
  const b = window.stepUpBackup_20260730;
  if(!b){ console.error('バックアップが見つかりません。'); return; }
  localStorage.clear();
  Object.keys(b).forEach(k => localStorage.setItem(k, b[k]));
  console.log('%c[復元完了] 実行前の状態に戻しました。ページをリロードしてください。','color:#c0392b;font-weight:bold');
 };

 // ---------- 1. 共通ヘルパー ----------
 const norm = s => (s || '').replace(/[\s　]/g, '').toLowerCase();

 const results = { updated: [], created: [], skipped: [], errors: [] };

 function updateCanonical(childId, id, patch, label){
  try{
   const before = ProgressEngine.getAll(childId).find(it => it.id === id);
   if(!before){
    results.errors.push(`${label}: 見つかりませんでした(id=${id})`);
    return;
   }
   ProgressEngine.updateItem(childId, id, patch);
   results.updated.push(`${childId} / ${before.title}`);
  }catch(e){
   results.errors.push(`${label}: エラー - ${e.message}`);
  }
 }

 // 既存項目をタイトルで検索し、見つかればそのIDを更新、無ければ新規カスタム項目として作成する。
 // 何度実行しても、同じタイトルが既にあれば「更新」だけになり、重複登録は起きない。
 function findOrCreateCustom(childId, titleQuery, subject, patch){
  try{
   const all = ProgressEngine.getAll(childId);
   const nq = norm(titleQuery);
   const match = all.find(it => {
    const n = norm(it.title);
    return n && (n.includes(nq) || nq.includes(n));
   });
   if(match){
    ProgressEngine.updateItem(childId, match.id, patch);
    results.updated.push(`${childId} / ${match.title}（既存項目として更新）`);
    return;
   }
   const customs = getCustomAssignments(childId);
   const safeId = titleQuery.replace(/[^0-9A-Za-zぁ-んァ-ヶー一-龠]/g, '');
   const newId = `${childId}-custom-manual-${safeId}`;
   if(customs.some(c => c.id === newId)){
    ProgressEngine.updateItem(childId, newId, patch);
    results.updated.push(`${childId} / ${titleQuery}（既存の手動項目を更新）`);
    return;
   }
   const entry = Object.assign({
    id: newId, subject: subject || '', title: titleQuery, category: '',
    status: 'not-started', done: false, progress: '', remaining: ''
   }, patch);
   customs.push(entry);
   saveCustomAssignments(childId, customs);
   results.created.push(`${childId} / ${titleQuery}（新規追加）`);
  }catch(e){
   results.errors.push(`${childId} / ${titleQuery}: エラー - ${e.message}`);
  }
 }

 // ============================================================
 // ■ さくや（sakuya）
 // ============================================================

 // 【完了】
 updateCanonical('sakuya', 'sakuya-reading-report', {status:'completed', done:true, progress:'完了', remaining:'なし'}, 'さくや:読書感想文');
 updateCanonical('sakuya', 'sakuya-word-order-training', {status:'completed', done:true, progress:'完了', remaining:'なし'}, 'さくや:くり返し語順トレーニング');
 updateCanonical('sakuya', 'sakuya-elementary-english-words', {status:'completed', done:true, progress:'完了', remaining:'なし'}, 'さくや:小学英単語');
 updateCanonical('sakuya', 'sakuya-home-economics-handnote', {status:'completed', done:true, progress:'丸付け済', remaining:'なし'}, 'さくや:ハンドノート');
 updateCanonical('sakuya', 'sakuya-gagaku', {status:'completed', done:true, progress:'完了', remaining:'なし'}, 'さくや:雅楽について調べよう');

 findOrCreateCustom('sakuya', '合唱コンの曲を5回聞く', '音楽', {status:'completed', done:true, progress:'完了（5回聴取済み）', remaining:'なし'});

 // 「サマースクール」は既存の「サマースクール数学」(sakuya-summer-math)とは別の、
 // 完全に独立した新規課題として追加する（あいまい一致で既存項目に統合されないよう、固定IDで直接作成する）。
 // 課題名：サマースクール／種別：ワーク／説明：国語・数学・英語・理科・社会の5教科が1冊にまとまった教材／状態：完了
 (function addSakuyaSummerSchoolAsNewItem(){
  try{
   const customs = getCustomAssignments('sakuya');
   const newId = 'sakuya-custom-manual-summerschool2026';
   const already = customs.find(c => c.id === newId);
   const patch = {
    title:'サマースクール', subject:'ワーク',
    note:'国語・数学・英語・理科・社会の5教科が1冊にまとまった教材',
    status:'completed', done:true, progress:'完了', remaining:'なし'
   };
   if(already){
    Object.assign(already, patch);
    saveCustomAssignments('sakuya', customs);
    results.updated.push('sakuya / サマースクール（既存の新規項目を更新）');
   } else {
    customs.push(Object.assign({id:newId, category:''}, patch));
    saveCustomAssignments('sakuya', customs);
    results.created.push('sakuya / サマースクール（新規追加）');
   }
  }catch(e){
   results.errors.push('さくや:サマースクール: エラー - ' + e.message);
  }
 })();

 // 【進行中】※総ページ数が不明なため、割合は計算せず文字列のみ反映
 updateCanonical('sakuya', 'sakuya-japanese', {status:'in-progress', done:false, progress:'残り10ページ', remaining:'10ページ'}, 'さくや:国語の学習');
 updateCanonical('sakuya', 'sakuya-kanji-skill', {status:'in-progress', done:false, progress:'残り1ページ', remaining:'1ページ'}, 'さくや:漢字スキル');

 // 【未着手】（現状維持の確認のみ。既に未着手のはずだが念のため明示）
 updateCanonical('sakuya', 'sakuya-ima-dekiru', {status:'not-started', done:false}, 'さくや:今の私に出来ること');
 updateCanonical('sakuya', 'sakuya-woodwork', {status:'not-started', done:false}, 'さくや:木工作品アイデアスケッチ');
 findOrCreateCustom('sakuya', 'アルトリコーダー', '音楽', {status:'not-started', done:false});
 updateCanonical('sakuya', 'sakuya-keynote', {status:'not-started', done:false}, 'さくや:キーノート下書き');
 updateCanonical('sakuya', 'sakuya-disaster-report', {status:'not-started', done:false}, 'さくや:防災レポート');

 // ============================================================
 // ■ 壱凰（iori）
 // ============================================================

 // 【完了】
 updateCanonical('iori', 'iori-essay', {status:'completed', done:true, progress:'完了', remaining:'なし'}, '壱凰:国語 作文');
 findOrCreateCustom('iori', 'ことばのきまり', '国語', {status:'completed', done:true, progress:'完了', remaining:'なし'});
 updateCanonical('iori', 'iori-japanese-research', {status:'completed', done:true, progress:'P106〜135まで完了（丸付け済）', remaining:'なし'}, '壱凰:国語新研究');
 updateCanonical('iori', 'iori-history-study', {status:'completed', done:true, progress:'P80〜91まで完了（丸付け済）', remaining:'なし'}, '壱凰:歴史の学習');
 updateCanonical('iori', 'iori-social-research', {status:'completed', done:true, progress:'P78〜111まで完了（丸付け済）', remaining:'なし'}, '壱凰:社会新研究');
 findOrCreateCustom('iori', '数学 新研究', '数学', {status:'completed', done:true, progress:'P81まで完了', remaining:'なし'});
 updateCanonical('iori', 'iori-science-research', {status:'completed', done:true, progress:'P78〜113まで完了（丸付け済）', remaining:'なし'}, '壱凰:理科新研究');
 findOrCreateCustom('iori', '家庭科・技術', '家庭科・技術', {status:'completed', done:true, progress:'完了', remaining:'なし'});
 updateCanonical('iori', 'iori-integrated-study', {status:'completed', done:true, progress:'完了（総合プリント）', remaining:'なし'}, '壱凰:総合プリント');

 // 【進行中】※総ページ数が不明なため、割合は計算せず文字列のみ反映
 findOrCreateCustom('iori', '数学ワーク', '数学', {status:'in-progress', done:false, progress:'P59まで丸付け済', remaining:'P59以降'});
 updateCanonical('iori', 'iori-joyful-work', {status:'in-progress', done:false, progress:'P26まで完了', remaining:'P26以降'}, '壱凰:英語ジョイフルワーク');
 updateCanonical('iori', 'iori-english-research', {status:'in-progress', done:false, progress:'P76〜105まで完了（丸付け済）', remaining:'P105以降'}, '壱凰:英語新研究');

 // 先生課題 物理：Day1〜Day14の個別カード形式のまま管理する。
 // サマリー用のメモ項目は作成しない。分かっている範囲(Day1・Day2完了)だけをDay単位で反映し、
 // Day3〜Day14には一切触れない（特定のDayを推測で完了にしない）。
 (function markPhysicsDay1Day2Complete(){
  try{
   const all = ProgressEngine.getAll('iori');
   [1,2].forEach(day=>{
    const id = tutorPhysicsItemId(day);
    const item = all.find(it => it.id === id);
    if(item){
     ProgressEngine.updateItem('iori', id, {status:'completed', done:true, progress:'完了', remaining:'なし'});
     results.updated.push(`iori / 家庭教師 物理 Day${day} → 完了`);
    } else {
     results.errors.push(`iori:家庭教師 物理 Day${day} が見つかりませんでした`);
    }
   });
   // 万が一、以前のバージョンで作成してしまった「物理1年総復習（14日分）」のメモ項目が
   // 残っている場合は削除する（Day単位管理に統一するため）
   const ioriCustoms = getCustomAssignments('iori');
   const summaryId = 'iori-custom-manual-物理1年総復習14日分';
   const beforeCount = ioriCustoms.length;
   const filtered = ioriCustoms.filter(c => c.id !== summaryId);
   if(filtered.length !== beforeCount){
    saveCustomAssignments('iori', filtered);
    results.updated.push('iori / 旧「物理1年総復習」メモ項目を削除しました');
   }
  }catch(e){
   results.errors.push('物理Day1/2更新: エラー - ' + e.message);
  }
 })();

 // ---------- 実行結果の表示 ----------
 console.log('%c=== 反映結果 ===', 'color:#1e8a4c;font-weight:bold;font-size:14px');
 console.log(`更新: ${results.updated.length}件`);
 results.updated.forEach(x => console.log('  ✓', x));
 console.log(`新規追加: ${results.created.length}件`);
 results.created.forEach(x => console.log('  ＋', x));
 if(results.errors.length){
  console.log(`%cエラー: ${results.errors.length}件`, 'color:#c0392b;font-weight:bold');
  results.errors.forEach(x => console.error('  ✗', x));
 } else {
  console.log('%cエラーなし', 'color:#1e8a4c');
 }
 console.log('%c完了しました。ページをリロードして表示をご確認ください。', 'color:#146aff;font-weight:bold');
})();
