const data=window.StepUpData.children;
const testEvents=window.StepUpData.testEvents;
// Sprint 47: 固定日付を廃止し、端末の現在日付を基準にする。
// 日付キーはローカル時刻のYYYY-MM-DD形式で統一する。
function computeTodayDateOnly(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function formatDateKey(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
const TODAY=computeTodayDateOnly();
const PLAN_DATE=formatDateKey(TODAY);
const assignmentData=window.StepUpData.assignments;
const assignmentProgressKey=id=>`stepup-assignment-progress-${id}`;
const nextPlanKey=id=>`stepup-next-plan-${id}`;
const assignmentStatusLabels={completed:'完了済み','in-progress':'進行中','not-started':'未着手'};

function assignmentItems(id=current){
 const source=assignmentData?.[id]?.items||[];
 const saved=JSON.parse(localStorage.getItem(assignmentProgressKey(id))||'{}');
 return source.map(item=>({...item,...(saved[item.id]||{})}));
}
function saveAssignmentItems(id,items){
 const prev=JSON.parse(localStorage.getItem(assignmentProgressKey(id))||'{}');
 const states={};
 items.forEach(item=>{
  const before=prev[item.id]||{};
  const changed=before.status!==item.status||before.current!==item.current||before.progress!==item.progress||before.remaining!==item.remaining;
  states[item.id]={
   status:item.status,progress:item.progress,remaining:item.remaining,current:item.current,total:item.total,
   deadline:item.deadline,done:item.done,updatedAt:changed?new Date().toISOString():(before.updatedAt||null),
   title:item.title,subject:item.subject,note:item.note!=null?item.note:before.note,
   progressType:item.progressType||before.progressType,unit:item.unit||before.unit,
   completedAt:item.done?(item.completedAt||before.completedAt||new Date().toISOString()):null
  };
 });
 localStorage.setItem(assignmentProgressKey(id),JSON.stringify(states));
}
function normalizeAssignmentText(text){return String(text||'').replace(/[\s・：:（）()]/g,'').toLowerCase()}
function extractReportedPage(text,name){
 const normalizedName=normalizeAssignmentText(name),normalizedText=normalizeAssignmentText(text);
 const nameIndex=normalizedText.indexOf(normalizedName);
 const nearby=nameIndex>=0?normalizedText.slice(nameIndex+normalizedName.length,nameIndex+normalizedName.length+40):normalizedText;
 const range=nearby.match(/(?:p|ページ)?(\d+)(?:〜|-|~|から)(\d+)/);
 if(range)return Number(range[2]);
 const match=nearby.match(/(?:p|ページ)(\d+)|(?:p|ページまで|ページを)?(\d+)ページ/);
 return match?Number(match[1]||match[2]):null;
}
function getAssignmentsForChild(id){
 return ProgressEngine.getAll(id).map(it=>({
  id:it.id,name:it.title,
  deadline:toIsoDeadlineOrDefault(it.deadline),
  current:it.current!=null?it.current:(it.done?1:0),
  total:it.total!=null?it.total:1,
  category:it.categoryLabel,
  updatedAt:it.updatedAt||null
 }));
}
function syncLearningProgress(id,name,current,total){
 const normalizedName=normalizeAssignmentText(name);
 const items=assignmentItems(id),item=items.find(entry=>normalizeAssignmentText(entry.title)===normalizedName);
 if(item){
  item.current=current;
  item.status=Number(current)>=Number(total||100)?'completed':'in-progress';
  item.progress=Number(current)>=Number(total||100)?'完了':`P${current}まで完了`;
  item.remaining=Number(current)>=Number(total||100)?'なし':`P${current}以降`;
  saveAssignmentItems(id,items);
 }
 const materials=getMaterials(id),material=materials.find(entry=>normalizeAssignmentText(entry.name)===normalizedName);
 if(material){material.current=current;material.done=Number(current)>=Number(total||100);saveMaterials(materials)}
}
function assignmentForTask(taskTitle,id=current){
 const task=normalizeAssignmentText(taskTitle);
 return assignmentItems(id).find(item=>{
  const title=normalizeAssignmentText(item.title);
  return title&& (task.includes(title)||title.includes(task));
 });
}
function isWeekday(){return TODAY.getDay()>=1&&TODAY.getDay()<=5}
function assignmentAllowedForPlan(item,id=current){
 if(!isWeekday())return true;
 if(id==='iori')return !['リコーダー','家庭科'].includes(item.subject);
 if(id==='sakuya')return !['家庭科','技術','音楽','美術','保健体育','副教科'].includes(item.subject)&&item.category!=='holiday-project';
 return true;
}
function assignmentPriority(item){
 const ranks={submission:1,'school-homework':2,'test-study':3,'weak-point':4,'advanced-study':5};
 return ranks[item.category]||5;
}
function createTomorrowPlan(id=current){
 const items=assignmentItems(id).filter(item=>item.status!=='completed'&&assignmentAllowedForPlan(item,id));
 const assignmentEntries=items.map(item=>({
  assignmentId:item.id,
  subject:item.subject,
  title:item.title,
  status:item.status,
  remaining:item.remaining,
  priority:assignmentPriority(item),
  category:item.category
 }));
 // どこスタの復習候補(間違い直し)を、定期テストの次・苦手単元の前(優先度3.5)に挿入する。
 const dokosutaEntries=getDokosutaReviewCandidates(id).map(entry=>{
  const minutes=dokosutaReviewMinutes(entry);
  const base={
   assignmentId:null,
   dokosutaId:entry.id,
   subject:entry.subject,
   title:`どこスタ ${entry.unit||entry.subject}の間違い直し`,
   status:'in-progress',
   remaining:`${minutes}分`,
   priority:3.5,
   category:'dokosuta-review',
   minutes
  };
  const linked=[base];
  // 壱凰の場合、単元名が一致する新研究があれば、関連ページ確認の候補も追加する(ページ番号は推測しない)
  if(id==='iori'){
   const relatedResearch=items.find(it=>it.title&&it.title.includes('新研究')&&it.subject===entry.subject);
   if(relatedResearch){
    linked.push({
     assignmentId:null,
     dokosutaId:entry.id,
     subject:entry.subject,
     title:`新研究の${entry.unit||entry.subject}関連ページを確認`,
     status:'in-progress',
     remaining:'ページ番号は本人が確認',
     priority:3.6,
     category:'dokosuta-research-link',
     minutes:20
    });
   }
  }
  return linked;
 }).flat();
 // 家庭教師 数学Day：10件を一度に出さず、最も番号の小さい未完了Dayだけを候補にする。
 const tutorMathEntries=[];
 if(id==='iori'){
  const allCustom=ProgressEngine.getAll('iori');
  let nextMathDay=null;
  for(let day=1;day<=IORI_TUTOR_MATH_TOTAL_DAYS;day++){
   const item=allCustom.find(x=>x.id===tutorMathItemId(day));
   if(item&&!item.done){nextMathDay=item;break}
  }
  if(nextMathDay){
   tutorMathEntries.push({
    assignmentId:nextMathDay.id,
    subject:'数学',
    title:nextMathDay.title,
    status:nextMathDay.status,
    remaining:nextMathDay.remaining||'10問（計算8問・応用2問）',
    priority:2,
    category:'school-homework'
   });
  }
 }
 const merged=[...assignmentEntries,...tutorMathEntries,...dokosutaEntries];
 return merged.sort((a,b)=>a.priority-b.priority);
}
function saveTomorrowPlan(id=current){
 const plan=createTomorrowPlan(id);
 localStorage.setItem(nextPlanKey(id),JSON.stringify({date:PLAN_DATE,childName:assignmentData[id]?.childName,items:plan}));
 return plan;
}
function assignmentStepText(id=current,additionalProgress=''){
 // Sprint 22: 課題名はgetTodayCheckedAssignmentTitles()だけを使う。
 // canonicalItems/assignmentItems()/教科名/次の課題などから推測しない。
 const titles=getTodayCheckedAssignmentTitles(id);
 if(titles.length)return `${titles.join('・')}に取り組み、${titles.length}個のミッションを進めました。`;
 if(additionalProgress)return `${additionalProgress.slice(0,40)}を記録し、昨日より一歩進んだ。`;
 return '今日できたことを一つ振り返った。';
}

// ============================================================
// Sprint 14: 共通進捗エンジン Ver.1
// 「データは共通・表示は子どもごと」という方針で、
// 既存の assignmentItems()/saveAssignmentItems()（＝window.StepUpData.assignments
// をベースにした②の仕組み）をそのまま正のデータ源として使い、そこに乗らない
// 項目だけを「カスタム項目」として別キーで補う。
// 各画面（ホーム・課題・教材・成長・AIコーチ・学習報告）は、この
// ProgressEngine.getAll(childId) / updateItem(childId, itemId, patch) を経由して
// 同じデータを参照する。
// ============================================================
const ASSIGNMENT_CATEGORY_LABELS={
 'submission':'提出期限','school-homework':'学校の宿題','test-study':'定期テスト対策',
 'weak-point':'苦手単元','advanced-study':'発展学習','holiday-project':'長期休み課題'
};
function categoryLabel(category){return ASSIGNMENT_CATEGORY_LABELS[category]||category||'課題'}
function customAssignmentKey(id){return 'stepup-assignment-custom-'+id}
function getCustomAssignments(id){
 try{const list=JSON.parse(localStorage.getItem(customAssignmentKey(id))||'[]');return Array.isArray(list)?list:[]}
 catch(e){console.error('ProgressEngine: カスタム課題の読み込みに失敗しました',e);return []}
}
function saveCustomAssignments(id,list){
 try{localStorage.setItem(customAssignmentKey(id),JSON.stringify(list))}
 catch(e){console.error('ProgressEngine: カスタム課題の保存に失敗しました',e)}
}
function toIsoDeadlineOrDefault(deadline){
 if(deadline&&/^\d{4}-\d{2}-\d{2}$/.test(deadline))return deadline;
 return '2026-08-31';
}

// ============================================================
// Sprint 23: 提出期限ページ 共通ロジック
// 期限の判定・並び順・AI学習計画向けデータ取得は、すべてここに集約する。
// ============================================================
const DEADLINE_CATEGORY_LABELS={overdue:'期限切れ・未完了',today:'今日まで',within3:'3日以内',within7:'7日以内',later:'それ以降',none:'期限未設定',done:'完了済み'};
const DEADLINE_GROUP_ORDER=['overdue','today','within3','within7','later','none','done'];
const DEADLINE_PRIORITY_RANK={overdue:1,today:2,within3:3,within7:4,later:5,none:6,done:7};
function todayDateOnly(){return new Date(TODAY)}
function parseDeadlineDateOnly(deadline){
 if(!deadline||!/^\d{4}-\d{2}-\d{2}$/.test(deadline))return null;
 const parts=deadline.split('-').map(Number);
 return new Date(parts[0],parts[1]-1,parts[2]);
}
function formatDeadlineMonthDay(dateObj){return `${dateObj.getMonth()+1}月${dateObj.getDate()}日`}
// 日付の時刻部分を使わず、年月日だけで日数差を出す（1日ずれ防止）
function deadlineInfo(deadline,done){
 if(done)return {category:'done',label:'完了',daysRemaining:null};
 const dl=parseDeadlineDateOnly(deadline);
 if(!dl)return {category:'none',label:'期限未設定',daysRemaining:null};
 const diffDays=Math.round((dl-todayDateOnly())/86400000);
 if(diffDays<0)return {category:'overdue',label:'期限切れ',daysRemaining:diffDays};
 if(diffDays===0)return {category:'today',label:'今日まで',daysRemaining:0};
 if(diffDays<=3)return {category:'within3',label:`あと${diffDays}日`,daysRemaining:diffDays};
 if(diffDays<=7)return {category:'within7',label:`あと${diffDays}日`,daysRemaining:diffDays};
 return {category:'later',label:formatDeadlineMonthDay(dl)+'まで',daysRemaining:diffDays};
}
function resolveProgressType(item){
 if(item.progressType)return item.progressType;
 if(item.total!=null)return 'numeric';
 if(item.progress||item.remaining)return 'status';
 return 'check';
}
// AI学習計画などが参照するための共通データ取得（今回は取得のみ。生成ロジックは変更しない）
function getPendingDeadlineAssignments(childId){
 return ProgressEngine.getAll(childId)
  .filter(a=>!a.done)
  .map(a=>{
   const info=deadlineInfo(a.deadline,a.done);
   return {
    assignmentId:a.id,
    title:a.title,
    subject:a.subject||'',
    dueDate:a.deadline||null,
    daysRemaining:info.daysRemaining,
    progress:a.current!=null?a.current:null,
    remaining:(a.total!=null&&a.current!=null)?Math.max(0,a.total-a.current):null,
    status:a.progress||a.status||'',
    category:info.category,
    label:info.label,
    priority:DEADLINE_PRIORITY_RANK[info.category]
   };
  })
  .sort((a,b)=>a.priority-b.priority||((a.daysRemaining??999)-(b.daysRemaining??999)));
}
function formatUpdatedAt(iso){
 if(!iso)return'まだ更新されていません';
 const d=new Date(iso);
 if(isNaN(d.getTime()))return'まだ更新されていません';
 return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}更新`;
}
const PROGRESS_STATUS_RANK={'not-started':0,'in-progress':1,'completed':2};
function mergeStatusRank(a,b){return (PROGRESS_STATUS_RANK[a]||0)>=(PROGRESS_STATUS_RANK[b]||0)?a:b}
function mergeMaxNumber(a,b){
 const an=Number(a),bn=Number(b),av=Number.isFinite(an)?an:null,bv=Number.isFinite(bn)?bn:null;
 if(av===null)return bv;if(bv===null)return av;return Math.max(av,bv);
}
// 旧データのタイトル → canonicalの課題ID（自動一致では拾えない組み合わせのみ明示指定）
const LEGACY_TITLE_TO_CANONICAL_ID={
 iori:{'社会 新研究':'iori-social-research','英語 新研究':'iori-english-research','ジョイフルワーク':'iori-joyful-work'},
 sakuya:{
  'くり返し語順トレーニング':'sakuya-word-order-training','繰り返し語順トレーニング':'sakuya-word-order-training',
  '小学英単語':'sakuya-elementary-english-words',
  '家庭科ハンドノート':'sakuya-home-economics-handnote','ハンドノート':'sakuya-home-economics-handnote',
  'サマースクール':'sakuya-summer-math','数学の友':'sakuya-summer-math',
  '国語ワーク':'sakuya-japanese','国語語句学習':'sakuya-japanese',
  '漢字スキル':'sakuya-kanji-skill',
  '今の私にできること':'sakuya-ima-dekiru','今の私に出来ること':'sakuya-ima-dekiru',
  '木工作品':'sakuya-woodwork','木工作品 アイデアスケッチ':'sakuya-woodwork',
  '雅楽':'sakuya-gagaku','雅楽について調べる':'sakuya-gagaku',
  'Keynote':'sakuya-keynote','Keynote下書き':'sakuya-keynote',
  '防災レポート':'sakuya-disaster-report'
 }
};
function resolveCanonicalIdByTitle(childId,title){
 const map=LEGACY_TITLE_TO_CANONICAL_ID[childId]||{};
 if(map[title])return map[title];
 const norm=normalizeAssignmentText(title);
 if(!norm)return null;
 const items=(assignmentData?.[childId]?.items)||[];
 const found=items.find(it=>{const n=normalizeAssignmentText(it.title);return n&&(n.includes(norm)||norm.includes(n))});
 return found?found.id:null;
}
function progressMigratedKey(id){return 'stepup-progress-migrated-'+id+'-v2'}
function progressBackupKey(id){return 'stepup-progress-backup-'+id}
function migrateProgressIfNeeded(id){
 if(localStorage.getItem(progressMigratedKey(id)))return;
 try{
  const backup={
   migratedAt:new Date().toISOString(),
   legacy1_assignments:localStorage.getItem('stepup-assignments-'+id),
   legacy2_progress:localStorage.getItem(assignmentProgressKey(id)),
   legacy3_summerAssignments:id==='sakuya'?localStorage.getItem('stepup-summer-assignments-sakuya'):null
  };
  localStorage.setItem(progressBackupKey(id),JSON.stringify(backup));
 }catch(e){console.error('ProgressEngine: バックアップの保存に失敗しました',e)}

 const items=assignmentItems(id);
 const customs=getCustomAssignments(id);

 function upsertCanonical(canonicalId,patch){
  const item=items.find(it=>it.id===canonicalId);
  if(!item)return false;
  item.status=mergeStatusRank(item.status,patch.status||'not-started');
  item.current=mergeMaxNumber(item.current,patch.current);
  item.total=item.total!=null?item.total:patch.total;
  item.deadline=item.deadline||patch.deadline||null;
  if(patch.progress)item.progress=patch.progress;
  if(patch.remaining)item.remaining=patch.remaining;
  if(item.status==='completed'){
   if(item.total!=null)item.current=item.total;
   if(!patch.progress&&(!item.progress||item.progress==='未着手'))item.progress='完了';
   item.remaining='なし';
  }
  item.done=item.status==='completed';
  return true;
 }
 function upsertCustom(sourceId,title,patch){
  const customId=id+'-custom-'+sourceId;
  const exists=customs.find(c=>c.id===customId);
  if(exists){
   exists.status=mergeStatusRank(exists.status,patch.status||'not-started');
   exists.current=mergeMaxNumber(exists.current,patch.current);
   exists.total=exists.total!=null?exists.total:patch.total;
   exists.done=exists.status==='completed';
  }else{
   customs.push({
    id:customId,subject:patch.subject||'',title,scope:patch.scope||'',
    deadline:patch.deadline||'',category:patch.category||'',
    status:patch.status||'not-started',current:patch.current??null,total:patch.total??null,
    progress:patch.progress||'',remaining:patch.remaining||'',done:(patch.status||'not-started')==='completed',
    source:'sprint13-14-migration'
   });
  }
 }

 // 旧①（stepup-assignments-{id}、ページ数ベース）を統合
 try{
  const legacy1=JSON.parse(localStorage.getItem('stepup-assignments-'+id)||'[]');
  legacy1.forEach(entry=>{
   const total=Number(entry.total)||null,cur=Number(entry.current)||0;
   const status=total&&cur>=total?'completed':(cur>0?'in-progress':'not-started');
   const canonicalId=resolveCanonicalIdByTitle(id,entry.name);
   const patch={status,current:cur,total,deadline:entry.deadline,category:entry.category};
   if(!canonicalId||!upsertCanonical(canonicalId,patch)){
    upsertCustom('legacy1-'+entry.id,entry.name,patch);
   }
  });
 }catch(e){console.error('ProgressEngine: 旧①の統合に失敗しました',e)}

 // 旧③（sakuyaの夏休み課題、自由記述＋完了チェック）を統合
 if(id==='sakuya'){
  try{
   const legacy3=JSON.parse(localStorage.getItem('stepup-summer-assignments-sakuya')||'[]');
   legacy3.forEach(entry=>{
    const status=entry.done?'completed':(entry.progress&&entry.progress.trim()?'in-progress':'not-started');
    const canonicalId=resolveCanonicalIdByTitle('sakuya',entry.name);
    const patch={status,progress:entry.progress,deadline:entry.deadline,subject:entry.subject,scope:entry.scope};
    if(!canonicalId||!upsertCanonical(canonicalId,patch)){
     upsertCustom('legacy3-'+entry.id,entry.name,patch);
    }
   });
  }catch(e){console.error('ProgressEngine: 旧③の統合に失敗しました',e)}
 }

 saveAssignmentItems(id,items);
 saveCustomAssignments(id,customs);
 localStorage.setItem(progressMigratedKey(id),'true');
 console.log(`ProgressEngine: ${id} の移行が完了しました`,{items,customs});
}
const IORI_TUTOR_PHYSICS_TOTAL_DAYS=14;
function tutorPhysicsItemId(day){return `iori-custom-tutor-physics-day-${String(day).padStart(2,'0')}`}
function ensureIoriTutorPhysicsItems(){
 const customs=getCustomAssignments('iori');
 let changed=false;
 for(let day=1;day<=IORI_TUTOR_PHYSICS_TOTAL_DAYS;day++){
  const id=tutorPhysicsItemId(day);
  if(!customs.some(c=>c.id===id)){
   customs.push({
    id,subject:'理科',title:`家庭教師 物理 Day${day}`,scope:'',deadline:'',
    category:'school-homework',status:'not-started',current:null,total:null,
    progress:'',remaining:'',done:false,source:'sprint15-tutor-physics'
   });
   changed=true;
  }
 }
 if(changed)saveCustomAssignments('iori',customs);
}
const IORI_TUTOR_MATH_TOTAL_DAYS=10;
const IORI_TUTOR_MATH_DAY_NOTES={
 1:'因数分解の利用（基本）＆ 数の問題',
 2:'因数分解の利用（公式の活用）＆ 連続する整数の問題',
 3:'平方根の考え方の利用 ＆ 面積（図形）の問題',
 4:'平方完成を利用する解き方 ＆ 道幅（図形）の問題',
 5:'解の公式の利用（基本形）＆ 箱の容積の問題',
 6:'解の公式の利用（整理・約分が必要な形）＆ 動点と面積の問題',
 7:'式の展開・整理が必要な二次方程式 ＆ 関数との融合問題',
 8:'さまざまな二次方程式の計算 ＆ 物理・運動（ボールの高さ）の問題',
 9:'総合計算演習① ＆ 売上・割合の問題',
 10:'総合計算演習② ＆ 直角三角形と三平方の融合問題'
};
function tutorMathItemId(day){return `iori-custom-tutor-math-day-${String(day).padStart(2,'0')}`}
function ensureIoriTutorMathItems(){
 const customs=getCustomAssignments('iori');
 let changed=false;
 for(let day=1;day<=IORI_TUTOR_MATH_TOTAL_DAYS;day++){
  const id=tutorMathItemId(day);
  if(!customs.some(c=>c.id===id)){
   customs.push({
    id,subject:'数学',title:`家庭教師 数学 Day${day}`,scope:'',deadline:'',
    category:'school-homework',status:'not-started',current:null,total:null,
    progress:'',remaining:'',done:false,
    note:`中学3年 数学「二次方程式（計算＋応用）」10日間完成ドリル：${IORI_TUTOR_MATH_DAY_NOTES[day]}（計算8問・応用2問・全10問）`,
    source:'sprint84-tutor-math'
   });
   changed=true;
  }
 }
 if(changed)saveCustomAssignments('iori',customs);
}
const ProgressEngine={
 getAll(id){
  migrateProgressIfNeeded(id);
  if(id==='iori'){ensureIoriTutorPhysicsItems();ensureIoriTutorMathItems();}
  const canonical=assignmentItems(id).map(it=>({
   id:it.id,childId:id,subject:it.subject,title:it.title,category:it.category,
   categoryLabel:categoryLabel(it.category),priority:it.priority,status:it.status,
   done:it.done!=null?it.done:it.status==='completed',
   progress:it.progress||'',remaining:it.remaining||'',
   current:it.current!=null?it.current:null,total:it.total!=null?it.total:null,
   deadline:it.deadline||null,updatedAt:it.updatedAt||null,
   note:it.note||'',progressType:it.progressType||null,unit:it.unit||null,
   completedAt:it.completedAt||null,isCustom:false
  }));
  const customs=getCustomAssignments(id).map(c=>({
   id:c.id,childId:id,subject:c.subject||'',title:c.title,category:c.category||'',
   categoryLabel:categoryLabel(c.category),priority:c.priority||5,status:c.status||'not-started',
   done:c.done!=null?c.done:c.status==='completed',
   progress:c.progress||'',remaining:c.remaining||'',
   current:c.current!=null?c.current:null,total:c.total!=null?c.total:null,
   deadline:c.deadline||null,updatedAt:c.updatedAt||null,
   note:c.note||'',progressType:c.progressType||null,unit:c.unit||null,
   completedAt:c.completedAt||null,scope:c.scope||'',isCustom:true
  }));
  return canonical.concat(customs);
 },
 updateItem(id,itemId,patch){
  if(String(itemId).includes('-custom-')){
   const customs=getCustomAssignments(id);
   const item=customs.find(c=>c.id===itemId);
   if(item){
    Object.assign(item,patch);
    if(patch.status||patch.done!=null)item.done=patch.done!=null?patch.done:item.status==='completed';
    item.completedAt=item.done?(item.completedAt||new Date().toISOString()):null;
    item.updatedAt=new Date().toISOString();
    saveCustomAssignments(id,customs);
   }
   return;
  }
  const items=assignmentItems(id);
  const item=items.find(it=>it.id===itemId);
  if(item){
   Object.assign(item,patch);
   if(patch.status||patch.done!=null)item.done=patch.done!=null?patch.done:item.status==='completed';
   item.completedAt=item.done?(item.completedAt||new Date().toISOString()):null;
   saveAssignmentItems(id,items);
  }
 }
};

const SYNC_META_KEY='stepup-sync-meta-v1';
const SYNC_KEYS_PREFIX='stepup-';
let syncBusy=false;
function syncEligibleKeys(){
 const keys=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);
  if(k&&k.startsWith(SYNC_KEYS_PREFIX)&&k!==SYNC_META_KEY)keys.push(k);
 }
 return keys;
}
function getSyncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')}catch{return {}}}
function setSyncMeta(meta){localStorage.setItem(SYNC_META_KEY,JSON.stringify(meta))}
function setSyncStatus(text,state=''){
 const el=document.querySelector('#syncStatus'),panel=el?.closest('.sync-panel');
 if(el)el.textContent=text;
 if(panel){panel.classList.toggle('is-online',state==='online');panel.classList.toggle('is-offline',state==='offline')}
}
// Sprint 46: GitHub Pagesには /api/state のバックエンドが存在しないため、
// サーバー同期機能(familySync)は完全に無効化し、常にlocalStorageのみで動作させる。
// 呼び出しループ(2.5秒ごとの再試行)と、/api/stateへの通信自体を停止する。
// 既存の課題進捗・マイルールカード・ホーム画面連動はすべてlocalStorage経由のため、影響しない。
async function familySync(){
 setSyncStatus('この端末内に保存中（サーバー同期は無効）','offline');
}
window.addEventListener('load',()=>{familySync()});

const gradeSubjects=['国語','数学','英語','理科','社会','音楽','美術','保体','技家'];
function initGradeInputs(){
 const box=document.querySelector('#gradeInputs'); if(!box)return;
 const saved=JSON.parse(localStorage.getItem('stepup-iori-grades')||'{}');
 box.innerHTML=gradeSubjects.map(s=>`<label>${s}<input type="number" min="1" max="5" inputmode="numeric" data-grade="${s}" value="${saved[s]||''}" placeholder="-" aria-label="${s}の内申点"></label>`).join('');
 box.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateGradeTotal)); updateGradeTotal();
}
function updateGradeTotal(){
 const inputs=[...document.querySelectorAll('#gradeInputs input')],values=inputs.map(i=>Number(i.value)).filter(v=>v>=1&&v<=5);
 const total=document.querySelector('#gradeTotal'); if(total)total.textContent=values.length===9?`${values.reduce((a,b)=>a+b,0)} / 45`:`${values.length}教科 入力済み`;
}
document.querySelector('#saveGrades')?.addEventListener('click',()=>{
 const values={};document.querySelectorAll('#gradeInputs input').forEach(i=>{if(i.value)values[i.dataset.grade]=Number(i.value)});localStorage.setItem('stepup-iori-grades',JSON.stringify(values));
 const status=document.querySelector('#gradeSaveStatus');if(status){status.textContent='保存しました';setTimeout(()=>status.textContent='',1800)} updateGradeTotal();
});
window.addEventListener('load',initGradeInputs);

const select=document.querySelector('#select'),mission=document.querySelector('#mission'),family=document.querySelector('#family'),materialsScreen=document.querySelector('#materials'),growthScreen=document.querySelector('#growth'),plannerScreen=document.querySelector('#planner'),reportScreen=document.querySelector('#report');let current='iori';
function show(el){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));el.classList.add('active');el.classList.toggle('sakuya-theme',current==='sakuya');scrollTo(0,0)}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='family')openFamily();else{current=b.dataset.view;render();show(mission)}});
back.onclick=()=>show(select);familyBack.onclick=()=>show(select);
document.querySelector('#planModeManualBtn')?.addEventListener('click',()=>{openPlanner();setPlannerMode('manual');renderManualPlanList();populateManualPlanAssignmentSelect()});
document.querySelector('#planModeAiBtn')?.addEventListener('click',()=>{openPlanner();setPlannerMode('ai')});
function openFamily(){renderFamily();show(family)}
document.querySelectorAll('[data-family-nav]').forEach(button=>button.onclick=()=>{const destination=button.dataset.familyNav;if(destination==='family'){document.querySelectorAll('[data-family-nav]').forEach(x=>x.classList.toggle('active',x===button));return}current=destination;render();show(mission)});
function key(){return 'stepup-v4-'+PLAN_DATE+'-'+current}
// Sprint 18: 当日の計画（チェック項目）と課題IDの明示的な対応表。
// 実行時の文字列検索は行わず、あらかじめ決めた1:1の対応のみを使う。
// 対応表に無いタイトルはassignmentId=nullとなり、課題へは一切反映されない。
const TASK_ASSIGNMENT_MAP={
 iori:{
  '英語 新研究':'iori-english-research',
  'ジョイフルワーク':'iori-joyful-work',
  '社会 新研究':'iori-social-research',
  '数学 新研究':'iori-custom-legacy1-6101',
  'ことばのきまり':'iori-custom-legacy1-6103'
 },
 sakuya:{}
};
function taskAssignmentId(title,childId=current){return (TASK_ASSIGNMENT_MAP[childId]||{})[title]||null}

// Sprint 75: スケジュール項目の色分類。既存のtitle文字列だけから安全に判定する。
// 新しい必須フィールドは追加しない。教科による色分けはしない(通常学習は常に青)。
const SCHEDULE_CATEGORY_LABELS={morning:'朝活',night:'夜活',exercise:'筋トレ',outing:'外出',study:'学習'};
function classifyScheduleCategory(title){
 const t=String(title||'');
 if(/朝活/.test(t))return 'morning';
 if(/筋トレ/.test(t))return 'exercise';
 if(/外出|移動/.test(t))return 'outing';
 if(/夜活|確認テスト|課題テスト対策|復習テスト/.test(t))return 'night';
 return 'study';
}
function activeTasks(childId=current){
 const k='stepup-v4-'+PLAN_DATE+'-'+childId;
 const saved=JSON.parse(localStorage.getItem(k)||'{}');
 const base=saved.customTasks||data[childId].tasks;
 // Sprint 66: 5番目の要素(メタ情報)に対応。無ければ空オブジェクトとして扱う(後方互換)。
 // meta.archived=trueの項目は「計画から外された」ものとして、表示からは除外する(物理削除はしない)。
 const studyTasks=base
  .map(t=>t.length>=4?t:[t[0],t[1],t[2],taskAssignmentId(t[1],childId)])
  .filter(t=>!(t[4]&&t[4].archived));
 // Sprint 50: 固定予定(部活・外出など)を、今日の予定として学習予定と時系列でマージする。
 const dk=dateKey(TODAY);
 const events=getEventsForDate(dk,childId).map(e=>[e.startTime||'',e.title,e.endTime&&e.startTime?`${e.startTime}〜${e.endTime}`:'',null,EVENT_CATEGORY_LABELS[e.category]||'予定',e.id]);
 const merged=[...studyTasks.map(t=>[t[0],t[1],t[2],t[3],null,null,t[4]||null]),...events.map(e=>[...e,null])];
 merged.sort((a,b)=>(a[0]||'99:99').localeCompare(b[0]||'99:99'));
 return merged;
}
// Sprint 85: タスクのリアクション識別キー。配列インデックスは使わない。
// 優先順位：①課題IDがあればassignment:ID ②無ければcontent:時刻|タイトル|所要時間
function taskReactionKey(t){
 if(t[3])return `assignment:${t[3]}`;
 return `content:${t[0]||''}|${t[1]||''}|${t[2]||''}`;
}
function familyReactionsKey(childId){return `stepup-family-reactions-${dateKey(TODAY)}-${childId}`}
function getFamilyReactions(childId){
 try{const v=JSON.parse(localStorage.getItem(familyReactionsKey(childId))||'{}');return (v&&typeof v==='object')?v:{}}
 catch(e){return {}}
}
// 保護者が👍を押す/解除する。1タスク1リアクション、押すと付き、もう一度押すと外れる。
function toggleFamilyReaction(childId,taskKey){
 const reactions=getFamilyReactions(childId);
 if(reactions[taskKey]&&reactions[taskKey].liked){
  delete reactions[taskKey];
 }else{
  reactions[taskKey]={liked:true,updatedAt:new Date().toISOString()};
 }
 localStorage.setItem(familyReactionsKey(childId),JSON.stringify(reactions));
 return reactions;
}
// 2つの日程配列を比較し、同一内容(時刻・タイトル・所要時間が一致)のタスクへ
// チェック状態を引き継ぐ。並び替え・追加・アーカイブの前後で、内容ベースに
// チェックがズレないようにするための共通ヘルパー。
function remapChecksByContent(oldTasks,oldChecks,newTasks){
 const newChecks={};
 newTasks.forEach((t,newIndex)=>{
  const oldIndex=oldTasks.findIndex(o=>o[0]===t[0]&&o[1]===t[1]&&o[2]===t[2]);
  if(oldIndex>-1&&oldChecks&&oldChecks[oldIndex])newChecks[newIndex]=true;
 });
 return newChecks;
}

// ============================================================
// Sprint 66: 今日の計画(customTasks)の安全な操作関数群。
// ・5番目の要素(メタ情報)に対応。無ければ空オブジェクトとして扱う。
// ・物理削除は行わず、meta.archived=trueで非表示にする。
// ・並び替え・追加のたびに、内容一致でチェック状態を再マッピングする。
// ============================================================
function getRawCustomTasks(){
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const base=saved.customTasks||data[current].tasks;
 return base.map(t=>t.length>=5?[t[0],t[1],t[2],t[3],{...t[4]}]:(t.length>=4?[t[0],t[1],t[2],t[3],{}]:[t[0],t[1],t[2],taskAssignmentId(t[1]),{}]));
}
// customTasksを書き換える際、変更前後の表示順(activeTasks())を比較し、
// チェック状態を内容一致で自動的に引き継ぐ。呼び出し側でchecksを個別に触る必要はない。
function saveRawCustomTasks(newRawTasks){
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const oldTasks=activeTasks();
 const oldChecks=saved.checks||{};
 saved.customTasks=newRawTasks;
 localStorage.setItem(key(),JSON.stringify(saved));
 const newTasks=activeTasks();
 saved.checks=remapChecksByContent(oldTasks,oldChecks,newTasks);
 localStorage.setItem(key(),JSON.stringify(saved));
}
// 指定した課題IDが、今日の計画に(アーカイブされていない状態で)既に登録済みかどうか。
function isAssignmentInTodayPlan(assignmentId){
 if(!assignmentId)return false;
 return getRawCustomTasks().some(t=>t[3]===assignmentId&&!(t[4]&&t[4].archived));
}
// 課題を今日の計画へ追加する。重複していれば追加せずfalseを返す。
function addAssignmentToTodayPlan(assignmentId,title,startTime,durationMinutes,meta={}){
 if(isAssignmentInTodayPlan(assignmentId))return false;
 const raw=getRawCustomTasks();
 raw.push([startTime||'19:00',title,`${durationMinutes||30}分`,assignmentId,{
  archived:false,
  pageStart:meta.pageStart!=null?meta.pageStart:null,
  pageEnd:meta.pageEnd!=null?meta.pageEnd:null,
  problemRange:meta.problemRange||'',
  memo:meta.memo||'',
  updatedAt:new Date().toISOString()
 }]);
 saveRawCustomTasks(raw);
 return true;
}
// 今日の計画から外す(物理削除せず、meta.archived=trueにするだけ)。
function archiveTodayPlanTask(rawIndex){
 const raw=getRawCustomTasks();
 if(!raw[rawIndex])return;
 raw[rawIndex][4]=raw[rawIndex][4]||{};
 raw[rawIndex][4].archived=true;
 raw[rawIndex][4].updatedAt=new Date().toISOString();
 saveRawCustomTasks(raw);
}
// 生配列内で隣接する2項目を入れ替える(「上へ」「下へ」)。チェック状態も内容一致で自動的に追従する。
function moveTodayPlanTask(rawIndex,direction){
 const raw=getRawCustomTasks();
 const targetIndex=rawIndex+direction;
 if(targetIndex<0||targetIndex>=raw.length)return;
 [raw[rawIndex],raw[targetIndex]]=[raw[targetIndex],raw[rawIndex]];
 saveRawCustomTasks(raw);
}
// 自由な予定(既存課題に紐付かない手入力の予定)を今日の計画へ追加する。
function addFreeTaskToTodayPlan(title,startTime,durationMinutes,meta={}){
 const raw=getRawCustomTasks();
 raw.push([startTime||'19:00',title,`${durationMinutes||30}分`,null,{
  archived:false,memo:meta.memo||'',updatedAt:new Date().toISOString()
 }]);
 saveRawCustomTasks(raw);
}
// 今日の計画にある項目(アーカイブ含む)を編集する(時刻・所要時間・ページ範囲・メモ)。
function updateTodayPlanTask(rawIndex,patch){
 const raw=getRawCustomTasks();
 if(!raw[rawIndex])return;
 if(patch.startTime!=null)raw[rawIndex][0]=patch.startTime;
 if(patch.title!=null)raw[rawIndex][1]=patch.title;
 if(patch.durationMinutes!=null)raw[rawIndex][2]=`${patch.durationMinutes}分`;
 raw[rawIndex][4]=raw[rawIndex][4]||{};
 if(patch.pageStart!==undefined)raw[rawIndex][4].pageStart=patch.pageStart;
 if(patch.pageEnd!==undefined)raw[rawIndex][4].pageEnd=patch.pageEnd;
 if(patch.problemRange!==undefined)raw[rawIndex][4].problemRange=patch.problemRange;
 if(patch.memo!==undefined)raw[rawIndex][4].memo=patch.memo;
 raw[rawIndex][4].updatedAt=new Date().toISOString();
 saveRawCustomTasks(raw);
}

// ============================================================
// Sprint 66: 「自分で計画を作る」タブの描画・操作
// ============================================================
function renderManualPlanList(){
 const listEl=document.querySelector('#manualPlanList');
 if(!listEl)return;
 const raw=getRawCustomTasks();
 const visibleEntries=raw.map((t,i)=>({t,i})).filter(({t})=>!(t[4]&&t[4].archived));
 if(!visibleEntries.length){
  listEl.innerHTML='<div class="empty-state">今日の計画はまだありません。下の「追加」から予定を入れましょう。</div>';
  return;
 }
 listEl.innerHTML=visibleEntries.map(({t,i})=>{
  const meta=t[4]||{};
  const pageText=(meta.pageStart!=null&&meta.pageEnd!=null)?`P${meta.pageStart}\u3011${meta.pageEnd}`:'';
  return `<article class="manual-plan-item">
   <div class="manual-plan-item-main">
    <input type="time" class="mp-start" value="${t[0]||''}" data-mp-index="${i}">
    <input type="text" class="mp-title" value="${escapeHtml(t[1]||'')}" data-mp-index="${i}">
    <input type="number" class="mp-duration" min="5" step="5" value="${parseInt(t[2])||30}" data-mp-index="${i}">
   </div>
   <div class="manual-plan-item-sub">
    <input type="text" class="mp-pages" placeholder="\u30da\u30fc\u30b8\u7bc4\u56f2\uff08\u4efb\u610f\uff09" value="${pageText}" data-mp-index="${i}">
    <input type="text" class="mp-memo" placeholder="\u30e1\u30e2\uff08\u4efb\u610f\uff09" value="${escapeHtml(meta.memo||'')}" data-mp-index="${i}">
   </div>
   <div class="manual-plan-item-actions">
    <button type="button" class="mp-up-btn" data-mp-move="${i}" data-mp-dir="-1" title="\u4e0a\u3078">\u2191</button>
    <button type="button" class="mp-down-btn" data-mp-move="${i}" data-mp-dir="1" title="\u4e0b\u3078">\u2193</button>
    <button type="button" class="mp-remove-btn" data-mp-remove="${i}">\u8a08\u753b\u304b\u3089\u5916\u3059</button>
   </div>
  </article>`;
 }).join('');
 bindManualPlanListEvents();
}
function bindManualPlanListEvents(){
 document.querySelectorAll('[data-mp-move]').forEach(btn=>{
  btn.onclick=()=>{
   moveTodayPlanTask(Number(btn.dataset.mpMove),Number(btn.dataset.mpDir));
   renderManualPlanList();render();
  };
 });
 document.querySelectorAll('[data-mp-remove]').forEach(btn=>{
  btn.onclick=()=>{
   if(!confirm('\u3053\u306e\u4e88\u5b9a\u3092\u4eca\u65e5\u306e\u8a08\u753b\u304b\u3089\u5916\u3057\u307e\u3059\u304b\uff1f(\u8a18\u9332\u306f\u524a\u9664\u3055\u308c\u307e\u305b\u3093)'))return;
   archiveTodayPlanTask(Number(btn.dataset.mpRemove));
   renderManualPlanList();render();
  };
 });
 document.querySelectorAll('.mp-start,.mp-title,.mp-duration,.mp-pages,.mp-memo').forEach(input=>{
  input.onchange=()=>{
   const idx=Number(input.dataset.mpIndex);
   const patch={};
   if(input.classList.contains('mp-start'))patch.startTime=input.value;
   if(input.classList.contains('mp-title'))patch.title=input.value;
   if(input.classList.contains('mp-duration'))patch.durationMinutes=Number(input.value)||30;
   if(input.classList.contains('mp-memo'))patch.memo=input.value;
   if(input.classList.contains('mp-pages')){
    const m=input.value.match(/(\d+)\D+(\d+)/);
    if(m){patch.pageStart=Number(m[1]);patch.pageEnd=Number(m[2])}
   }
   updateTodayPlanTask(idx,patch);
   render();
  };
 });
}
function populateManualPlanAssignmentSelect(){
 const sel=document.querySelector('#manualPlanAssignmentSelect');
 if(!sel)return;
 const items=ProgressEngine.getAll(current).filter(it=>!it.done);
 sel.innerHTML=items.length
  ?items.map(it=>`<option value="${it.id}" data-title="${escapeHtml(it.title)}">${escapeHtml(it.subject?it.subject+'\uff1a':'')}${escapeHtml(it.title)}</option>`).join('')
  :'<option value="">\u672a\u5b8c\u4e86\u306e\u8ab2\u984c\u304c\u3042\u308a\u307e\u305b\u3093</option>';
}
document.querySelector('#manualPlanAddAssignmentBtn')?.addEventListener('click',()=>{
 const sel=document.querySelector('#manualPlanAssignmentSelect');
 const assignmentId=sel.value;
 if(!assignmentId)return;
 const title=sel.selectedOptions[0]?.dataset.title||sel.selectedOptions[0]?.textContent||'\u8ab2\u984c';
 const startTime=document.querySelector('#manualPlanAssignmentStart').value||'19:00';
 const duration=Number(document.querySelector('#manualPlanAssignmentDuration').value)||30;
 const added=addAssignmentToTodayPlan(assignmentId,title,startTime,duration,{});
 if(added){renderManualPlanList();render()}
 else alert('\u3053\u306e\u8ab2\u984c\u306f\u4eca\u65e5\u306e\u8a08\u753b\u306b\u767b\u9332\u6e08\u307f\u3067\u3059');
});
document.querySelector('#manualPlanAddFreeBtn')?.addEventListener('click',()=>{
 const title=document.querySelector('#manualPlanFreeTitle').value.trim();
 if(!title)return;
 const startTime=document.querySelector('#manualPlanFreeStart').value||'19:00';
 const duration=Number(document.querySelector('#manualPlanFreeDuration').value)||30;
 addFreeTaskToTodayPlan(title,startTime,duration,{});
 document.querySelector('#manualPlanFreeTitle').value='';
 renderManualPlanList();render();
});

function escapeHtml(text){return String(text).replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}
function formatFocusTitle(text){
 const parts=String(text).trim().split(/\s+/).filter(Boolean);
 if(parts.length<2)return escapeHtml(text);
 return parts.map(part=>`<span class="focus-phrase">${escapeHtml(part)}</span>`).join('<span class="focus-space" aria-hidden="true"> </span>');
}
function render(){const d=data[current];mission.classList.toggle('sakuya-theme',current==='sakuya');personName.textContent=d.name;
 const heroYearEl=document.querySelector('#heroDateYear'),heroFullEl=document.querySelector('#heroDateFull');
 if(heroYearEl)heroYearEl.textContent=`${TODAY.getFullYear()}年`;
 if(heroFullEl)heroFullEl.textContent=`${TODAY.getMonth()+1}月${TODAY.getDate()}日（${['日','月','火','水','木','金','土'][TODAY.getDay()]}）`;
 if(current==='sakuya'){const focusInfo=sakuyaFocusDisplay();focusTitle.innerHTML=formatFocusTitle(dynamicFocusText(focusInfo.title));focusSub.textContent=focusInfo.sub;priorityTitle.textContent=focusInfo.priorityTitle;priorityText.textContent=focusInfo.priorityText;}else{focusTitle.innerHTML=formatFocusTitle(dynamicFocusText(d.focus));focusSub.textContent=d.sub;priorityTitle.textContent=d.priority;priorityText.textContent=d.priorityText;}renderMobileWelcome(d);renderCountdown();const goalsEl=document.querySelector('#goals');if(goalsEl)goalsEl.innerHTML=(current==='sakuya'?sakuyaDynamicGoals():d.goals).map(x=>`<li>${x}</li>`).join('');const saved=JSON.parse(localStorage.getItem(key())||'{}');const tasks=activeTasks();const linkedItems=ProgressEngine.getAll(current);const familyReactions=getFamilyReactions(current);scheduleList.innerHTML=tasks.map((t,i)=>{
if(t[5]){
 // Sprint 50: 固定予定は表示専用行。チェックボックスを持たせず、完了数・進捗率には含めない。
 return `<div class="task task--event"><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[4]||'予定'}</small></span><span class="task-state">${t[2]}</span></div>`;
}
const cat=classifyScheduleCategory(t[1]);
const assignment=t[3]?linkedItems.find(x=>x.id===t[3]):null;const assignmentText=assignment?`課題：${assignment.done?'完了済み':assignment.status==='in-progress'?'進行中':'未着手'}${assignment.total!=null?`・${assignment.current}/${assignment.total}`:''}`:(saved.checks?.[i]?'完了 ✓':'タップで完了');const familyLiked=(familyReactions[taskReactionKey(t)]||{}).liked;const familyLikeBadge=familyLiked?'<span class="family-like-badge" title="おうちの人から👍">👍 おうちの人から</span>':'';return `<label class="task cat-${cat} ${saved.checks?.[i]?'done':''}"><input type="checkbox" data-i="${i}" data-assignment-id="${t[3]||''}" ${saved.checks?.[i]?'checked':''}><time class="cat-${cat}">${t[0]}</time><span><strong>${t[1]}</strong><small class="task-tag cat-${cat}">${SCHEDULE_CATEGORY_LABELS[cat]}</small></span><span class="task-state">${assignmentText}</span><span class="duration">${t[2]}</span>${familyLikeBadge}</label>`;
}).join('');stepMessage.textContent=saved.step||'今日の記録はまだありません。「今日の記録を保存する」を押すと、ここに表示されます。';bindChecks();update();renderPersonalCoach();renderHomeDeadlineCard();loadDailyReportCard();renderSakuyaTestRulesCard();renderDokosutaHistory()}
// Sprint 12-3/12-4: 今日の学習報告カード（提出物・課題データとは別のlocalStorageキーで管理）
function dailyReportKey(date){return `stepup_daily_report_${date}_${current}`}
// Sprint 43: さくや専用「課題テストのマイルール」カード。
// 教科別トラッカーは既存の課題進捗(ProgressEngine)とは別のlocalStorageキーで管理し、
// 既存データを一切変更しない。保存時は既存の「今日のStep Up」(saved.step)の仕組みをそのまま利用する。
function sakuyaTestRulesKey(){return 'stepup-sakuya-test-rules-v1'}
function getSakuyaTestRulesData(){
 try{return JSON.parse(localStorage.getItem(sakuyaTestRulesKey())||'{}')}catch(e){return{}}
}
function saveSakuyaTestRulesData(data){
 localStorage.setItem(sakuyaTestRulesKey(),JSON.stringify(data));
}
function renderSakuyaTestRulesCard(){
 const card=document.querySelector('#sakuyaTestRulesCard');
 if(!card)return;
 const isSakuya=current==='sakuya';
 card.classList.toggle('hidden',!isSakuya);
 if(!isSakuya)return;
 const data=getSakuyaTestRulesData();
 card.querySelectorAll('.sakuya-subject-row').forEach(row=>{
  const subject=row.dataset.subject;
  const entry=data[subject]||{};
  const pageInput=row.querySelector('.sakuya-subject-page');
  const scoreInput=row.querySelector('.sakuya-subject-score');
  const statusEl=row.querySelector('.sakuya-subject-status');
  if(pageInput&&entry.currentPage!=null&&document.activeElement!==pageInput)pageInput.value=entry.currentPage;
  if(scoreInput&&entry.testScore!=null&&document.activeElement!==scoreInput)scoreInput.value=entry.testScore;
  if(statusEl){
   statusEl.textContent=entry.status?(entry.status==='clear'?'達成 ◎':'やり直し'):'';
   statusEl.classList.toggle('is-clear',entry.status==='clear');
   statusEl.classList.toggle('is-retry',entry.status==='retry');
  }
  let retryNote=row.querySelector('.sakuya-subject-retry-note');
  if(entry.status==='retry'){
   if(!retryNote){
    retryNote=document.createElement('p');
    retryNote.className='sakuya-subject-retry-note';
    row.appendChild(retryNote);
   }
   retryNote.textContent='明日は同じページを復習し、次のページも進めよう';
  }else if(retryNote){
   retryNote.remove();
  }
 });
}
document.querySelector('#sakuyaTestRulesSave')?.addEventListener('click',()=>{
 if(current!=='sakuya')return;
 const card=document.querySelector('#sakuyaTestRulesCard');
 const data=getSakuyaTestRulesData();
 card.querySelectorAll('.sakuya-subject-row').forEach(row=>{
  const subject=row.dataset.subject;
  const hasMax=row.dataset.max!=null&&row.dataset.max!=='';
  const max=hasMax?Number(row.dataset.max):null;
  const pageInput=row.querySelector('.sakuya-subject-page');
  const scoreInput=row.querySelector('.sakuya-subject-score');
  const rawPage=pageInput.value.trim()===''?null:Math.max(0,Number(pageInput.value));
  const pageVal=(rawPage!=null&&max!=null)?Math.min(max,rawPage):rawPage;
  const scoreVal=scoreInput.value.trim()===''?null:Math.max(0,Math.min(10,Number(scoreInput.value)));
  data[subject]={
   currentPage:pageVal,
   testScore:scoreVal,
   status:scoreVal==null?null:(scoreVal>=8?'clear':'retry')
  };
 });
 saveSakuyaTestRulesData(data);
 renderSakuyaTestRulesCard();

 // 「今日のStep Up」へ保存(既存の仕組みをそのまま利用。既存データは壊さず、stepフィールドだけ更新)
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.step='課題テストに向けて、自分で勉強方法とルールを決めることができた。';
 saved.growthTags=['自分で計画を立てた','考える力','自己管理'];
 localStorage.setItem(key(),JSON.stringify(saved));
 if(typeof stepMessage!=='undefined'&&stepMessage)stepMessage.textContent=saved.step;

 const statusEl=document.querySelector('#sakuyaTestRulesStatus');
 if(statusEl){
  statusEl.textContent='記録を保存しました';
  clearTimeout(window.sakuyaTestRulesStatusTimer);
  window.sakuyaTestRulesStatusTimer=setTimeout(()=>{if(statusEl.textContent==='記録を保存しました')statusEl.textContent=''},2500);
 }
});
// Sprint 44: さくや専用「今日の計画」の自動連動。
// children.jsの静的なfocus/subの代わりに、実際の課題進捗(ProgressEngine)から
// 「まだ終わっていない課題」を優先順で探し、完了した課題は自動的に計画から外れる。
// 壱凰には一切適用しない。
// 判定ロジックは1か所だけにまとめる：優先順位に沿った「未完了課題の並び」を返す共通関数。
// priorityTitleと#goalsは、この同じ関数の結果を使って表示する(重複ロジックを作らない)。
function sakuyaIncompleteQueue(){
 const priorityOrder=['sakuya-kanji-skill','sakuya-japanese'];
 const all=ProgressEngine.getAll('sakuya').filter(it=>!it.done);
 const ordered=[];
 priorityOrder.forEach(id=>{
  const item=all.find(it=>it.id===id);
  if(item)ordered.push(item);
 });
 const rest=all.filter(it=>!ordered.includes(it))
  .sort((a,b)=>(a.status==='not-started'?1:0)-(b.status==='not-started'?1:0)||(a.priority||9)-(b.priority||9));
 return [...ordered,...rest];
}
function getSakuyaNextFocusTask(){
 const queue=sakuyaIncompleteQueue();
 return queue.length?queue[0]:null;
}
function sakuyaDynamicGoals(){
 const queue=sakuyaIncompleteQueue();
 if(!queue.length)return['今日の課題はすべて完了しました。よく頑張りました。'];
 return queue.slice(0,4).map(it=>{
  const remain=(it.remaining&&it.remaining!=='なし')?`残り${it.remaining}`:(it.progress&&it.progress!=='未着手'?it.progress:'未着手');
  return `${it.title}（${remain}）`;
 });
}

function sakuyaFocusDisplay(){
 const task=getSakuyaNextFocusTask();
 if(!task){
  return {
   title:'今日の課題はすべて完了', sub:'よく頑張りました。次の目標をお家の人と確認しましょう。',
   priorityTitle:'今日の課題はすべて完了しました', priorityText:'新しい目標が決まったら、また一緒に計画を立てよう。'
  };
 }
 const remainText=(task.remaining&&task.remaining!=='なし')?`残り${task.remaining}`:(task.progress&&task.progress!=='未着手'?task.progress:'');
 return {
  title:task.title,
  sub:remainText?`${remainText}。今日はここを進めよう。`:'今日はここから進めよう。',
  priorityTitle:remainText?`${task.title}（${remainText}）を進める`:`${task.title}を進める`,
  priorityText:'できたら「今日のStep Up」に記録しよう。'
 };
}
// Sprint 48: ホーム画面上部の日付表示を、カレンダーと同じTODAY基準に統一する。
// children.js内に埋め込まれた固定の日付文字列(例：「7月21日」)を、動的な今日の日付に差し替える。
// 新機能・デザイン変更はせず、日付部分の文字列だけを差し替える。
function todayMonthDayLabel(){return `${TODAY.getMonth()+1}月${TODAY.getDate()}日`}
function dynamicFocusText(rawText){
 const stripped=String(rawText).replace(/^\d{1,2}月\d{1,2}日\s*/,'');
 return stripped?`${todayMonthDayLabel()} ${stripped}`:todayMonthDayLabel();
}
function loadDailyReportCard(){
 const doneEl=document.querySelector('#dailyReportDone');
 const stepUpEl=document.querySelector('#dailyReportStepUp');
 const statusEl=document.querySelector('#dailyReportStatus');
 if(!doneEl||!stepUpEl)return;
 const date=dateKey(new Date());
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(dailyReportKey(date))||'null')}catch(e){console.error('学習報告の読み込みに失敗しました',e)}
 doneEl.value=saved?.done||'';
 stepUpEl.value=saved?.stepUp||'';
 if(statusEl)statusEl.textContent='';
}
function autoStepUpFromChecklist(){
 const boxes=[...document.querySelectorAll('#scheduleList .task input[type="checkbox"]')];
 if(!boxes.length)return'';
 const checked=boxes.filter(b=>b.checked);
 if(!checked.length)return'';
 const titles=checked
  .map(b=>b.closest('.task')?.querySelector('strong')?.textContent.trim())
  .filter(Boolean);
 if(!titles.length)return'';
 let text=titles.join('・');
 if(checked.length===boxes.length)text+='。今日のミッションを全部達成！';
 return text;
}
function saveDailyReportCard(){
 const doneEl=document.querySelector('#dailyReportDone');
 const stepUpEl=document.querySelector('#dailyReportStepUp');
 const statusEl=document.querySelector('#dailyReportStatus');
 if(!doneEl||!stepUpEl)return;
 const done=doneEl.value.trim();
 const manualStepUp=stepUpEl.value.trim();
 const stepUp=manualStepUp||autoStepUpFromChecklist();
 if(!done&&!stepUp){
  if(statusEl)statusEl.textContent='記録する内容を1つ入力してください。';
  return;
 }
 const date=dateKey(new Date());
 try{
  localStorage.setItem(dailyReportKey(date),JSON.stringify({date,done,stepUp}));
  if(statusEl)statusEl.textContent='今日の記録を保存しました。';
 }catch(e){
  console.error('学習報告の保存に失敗しました',e);
  if(statusEl)statusEl.textContent='保存に失敗しました。もう一度お試しください。';
 }
}
document.querySelector('#dailyReportSave')?.addEventListener('click',saveDailyReportCard);
function wireDailyReportMic(){
 const btn=document.querySelector('#dailyReportMic');
 const target=document.querySelector('#dailyReportDone');
 if(!btn||!target)return;
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){btn.disabled=true;btn.title='この端末では音声入力が使えません';return}
 const recognition=new SR();recognition.lang='ja-JP';recognition.interimResults=false;
 let listening=false;
 btn.onclick=()=>{if(listening)return;listening=true;btn.classList.add('listening');recognition.start()};
 recognition.onresult=(e)=>{const text=e.results[0][0].transcript;target.value=target.value?target.value+'\n'+text:text};
 recognition.onend=()=>{listening=false;btn.classList.remove('listening')};
 recognition.onerror=()=>{listening=false;btn.classList.remove('listening')};
}
wireDailyReportMic();
function renderHomeDeadlineCard(){
 const list=document.querySelector('#homeDeadlineList');
 if(!list)return;
 const near=getPendingDeadlineAssignments(current).filter(a=>['overdue','today','within3','within7'].includes(a.category)).slice(0,3);
 list.innerHTML=near.length
  ?near.map(a=>`<div class="home-deadline-row"><span class="home-deadline-title">${escapeHtml(a.title)}</span><span class="deadline-tag cat-${a.category}">${escapeHtml(a.label)}</span></div>`).join('')
  :'<div class="empty-state">今週、期限が近い提出物はありません</div>';
}
document.querySelector('#goToDeadlinePage')?.addEventListener('click',openAssignments);
function collapseSeriesForHomeCard(list){
 const physicsPrefix='家庭教師 物理';
 const physicsItems=list.filter(a=>a.name.startsWith(physicsPrefix));
 const others=list.filter(a=>!a.name.startsWith(physicsPrefix));
 if(!physicsItems.length)return others;
 const dayNumber=name=>Number((name.match(/Day(\d+)/)||[])[1])||0;
 const next=physicsItems.sort((a,b)=>dayNumber(a.name)-dayNumber(b.name))[0];
 return others.concat([next]);
}
function renderTodayAssignmentsCard(){
 const list=document.querySelector('#todayAssignmentsList');
 if(!list)return;
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const homeChecks=saved.homeAssignmentChecks||{};
 const items=collapseSeriesForHomeCard(getAssignments().filter(a=>a.current<a.total)).sort((a,b)=>daysLeft(a.deadline)-daysLeft(b.deadline)).slice(0,3);
 list.innerHTML=items.length?items.map(a=>{
  const left=daysLeft(a.deadline),remain=Math.max(0,a.total-a.current),pct=Math.min(100,Math.round(a.current/a.total*100)),today=remain?dailyTarget(a):0;
  return `<article class="assignment-item ${left<=7?'urgent':''}"><div class="assignment-top"><div><small>${a.category}</small><h2>${a.name}</h2></div><b>あと ${left}日</b></div><div class="assignment-meta"><span>現在<strong>${a.current} / ${a.total}</strong></span><span>残り<strong>${remain}</strong></span><span>今日の目安<strong>${today}</strong></span></div><div class="assignment-progress"><i style="width:${pct}%"></i></div><label class="today-assignment-check"><input type="checkbox" data-home-assignment-id="${a.id}" ${homeChecks[a.id]?'checked':''}> 今日ここまで進めたらチェック（保存で課題へ反映）</label></article>`;
 }).join(''):'<div class="empty-state">今日取り組む課題はありません。</div>';
 document.querySelectorAll('[data-home-assignment-id]').forEach(cb=>{
  cb.onchange=()=>{
   const s=JSON.parse(localStorage.getItem(key())||'{}');
   s.homeAssignmentChecks=s.homeAssignmentChecks||{};
   s.homeAssignmentChecks[cb.dataset.homeAssignmentId]=cb.checked;
   localStorage.setItem(key(),JSON.stringify(s));
  };
 });
}
document.querySelector('#todayAssignmentsMore')?.addEventListener('click',()=>openAssignments());
function renderMobileWelcome(d){
 const hour=new Date().getHours();
 const greeting=hour<11?'おはよう！':hour<18?'こんにちは！':'こんばんは！';
 const messageText='今日も一歩ずつ進もう。';
 const greetingEl=document.querySelector('#welcomeGreeting');
 const nameChildEl=document.querySelector('#welcomeNameChild');
 const nameMessageEl=document.querySelector('#welcomeNameMessage');
 const targetEl=document.querySelector('#welcomeTarget');
 const dateEl=document.querySelector('#welcomeDate');
 if(dateEl)dateEl.textContent=`${TODAY.getFullYear()}年${TODAY.getMonth()+1}月${TODAY.getDate()}日（${['日','月','火','水','木','金','土'][TODAY.getDay()]}）`;
 if(greetingEl)greetingEl.textContent=greeting;
 if(nameChildEl)nameChildEl.textContent='';
 if(nameMessageEl)nameMessageEl.textContent=messageText;
 if(targetEl)targetEl.textContent=current==='sakuya'?sakuyaFocusDisplay().priorityTitle:d.priority;
}

function renderCountdown(){
 const events=testEvents[current]||[];
 countdownStrip.innerHTML=events.map(e=>{const target=new Date(e.date+'T00:00:00');const days=Math.max(0,Math.ceil((target-TODAY)/86400000));return `<article><small>${e.subject}</small><strong>${e.title}</strong><b>あと ${days}日</b><span>${target.getMonth()+1}/${target.getDate()}</span></article>`}).join('');
}
// Sprint 18: 当日の計画のチェックだけを、明示的なIDで課題進捗へ反映する。
// 自由記述や課題名の文字列検索は一切使わない。
function reflectTaskCheckToAssignment(assignmentId,checked,snapshotKey){
 if(!assignmentId)return{message:null,changed:false};
 const items=ProgressEngine.getAll(current);
 const item=items.find(x=>x.id===assignmentId);
 if(!item)return{message:'対応する課題が見つかりませんでした。',changed:false};
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.assignmentSnapshots=saved.assignmentSnapshots||{};
 const isBinary=item.total==null;
 const key_=String(snapshotKey??assignmentId);
 if(checked){
  if(item.done)return{message:`${item.title}はすでに完了として反映済みです。`,changed:false};
  // チェックを外した時に正確に戻せるよう、チェック前の状態を保存しておく
  saved.assignmentSnapshots[key_]={id:assignmentId,current:item.current,total:item.total,status:item.status,done:item.done};
  localStorage.setItem(key(),JSON.stringify(saved));
  if(isBinary){
   ProgressEngine.updateItem(current,assignmentId,{status:'completed',done:true});
   return{message:`${item.title}を完了として反映しました`,changed:true};
  }
  const deadlineIso=toIsoDeadlineOrDefault(item.deadline);
  const remainDays=Math.max(1,daysLeft(deadlineIso));
  const increment=Math.max(1,Math.ceil((item.total-item.current)/remainDays));
  const after=Math.min(item.total,item.current+increment);
  const done=after>=item.total;
  ProgressEngine.updateItem(current,assignmentId,{current:after,status:done?'completed':'in-progress',done});
  return{message:done?`${item.title}を完了として反映しました`:`${item.title}を${after}/${item.total}まで反映しました`,changed:true};
 }
 // チェックを外した場合：直前のスナップショットがあれば、その値へ正確に戻す（実績を0にリセットしない）
 const snapshot=saved.assignmentSnapshots[key_];
 if(snapshot&&snapshot.id===assignmentId){
  ProgressEngine.updateItem(current,assignmentId,{current:snapshot.current,total:snapshot.total,status:snapshot.status,done:snapshot.done});
  delete saved.assignmentSnapshots[key_];
  localStorage.setItem(key(),JSON.stringify(saved));
  return{message:`${item.title}のチェックを外したため、今日の分を取り消しました`,changed:true};
 }
 return{message:'課題進捗への変更はありませんでした。',changed:false};
}
// Sprint 19: 「保存＝今日の記録を確定」。
// チェック(スケジュール・今日の学習カード)は記録として保持するだけで、
// ここで初めて、チェック済みのassignmentIdをまとめて課題へ反映する。
// 同じ内容で繰り返し保存しても、既に反映済みのIDはスキップするため二重更新しない。
function collectTodayCheckedAssignmentIds(){
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const tasks=activeTasks();
 const checks=saved.checks||{};
 const homeChecks=saved.homeAssignmentChecks||{};
 const ids=new Set();
 tasks.forEach((t,i)=>{if(checks[i]&&t[3])ids.add(t[3])});
 Object.keys(homeChecks).forEach(id=>{if(homeChecks[id])ids.add(id)});
 return ids;
}
// Sprint 22: 課題名の取得処理をここ1か所だけに共通化する。
// AI VOICE COACH・TODAY'S STEP UP・保存通知・成長タブAIコーチは、
// すべてこの2つの関数を経由して課題名を取得する（推測・別ルートでの取得は行わない）。
function getTodayCheckedAssignmentItems(id=current){
 const checkedIds=collectTodayCheckedAssignmentIds();
 const allItems=ProgressEngine.getAll(id);
 return [...checkedIds].map(cid=>allItems.find(item=>item.id===cid)).filter(Boolean);
}
function getTodayCheckedAssignmentTitles(id=current){
 return getTodayCheckedAssignmentItems(id).map(item=>item.title).filter(Boolean);
}
function commitTodayCheckedAssignments(){
 const checkedIds=collectTodayCheckedAssignmentIds();
 let saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.reflectedAssignments=saved.reflectedAssignments||{};
 const toApply=[...checkedIds].filter(id=>!saved.reflectedAssignments[id]);
 const toRevert=Object.keys(saved.reflectedAssignments).filter(id=>saved.reflectedAssignments[id]&&!checkedIds.has(id));
 const messages=[];
 toApply.forEach(id=>{
  const result=reflectTaskCheckToAssignment(id,true,'commit-'+id);
  if(result&&result.message)messages.push(result.message);
  saved=JSON.parse(localStorage.getItem(key())||'{}');
  saved.reflectedAssignments=saved.reflectedAssignments||{};
  saved.reflectedAssignments[id]=true;
  localStorage.setItem(key(),JSON.stringify(saved));
 });
 toRevert.forEach(id=>{
  const result=reflectTaskCheckToAssignment(id,false,'commit-'+id);
  if(result&&result.message)messages.push(result.message);
  saved=JSON.parse(localStorage.getItem(key())||'{}');
  saved.reflectedAssignments=saved.reflectedAssignments||{};
  delete saved.reflectedAssignments[id];
  localStorage.setItem(key(),JSON.stringify(saved));
 });
 if(!messages.length)messages.push('課題進捗への変更はありませんでした。');
 return messages;
}
function showScheduleReflectStatus(result){
 const el=document.querySelector('#scheduleReflectStatus');
 if(!el)return;
 const message=result&&result.message?result.message:'課題進捗への変更はありませんでした。';
 el.textContent=message;
 clearTimeout(window.scheduleReflectStatusTimer);
 window.scheduleReflectStatusTimer=setTimeout(()=>{if(el.textContent===message)el.textContent=''},4000);
}
function bindChecks(){document.querySelectorAll('.task input').forEach(c=>c.onchange=()=>{const saved=JSON.parse(localStorage.getItem(key())||'{}');saved.checks=saved.checks||{};saved.checks[c.dataset.i]=c.checked;if(c.checked&&saved.activeTaskIndex===Number(c.dataset.i))saved.activeTaskIndex=null;localStorage.setItem(key(),JSON.stringify(saved));const task=c.closest('.task');task.classList.toggle('done',c.checked);const state=task.querySelector('.task-state');if(state)state.textContent=c.checked?(c.dataset.assignmentId?'記録済み（保存で課題へ反映）':'完了 ✓'):'タップで完了';update()})}
function stepSuggestion(done,total,tasks,checks){
 if(!done)return '今日の計画を確認し、最初のミッションに挑戦した。';
 if(done===total)return `予定していた${total}個のミッションを最後までやり切った。`;
 const last=[...tasks.keys()].reverse().find(i=>checks[i]);
 const title=last===undefined?'学習':tasks[last][1];
 return `${title}に取り組み、${done}個のミッションを進めた。`;
}
function updateMobileMission(tasks,checks,done){
 const next=tasks.findIndex((_,i)=>!checks[i]);
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const activeIndex=Number.isInteger(saved.activeTaskIndex)?saved.activeTaskIndex:null;
 const isActive=next>=0&&activeIndex===next;
 const count=document.querySelector('#mobileMissionCount'),time=document.querySelector('#mobileMissionTime'),title=document.querySelector('#mobileMissionTitle'),duration=document.querySelector('#mobileMissionDuration'),button=document.querySelector('#completeCurrentMission'),label=document.querySelector('#mobileMissionLabel'),progress=document.querySelector('#mobileProgressBar'),remainingText=document.querySelector('#mobileRemainingText'),remainingList=document.querySelector('#mobileRemainingList'),tag=document.querySelector('#mobileMissionTag'),remainingBadge=document.querySelector('#mobileMissionRemaining');
 const percentValue=tasks.length?Math.round(done/tasks.length*100):0;
 if(count)count.textContent=`${done} / ${tasks.length} 完了`;
 if(progress)progress.style.width=percentValue+'%';
 if(remainingText)remainingText.textContent=next<0?'今日のミッションはすべて完了！':`今日はあと${tasks.length-done}個`;
 if(remainingList)remainingList.innerHTML=next<0?'':tasks.map((t,i)=>!checks[i]&&i!==next?`<span>${escapeHtml(t[1])}</span>`:'').join('');
 if(next<0){
  if(label)label.textContent='TODAY COMPLETE';if(time){time.textContent='DONE';time.className='cat-study';}if(title)title.textContent='今日の計画をすべて完了！';if(duration)duration.textContent='今日のStep Upを残して、しっかり休もう。';if(tag){tag.textContent='';tag.className='task-tag hidden';}if(remainingBadge)remainingBadge.classList.add('hidden');if(button){button.textContent='MISSION COMPLETE ✓';button.disabled=true;delete button.dataset.taskIndex;}
  return;
 }
 const nextTask=tasks[next];
 const cat=classifyScheduleCategory(nextTask[1]);
 if(label)label.textContent=isActive?'学習中':'今やること';
 if(time){time.textContent=nextTask[0];time.className='cat-'+cat;}
 if(title)title.textContent=nextTask[1];
 if(duration)duration.textContent=isActive?`予定時間 ${nextTask[2]}・集中して進めよう`:`予定時間 ${nextTask[2]}`;
 if(tag){tag.textContent=SCHEDULE_CATEGORY_LABELS[cat];tag.className='task-tag cat-'+cat;}
 // 残量：紐付く課題データがあれば「残りNページ/回」等を表示。無ければ非表示。
 if(remainingBadge){
  const linked=nextTask[3]?ProgressEngine.getAll(current).find(x=>x.id===nextTask[3]):null;
  const remainLabel=linked&&linked.remaining&&linked.remaining!=='なし'?`残り${linked.remaining}`:'';
  if(remainLabel){remainingBadge.textContent=remainLabel;remainingBadge.classList.remove('hidden');}
  else{remainingBadge.textContent='';remainingBadge.classList.add('hidden');}
 }
 if(button){button.textContent=isActive?'完了する ✓':'開始する';button.disabled=false;button.dataset.taskIndex=String(next);button.dataset.action=isActive?'complete':'start';}
}
function update(){const cs=[...document.querySelectorAll('.task input')],done=cs.filter(x=>x.checked).length,p=cs.length?Math.round(done/cs.length*100):0;percent.textContent=p+'%';const doneCountEl=document.querySelector('#doneCount'),totalCountEl=document.querySelector('#totalCount'),barEl=document.querySelector('#bar');if(doneCountEl)doneCountEl.textContent=done;if(totalCountEl)totalCountEl.textContent=cs.length;if(barEl)barEl.style.width=p+'%';const tasks=activeTasks(),checks=cs.map(x=>x.checked);updateMobileMission(tasks,checks,done);renderPersonalCoach();}

function showMissionCelebration(taskTitle,allDone){
 const box=document.querySelector('#missionCelebration'),title=document.querySelector('#celebrationTitle'),text=document.querySelector('#celebrationText');
 if(!box)return;
 if(title)title.textContent=allDone?'今日の計画、完了！':'よく頑張った！';
 if(text)text.textContent=allDone?'最後までやり切ったことが、今日のStep Upです。':`${taskTitle}を完了しました。`;
 box.classList.add('show');box.setAttribute('aria-hidden','false');
 clearTimeout(window.stepupCelebrationTimer);
 window.stepupCelebrationTimer=setTimeout(()=>{box.classList.remove('show');box.setAttribute('aria-hidden','true');if(allDone)document.querySelector('.step-card')?.scrollIntoView({behavior:'smooth',block:'start'});},2200);
}
const completeCurrentMission=document.querySelector('#completeCurrentMission');
if(completeCurrentMission)completeCurrentMission.onclick=()=>{
 const index=Number(completeCurrentMission.dataset.taskIndex);if(!Number.isInteger(index))return;
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 if(completeCurrentMission.dataset.action==='start'){saved.activeTaskIndex=index;localStorage.setItem(key(),JSON.stringify(saved));update();return;}
 const checkbox=document.querySelector(`.task input[data-i="${index}"]`);if(!checkbox)return;
 const taskTitle=activeTasks()[index]?.[1]||'ミッション';
 checkbox.checked=true;
 saved.activeTaskIndex=null;localStorage.setItem(key(),JSON.stringify(saved));
 checkbox.dispatchEvent(new Event('change'));
 const allDone=[...document.querySelectorAll('.task input')].every(x=>x.checked);
 showMissionCelebration(taskTitle,allDone);
};


// Sprint 25: Champion Edition テーマ（既存のthemeToggleボタンを流用し、全画面・永続化に拡張）
const THEME_STORAGE_KEY='stepup-theme';
function applyTheme(themeName){
 document.documentElement.classList.toggle('theme-champion-black',themeName==='black');
}
function initTheme(){
 let saved='white';
 try{saved=localStorage.getItem(THEME_STORAGE_KEY)||'white'}catch(e){}
 applyTheme(saved);
}
initTheme();
// Sprint 26: Heroエリアへ「Step Up / CHAMPION EDITION」ブランド表示を一度だけ挿入する。
// 既存の動的なTODAY'S FOCUS(進捗リング・フォーカスタイトル)は一切変更しない。
(function insertChampionHeroBrand(){
 const hero=document.querySelector('.focus-hero');
 const textBlock=hero?.querySelector(':scope>div:first-child');
 if(!textBlock||textBlock.querySelector('.champion-hero-brand'))return;
 textBlock.insertAdjacentHTML('afterbegin','<div class="champion-hero-brand" aria-hidden="true"><span class="champion-emblem lg" aria-hidden="true"></span><span class="champion-hero-brand-text"><span class="champion-hero-brand-main">Step Up</span><span class="champion-hero-brand-edition">CHAMPION EDITION</span><span class="champion-hero-brand-sub">今日も勝利への一歩。</span></span></div>');
})();
// Sprint 39: 重要な見出しにだけ「エンブレムライン」(線+ダイヤ+エンブレム+ダイヤ+線)を一度だけ配置する(表示のみ)。
function championEmblemLineHTML(){
 return '<div class="champion-emblem-line" aria-hidden="true"><span class="champion-emblem-line__line"></span><span class="champion-emblem-line__diamond"></span><span class="champion-emblem champion-emblem-line__badge" aria-hidden="true"></span><span class="champion-emblem-line__diamond"></span><span class="champion-emblem-line__line"></span></div>';
}
(function insertChampionPageEmblems(){
 document.querySelectorAll('.utility-hero h1,.calendar-hero h1').forEach(h1=>{
  if(h1.parentElement.querySelector('.champion-emblem-line'))return;
  h1.insertAdjacentHTML('beforebegin',championEmblemLineHTML());
 });
 const stepHeading=document.querySelector('.step-card small');
 if(stepHeading&&!stepHeading.parentElement.querySelector('.champion-emblem-line')){
  stepHeading.insertAdjacentHTML('beforebegin',championEmblemLineHTML());
 }
 const voiceHeading=document.querySelector('#voiceCoach .voice-heading');
 if(voiceHeading&&!voiceHeading.querySelector('.champion-emblem-line')){
  voiceHeading.insertAdjacentHTML('afterbegin',championEmblemLineHTML());
 }
 const restHeading=document.querySelector('.rest-card small')||document.querySelector('.rest-card .card-title');
 if(restHeading&&!restHeading.parentElement.querySelector('.champion-emblem-line')){
  restHeading.insertAdjacentHTML('beforebegin',championEmblemLineHTML());
 }
})();
themeToggle.onclick=()=>{
 const isBlack=document.documentElement.classList.contains('theme-champion-black');
 const next=isBlack?'white':'black';
 applyTheme(next);
 try{localStorage.setItem(THEME_STORAGE_KEY,next)}catch(e){console.error('テーマの保存に失敗しました',e)}
};

function getCoachMessage(id){
 const saved=JSON.parse(localStorage.getItem('stepup-v4-'+PLAN_DATE+'-'+id)||'{}');
 const tasks=saved.customTasks||data[id].tasks;
 const checks=saved.checks||{};
 const doneIndexes=tasks.map((_,i)=>i).filter(i=>checks[i]);
 const nextIndex=tasks.findIndex((_,i)=>!checks[i]);
 const done=doneIndexes.length,total=tasks.length,rate=total?Math.round(done/total*100):0;
 const lastDone=doneIndexes.length?tasks[doneIndexes[doneIndexes.length-1]][1]:'';
 const nextTask=nextIndex>=0?tasks[nextIndex][1]:'';
 const profile=id==='iori'?{
  name:'壱凰',strength:'ゴールを決めると、最後までやり切ろうとする力',strategy:'英語や暗記は、最初に「分からない所」を3つだけ見つけてから取り組むと、集中しやすくなるよ。',fallback:'まず数学か英語を20分。終わったらチェックを付けよう。'
 }:{
  name:'朔埜',strength:'一つずつ順番に進め、文章や課題を形にする力',strategy:'算数や理科は、長く続けるより「10分＋丸付け」を1セットにすると、苦手を見つけやすいよ。',fallback:'最初の10分だけ始めよう。始められたことが今日の一歩。'
 };
 let good;
 const checkedTitles=getTodayCheckedAssignmentTitles(id);
 if(rate===100)good=`今日の${total}個のミッションを最後までやり切れたね。${profile.strength}がしっかり出ています。`;
 else if(checkedTitles.length)good=`${checkedTitles.join('・')}に取り組めたね。${done}個を完了できたことが、今日の確かなStep Upです。`;
 else if(done>0)good=`${lastDone}まで進められたね。${done}個を完了できたことが、今日の確かなStep Upです。`;
 else good=`今日の目標を確認できたことが最初の一歩。${profile.strength}を生かして、一つだけ始めよう。`;
 const completedAssignments=ProgressEngine.getAll(id).filter(a=>a.done).length;
 if(completedAssignments)good+=` 課題も${completedAssignments}件終わらせられているね。`;
 const next=nextTask?`${nextTask}を、まず20分だけ進めよう。終わったら休憩して、できた所にチェックを付けよう。`: '今日の計画は完了です。今日できたことを一つ書いて、睡眠と休養を優先しよう。';
 return {name:profile.name,good,strategy:profile.strategy,next:nextTask?next:profile.fallback,rate,done,total};
}
function renderPersonalCoach(){
 const message=getCoachMessage(current);
 const name=document.querySelector('#coachChildName'),good=document.querySelector('#coachGood'),strategy=document.querySelector('#coachStrategy'),next=document.querySelector('#coachNext');
 if(name)name.textContent=message.name+'専用';
 if(good)good.textContent=message.good;
 if(strategy)strategy.textContent=message.strategy;
 if(next)next.textContent=message.next;
}
function childSummary(id){
 const saved=JSON.parse(localStorage.getItem('stepup-v4-'+PLAN_DATE+'-'+id)||'{}');
 const tasks=activeTasks(id).filter(t=>!t[5]); // イベント(固定予定)は達成率の分母に含めない(子ども側update()と同じ基準)
 const checks=saved.checks||{};
 const total=tasks.length;
 const done=tasks.filter((t,i)=>checks[i]).length;
 const rate=total?Math.round(done/total*100):0;
 const mins=tasks.reduce((sum,t,i)=>sum+(checks[i]?parseInt(t[2])||0:0),0);
 return {done,total,rate,mins,step:saved.step||'まだ記録なし'};
}
function renderFamily(){
 const a=childSummary('iori'),b=childSummary('sakuya'),allDone=a.done+b.done,allTotal=a.total+b.total,rate=Math.round(allDone/allTotal*100),mins=a.mins+b.mins;
 familyStats.innerHTML=`<div><b>${rate}%</b><span>今日の達成率</span></div><div><b>${Math.floor(mins/60)}h ${mins%60}m</b><span>完了した学習時間</span></div><div><b>${allTotal-allDone}</b><span>残りミッション</span></div>`;
 childOverview.innerHTML=[['壱凰','IORI','iori',a,'#d70725'],['朔埜','SAKUYA','sakuya',b,'#146aff']].map(([name,en,key,x,color])=>`<article style="--child:${color}" data-child-open="${key}" role="button" tabindex="0" aria-label="${name}の個人ページを見る"><small>${en}</small><h2>${name}</h2><div class="child-rate"><b>${x.rate}%</b><span>${x.done}/${x.total} COMPLETE</span></div><div class="child-bar"><i style="width:${x.rate}%"></i></div><p>${x.step}</p></article>`).join('');
 childOverview.querySelectorAll('[data-child-open]').forEach(card=>{const open=()=>{current=card.dataset.childOpen;render();show(mission)};card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
 renderFamilyTodayActivity();
 renderFamilyDeadlineAlert();
 renderFamilyStepUp();
}
// Sprint 85: 提出期限アラート(閲覧専用)。既存のgetPendingDeadlineAssignments()をそのまま利用する。
function renderFamilyDeadlineAlert(){
 const el=document.querySelector('#familyDeadlineAlert');
 if(!el)return;
 const rows=['iori','sakuya'].flatMap(childId=>{
  const name=childId==='iori'?'壱凰':'朔埜';
  return getPendingDeadlineAssignments(childId)
   .filter(a=>['overdue','today','within3'].includes(a.category))
   .map(a=>({...a,name}));
 });
 el.innerHTML=rows.length
  ?rows.map(a=>`<div class="family-activity-row"><b>[${a.name}] ${escapeHtml(a.title)}</b><span class="deadline-tag cat-${a.category}">${escapeHtml(a.label)}</span></div>`).join('')
  :'<p class="family-activity-empty">期限が近い提出物はありません。</p>';
}
// 今日のStep Up：子どもごとに1件、既存のchildSummary().stepをそのまま利用する。
function renderFamilyStepUp(){
 const el=document.querySelector('#familyStepUp');
 if(!el)return;
 const a=childSummary('iori'),b=childSummary('sakuya');
 el.innerHTML=`<div class="family-activity-row"><b>壱凰</b><span>${escapeHtml(a.step)}</span></div><div class="family-activity-row"><b>朔埜</b><span>${escapeHtml(b.step)}</span></div>`;
}
// Sprint 66: 保護者ページ(閲覧専用)。子どもごとに「今日追加された課題」「今日の計画」を表示する。
// 編集・上書きの手段は一切設けない。
function renderFamilyTodayActivity(){
 const el=document.querySelector('#familyTodayActivity');
 if(!el)return;
 const todayStr=dateKey(TODAY);
 el.innerHTML=['iori','sakuya'].map(childId=>{
  const name=childId==='iori'?'壱凰':'朔埜';
  const customs=getCustomAssignments(childId).filter(c=>(c.createdAt||'').slice(0,10)===todayStr);
  const savedPlan=JSON.parse(localStorage.getItem(`stepup-v4-${todayStr}-${childId}`)||'{}');
  const savedChecks=savedPlan.checks||{};
  const reactions=getFamilyReactions(childId);
  // Sprint 85: 子ども側の詳細スケジュールと完全に同じ基準(activeTasks)で今日の計画を表示する。
  // これにより、子ども側でチェックしたタスク＝ここで完了表示されるタスク、が一致する。
  const allTasks=activeTasks(childId);
  const activePlan=allTasks.map((t,i)=>({t,i})).filter(({t})=>!t[5]); // イベント行を除外しつつ、元の配列インデックスを保持する
  // アーカイブ履歴(表示からは外れているが記録は残っている項目)は生のcustomTasksから別途取得する
  const rawTasks=(savedPlan.customTasks||[]).map(t=>t.length>=5?t:[t[0],t[1],t[2],t[3]||null,{}]);
  const archivedPlan=rawTasks.filter(t=>t[4]&&t[4].archived);

  const addedHtml=customs.length
   ?customs.map(c=>`<div class="family-activity-row"><b>${escapeHtml(c.title)}</b><span>${escapeHtml(c.subject||'')}${c.material?'／教材：'+escapeHtml(c.material):''}</span><small>追加：${c.createdAt?new Date(c.createdAt).toLocaleString('ja-JP'):'—'}</small></div>`).join('')
   :'<p class="family-activity-empty">今日追加された課題はありません。</p>';

  const planHtml=activePlan.length
   ?activePlan.map(({t,i})=>{
     const meta=t[6]||{};
     const pageText=(meta.pageStart!=null&&meta.pageEnd!=null)?`P${meta.pageStart}〜${meta.pageEnd}`:(meta.problemRange||'');
     const isDone=!!savedChecks[i];
     const rKey=taskReactionKey(t);
     const liked=!!(reactions[rKey]&&reactions[rKey].liked);
     const likeBtn=isDone
      ?`<button type="button" class="family-like-btn ${liked?'is-liked':''}" data-like-child="${childId}" data-like-key="${escapeHtml(rKey)}" aria-pressed="${liked}">👍${liked?' 応援済み':''}</button>`
      :`<button type="button" class="family-like-btn is-disabled" disabled title="完了したら応援できます">👍</button>`;
     return `<div class="family-activity-row"><b>${t[0]||'--:--'} ${escapeHtml(t[1])}</b><span>${escapeHtml(t[2]||'')}${pageText?'／'+escapeHtml(pageText):''}</span><small>完了：${isDone?'済み':'未'}${meta.updatedAt?'／更新：'+new Date(meta.updatedAt).toLocaleString('ja-JP'):''}</small>${likeBtn}</div>`;
    }).join('')
   :'<p class="family-activity-empty">今日の計画はまだありません。</p>';

  const archivedHtml=archivedPlan.length
   ?`<details class="family-activity-archived"><summary>計画から外した項目の履歴（${archivedPlan.length}件）</summary>${archivedPlan.map(t=>`<div class="family-activity-row is-archived"><b>${t[0]||'--:--'} ${escapeHtml(t[1])}</b><small>外した日時：${t[4]?.updatedAt?new Date(t[4].updatedAt).toLocaleString('ja-JP'):'—'}</small></div>`).join('')}</details>`
   :'';

  return `<div class="family-activity-child">
    <h3>${name}</h3>
    <div class="family-activity-section"><small>今日追加された課題</small>${addedHtml}</div>
    <div class="family-activity-section"><small>今日の計画</small>${planHtml}</div>
    ${archivedHtml}
   </div>`;
 }).join('');
 el.querySelectorAll('[data-like-key]').forEach(btn=>{
  btn.onclick=()=>{
   toggleFamilyReaction(btn.dataset.likeChild,btn.dataset.likeKey);
   renderFamilyTodayActivity();
   if(document.querySelector('#mission')?.classList.contains('active'))render();
  };
 });
}

// Calendar navigation and rendering
const calendarScreen=document.querySelector('#calendar');
const calendarGrid=document.querySelector('#calendarGrid');
const monthTitle=document.querySelector('#monthTitle');
const agendaTitle=document.querySelector('#agendaTitle');
const agendaList=document.querySelector('#agendaList');
const calendarPerson=document.querySelector('#calendarPerson');
let calendarDate=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);
let selectedDate=new Date(TODAY);
// Sprint 47: 固定日付のダミー予定(calendarEvents)は廃止。
// 日付・子どもごとに保存された実際の予定(customTasks)、
// 「今日」でまだ保存されていなければ既定のスケジュールを表示する。
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

// Sprint 50: 固定予定(部活・外出・オンライン家庭教師など)の保存構造。
// 学習予定(customTasks)とは完全に別のキーで管理し、既存データと競合しない。
const EVENT_CATEGORY_LABELS={club:'部活',outing:'外出',tutor:'オンライン家庭教師',school:'学校',hospital:'通院',family:'家族の予定',commute:'移動',meal:'食事',rest:'休憩',other:'その他'};
function eventsKey(dateStr,childId){return `stepup-events-${dateStr}-${childId}`}
// ============================================================
// どこスタ連携（手動記録）
// 既存データ・機能とは完全に別のキーで管理し、既存処理は一切変更しない。
// ============================================================
const DOKOSUTA_URL='https://d-study-home.i-cube-core.com/';
function dokosutaKey(childId){return `stepup-dokosuta-log-${childId}`}
function getDokosutaLog(childId){try{const v=JSON.parse(localStorage.getItem(dokosutaKey(childId))||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
function saveDokosutaLog(childId,list){localStorage.setItem(dokosutaKey(childId),JSON.stringify(list))}

// 復習候補の時間を、間違い数・分からない内容・復習希望から算出する(最も長い時間を採用)
function dokosutaReviewMinutes(entry){
 let m=0;
 const mistakes=Number(entry.mistakes||0);
 if(mistakes>=6)m=Math.max(m,20);
 else if(mistakes>=3)m=Math.max(m,15);
 else if(mistakes>=1)m=Math.max(m,10);
 if(entry.unclear&&String(entry.unclear).trim())m=Math.max(m,15);
 if(entry.reviewAgain)m=Math.max(m,15);
 return m;
}
// 翌日の復習候補として扱うべき記録かどうかの判定(1か所にまとめる)
function isDokosutaReviewCandidate(entry){
 if(entry.reviewed)return false;
 const mistakes=Number(entry.mistakes||0);
 return mistakes>=1 || !!(entry.unclear&&String(entry.unclear).trim()) || !!entry.reviewAgain;
}
function getDokosutaReviewCandidates(childId){
 return getDokosutaLog(childId).filter(isDokosutaReviewCandidate);
}

function getEventsRaw(dateStr,childId){try{const v=JSON.parse(localStorage.getItem(eventsKey(dateStr,childId))||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
function saveEventsRaw(dateStr,childId,list){localStorage.setItem(eventsKey(dateStr,childId),JSON.stringify(list))}
// 指定した日・子どもの固定予定を取得する(本人分＋共通(family)分をまとめて返す)
function getEventsForDate(dateStr,childId){
 const own=getEventsRaw(dateStr,childId);
 const family=getEventsRaw(dateStr,'family');
 return [...own,...family].sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99'));
}
function toMinutesSafe(t){if(!t)return null;const[h,m]=String(t).split(':').map(Number);return h*60+(m||0)}
// 固定予定の時間帯を分単位のperiod配列にし、重なりを統合(和集合)する
function mergedBusyPeriods(dateStr,childId){
 const events=getEventsForDate(dateStr,childId).filter(e=>e.startTime&&e.endTime);
 const periods=events.map(e=>[toMinutesSafe(e.startTime),toMinutesSafe(e.endTime)]).sort((a,b)=>a[0]-b[0]);
 const merged=[];
 for(const p of periods){
  if(merged.length&&p[0]<=merged[merged.length-1][1]){merged[merged.length-1][1]=Math.max(merged[merged.length-1][1],p[1])}
  else merged.push([...p]);
 }
 return merged;
}
// 指定した開始時刻・所要時間が、固定予定の使用不可時間と重なる場合、重ならない次の時刻まで進める
function avoidBusyPeriods(startMin,durationMin,busyPeriods){
 let t=startMin;
 let moved=true;
 while(moved){
  moved=false;
  for(const[bStart,bEnd]of busyPeriods){
   if(t<bEnd&&(t+durationMin)>bStart){t=bEnd;moved=true;}
  }
 }
 return t;
}

function tasksForDate(d,id=current){
 const dk=dateKey(d);
 const k='stepup-v4-'+dk+'-'+id;
 const saved=JSON.parse(localStorage.getItem(k)||'{}');
 const studyTasks=(saved.customTasks?saved.customTasks:(dk===dateKey(TODAY)?data[id].tasks:[])).map(t=>t.length>=4?t:[t[0],t[1],t[2],t[3]||null]);
 const events=getEventsForDate(dk,id).map(e=>[e.startTime||'',`${e.title}`,e.endTime&&e.startTime?`${e.startTime}〜${e.endTime}`:'',null,EVENT_CATEGORY_LABELS[e.category]||'予定',e.id]);
 const merged=[...studyTasks.map(t=>[t[0],t[1],t[2],t[3],null,null]),...events];
 merged.sort((a,b)=>(a[0]||'99:99').localeCompare(b[0]||'99:99'));
 return merged;
}
function renderCalendar(){
 const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
 monthTitle.textContent=`${y}年${m+1}月`;
 const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
 calendarGrid.innerHTML='';
 for(let i=0;i<42;i++){
  const d=new Date(start);d.setDate(start.getDate()+i);const k=dateKey(d);const ev=tasksForDate(d);
  const b=document.createElement('button');b.className='day'+(d.getMonth()!==m?' muted':'')+(k===dateKey(selectedDate)?' selected':'')+(k===dateKey(TODAY)?' today':'');
  b.innerHTML=`<span class="day-number">${d.getDate()}</span>${ev.length?'<i class="day-dot"></i><span class="day-label">'+ev[0][1]+'</span>':''}`;
  b.onclick=()=>{selectedDate=d;renderCalendar();renderAgenda()};calendarGrid.appendChild(b);
 }
 renderAgenda();
 if(typeof updateReAdjustButtonVisibility==='function')updateReAdjustButtonVisibility();
}
function renderAgenda(){
 const ev=tasksForDate(selectedDate);
 agendaTitle.textContent=`${selectedDate.getMonth()+1}月${selectedDate.getDate()}日の予定`;
 agendaList.innerHTML=ev.length?ev.map(x=>{
  const isEvent=!!x[5];
  const label=isEvent?(x[4]||'予定'):'学習ミッション';
  const editBtns=isEvent?`<div class="event-actions"><button type="button" data-edit-event="${x[5]}">編集</button><button type="button" data-delete-event="${x[5]}">削除</button></div>`:'';
  return `<div class="agenda-item${isEvent?' agenda-item--event':''}"><time>${x[0]}</time><span><strong>${x[1]}</strong><small>${label}</small></span><em>${x[2]}</em>${editBtns}</div>`;
 }).join(''):'<div class="empty-agenda">予定はありません。休息や振り返りの時間にしましょう。</div>';
 bindEventActionButtons();
}
function openCalendar(){calendarPerson.textContent=(data[current]?.name||'学習')+' / 学習カレンダー';show(calendarScreen);renderCalendar()}
document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{
 const dest=btn.dataset.nav;
 if(dest==='calendar') openCalendar();
 else if(dest==='home') show(mission);
 else if(dest==='materials') openMaterials();
 else if(dest==='growth') openGrowth();
 else if(dest==='assignments') openAssignments();
}));
document.querySelector('#calendarBack').onclick=()=>show(mission);
document.querySelector('#prevMonth').onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar()};
document.querySelector('#nextMonth').onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar()};
document.querySelector('#todayBtn').onclick=()=>{calendarDate=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);selectedDate=new Date(TODAY);renderCalendar()};

// Sprint 50: 固定予定の追加・編集・削除
const eventFormEl=document.querySelector('#eventForm');
const openEventFormBtn=document.querySelector('#openEventFormBtn');
const eventTitleInput=document.querySelector('#eventTitle');
const eventDateInput=document.querySelector('#eventDate');
const eventStartInput=document.querySelector('#eventStart');
const eventEndInput=document.querySelector('#eventEnd');
const eventCategoryInput=document.querySelector('#eventCategory');
const eventNoteInput=document.querySelector('#eventNote');
const eventTargetInput=document.querySelector('#eventTarget');
const eventEditIdInput=document.querySelector('#eventEditId');
const saveEventBtn=document.querySelector('#saveEventBtn');
const deleteEventBtn=document.querySelector('#deleteEventBtn');
const eventFormTitle=document.querySelector('#eventFormTitle');

function openEventForm(existing){
 eventFormEl.classList.remove('hidden');
 if(existing){
  eventFormTitle.textContent='予定を編集';
  eventEditIdInput.value=existing.id;
  eventTitleInput.value=existing.title;
  eventDateInput.value=existing.date;
  eventStartInput.value=existing.startTime||'';
  eventEndInput.value=existing.endTime||'';
  eventCategoryInput.value=existing.category||'other';
  eventNoteInput.value=existing.note||'';
  eventTargetInput.value=existing.__ownerChildId||'family';
  deleteEventBtn.classList.remove('hidden');
 }else{
  eventFormTitle.textContent='予定を追加';
  eventEditIdInput.value='';
  eventTitleInput.value='';
  eventDateInput.value=dateKey(selectedDate);
  eventStartInput.value='';
  eventEndInput.value='';
  eventCategoryInput.value='club';
  eventNoteInput.value='';
  eventTargetInput.value=current;
  deleteEventBtn.classList.add('hidden');
 }
}
openEventFormBtn.onclick=()=>openEventForm(null);

saveEventBtn.onclick=()=>{
 const title=eventTitleInput.value.trim();
 if(!title)return;
 const dateStr=eventDateInput.value||dateKey(selectedDate);
 const targetChild=eventTargetInput.value;
 const editId=eventEditIdInput.value;
 const entry={
  id:editId||('event-'+Date.now()),
  type:'fixed-event',
  category:eventCategoryInput.value,
  title,
  date:dateStr,
  startTime:eventStartInput.value||null,
  endTime:eventEndInput.value||null,
  note:eventNoteInput.value||'',
  childId:targetChild
 };
 if(editId){
  // 編集：どのオーナー(iori/sakuya/family)に保存されているか分からないため、3つとも探して更新する
  ['iori','sakuya','family'].forEach(owner=>{
   const list=getEventsRaw(dateStr,owner);
   const idx=list.findIndex(e=>e.id===editId);
   if(idx>-1){
    if(owner===targetChild){list[idx]=entry;saveEventsRaw(dateStr,owner,list)}
    else{list.splice(idx,1);saveEventsRaw(dateStr,owner,list);const newList=getEventsRaw(dateStr,targetChild);newList.push(entry);saveEventsRaw(dateStr,targetChild,newList)}
   }
  });
 }else{
  const list=getEventsRaw(dateStr,targetChild);
  list.push(entry);
  saveEventsRaw(dateStr,targetChild,list);
 }
 eventFormEl.classList.add('hidden');
 renderCalendar();
 render();
};

deleteEventBtn.onclick=()=>{
 const editId=eventEditIdInput.value;
 if(!editId)return;
 if(!confirm('この予定を削除しますか？'))return;
 const dateStr=eventDateInput.value||dateKey(selectedDate);
 ['iori','sakuya','family'].forEach(owner=>{
  const list=getEventsRaw(dateStr,owner);
  const filtered=list.filter(e=>e.id!==editId);
  if(filtered.length!==list.length)saveEventsRaw(dateStr,owner,filtered);
 });
 eventFormEl.classList.add('hidden');
 renderCalendar();
 render();
};

// agendaList内の編集・削除ボタンにイベントを登録(再描画のたびに呼び出す)
function bindEventActionButtons(){
 document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.editEvent;
  const dateStr=dateKey(selectedDate);
  let found=null,owner=null;
  ['iori','sakuya','family'].forEach(o=>{
   const item=getEventsRaw(dateStr,o).find(e=>e.id===id);
   if(item){found=item;owner=o}
  });
  if(found){found.__ownerChildId=owner;openEventForm(found)}
 });
 document.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{
  if(!confirm('この予定を削除しますか？'))return;
  const id=b.dataset.deleteEvent;
  const dateStr=dateKey(selectedDate);
  ['iori','sakuya','family'].forEach(owner=>{
   const list=getEventsRaw(dateStr,owner);
   const filtered=list.filter(e=>e.id!==id);
   if(filtered.length!==list.length)saveEventsRaw(dateStr,owner,filtered);
  });
  renderCalendar();
  render();
 });
}

// ============================================================
// どこスタ連携：UI配線(開くボタン・記録フォーム・履歴表示・編集・削除・復習済み切替)
// ============================================================
const openDokosutaBtn=document.querySelector('#openDokosutaBtn');
const dokosutaFallback=document.querySelector('#dokosutaFallback');
if(openDokosutaBtn)openDokosutaBtn.onclick=()=>{
 const win=window.open(DOKOSUTA_URL,'_blank','noopener,noreferrer');
 if(!win||win.closed||typeof win.closed==='undefined'){
  if(dokosutaFallback)dokosutaFallback.classList.remove('hidden');
 }else{
  if(dokosutaFallback)dokosutaFallback.classList.add('hidden');
 }
};

const dokosutaFormEl=document.querySelector('#dokosutaForm');
const toggleDokosutaFormBtn=document.querySelector('#toggleDokosutaFormBtn');
const dokosutaDateInput=document.querySelector('#dokosutaDate');
const dokosutaChildInput=document.querySelector('#dokosutaChild');
const dokosutaSubjectInput=document.querySelector('#dokosutaSubject');
const dokosutaUnitInput=document.querySelector('#dokosutaUnit');
const dokosutaMinutesInput=document.querySelector('#dokosutaMinutes');
const dokosutaContentInput=document.querySelector('#dokosutaContent');
const dokosutaMistakesInput=document.querySelector('#dokosutaMistakes');
const dokosutaUnclearInput=document.querySelector('#dokosutaUnclear');
const dokosutaReviewAgainInput=document.querySelector('#dokosutaReviewAgain');
const dokosutaMemoInput=document.querySelector('#dokosutaMemo');
const dokosutaEditIdInput=document.querySelector('#dokosutaEditId');
const saveDokosutaBtn=document.querySelector('#saveDokosutaBtn');
const deleteDokosutaBtn=document.querySelector('#deleteDokosutaBtn');

function openDokosutaForm(existing){
 if(!dokosutaFormEl)return;
 dokosutaFormEl.classList.remove('hidden');
 if(existing){
  dokosutaEditIdInput.value=existing.id;
  dokosutaDateInput.value=existing.date;
  dokosutaChildInput.value=existing.childId;
  dokosutaSubjectInput.value=existing.subject;
  dokosutaUnitInput.value=existing.unit||'';
  dokosutaMinutesInput.value=existing.minutes||0;
  dokosutaContentInput.value=existing.content||'';
  dokosutaMistakesInput.value=existing.mistakes||0;
  dokosutaUnclearInput.value=existing.unclear||'';
  dokosutaReviewAgainInput.checked=!!existing.reviewAgain;
  dokosutaMemoInput.value=existing.memo||'';
  deleteDokosutaBtn.classList.remove('hidden');
 }else{
  dokosutaEditIdInput.value='';
  dokosutaDateInput.value=dateKey(TODAY);
  dokosutaChildInput.value=current;
  dokosutaSubjectInput.value='国語';
  dokosutaUnitInput.value='';
  dokosutaMinutesInput.value='';
  dokosutaContentInput.value='';
  dokosutaMistakesInput.value='';
  dokosutaUnclearInput.value='';
  dokosutaReviewAgainInput.checked=false;
  dokosutaMemoInput.value='';
  deleteDokosutaBtn.classList.add('hidden');
 }
}
if(toggleDokosutaFormBtn)toggleDokosutaFormBtn.onclick=()=>{
 if(dokosutaFormEl.classList.contains('hidden'))openDokosutaForm(null);
 else dokosutaFormEl.classList.add('hidden');
};

if(saveDokosutaBtn)saveDokosutaBtn.onclick=()=>{
 const childId=dokosutaChildInput.value;
 const editId=dokosutaEditIdInput.value;
 const now=new Date().toISOString();
 const entry={
  id:editId||('dokosuta-'+Date.now()),
  date:dokosutaDateInput.value||dateKey(TODAY),
  childId,
  subject:dokosutaSubjectInput.value,
  unit:dokosutaUnitInput.value.trim(),
  minutes:Math.max(0,Math.floor(Number(dokosutaMinutesInput.value)||0)),
  content:dokosutaContentInput.value.trim(),
  mistakes:Math.max(0,Math.floor(Number(dokosutaMistakesInput.value)||0)),
  unclear:dokosutaUnclearInput.value.trim(),
  reviewAgain:dokosutaReviewAgainInput.checked,
  memo:dokosutaMemoInput.value.trim(),
  reviewed:false,
  createdAt:now,
  updatedAt:now
 };
 if(editId){
  // 編集：どの子どものログにあるか分からないため両方探す(対象変更にも対応)
  ['iori','sakuya'].forEach(owner=>{
   const list=getDokosutaLog(owner);
   const idx=list.findIndex(e=>e.id===editId);
   if(idx>-1){
    entry.createdAt=list[idx].createdAt;
    entry.reviewed=list[idx].reviewed;
    if(owner===childId){list[idx]=entry;saveDokosutaLog(owner,list)}
    else{list.splice(idx,1);saveDokosutaLog(owner,list);const newList=getDokosutaLog(childId);newList.unshift(entry);saveDokosutaLog(childId,newList)}
   }
  });
 }else{
  const list=getDokosutaLog(childId);
  list.unshift(entry);
  saveDokosutaLog(childId,list);
 }
 dokosutaFormEl.classList.add('hidden');
 renderDokosutaHistory();
};

if(deleteDokosutaBtn)deleteDokosutaBtn.onclick=()=>{
 const editId=dokosutaEditIdInput.value;
 if(!editId)return;
 if(!confirm('この学習記録を削除しますか？'))return;
 ['iori','sakuya'].forEach(owner=>{
  const list=getDokosutaLog(owner);
  const filtered=list.filter(e=>e.id!==editId);
  if(filtered.length!==list.length)saveDokosutaLog(owner,filtered);
 });
 dokosutaFormEl.classList.add('hidden');
 renderDokosutaHistory();
};

function renderDokosutaHistory(){
 const historyEl=document.querySelector('#dokosutaHistory');
 if(!historyEl)return;
 const list=getDokosutaLog(current).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
 historyEl.innerHTML=list.length?list.map(e=>`
  <article class="dokosuta-history-item ${e.reviewed?'is-reviewed':''}">
   <div class="dokosuta-history-main">
    <b>${e.date}</b><span>${e.subject}${e.unit?'／'+e.unit:''}</span>
    <small>${e.minutes}分・間違い${e.mistakes}問${e.reviewAgain?'・復習希望':''}${e.reviewed?'・復習済み':''}</small>
   </div>
   <div class="dokosuta-history-actions">
    <button type="button" data-dokosuta-edit="${e.id}">編集</button>
    <button type="button" data-dokosuta-toggle-reviewed="${e.id}">${e.reviewed?'未完了に戻す':'復習済みにする'}</button>
    <button type="button" data-dokosuta-delete="${e.id}">削除</button>
   </div>
  </article>
 `).join(''):'<p class="dokosuta-empty">まだ記録がありません。</p>';

 historyEl.querySelectorAll('[data-dokosuta-edit]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.dokosutaEdit;
  const item=getDokosutaLog(current).find(e=>e.id===id);
  if(item)openDokosutaForm(item);
 });
 historyEl.querySelectorAll('[data-dokosuta-delete]').forEach(b=>b.onclick=()=>{
  if(!confirm('この学習記録を削除しますか？'))return;
  const id=b.dataset.dokosutaDelete;
  const list=getDokosutaLog(current).filter(e=>e.id!==id);
  saveDokosutaLog(current,list);
  renderDokosutaHistory();
 });
 historyEl.querySelectorAll('[data-dokosuta-toggle-reviewed]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.dokosutaToggleReviewed;
  const list=getDokosutaLog(current);
  const item=list.find(e=>e.id===id);
  if(item){item.reviewed=!item.reviewed;item.updatedAt=new Date().toISOString();saveDokosutaLog(current,list);renderDokosutaHistory()}
 });
}

// Sprint 50: 「今日の計画を再調整」。固定予定は維持し、未完了の学習予定だけを
// 空き時間(固定予定と重ならない時間)へ再配置する。完了済みは動かさない。適用を押すまで保存しない。
const reAdjustPlanBtn=document.querySelector('#reAdjustPlanBtn');
function updateReAdjustButtonVisibility(){
 if(!reAdjustPlanBtn)return;
 const dk=dateKey(selectedDate);
 const hasEvents=getEventsForDate(dk,current).length>0;
 reAdjustPlanBtn.classList.toggle('hidden',!(hasEvents&&dk===dateKey(TODAY)));
}
if(reAdjustPlanBtn)reAdjustPlanBtn.onclick=()=>{
 const dk=dateKey(TODAY);
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const currentTasks=(saved.customTasks||data[current].tasks).map(t=>t.length>=4?t:[t[0],t[1],t[2],t[3]||null]);
 const checks=saved.checks||{};
 const busy=mergedBusyPeriods(dk,current);
 const kept=[];//完了済みはそのまま
 const pending=[];//未完了は再配置対象
 currentTasks.forEach((t,i)=>{if(checks[i])kept.push(t);else pending.push(t)});
 let clock=Math.max(360,...kept.map(t=>toMinutes(t[0])+ (parseInt(t[2])||30)));//完了済みの後から、最低6:00から
 if(!kept.length)clock=360;
 const result=[...kept];
 pending.forEach(t=>{
  const duration=parseInt(t[2])||30;
  clock=avoidBusyPeriods(clock,duration,busy);
  result.push([asTime(clock),t[1],t[2],t[3]]);
  clock+=duration+10;
 });
 result.sort((a,b)=>toMinutes(a[0])-toMinutes(b[0]));
 generatedPlan=result;
 planPreview.innerHTML=result.map((t,i)=>`<article><b>${String(i+1).padStart(2,'0')}</b><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span></article>`).join('');
 applyPlanBtn.disabled=false;
 show(plannerScreen);
};



// Materials
const defaultMaterials={
 iori:[
  {name:'数学 新研究',subject:'数学',priority:'urgent',note:'今日の最優先・完了目標',current:42,total:180,todayFrom:42,todayTo:55},
  {name:'社会 新研究',subject:'社会',priority:'urgent',note:'今日の最優先・完了目標',current:30,total:150,todayFrom:30,todayTo:44},
  {name:'ことばのきまり',subject:'国語',priority:'urgent',note:'提出課題',current:18,total:42,todayFrom:18,todayTo:42},
  {name:'英語 新研究',subject:'英語',priority:'school',note:'夏休み課題',current:26,total:160,todayFrom:26,todayTo:34},
  {name:'歴史の学習',subject:'社会',priority:'review',note:'1・2年の復習',current:12,total:80,todayFrom:12,todayTo:18},
  {name:'ジョイフルワーク',subject:'英語',priority:'school',note:'学校の宿題',current:8,total:60,todayFrom:8,todayTo:14}
 ],
 sakuya:[
  {name:'サマースクール',subject:'その他',priority:'urgent',note:'丸付け',current:18,total:40,todayFrom:18,todayTo:22},
  {name:'国語ワーク',subject:'国語',priority:'school',note:'3ページ',current:10,total:60,todayFrom:10,todayTo:13},
  {name:'理科ワーク',subject:'理科',priority:'school',note:'10ページ',current:15,total:70,todayFrom:15,todayTo:25},
  {name:'数学ワーク',subject:'数学',priority:'review',note:'3ページ',current:9,total:60,todayFrom:9,todayTo:12}
 ]
};
let materialFilter='all';
function materialKey(){return 'stepup-materials-'+current}
function getMaterials(){
 const saved=JSON.parse(localStorage.getItem(materialKey())||'null');
 if(saved)return saved;
 // Sprint 49: 初回はDate.now()ベースの不安定なIDで生成せず、
 // 生成した時点で即座に保存し、以降は同じ安定したIDを使い続ける。
 // （これにより「描画時のID」と「クリック時に再取得したID」が一致するようになる）
 const list=defaultMaterials[current].map((x,i)=>({...x,id:`${current}-material-${i}`,done:false}));
 saveMaterials(list);
 return list;
}
function saveMaterials(list){localStorage.setItem(materialKey(),JSON.stringify(list))}
function renderMaterials(){
 const list=getMaterials();const filtered=materialFilter==='all'?list:list.filter(x=>x.priority===materialFilter);
 materialList.innerHTML=filtered.length?filtered.map(x=>{const total=Number(x.total||100),currentPage=Number(x.current||0),pct=Math.min(100,Math.round(currentPage/total*100));return `<article class="material-item ${x.priority} ${x.done?'done':''}"><div><small>${x.subject} / ${x.priority==='urgent'?'PRIORITY':x.priority==='school'?'SCHOOL':'REVIEW'}</small><h2>${x.name}</h2><p>${x.note||''}</p><div class="page-target"><span>今日 P${x.todayFrom||'-'}〜${x.todayTo||'-'}</span><b>現在 P${currentPage} / ${total}</b></div><div class="material-progress"><i style="width:${pct}%"></i></div><em>残り ${Math.max(0,total-currentPage)}ページ</em></div><div class="material-actions"><button data-progress-id="${x.id}">＋進捗</button><button data-material-id="${x.id}">${x.done?'戻す':'完了'}</button></div></article>`}).join(''):'<div class="empty-state">この条件の教材はありません。</div>';
 document.querySelectorAll('[data-material-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.materialId);if(!item)return;item.done=!item.done;item.current=item.done?Number(item.total||100):0;saveMaterials(all);syncLearningProgress(current,item.name,item.current,item.total);renderMaterials()});
 document.querySelectorAll('[data-progress-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.progressId);if(!item)return;const total=Number(item.total||9999);item.current=Math.max(0,Math.min(total,Number(item.current||0)+1));item.done=item.current>=total;saveMaterials(all);syncLearningProgress(current,item.name,item.current,item.total);renderMaterials()});
 renderNotebookSection();
}

// ============================================================
// NotebookLM連携（登録済みURLを新しいタブで開くだけ。API連携・自動取得は行わない）
// URLは子ども→教材→教科の3階層構造でこの1か所にまとめて管理する。
// 各教科の下に将来「プロンプトをコピー」等の補助ボタンを追加しやすいよう、
// ボタン生成はSUBJECT_LABELS配列を基準にした共通ループにしている。
// ============================================================
const notebookLinks = {
 sakuya: {
  summerSchool: {
   english: "https://notebook.google.com/notebook/1fc70cd4-8f7b-491d-afab-c017bbd896ed",
   math: "https://notebook.google.com/notebook/b2b791fc-ece6-41e0-9c10-a43a4bd5e9e3",
   science: "https://notebook.google.com/notebook/6f74d340-780f-4494-bdbd-1aafe2a2a51c",
   social: "https://notebook.google.com/notebook/9d79ac0c-7ff4-4e9f-af38-9070766f49c9",
   japanese: "https://notebook.google.com/notebook/b27f8756-eca2-4942-a248-aeb0a06ffd1a"
  }
 },
 iori: {
  shinKenkyu: {
   english: "",
   math: "",
   science: "",
   social: "",
   japanese: ""
  }
 }
};
// 子どもの内部キー → 対応する教材の内部キー・表示名
const NOTEBOOK_MATERIAL_BY_CHILD={
 sakuya:{materialId:'summerSchool',materialLabel:'サマースクール'},
 iori:{materialId:'shinKenkyu',materialLabel:'新研究'}
};
// 教科の内部キー → 表示名・アイコン(表示名と内部キーを混同しないよう分離)
const NOTEBOOK_SUBJECTS=[
 {id:'english',label:'英語',icon:'📘'},
 {id:'math',label:'数学',icon:'📗'},
 {id:'science',label:'理科',icon:'🧪'},
 {id:'social',label:'社会',icon:'🌍'},
 {id:'japanese',label:'国語',icon:'📖'}
];

// URLを開く共通処理：登録済みなら新しいタブ、未登録なら画面内通知を表示する。
function openNotebook(childId,materialId,subjectId){
 const url=notebookLinks?.[childId]?.[materialId]?.[subjectId]||'';
 if(!url){
  showNotebookNotice('NotebookLMのURLがまだ登録されていません');
  return;
 }
 window.open(url,'_blank','noopener,noreferrer');
}
function showNotebookNotice(message){
 const el=document.querySelector('#notebookNotice');
 if(!el)return;
 el.textContent=message;
 clearTimeout(window.notebookNoticeTimer);
 window.notebookNoticeTimer=setTimeout(()=>{if(el.textContent===message)el.textContent=''},3000);
}
// 現在選択中の子どもに対応する教材・5教科ボタンだけを描画する(両方同時表示しない)
function renderNotebookSection(){
 const sectionEl=document.querySelector('#notebookSection');
 const subEl=document.querySelector('#notebookSub');
 const buttonsEl=document.querySelector('#notebookButtons');
 if(!sectionEl||!subEl||!buttonsEl)return;
 // 今回は朔埜のサマースクールのみ完成のため、朔埜選択時だけセクションを表示する。
 // 壱凰選択時はセクション自体を非表示にする(準備中表示も出さない)。
 // notebookLinksのiori.shinKenkyu構造自体は将来用にそのまま残す。
 if(current!=='sakuya'){
  sectionEl.classList.add('hidden');
  subEl.textContent='';buttonsEl.innerHTML='';
  return;
 }
 sectionEl.classList.remove('hidden');
 const info=NOTEBOOK_MATERIAL_BY_CHILD[current];
 if(!info){subEl.textContent='';buttonsEl.innerHTML='';return}
 subEl.textContent=`${info.materialLabel} AI復習`;
 buttonsEl.innerHTML=NOTEBOOK_SUBJECTS.map(s=>
  `<button type="button" class="notebook-subject-btn" data-notebook-child="${current}" data-notebook-material="${info.materialId}" data-notebook-subject="${s.id}">
    <span class="notebook-subject-icon">${s.icon}</span>
    <span class="notebook-subject-text"><span class="notebook-subject-name">${s.label}</span><small class="notebook-subject-caption">NotebookLMで開く</small></span>
    <span class="notebook-subject-arrow">→</span>
   </button>`
 ).join('');
 buttonsEl.querySelectorAll('[data-notebook-subject]').forEach(b=>b.onclick=()=>{
  openNotebook(b.dataset.notebookChild,b.dataset.notebookMaterial,b.dataset.notebookSubject);
 });
}
function openMaterials(){materialsPerson.textContent=data[current].name+' / 学習ツール';renderNotebookSection();show(materialsScreen)}
materialsBack.onclick=()=>show(mission);
addMaterialBtn.onclick=()=>materialForm.classList.toggle('hidden');
materialFilters.querySelectorAll('button').forEach(b=>b.onclick=()=>{materialFilter=b.dataset.filter;materialFilters.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderMaterials()});
saveMaterialBtn.onclick=()=>{const name=newMaterialName.value.trim();if(!name)return;const list=getMaterials();list.push({id:Date.now(),name,subject:newMaterialSubject.value,priority:newMaterialPriority.value,note:'追加した教材',current:0,total:100,todayFrom:1,todayTo:5,done:false});saveMaterials(list);newMaterialName.value='';materialForm.classList.add('hidden');renderMaterials()};

// Growth
function openGrowth(){renderGrowth();renderPersonalCoach();show(growthScreen)}
function renderGrowth(){
 growthPerson.textContent=data[current].name+' / 成長記録';
 const saved=JSON.parse(localStorage.getItem(key())||'{}');const checks=saved.checks||{};const total=activeTasks().length;const done=Object.values(checks).filter(Boolean).length;const rate=Math.round(done/total*100);
 growthRate.textContent=rate+'%';growthDone.textContent=done;growthStreak.textContent=(done?3:1)+'日';growthStep.textContent=saved.step||'まだ記録がありません。小さな成長を一つ残そう。';
 const base=current==='iori'?[42,58,35,71,64,50,rate]:[30,45,52,40,68,55,rate];const days=['月','火','水','木','金','土','今日'];
 weekBars.innerHTML=base.map((v,i)=>`<div class="week-bar ${i===6?'today':''}"><span>${v}%</span><i style="height:${Math.max(v,4)}%"></i><b>${days[i]}</b></div>`).join('');
 const achievements=[];if(done)achievements.push(`${done}個のミッションを完了できた`);if(rate>=50)achievements.push('予定の半分以上を進めた');if(saved.step)achievements.push('今日のStep Upを自分の言葉で残した');
 const completedAssignments=ProgressEngine.getAll(current).filter(a=>a.done).length;
 if(completedAssignments)achievements.push(`${completedAssignments}件の課題を完了できた`);
 if(current==='iori'){
  const physicsDone=ProgressEngine.getAll('iori').filter(a=>a.title.startsWith('家庭教師 物理')&&a.done).length;
  achievements.push(`家庭教師 物理　${physicsDone}／${IORI_TUTOR_PHYSICS_TOTAL_DAYS}日完了`);
 }
 achievementList.innerHTML=achievements.length?achievements.map(x=>`<div class="achievement"><i>✓</i><strong>${x}</strong></div>`).join(''):'<div class="empty-state">最初のミッションを完了すると、ここに成長が表示されます。</div>';
}
growthBack.onclick=()=>show(mission);
resetTodayBtn.onclick=()=>{if(confirm('今日のチェックとStep Up記録をリセットしますか？')){localStorage.removeItem(key());render();renderGrowth()}};


// Sprint 5: Smart daily plan builder
const plannerBack=document.querySelector('#plannerBack');
const openPlannerBtn=document.querySelector('#openPlannerBtn');
const generatePlanBtn=document.querySelector('#generatePlanBtn');
const applyPlanBtn=document.querySelector('#applyPlanBtn');
const restorePlanBtn=document.querySelector('#restorePlanBtn');
let generatedPlan=[];
function toMinutes(value){const [h,m]=value.split(':').map(Number);return h*60+m}
function asTime(total){total%=1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function priorityRank(p){return p==='urgent'?1:p==='school'?2:p==='review'?4:5}
function openPlanner(){plannerPerson.textContent=data[current].name+' / 今日の学習計画';generatedPlan=[];planPreview.innerHTML='<div class="empty-state">条件を選んで「計画を作る」を押してください。</div>';applyPlanBtn.disabled=true;setPlannerMode('manual');renderManualPlanList();populateManualPlanAssignmentSelect();show(plannerScreen)}
function setPlannerMode(mode){
 document.querySelector('#plannerManualSection').classList.toggle('hidden',mode!=='manual');
 document.querySelector('#plannerAiSection').classList.toggle('hidden',mode!=='ai');
 document.querySelector('#plannerModeManualBtn').classList.toggle('active',mode==='manual');
 document.querySelector('#plannerModeAiBtn').classList.toggle('active',mode==='ai');
}
document.querySelector('#plannerModeManualBtn')?.addEventListener('click',()=>{setPlannerMode('manual');renderManualPlanList();populateManualPlanAssignmentSelect()});
document.querySelector('#plannerModeAiBtn')?.addEventListener('click',()=>setPlannerMode('ai'));
openPlannerBtn.onclick=openPlanner;plannerBack.onclick=()=>show(mission);
generatePlanBtn.onclick=()=>{
 const total=Number(planMinutes.value),session=Number(sessionMinutes.value),rest=Number(breakMinutes.value);let clock=toMinutes(planStart.value);let remaining=total;
 const materials=getMaterials().filter(x=>!x.done).sort((a,b)=>priorityRank(a.priority)-priorityRank(b.priority));
 const result=[];let idx=0;
 while(remaining>0 && materials.length){
  const item=materials[idx%materials.length];const duration=Math.min(session,remaining);
  const target=(item.todayFrom&&item.todayTo)?`P${item.todayFrom}〜${item.todayTo}`:item.note||'今日の目標';
  result.push([asTime(clock),`${item.name}（${target}）`,`${duration}分`]);clock+=duration;remaining-=duration;idx++;
  if(remaining>0){clock+=rest}
  if(idx===Math.ceil(materials.length/2) && remaining>=30){clock+=45}
 }
 if(includeExercise.checked)result.push([asTime(clock),'筋トレ・運動','30分']);
 result.push([asTime(clock+(includeExercise.checked?40:0)),'丸付け・今日のStep Up','20分']);
 generatedPlan=result;
 planPreview.innerHTML=result.map((t,i)=>`<article><b>${String(i+1).padStart(2,'0')}</b><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span></article>`).join('');
 applyPlanBtn.disabled=false;
};
applyPlanBtn.onclick=()=>{if(!generatedPlan.length)return;const saved=JSON.parse(localStorage.getItem(key())||'{}');saved.customTasks=generatedPlan;saved.checks={};localStorage.setItem(key(),JSON.stringify(saved));render();show(mission)};
restorePlanBtn.onclick=()=>{if(!confirm('今日の計画を初期状態に戻しますか？'))return;const saved=JSON.parse(localStorage.getItem(key())||'{}');delete saved.customTasks;saved.checks={};localStorage.setItem(key(),JSON.stringify(saved));render();show(mission)};

// Sprint 6: AI learning manager and deadline-based assignments
const assignmentsScreen=document.querySelector('#assignments');
const openAssignmentBtn=document.querySelector('#openAssignmentBtn');
const assignmentBack=document.querySelector('#assignmentBack');
const addAssignmentBtn=document.querySelector('#addAssignmentBtn');
const assignmentForm=document.querySelector('#assignmentForm');

const defaultAssignments={
 iori:[
  {id:6101,name:'数学 新研究',deadline:'2026-08-31',current:42,total:180,category:'提出期限'},
  {id:6102,name:'社会 新研究',deadline:'2026-08-31',current:30,total:150,category:'提出期限'},
  {id:6103,name:'ことばのきまり',deadline:'2026-07-24',current:18,total:42,category:'学校の宿題'},
  {id:6104,name:'英語 新研究',deadline:'2026-08-31',current:26,total:160,category:'学校の宿題'},
  {id:6105,name:'ジョイフルワーク',deadline:'2026-08-31',current:8,total:60,category:'学校の宿題'}
 ],
 sakuya:[
  {id:6202,name:'サマースクール',deadline:'2026-08-31',current:18,total:40,category:'学校の宿題'},
  {id:6203,name:'国語ワーク',deadline:'2026-08-31',current:10,total:60,category:'学校の宿題'},
  {id:6204,name:'理科ワーク',deadline:'2026-08-31',current:15,total:70,category:'学校の宿題'},
  {id:6205,name:'数学ワーク',deadline:'2026-08-31',current:9,total:60,category:'苦手単元'}
 ]
};
function assignmentKey(){return 'stepup-assignments-'+current}
function getAssignments(){return getAssignmentsForChild(current)}
function saveAssignments(list){
 list.forEach(item=>{
  const done=Number(item.current)>=Number(item.total);
  ProgressEngine.updateItem(current,item.id,{
   current:item.current,total:item.total,deadline:item.deadline,
   status:done?'completed':(Number(item.current)>0?'in-progress':'not-started'),
   done
  });
 });
}
function daysLeft(date){return Math.max(1,Math.ceil((new Date(date+'T23:59:59')-TODAY)/86400000))}
function dailyTarget(a){return Math.max(0,Math.ceil((Number(a.total)-Number(a.current))/daysLeft(a.deadline)))}
// Sprint 23: 提出期限ページ本体。壱凰・朔埜とも同じ関数で描画し、
// ProgressEngine.getAll()だけをデータ源にする(別データを作らない)。
let pendingDeadlineChecks={}; // {assignmentId: true/false} 「変更を保存」を押すまでは確定しない
function renderAssignments(){
 assignmentPerson.textContent=(data[current]?.name||'')+' / 提出期限';
 pendingDeadlineChecks={};
 const list=ProgressEngine.getAll(current);
 const groups={};
 DEADLINE_GROUP_ORDER.forEach(cat=>groups[cat]=[]);
 list.forEach(item=>{
  const info=deadlineInfo(item.deadline,item.done);
  groups[info.category].push({item,info});
 });
 Object.keys(groups).forEach(cat=>{
  groups[cat].sort((a,b)=>{
   const da=parseDeadlineDateOnly(a.item.deadline),db=parseDeadlineDateOnly(b.item.deadline);
   if(da&&db)return da-db;
   if(da)return -1;
   if(db)return 1;
   return 0;
  });
 });
 const totalCount=list.length,doneCount=list.filter(a=>a.done).length;
 const urgentCount=groups.overdue.length+groups.today.length+groups.within3.length;
 assignmentSummary.innerHTML=`<div class="assignment-summary-line">登録 ${totalCount}件　｜　期限間近 ${urgentCount}件　｜　完了 ${doneCount}件</div>`;

 if(!list.length){
  assignmentList.innerHTML='<div class="empty-state">提出物はまだ登録されていません。<br>学校から課題が出たら、「提出物を追加」から登録しましょう。</div>';
 }else{
  assignmentList.innerHTML=DEADLINE_GROUP_ORDER.filter(cat=>groups[cat].length).map(cat=>{
   const rows=groups[cat].map(({item,info})=>renderDeadlineCard(item,info)).join('');
   return `<div class="deadline-group"><h3 class="deadline-group-title">${DEADLINE_CATEGORY_LABELS[cat]}</h3>${rows}</div>`;
  }).join('');
 }
 wireDeadlineCardEvents();
}
function formatDeadlineJapanese(deadline){
 const dl=parseDeadlineDateOnly(deadline);
 if(!dl)return'未設定';
 const w=['日','月','火','水','木','金','土'][dl.getDay()];
 return `${dl.getFullYear()}/${String(dl.getMonth()+1).padStart(2,'0')}/${String(dl.getDate()).padStart(2,'0')}（${w}）`;
}
function renderDeadlineCard(item,info){
 const type=resolveProgressType(item);
 const unit=item.unit||'ページ';
 const typeLabel=type==='numeric'?'ページ・回数型':type==='status'?'状態型':'完了チェック型';
 let progressBlock='';
 if(type==='numeric'&&item.total!=null){
  const cur=item.current||0,total=item.total,remain=Math.max(0,total-cur),pct=Math.min(100,Math.round(cur/total*100));
  progressBlock=`<div class="subm-progress-card">
   <small>進捗状況</small>
   <div class="subm-progress-bar"><i style="width:${pct}%"></i></div>
   <div class="subm-progress-pct">${pct}%</div>
   <div class="subm-progress-figures">
    <div><small>現在値</small><strong>${cur}${unit}</strong></div>
    <div><small>目標値</small><strong>${total}${unit}</strong></div>
    <div><small>残り</small><strong>${remain}${unit}</strong></div>
   </div>
  </div>`;
 }else if(type==='status'){
  progressBlock=`<div class="subm-progress-card"><small>状態</small><strong>${escapeHtml(item.progress||'未着手')}</strong></div>`;
 }
 const detailRows=[
  ['進捗形式',typeLabel],
  type==='numeric'?['単位',escapeHtml(unit)]:null,
  item.subject?['教科',escapeHtml(item.subject)]:null,
  ['メモ',item.note?escapeHtml(item.note):'なし']
 ].filter(Boolean).map(([k,v])=>`<div class="subm-detail-row"><span>${k}</span><span>${v}</span></div>`).join('');
 const inPlan=isAssignmentInTodayPlan(item.id);
 const addToPlanBtn=item.done?'':(inPlan
  ?`<p class="subm-plan-registered">この課題は今日の計画に登録済みです</p>`
  :`<button type="button" data-open-add-to-plan="${item.id}" class="subm-add-to-plan-btn">今日の計画へ追加</button>`);
 return `<article class="subm-card cat-${info.category}" data-assignment-id="${item.id}">
  <div class="subm-detail">
   <div class="subm-title-row"><h3 class="subm-title">${escapeHtml(item.title)}</h3>${item.subject?`<span class="subm-subject-badge">${escapeHtml(item.subject)}</span>`:''}</div>
   <div class="subm-deadline-row">
    <div class="subm-deadline-block"><small>提出期限</small><strong>${formatDeadlineJapanese(item.deadline)}</strong></div>
    <div class="subm-days-badge cat-${info.category}"><small>期限まで</small><strong>${info.label}</strong></div>
   </div>
   ${progressBlock}
   <div class="subm-detail-list">${detailRows}</div>
   <label class="subm-complete-check"><input type="checkbox" data-deadline-check="${item.id}" ${item.done?'checked':''}> 完了済みにする</label>
   <p class="subm-save-hint">チェック内容は「変更を保存」を押すまで反映されません</p>
   <button type="button" data-deadline-edit="${item.id}" class="subm-edit-toggle-btn">編集</button>
   ${addToPlanBtn}
   <div id="addToPlan-${item.id}" class="subm-add-to-plan-form hidden">
    <label>開始時刻<input type="time" class="atp-start" value="19:00"></label>
    <label>予定時間（分）<input type="number" class="atp-duration" min="5" step="5" value="30"></label>
    <label>取り組むページ範囲（任意）<input type="text" class="atp-pages" placeholder="例：12〜14ページ" value="${item.pageStart!=null&&item.pageEnd!=null?`${item.pageStart}〜${item.pageEnd}`:''}"></label>
    <label>メモ（任意）<input type="text" class="atp-memo" placeholder="任意"></label>
    <button type="button" class="atp-confirm-btn" data-atp-confirm="${item.id}" data-atp-title="${escapeHtml(item.title)}">この内容で今日の計画へ追加</button>
   </div>
  </div>
  <div id="deadlineEdit-${item.id}" class="subm-edit hidden">
   <h4>編集</h4>
   ${renderDeadlineEditForm(item)}
  </div>
 </article>`;
}
function renderDeadlineEditForm(item){
 const type=resolveProgressType(item);
 return `
  <label>提出物名<input type="text" class="de-name" value="${escapeHtml(item.title)}"></label>
  <label>教科<input type="text" class="de-subject" value="${escapeHtml(item.subject||'')}"></label>
  <label>提出期限<input type="date" class="de-deadline" value="${item.deadline&&/^\d{4}-\d{2}-\d{2}$/.test(item.deadline)?item.deadline:''}"></label>
  <label>進捗形式
   <select class="de-type">
    <option value="numeric" ${type==='numeric'?'selected':''}>ページ・回数型</option>
    <option value="status" ${type==='status'?'selected':''}>状態型</option>
    <option value="check" ${type==='check'?'selected':''}>完了チェック型</option>
   </select>
  </label>
  <label>現在値<input type="number" class="de-current" value="${item.current!=null?item.current:0}" min="0"></label>
  <label>目標値<input type="number" class="de-total" value="${item.total!=null?item.total:10}" min="1"></label>
  <label>単位<input type="text" class="de-unit" value="${escapeHtml(item.unit||'ページ')}"></label>
  <label>状態<input type="text" class="de-status" value="${escapeHtml(item.progress||'')}" placeholder="例：下書き中"></label>
  <label>メモ<input type="text" class="de-note" value="${escapeHtml(item.note||'')}"></label>
  <div class="subm-edit-actions"><button type="button" class="de-save" data-de-save="${item.id}">保存する</button><button type="button" class="de-cancel" data-de-cancel="${item.id}">キャンセル</button></div>
 `;
}
function wireDeadlineCardEvents(){
 document.querySelectorAll('[data-deadline-check]').forEach(cb=>{
  cb.onchange=()=>{pendingDeadlineChecks[cb.dataset.deadlineCheck]=cb.checked};
 });
 document.querySelectorAll('[data-deadline-edit]').forEach(btn=>{
  btn.onclick=()=>{
   const form=document.querySelector(`#deadlineEdit-${CSS.escape(btn.dataset.deadlineEdit)}`);
   form?.classList.toggle('hidden');
  };
 });
 // Sprint 66: 「今日の計画へ追加」ボタン(確認フォームの開閉)
 document.querySelectorAll('[data-open-add-to-plan]').forEach(btn=>{
  btn.onclick=()=>{
   const form=document.querySelector(`#addToPlan-${CSS.escape(btn.dataset.openAddToPlan)}`);
   form?.classList.toggle('hidden');
  };
 });
 // 確認フォームの「この内容で今日の計画へ追加」ボタン
 document.querySelectorAll('[data-atp-confirm]').forEach(btn=>{
  btn.onclick=()=>{
   const assignmentId=btn.dataset.atpConfirm;
   const title=btn.dataset.atpTitle;
   const form=btn.closest('.subm-add-to-plan-form');
   const startTime=form.querySelector('.atp-start').value||'19:00';
   const durationMinutes=Number(form.querySelector('.atp-duration').value)||30;
   const pagesText=form.querySelector('.atp-pages').value.trim();
   const memo=form.querySelector('.atp-memo').value.trim();
   // 「12〜14ページ」等の簡易テキストからpageStart/pageEndを推測せず、そのままproblemRange扱いにする
   // (ページ範囲は課題フォーム側の数値項目とは別に、ここでは自由記述として保持する)
   const added=addAssignmentToTodayPlan(assignmentId,title,startTime,durationMinutes,{problemRange:pagesText,memo});
   if(added){
    showDeadlineSaveStatus('今日の計画へ追加しました');
    renderAssignments();
    render();
   }else{
    showDeadlineSaveStatus('この課題は今日の計画に登録済みです');
   }
  };
 });
 document.querySelectorAll('[data-de-cancel]').forEach(btn=>{
  btn.onclick=()=>{document.querySelector(`#deadlineEdit-${CSS.escape(btn.dataset.deCancel)}`)?.classList.add('hidden')};
 });
 document.querySelectorAll('[data-de-save]').forEach(btn=>{
  btn.onclick=()=>{
   const id=btn.dataset.deSave;
   const card=btn.closest('.subm-edit');
   if(!card)return;
   const patch={
    title:card.querySelector('.de-name')?.value.trim()||'名称未設定',
    subject:card.querySelector('.de-subject')?.value.trim()||'',
    deadline:card.querySelector('.de-deadline')?.value||null,
    progressType:card.querySelector('.de-type')?.value||'check',
    current:Number(card.querySelector('.de-current')?.value)||0,
    total:Math.max(1,Number(card.querySelector('.de-total')?.value)||1),
    unit:card.querySelector('.de-unit')?.value.trim()||'ページ',
    progress:card.querySelector('.de-status')?.value.trim()||'',
    note:card.querySelector('.de-note')?.value.trim()||''
   };
   ProgressEngine.updateItem(current,id,patch);
   showDeadlineSaveStatus(`${patch.title}を更新しました`);
   renderAssignments();
   render();
  };
 });
}
function showDeadlineSaveStatus(message){
 const el=document.querySelector('#deadlineSaveStatus');
 if(!el)return;
 el.textContent=message;
 clearTimeout(window.deadlineSaveStatusTimer);
 window.deadlineSaveStatusTimer=setTimeout(()=>{if(el.textContent===message)el.textContent=''},3000);
}
document.querySelector('#saveDeadlineChangesBtn')?.addEventListener('click',()=>{
 const ids=Object.keys(pendingDeadlineChecks);
 if(!ids.length){showDeadlineSaveStatus('変更はありません');return}
 let lastTitle='',count=0;
 ids.forEach(id=>{
  const checked=pendingDeadlineChecks[id];
  const item=ProgressEngine.getAll(current).find(x=>x.id===id);
  if(!item||item.done===checked)return;
  ProgressEngine.updateItem(current,id,{done:checked,status:checked?'completed':'not-started'});
  lastTitle=item.title;count++;
 });
 pendingDeadlineChecks={};
 if(count===1)showDeadlineSaveStatus(`${lastTitle}を完了にしました`);
 else if(count>1)showDeadlineSaveStatus(`${count}件を更新しました`);
 else showDeadlineSaveStatus('変更はありません');
 renderAssignments();
 render();
});
function openAssignments(){assignmentForm.classList.add('hidden');materialForm.classList.add('hidden');renderAssignments();populateAssignmentMaterialList();renderMaterials();show(assignmentsScreen)}
// 既存教材(教材ページのdefaultMaterials+保存済み教材)から候補一覧を作る。一覧にない場合は自由入力可。
function populateAssignmentMaterialList(){
 const dl=document.querySelector('#assignmentMaterialList');
 if(!dl)return;
 const names=new Set((defaultMaterials[current]||[]).map(m=>m.name));
 getMaterials().forEach(m=>names.add(m.name));
 dl.innerHTML=[...names].map(n=>`<option value="${escapeHtml(n)}">`).join('');
}
openAssignmentBtn.onclick=openAssignments;assignmentBack.onclick=()=>show(mission);addAssignmentBtn.onclick=()=>{
 const isHidden=assignmentForm.classList.toggle('hidden');
 if(!isHidden){
  requestAnimationFrame(()=>{
   assignmentForm.scrollIntoView({behavior:'smooth',block:'start'});
   document.querySelector('#newAssignmentName')?.focus({preventScroll:true});
  });
 }
};
document.querySelector('#newAssignmentType')?.addEventListener('change',(e)=>{
 const numericFields=document.querySelector('#newAssignmentNumericFields');
 const statusField=document.querySelector('#newAssignmentStatusField');
 const isNumeric=e.target.value==='numeric',isStatus=e.target.value==='status';
 numericFields?.classList.toggle('hidden',!isNumeric);
 statusField?.classList.toggle('hidden',!isStatus);
});

// Sprint 13: 朔埜の夏休み課題（初期データ。移行処理でcustomItemsに反映済み）
const sakuyaSummerDefaults=[
 {id:7001,subject:'国語',name:'国語語句学習',scope:'P41〜55（○つけ直しまで）',deadline:'9月2日',progress:'',done:false},
 {id:7002,subject:'国語',name:'作文または説明文',scope:'',deadline:'別紙参照',progress:'',done:false},
 {id:7003,subject:'国語',name:'漢字スキル・漢字ノート',scope:'漢字スキル P20まで、漢字ノート10ページ',deadline:'9月最初の授業',progress:'',done:false},
 {id:7004,subject:'国語',name:'習字（自由参加）',scope:'',deadline:'',progress:'',done:false},
 {id:7005,subject:'数学',name:'数学の友',scope:'P32〜47、P146〜147',deadline:'8月25日',progress:'',done:false},
 {id:7006,subject:'理科',name:'自由研究',scope:'',deadline:'8月25日',progress:'',done:false},
 {id:7007,subject:'英語',name:'繰り返し語順トレーニング',scope:'P10〜14',deadline:'8月25日',progress:'',done:false},
 {id:7008,subject:'英語',name:'小学英単語',scope:'P5〜16',deadline:'8月25日',progress:'',done:false},
 {id:7009,subject:'家庭科',name:'ハンドノート',scope:'P4〜9、P30〜35',deadline:'7月30日',progress:'',done:false},
 {id:7010,subject:'家庭科',name:'今の私にできること',scope:'プリント片面1枚',deadline:'8月25日',progress:'',done:false},
 {id:7011,subject:'技術',name:'木工作品 アイデアスケッチ',scope:'',deadline:'2学期最初の授業',progress:'',done:false},
 {id:7012,subject:'音楽',name:'雅楽について調べる',scope:'A4レポート1枚',deadline:'9月1日',progress:'',done:false},
 {id:7013,subject:'音楽',name:'アルトリコーダー「喜びの歌」の練習',scope:'',deadline:'',progress:'',done:false},
 {id:7014,subject:'音楽',name:'合唱コンクール曲を5回聴く',scope:'自分のクラスの曲',deadline:'',progress:'',done:false},
 {id:7015,subject:'総合',name:'Keynote下書き',scope:'',deadline:'7月30日',progress:'',done:false},
 {id:7016,subject:'総合',name:'防災レポート',scope:'',deadline:'8月25日',progress:'',done:false}
];

// Sprint 7: always-visible navigation shortcuts (Sprint 20でホームのquick-actionsは削除。要素が無ければ何もしない)
document.querySelector('#quickPlanner')?.addEventListener('click',openPlanner);
document.querySelector('#quickAssignments')?.addEventListener('click',openAssignments);
document.querySelector('#quickMaterials')?.addEventListener('click',openMaterials);
document.querySelector('#quickGrowth')?.addEventListener('click',openGrowth);
document.querySelector('#quickCalendar')?.addEventListener('click',openCalendar);
saveAssignmentBtn.onclick=()=>{
 const name=document.querySelector('#newAssignmentName')?.value.trim();
 const subject=document.querySelector('#newAssignmentSubject')?.value.trim()||'';
 const deadlineRaw=document.querySelector('#newAssignmentDeadline')?.value||'';
 // 必須項目チェック：教科・課題名・提出期限
 if(!name||!subject||!deadlineRaw){
  showDeadlineSaveStatus('教科・課題名・提出期限は必須です');
  return;
 }
 const type=document.querySelector('#newAssignmentType')?.value||'check';
 const note=document.querySelector('#newAssignmentNote')?.value.trim()||'';
 // Sprint 66: 詳細項目(既存データにも安全に追加できるよう、無指定ならnull/空文字にする)
 const material=document.querySelector('#newAssignmentMaterial')?.value.trim()||'';
 const pageStartRaw=document.querySelector('#newAssignmentPageStart')?.value;
 const pageEndRaw=document.querySelector('#newAssignmentPageEnd')?.value;
 const problemRange=document.querySelector('#newAssignmentProblemRange')?.value.trim()||'';
 const priority=document.querySelector('#newAssignmentPriority')?.value||'normal';
 const now=new Date().toISOString();
 const customs=getCustomAssignments(current);
 const newId=`${current}-custom-manual-${Date.now()}`;
 const entry={
  id:newId,subject,title:name,scope:'',deadline:deadlineRaw||'',category:'',
  status:'not-started',done:false,progress:'',remaining:'',note,progressType:type,
  source:'manual',
  material,
  pageStart:pageStartRaw!==''&&pageStartRaw!=null?Number(pageStartRaw):null,
  pageEnd:pageEndRaw!==''&&pageEndRaw!=null?Number(pageEndRaw):null,
  problemRange,priority,updatedAt:now,createdAt:now
 };
 if(type==='numeric'){
  entry.current=Number(document.querySelector('#newAssignmentCurrent')?.value)||0;
  entry.total=Math.max(1,Number(document.querySelector('#newAssignmentTotal')?.value)||1);
  entry.unit=document.querySelector('#newAssignmentUnit')?.value.trim()||'ページ';
 }else if(type==='status'){
  entry.progress=document.querySelector('#newAssignmentStatus')?.value||'未着手';
 }
 customs.push(entry);
 saveCustomAssignments(current,customs);
 // 「今日の計画にも追加する」がチェックされていれば、customTasksへも反映する
 const addToPlan=document.querySelector('#newAssignmentAddToPlan')?.checked;
 if(addToPlan){
  const planStart=document.querySelector('#newAssignmentPlanStart')?.value||'19:00';
  const planDuration=Number(document.querySelector('#newAssignmentPlanDuration')?.value)||30;
  addAssignmentToTodayPlan(newId,name,planStart,planDuration,{pageStart:entry.pageStart,pageEnd:entry.pageEnd,problemRange});
 }
 document.querySelector('#newAssignmentName').value='';
 document.querySelector('#newAssignmentSubject').value='';
 document.querySelector('#newAssignmentDeadline').value='';
 document.querySelector('#newAssignmentNote').value='';
 document.querySelector('#newAssignmentMaterial').value='';
 document.querySelector('#newAssignmentPageStart').value='';
 document.querySelector('#newAssignmentPageEnd').value='';
 document.querySelector('#newAssignmentProblemRange').value='';
 document.querySelector('#newAssignmentAddToPlan').checked=false;
 document.querySelector('#newAssignmentPlanFields').classList.add('hidden');
 assignmentForm.classList.add('hidden');
 showDeadlineSaveStatus(addToPlan?'提出物を追加し、今日の計画にも入れました':'提出物を追加しました');
 renderAssignments();
 render();
};
document.querySelector('#newAssignmentAddToPlan')?.addEventListener('change',(e)=>{
 document.querySelector('#newAssignmentPlanFields').classList.toggle('hidden',!e.target.checked);
});

function autoStepMessage(){
 const saved=JSON.parse(localStorage.getItem(key())||'{}'),tasks=activeTasks(),checks=saved.checks||{},done=Object.values(checks).filter(Boolean).length;
 if(!done)return '最初の一つに取り組む準備ができた。';
 if(done===tasks.length)return '予定したミッションを最後までやり切った。';
 const completed=tasks.find((t,i)=>checks[i]);
 return completed?`${completed[1]}に取り組み、今日の一歩を進めた。`:`${done}個のミッションを完了した。`;
}

// Replace the Sprint 5 generator with deadline-aware planning.
generatePlanBtn.onclick=()=>{
 const total=Number(planMinutes.value),session=Number(sessionMinutes.value),rest=Number(breakMinutes.value);let clock=toMinutes(planStart.value),remaining=total,result=[];
 const busy=mergedBusyPeriods(dateKey(TODAY),current);
 if(includeMorning.checked){clock=avoidBusyPeriods(clock,30,busy);result.push([asTime(clock),'朝活：英単語・丸付け','30分']);clock+=40}
 const assignments=getAssignments().filter(a=>a.current<a.total).sort((a,b)=>daysLeft(a.deadline)-daysLeft(b.deadline));
 const materials=getMaterials().filter(x=>!x.done);
 const queue=assignments.map(a=>({name:a.name,target:`今日の目安 ${dailyTarget(a)}／期限まで${daysLeft(a.deadline)}日`}));
 materials.forEach(m=>{if(!queue.some(q=>q.name===m.name))queue.push({name:m.name,target:m.note||'復習'})});
 // どこスタの復習候補(間違い直し・新研究関連ページ確認)を、教材の後・苦手/発展の前という
 // 優先位置に確実に含まれるよう、キューの末尾ではなく既存項目の直後(苦手学習より前)に挿入する
 const dokosutaQueueItems=createTomorrowPlan(current).filter(it=>it.category==='dokosuta-review'||it.category==='dokosuta-research-link').map(it=>({name:it.title,target:it.remaining,minutesHint:it.minutes}));
 queue.splice(Math.min(queue.length,4),0,...dokosutaQueueItems);
 // 家庭教師 数学Day：最小番号の未完了1件だけを候補に含める(10件まとめては出さない)
 const tutorMathQueueItems=createTomorrowPlan(current).filter(it=>it.assignmentId&&String(it.assignmentId).startsWith('iori-custom-tutor-math-day-')).map(it=>({name:it.title,target:it.remaining}));
 if(tutorMathQueueItems.length&&!queue.some(q=>q.name===tutorMathQueueItems[0].name))queue.splice(Math.min(queue.length,2),0,...tutorMathQueueItems);
 let idx=0;
 while(remaining>0&&queue.length){const item=queue[idx%queue.length],duration=Math.min(item.minutesHint||session,remaining);clock=avoidBusyPeriods(clock,duration,busy);result.push([asTime(clock),`${item.name}（${item.target}）`,`${duration}分`]);clock+=duration;remaining-=duration;idx++;if(remaining>0)clock+=rest;if(idx===Math.ceil(queue.length/2)&&remaining>=30)clock+=45}
 if(hasTutor.checked){clock=avoidBusyPeriods(clock,60,busy);result.push([asTime(clock),'家庭教師の授業','60分']);clock+=70}
 if(includeExercise.checked){clock=avoidBusyPeriods(clock,30,busy);result.push([asTime(clock),'筋トレ・運動','30分']);clock+=40}
 clock=avoidBusyPeriods(clock,20,busy);
 result.push([asTime(clock),'丸付け・今日のStep Up','20分']);generatedPlan=result;
 planPreview.innerHTML=result.map((t,i)=>`<article><b>${String(i+1).padStart(2,'0')}</b><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span></article>`).join('');applyPlanBtn.disabled=false;
};

const oldRenderFamily=renderFamily;
renderFamily=function(){oldRenderFamily();const a=childSummary('iori'),b=childSummary('sakuya');const am=getMaterialsFor('iori'),bm=getMaterialsFor('sakuya');const ca=getCoachMessage('iori'),cb=getCoachMessage('sakuya');familyInsights.innerHTML=`<article><small>壱凰・今週の積み重ね</small><b>${a.done?3:1}日</b><p>本人の昨日までの積み重ねを表示しています。</p></article><article><small>朔埜・今週の積み重ね</small><b>${b.done?3:1}日</b><p>本人の昨日までの積み重ねを表示しています。</p></article><article><small>今日完了した教材・ミッション</small><b>${am.filter(x=>x.done).length+a.done}件 / ${bm.filter(x=>x.done).length+b.done}件</b><p>壱凰 / 朔埜。それぞれの進み具合です。</p></article><section class="family-ai-report"><small>PARENT AI REPORT</small><h3>保護者へのAIレポート</h3><div class="parent-coach-grid"><article><b>壱凰</b><p>${ca.good}<br>声かけ：『次は${ca.next.replace('を、まず20分だけ進めよう。終わったら休憩して、できた所にチェックを付けよう。','から始めよう')}』</p></article><article><b>朔埜</b><p>${cb.good}<br>声かけ：『次は${cb.next.replace('を、まず20分だけ進めよう。終わったら休憩して、できた所にチェックを付けよう。','から始めよう')}』</p></article></div></section>`};
function getMaterialsFor(id){
 const saved=JSON.parse(localStorage.getItem('stepup-materials-'+id)||'null');
 if(saved)return saved;
 const list=defaultMaterials[id].map((x,i)=>({...x,id:`${id}-material-${i}`,done:false}));
 localStorage.setItem('stepup-materials-'+id,JSON.stringify(list));
 return list;
}


// Sprint 8: microphone report and local AI coach
const quickVoice=document.querySelector('#quickVoice');
const voiceCoach=document.querySelector('#voiceCoach');
const voiceStart=document.querySelector('#voiceStart');
const voiceStatus=document.querySelector('#voiceStatus');
const voiceTranscript=document.querySelector('#voiceTranscript');
const voiceAnalyze=document.querySelector('#voiceAnalyze');
const voiceClear=document.querySelector('#voiceClear');
const voiceResult=document.querySelector('#voiceResult');
const micTestBtn=document.querySelector('#micTestBtn');
const micDiagnosticResult=document.querySelector('#micDiagnosticResult');
const voiceEnvironment=document.querySelector('#voiceEnvironment');
let voiceRecognition=null;
let voiceListening=false;
let voiceSaveStatusTimer=null;


function updateVoiceEnvironment(){
 const localHost=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const secure=window.isSecureContext||localHost;
 const isPhone=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
 if(!voiceEnvironment)return;
 voiceEnvironment.className='voice-environment '+(secure?'ready':'notice');
 if(secure){
  voiceEnvironment.innerHTML=`<b>マイク確認の準備OK</b><span>${isPhone?'スマホ':'この端末'}のChromeで、下のボタンを押してください。</span>`;
 }else{
  voiceEnvironment.innerHTML='<b>スマホ表示は成功しています</b><span>現在は家庭内HTTP接続です。Chromeの安全制限により、機種によってマイクが利用できない場合があります。まず「マイク診断」を実行してください。</span>';
 }
}

function voiceReportKey(){return 'stepup-voice-report-'+current}
function updateVoicePersonalization(){
 const recommended=current==='sakuya';
 const badge=voiceCoach.querySelector('.voice-badge');
 if(badge)badge.textContent=recommended?'朔埜おすすめ':'音声でも記録OK';
 const guide=document.querySelector('#voiceGuide');
 if(guide)guide.textContent=recommended
  ?'「今日は何をしたか」「難しかったこと」「明日やりたいこと」を自由に話してね。'
  :'今日できたことや難しかったことを、短く話してください。';
 const saved=JSON.parse(localStorage.getItem(voiceReportKey())||'null');
 voiceTranscript.value=saved?.transcript||'';
 if(saved?.response){showVoiceResult(saved.response,saved.stepUp,saved.nextAction)}else{voiceResult.classList.add('hidden');voiceResult.innerHTML=''}
}
function renderReport(){
 if(!reportScreen)return;
 const saved=JSON.parse(localStorage.getItem(key())||'{}'),tasks=activeTasks(),checks=saved.checks||{};
 const person=document.querySelector('#reportPerson'),list=document.querySelector('#reportChecklist'),input=document.querySelector('#reportTranscript'),result=document.querySelector('#reportResult'),tomorrow=document.querySelector('#reportTomorrow');
 if(person)person.textContent=data[current].name+' / 今日の学習報告';
 if(list)list.innerHTML=tasks.map((task,index)=>`<label class="report-check ${checks[index]?'done':''}"><input type="checkbox" data-report-index="${index}" ${checks[index]?'checked':''}><span><strong>${escapeHtml(task[1])}</strong><small>${escapeHtml(task[0])}・${escapeHtml(task[2])}</small></span><b>${checks[index]?'完了':'未完了'}</b></label>`).join('');
 list?.querySelectorAll('[data-report-index]').forEach(box=>box.onchange=()=>{
  const latest=JSON.parse(localStorage.getItem(key())||'{}');latest.checks=latest.checks||{};latest.checks[box.dataset.reportIndex]=box.checked;localStorage.setItem(key(),JSON.stringify(latest));renderReport();render();
 });
 const report=JSON.parse(localStorage.getItem(voiceReportKey())||'null');
 if(input)input.value=report?.transcript||'';
 if(result){if(report?.response){const summary=report.summary||{};const progressRows=(summary.materialChanges||[]).map(change=>`<p>✓ ${escapeHtml(change.name)} P${change.before} → P${change.after}</p>`).join('');result.innerHTML=`<small>STEP UP AI</small><h3>${escapeHtml(report.response)}</h3><div><b>保存しました！</b><p>更新内容</p><p>✓ チェック項目${summary.checkedCount?` (${summary.checkedCount}件)`:''}</p><p>✓ 自由記述</p><p>✓ 教材進捗</p>${progressRows}<p>✓ 課題・提出期限</p><p>✓ 今日のStep Up</p><p>✓ 明日の学習計画</p></div><div><b>今日のStep Up</b><p>${escapeHtml(report.stepUp||'')}</p></div><div><b>明日の一歩</b><p>${escapeHtml(report.nextAction||'')}</p></div>`;result.classList.remove('hidden')}else{result.classList.add('hidden');result.innerHTML=''}}
 const plan=JSON.parse(localStorage.getItem(nextPlanKey(current))||'null');
 if(tomorrow)tomorrow.innerHTML=plan?.items?.length?`<strong>${plan.items.length}件の候補を準備しました。</strong><span>${plan.items.slice(0,3).map(item=>escapeHtml(item.title)).join(' / ')}${plan.items.length>3?' ほか':''}</span>`:'未完了の課題はありません。休息を優先する計画を準備します。';
}
function showVoiceResult(response,stepUp,nextAction){
 voiceResult.innerHTML=`<small>STEP UP AI</small><h3>${response}</h3><div><b>今日のStep Up</b><p>${stepUp}</p></div><div><b>明日の一歩</b><p>${nextAction}</p></div>`;
 voiceResult.classList.remove('hidden');
}
function analyzeVoiceReport(text){
 const t=text.trim();
 const positive=/(終わ|でき|進め|頑張|やった|集中|挑戦|質問|分か)/.test(t);
 const difficult=/(難し|分から|できな|疲れ|無理|つかれ)/.test(t);
 const math=/(数学|算数)/.test(t), english=/(英語|単語)/.test(t), reading=/(読書|感想文|国語)/.test(t);
 let subject=math?'数学':english?'英語':reading?'国語':'今日の学習';
 let response=positive?`${subject}に取り組んだことを、きちんと報告できたね。`:`今日の様子を言葉にできたことが、まず大切な一歩です。`;
 if(difficult)response+=` 難しかったことにも気づけています。今日は責めずに、次の一歩を小さくしよう。`;
 let stepUp=positive?`${subject}を途中で投げ出さず、自分の言葉で振り返れた。`:`自分の状態をAIコーチに伝えられた。`;
 let nextAction=difficult?`${subject}を明日は10分だけ復習し、分からない所を一つ質問する。`:`明日は最初のミッションを一つ終えてから、次へ進む。`;
 return {response,stepUp,nextAction};
}
function applyAssignmentReport(id,currentText){
 // Sprint 18/21: 課題進捗は「当日の計画」のチェック(reflectTaskCheckToAssignment)でのみ更新する。
 // ここでは課題データを一切変更せず、AIコーチ用のコメント生成に使う情報だけを組み立てて返す。
 // completedItemsは、今回チェックされているassignmentId(collectTodayCheckedAssignmentIds)を基準にし、
 // canonical・customItemsの区別なくProgressEngine.getAll()から正式な表示名(title)を取得する。
 // これにより、チェックしていない別の課題が誤って混ざることを防ぐ。
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const tasks=activeTasks(),checks=saved.checks||{};
 const allItems=ProgressEngine.getAll(id);
 const checkedIds=collectTodayCheckedAssignmentIds();
 const completedItems=[...checkedIds].map(cid=>allItems.find(it=>it.id===cid)).filter(Boolean);
 return {items:allItems,completedItems,checks:{...checks},tasks,matchedByCheck:completedItems.length,matchedByText:0,unmatchedFreeText:false};
}
function applyMaterialReport(id,report,text){
 const materials=getMaterialsFor(id),normalized=normalizeAssignmentText(text);
 report.tasks.forEach((task,index)=>{
  if(!report.checks[index])return;
  const title=normalizeAssignmentText(task[1]);
  const material=materials.find(item=>title.includes(normalizeAssignmentText(item.name))||normalizeAssignmentText(item.name).includes(title));
  if(material){
   const total=Number(material.total||100),target=Number(material.todayTo||0);
  material.current=total;
   material.done=material.current>=total;
  syncLearningProgress(id,material.name,material.current,total);
  }
 });
 materials.forEach(material=>{
  const title=normalizeAssignmentText(material.name);
  const reportedPage=extractReportedPage(text,material.name);
  if(title&&normalized.includes(title)&&/(完了|終わ|進め|やった|できた|ページ|p\d+)/i.test(text)){
  const total=Number(material.total||100);
  material.current=reportedPage===null?total:Math.min(total,Math.max(Number(material.current||0),reportedPage));
   material.done=material.current>=Number(material.total||100);
  syncLearningProgress(id,material.name,material.current,total);
  }
 });
 saveMaterials(materials);
 return materials;
}
function saveAssignmentReport(id,text,report){
 const reportKey=`stepup-assignment-report-${id}`;
 localStorage.setItem(reportKey,JSON.stringify({
  childName:assignmentData[id]?.childName,
  transcript:text,
    additionalProgress:text,
  completedTaskIndices:Object.keys(report.checks).filter(index=>report.checks[index]),
  completedAssignments:report.completedItems.map(item=>item.id),
  savedAt:new Date().toISOString()
 }));
}
function saveVoiceReport(){
 clearTimeout(window.voiceSaveStatusTimer);
 voiceStatus.textContent='';
 const text=voiceTranscript.value.trim();
 const reportState=JSON.parse(localStorage.getItem(key())||'{}'),reportChecks=reportState.checks||{};
 const checkedCount=Object.values(reportChecks).filter(Boolean).length;
 if(!text&&!checkedCount){voiceStatus.textContent='完了した項目にチェックするか、今日の記録を入力してください。';voiceTranscript.focus();return}
 try{
 const beforeMaterials=getMaterials().map(item=>({name:item.name,current:Number(item.current||0)}));
 const beforeAssignments=getAssignments().map(item=>({name:item.name,current:Number(item.current||0)}));
 const commitMessages=commitTodayCheckedAssignments();
 const result=analyzeVoiceReport(text);
 const assignmentReport=applyAssignmentReport(current,text);
 const materialReport=applyMaterialReport(current,assignmentReport,text);
 const stepUp=assignmentStepText(current,text);
 const tomorrowPlan=saveTomorrowPlan(current);
 const materialChanges=materialReport.map(item=>{const before=beforeMaterials.find(entry=>normalizeAssignmentText(entry.name)===normalizeAssignmentText(item.name));const after=Number(item.current||0);return before&&before.current!==after?{name:item.subject?`${item.subject} ${item.name}`:item.name,before:before.current,after}:null}).filter(Boolean);
 const assignmentChanges=getAssignments().filter(item=>{const before=beforeAssignments.find(entry=>normalizeAssignmentText(entry.name)===normalizeAssignmentText(item.name));return before&&before.current!==Number(item.current||0)});
 const summary={checkedCount,materialChanges,assignmentChanged:assignmentChanges.length>0};
 saveAssignmentReport(current,text,assignmentReport);
 localStorage.setItem(voiceReportKey(),JSON.stringify({transcript:text,additionalProgress:text,...result,stepUp,completedAssignments:assignmentReport.completedItems.map(item=>item.id),updatedMaterials:materialReport.filter(item=>item.done).map(item=>item.name),tomorrowPlan:tomorrowPlan.map(item=>item.assignmentId),summary,savedAt:new Date().toISOString()}));
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.step=stepUp;
 localStorage.setItem(key(),JSON.stringify(saved));
 {
  const stepSaved=JSON.parse(localStorage.getItem(key())||'{}');
  stepSaved.step=stepUp;
  localStorage.setItem(key(),JSON.stringify(stepSaved));
 }
 stepMessage.textContent=stepUp;
 showVoiceResult(result.response,stepUp,result.nextAction);
renderReport();
render();
if(document.querySelector('#family')?.classList.contains('active'))renderFamily();

const refreshedVoiceStatus=document.querySelector('#voiceStatus');
if(refreshedVoiceStatus){
refreshedVoiceStatus.textContent='保存完了しました';
voiceSaveStatusTimer=setTimeout(()=>{
const currentVoiceStatus=document.querySelector('#voiceStatus');
if(currentVoiceStatus?.textContent==='保存完了しました'){
currentVoiceStatus.textContent='';
}
},2500);
}

const refreshedReportStatus=document.querySelector('#reportStatus');
if(refreshedReportStatus){
refreshedReportStatus.textContent=`報告を保存しました。${commitMessages.join(' ')}`;
}
 }catch(error){
  voiceStatus.textContent='保存に失敗しました';
  console.error('音声報告の保存に失敗しました',error);
 }
}
function setVoiceStatus(message,state=''){
 voiceStatus.textContent=message;
 voiceStart.dataset.state=state;
}
function voiceLog(label,detail,ok=true){
 const time=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const row=document.createElement('article');row.className=ok?'ok':'ng';
 row.innerHTML=`<b>${ok?'OK':'確認'}</b><span><strong>${label}</strong><small>${time}　${detail}</small></span>`;
 micDiagnosticResult.prepend(row);
}
function speechErrorMessage(code){
 const messages={
  'not-allowed':'マイクが許可されていません。Chromeのアドレスバー左側から「マイク：許可」にしてください。',
  'service-not-allowed':'音声認識サービスが利用できません。Chromeでインターネット接続を確認してください。',
  'no-speech':'声を確認できませんでした。マイクに近づき、少し大きめの声で話してください。',
  'audio-capture':'マイクを取得できません。スマホまたはPCのマイク設定を確認してください。',
  'network':'文字起こしサービスとの通信に失敗しました。インターネット接続を確認してください。',
  'aborted':'音声入力を停止しました。'
 };
 return messages[code]||`音声認識エラー：${code||'不明'}`;
}
function setupSpeechRecognition(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){voiceStart.classList.add('unsupported');setVoiceStatus('このブラウザは音声入力非対応・手入力できます','error');return}
 voiceRecognition=new SpeechRecognition();
 voiceRecognition.lang='ja-JP';voiceRecognition.interimResults=true;voiceRecognition.continuous=false;voiceRecognition.maxAlternatives=1;
 voiceRecognition.onstart=()=>{voiceListening=true;voiceStart.classList.add('listening');setVoiceStatus('聞いています…「テストです」と話してください','listening');voiceLog('音声認識開始','SpeechRecognition.start() が正常に開始しました。')};
 voiceRecognition.onaudiostart=()=>{setVoiceStatus('マイクが声を待っています…','audio');voiceLog('マイク取得','ブラウザが音声入力を開始しました。')};
 voiceRecognition.onsoundstart=()=>{setVoiceStatus('声を検出しました。文字に変換中…','sound');voiceLog('音声検出','声または周囲の音を検出しました。')};
 voiceRecognition.onspeechstart=()=>{setVoiceStatus('話し声を検出しました。続けてください','speech');voiceLog('話し声検出','日本語の音声として処理しています。')};
 voiceRecognition.onresult=e=>{
  let finalText='',interim='';
  for(let i=e.resultIndex;i<e.results.length;i++){
   const part=e.results[i][0].transcript;
   if(e.results[i].isFinal)finalText+=part;else interim+=part;
  }
  voiceTranscript.value=(voiceTranscript.dataset.base||'')+finalText+interim;
  setVoiceStatus(finalText?'文字起こしできました。内容を確認してください':'文字に変換中…','result');
  if(finalText)voiceLog('文字起こし成功',`「${finalText.slice(0,30)}${finalText.length>30?'…':''}」`);
 };
 voiceRecognition.onspeechend=()=>{setVoiceStatus('話し終わりを検出しました。結果を待っています…','processing')};
 voiceRecognition.onend=()=>{
  voiceListening=false;voiceStart.classList.remove('listening');voiceTranscript.dataset.base=voiceTranscript.value;
  if(voiceTranscript.value.trim())setVoiceStatus('聞き取り完了・内容を確認してください','done');
  else if(voiceStart.dataset.state!=='error')setVoiceStatus('文字になりませんでした。下の診断履歴を確認してください','empty');
 };
 voiceRecognition.onerror=e=>{
  voiceListening=false;voiceStart.classList.remove('listening');
  const msg=speechErrorMessage(e.error);setVoiceStatus(msg,'error');voiceLog('音声認識エラー',`${e.error||'unknown'}：${msg}`,false);
 };
}

// Sprint 10: real microphone level + speech-result diagnostics
function diagnosticRow(ok,label,detail){
 return `<article class="${ok?'ok':'ng'}"><b>${ok?'OK':'確認'}</b><span><strong>${label}</strong><small>${detail}</small></span></article>`;
}
async function measureMicrophone(stream){
 const AudioContext=window.AudioContext||window.webkitAudioContext;
 if(!AudioContext)return {ok:true,detail:'マイク接続は確認済み（音量測定は未対応）'};
 const ctx=new AudioContext(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();
 analyser.fftSize=512;source.connect(analyser);const data=new Uint8Array(analyser.fftSize);
 let peak=0;const started=performance.now();
 while(performance.now()-started<1800){
  analyser.getByteTimeDomainData(data);let sum=0;
  for(const v of data){const n=(v-128)/128;sum+=n*n}
  peak=Math.max(peak,Math.sqrt(sum/data.length));
  await new Promise(r=>setTimeout(r,80));
 }
 await ctx.close();
 return peak>0.012?{ok:true,detail:`声・周囲音を検出しました（入力レベル ${Math.round(peak*100)}）`}:{ok:false,detail:'音量がほぼ0です。端末のマイク許可と入力デバイスを確認してください。'};
}
async function runMicrophoneDiagnostic(){
 micTestBtn.disabled=true;micTestBtn.textContent='声を出して診断中…';
 micDiagnosticResult.innerHTML='<p>約2秒、マイクに向かって「テストです」と話してください。</p>';
 const protocol=location.protocol,localHost=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const secure=window.isSecureContext||localHost,recognition=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
 const media=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
 let permission='未確認',permissionOK=false,level={ok:false,detail:'未測定'},stream=null;
 try{
  if(!media)throw new Error('media-unsupported');
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  permission='マイクへの接続に成功しました';permissionOK=true;level=await measureMicrophone(stream);
 }catch(error){
  if(error.name==='NotAllowedError'||error.name==='PermissionDeniedError')permission='ブラウザまたはWindowsでマイクが拒否されています';
  else if(error.name==='NotFoundError'||error.name==='DevicesNotFoundError')permission='使用できるマイクが見つかりません';
  else if(error.name==='NotReadableError'||error.name==='TrackStartError')permission='別のアプリがマイクを使用中の可能性があります';
  else if(error.message==='media-unsupported')permission=secure?'このブラウザではマイク接続機能を利用できません':'家庭内HTTP接続ではChromeがマイク機能を停止する場合があります';
  else permission=`マイク接続に失敗しました（${error.name||'unknown'}）`;
 }finally{if(stream)stream.getTracks().forEach(track=>track.stop())}
 const protocolDetail=protocol==='file:'?'index.htmlを直接開いています。start.batから開いてください。':secure?`${location.origin} で安全に開いています。`:'音声にはHTTPSまたはlocalhostが必要です。';
 micDiagnosticResult.innerHTML=[
  diagnosticRow(secure,'接続方法',protocolDetail),
  diagnosticRow(media,'マイク機能',media?'ブラウザがマイク接続に対応しています。':'Chromeで開いてください。'),
  diagnosticRow(permissionOK,'マイク許可',permission),
  diagnosticRow(level.ok,'実際の音声入力',level.detail),
  diagnosticRow(recognition,'日本語文字起こし機能',recognition?'Chromeの音声認識機能を確認しました。':'音声認識機能が見つかりません。')
 ].join('')+(permissionOK&&level.ok&&recognition?'<p class="diagnostic-success">マイク入力は正常です。次に「タップして話す」を押し、「テストです」と話してください。</p>':'<p class="diagnostic-help">「接続方法」が確認になる場合は家庭内HTTPの制限です。「マイク許可」が確認になる場合はChromeのサイト設定を確認してください。手入力での報告はそのまま利用できます。</p>');
 micTestBtn.disabled=false;micTestBtn.textContent='もう一度診断';
}
micTestBtn.onclick=runMicrophoneDiagnostic;

function openReport(){renderReport();show(reportScreen)}
if(quickVoice)quickVoice.onclick=openReport;
document.querySelector('#reportBack').onclick=()=>show(mission);
document.querySelector('#reportOpenVoice').onclick=()=>{show(mission);voiceCoach.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>voiceStart.focus(),350)};
document.querySelector('#reportSubmit').onclick=()=>{voiceTranscript.value=document.querySelector('#reportTranscript').value.trim();saveVoiceReport()};
voiceStart.onclick=async()=>{
 if(!voiceRecognition){setVoiceStatus('音声入力に対応していないため、下の欄へ手入力してください','error');voiceTranscript.focus();return}
 if(voiceListening){voiceRecognition.stop();return}
 const localHost=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const secure=window.isSecureContext||localHost;
 try{
  // 安全な接続ではマイク取得を先に確認。不安全な家庭内HTTPでは、
  // SpeechRecognitionを直接試し、端末側の実際の挙動を診断する。
  if(secure&&navigator.mediaDevices?.getUserMedia){
   const preflight=await navigator.mediaDevices.getUserMedia({audio:true});preflight.getTracks().forEach(t=>t.stop());
  }
  voiceTranscript.dataset.base=voiceTranscript.value.trim()?voiceTranscript.value.trim()+' ':'';
  setVoiceStatus(secure?'音声認識を開始しています…':'家庭内HTTPで音声認識を試しています…','starting');
  voiceRecognition.start();
 }catch(e){
  const msg=e.name==='NotAllowedError'?'マイクが許可されていません。Chromeのサイト設定から許可してください。':e.name==='SecurityError'?'この接続ではChromeがマイクを許可しません。スマホ表示と手入力は利用できます。':`マイクを開始できません（${e.name||'unknown'}）`;
  setVoiceStatus(msg,'error');voiceLog('開始前チェック',msg,false);
 }
};
voiceAnalyze.onclick=saveVoiceReport;
voiceClear.onclick=()=>{voiceTranscript.value='';voiceTranscript.dataset.base='';voiceResult.classList.add('hidden');voiceResult.innerHTML='';setVoiceStatus('マイク待機中');micDiagnosticResult.innerHTML='<p>まだ診断していません。</p>';localStorage.removeItem(voiceReportKey())};
setupSpeechRecognition();
updateVoiceEnvironment();

// Refresh voice content whenever a player page is rendered.
const sprint8Render=render;
render=function(){sprint8Render();updateVoicePersonalization();if(reportScreen?.classList.contains('active'))renderReport()};
// Sprint 11: 講師コメント → 学習計画・課題・AIコメントへの反映
(function(){
 const teacherSection=document.querySelector('#teacherCommentSection');
 if(!teacherSection)return; // UIが無い場合は他画面に影響を与えず終了
 const teacherInput=document.querySelector('#teacherCommentInput');
 const teacherCreateBtn=document.querySelector('#teacherCommentCreateDraft');
 const teacherClearBtn=document.querySelector('#teacherCommentClear');
 const teacherDraftBox=document.querySelector('#teacherCommentDraft');
 const teacherPlanDraft=document.querySelector('#teacherPlanDraft');
 const teacherAssignmentDraft=document.querySelector('#teacherAssignmentDraft');
 const teacherAiCommentDraft=document.querySelector('#teacherAiCommentDraft');
 const teacherApplyBtn=document.querySelector('#teacherCommentApply');
 const teacherStatus=document.querySelector('#teacherCommentStatus');

 function teacherApi(){return window.StepUpTeacherComments}

 function renderTeacherCommentSection(){
  if(!teacherApi()){teacherSection.classList.add('hidden');return}
  teacherSection.classList.remove('hidden');
  const childId=current;
  if(teacherInput)teacherInput.value=teacherApi().getComment(childId)||'';
  const draft=teacherApi().getDraft(childId);
  if(draft){
   teacherDraftBox?.classList.remove('hidden');
   if(teacherPlanDraft)teacherPlanDraft.value=draft.plan||'';
   if(teacherAssignmentDraft)teacherAssignmentDraft.value=draft.assignment||'';
   if(teacherAiCommentDraft)teacherAiCommentDraft.value=draft.aiComment||'';
  }else{
   teacherDraftBox?.classList.add('hidden');
   if(teacherPlanDraft)teacherPlanDraft.value='';
   if(teacherAssignmentDraft)teacherAssignmentDraft.value='';
   if(teacherAiCommentDraft)teacherAiCommentDraft.value='';
  }
  if(teacherStatus)teacherStatus.textContent='';
 }

 teacherInput?.addEventListener('input',()=>{
  if(!teacherApi())return;
  teacherApi().saveComment(current,teacherInput.value);
 });

 teacherCreateBtn?.addEventListener('click',()=>{
  if(!teacherApi())return;
  const text=(teacherInput?.value||'').trim();
  if(!text){if(teacherStatus)teacherStatus.textContent='講師コメントを入力してください';return}
  try{
   teacherApi().saveComment(current,teacherInput.value);
   teacherApi().createDraft(current,text);
   renderTeacherCommentSection();
   if(teacherStatus)teacherStatus.textContent='反映案を作成しました。内容を確認してください。';
  }catch(e){console.error('講師コメントの解析に失敗しました',e);if(teacherStatus)teacherStatus.textContent='反映案の作成に失敗しました。';}
 });

 teacherClearBtn?.addEventListener('click',()=>{
  if(!teacherApi())return;
  if(!confirm('講師コメントの入力と未反映の候補を消しますか？（反映済みの内容は消えません）'))return;
  teacherApi().clear(current);
  if(teacherInput)teacherInput.value='';
  renderTeacherCommentSection();
  if(teacherStatus)teacherStatus.textContent='入力を消しました。';
 });

 teacherApplyBtn?.addEventListener('click',()=>{
  if(!teacherApi())return;
  const childId=current;
  const editedDraft={
   sourceText:teacherInput?.value||'',
   plan:teacherPlanDraft?.value||'',
   assignment:teacherAssignmentDraft?.value||'',
   aiComment:teacherAiCommentDraft?.value||''
  };
  const ctx={
   getAssignments:()=>{try{return getAssignments()}catch{return []}},
   saveAssignments:(list)=>{try{saveAssignments(list)}catch(e){console.error(e)}},
   readPlan:()=>{try{return JSON.parse(localStorage.getItem(key())||'{}')}catch{return {}}},
   writePlan:(planData)=>{try{localStorage.setItem(key(),JSON.stringify(planData))}catch(e){console.error(e)}},
   getBaseTasks:()=>{try{return activeTasks()}catch{return []}}
  };
  try{
   teacherApi().applyDraft(childId,editedDraft,ctx);
   if(teacherInput)teacherInput.value='';
   renderTeacherCommentSection();
   if(teacherStatus)teacherStatus.textContent='まとめて反映しました。';
   try{render()}catch(e){console.error(e)}
   try{if(document.querySelector('#assignments')?.classList.contains('active'))renderAssignments()}catch(e){console.error(e)}
   try{if(document.querySelector('#family')?.classList.contains('active'))renderFamily()}catch(e){console.error(e)}
  }catch(e){
   console.error('講師コメントの反映に失敗しました',e);
   if(teacherStatus)teacherStatus.textContent='反映に失敗しました。もう一度お試しください。';
  }
 });

 const preSprint11RenderReport=renderReport;
 renderReport=function(){
  preSprint11RenderReport();
  try{renderTeacherCommentSection()}catch(e){console.error('講師コメント欄の表示に失敗しました',e)}
 };
})();
