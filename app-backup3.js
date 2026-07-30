const data=window.StepUpData.children;
const testEvents=window.StepUpData.testEvents;
const TODAY=new Date(2026,6,21);
const PLAN_DATE='2026-07-21';
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
 const states={};
 items.forEach(item=>{states[item.id]={status:item.status,progress:item.progress,remaining:item.remaining,current:item.current}});
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
 const saved=JSON.parse(localStorage.getItem(`stepup-assignments-${id}`)||'null');
 return saved||defaultAssignments[id].map(item=>({...item}));
}
function syncLearningProgress(id,name,current,total){
 const list=getAssignmentsForChild(id),normalizedName=normalizeAssignmentText(name);
 const assignment=list.find(item=>normalizeAssignmentText(item.name)===normalizedName);
 if(assignment){
  assignment.current=Math.max(0,Math.min(Number(assignment.total||total||100),Number(current)||0));
  saveAssignments(list);
 }
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
 return items.sort((a,b)=>assignmentPriority(a)-assignmentPriority(b)||a.priority-b.priority).map(item=>({
  assignmentId:item.id,
  subject:item.subject,
  title:item.title,
  status:item.status,
  remaining:item.remaining,
  priority:assignmentPriority(item),
  category:item.category
 }));
}
function saveTomorrowPlan(id=current){
 const plan=createTomorrowPlan(id);
 localStorage.setItem(nextPlanKey(id),JSON.stringify({date:PLAN_DATE,childName:assignmentData[id]?.childName,items:plan}));
 return plan;
}
function assignmentStepText(id=current,completedItems=[],additionalProgress=''){
 const names=completedItems.map(item=>item.title);
 if(names.length)return `${names[0]}を進め、昨日より一歩前進した。`;
 if(additionalProgress)return `${additionalProgress.slice(0,40)}を記録し、昨日より一歩進んだ。`;
 const next=assignmentItems(id).find(item=>item.status!=='completed');
 return next?`${next.title}に取り組む準備ができた。`:'今日できたことを一つ振り返った。';
}

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
async function familySync(){
 if(syncBusy||location.protocol==='file:')return;
 syncBusy=true;
 try{
  const meta=getSyncMeta(),now=Date.now(),changes={};
  for(const key of syncEligibleKeys()){
   const value=localStorage.getItem(key)??'';
   const hash=value;
   if(!meta[key])meta[key]={updatedAt:now,hash};
   else if(meta[key].hash!==hash){meta[key]={updatedAt:now,hash};changes[key]={value,updatedAt:now}}
  }
  if(Object.keys(changes).length){
   await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:changes})});
  }
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw new Error('sync');
  const remote=await response.json(),values=remote.values||{};
  let changed=false;
  for(const [key,item] of Object.entries(values)){
   if(!key.startsWith(SYNC_KEYS_PREFIX)||key===SYNC_META_KEY)continue;
   const localStamp=meta[key]?.updatedAt||0;
   if((item.updatedAt||0)>localStamp){
    localStorage.setItem(key,item.value??'');
    meta[key]={updatedAt:item.updatedAt||now,hash:item.value??''};
    changed=true;
   }
  }
  // First connection: publish local values that the server does not have yet.
  const missing={};
  for(const key of syncEligibleKeys())if(!values[key]){
   const value=localStorage.getItem(key)??'',updatedAt=meta[key]?.updatedAt||now;
   missing[key]={value,updatedAt};meta[key]={updatedAt,hash:value};
  }
  if(Object.keys(missing).length)await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:missing})});
  setSyncMeta(meta);setSyncStatus('PC・スマホの学習記録を同期中','online');
  if(changed){
   try{render()}catch{}
   if(document.querySelector('#family')?.classList.contains('active'))try{renderFamily()}catch{}
  }
 }catch(e){setSyncStatus('この端末内に保存中（サーバー接続なし）','offline')}
 finally{syncBusy=false}
}
window.addEventListener('load',()=>{familySync();setInterval(familySync,2500)});

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
function show(el){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));el.classList.add('active');scrollTo(0,0)}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='family')openFamily();else{current=b.dataset.view;render();show(mission)}});
back.onclick=()=>show(select);familyBack.onclick=()=>show(select);
document.querySelector('#viewTodayPlan')?.addEventListener('click',()=>document.querySelector('.goals')?.scrollIntoView({behavior:'smooth',block:'start'}));
function openFamily(){renderFamily();show(family)}
document.querySelectorAll('[data-family-nav]').forEach(button=>button.onclick=()=>{const destination=button.dataset.familyNav;if(destination==='family'){document.querySelectorAll('[data-family-nav]').forEach(x=>x.classList.toggle('active',x===button));return}current=destination;render();show(mission)});
function key(){return 'stepup-v4-'+PLAN_DATE+'-'+current}
function activeTasks(){const saved=JSON.parse(localStorage.getItem(key())||'{}');return saved.customTasks||data[current].tasks}
function escapeHtml(text){return String(text).replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}
function formatFocusTitle(text){
 const parts=String(text).trim().split(/\s+/).filter(Boolean);
 if(parts.length<2)return escapeHtml(text);
 return parts.map(part=>`<span class="focus-phrase">${escapeHtml(part)}</span>`).join('<span class="focus-space" aria-hidden="true"> </span>');
}
function render(){const d=data[current];mission.classList.toggle('sakuya-theme',current==='sakuya');personName.textContent=d.name;focusTitle.innerHTML=formatFocusTitle(d.focus);focusSub.textContent=d.sub;priorityTitle.textContent=d.priority;priorityText.textContent=d.priorityText;renderMobileWelcome(d);renderCountdown();goals.innerHTML=d.goals.map(x=>`<li>${x}</li>`).join('');const saved=JSON.parse(localStorage.getItem(key())||'{}');const tasks=activeTasks();scheduleList.innerHTML=tasks.map((t,i)=>{const assignment=assignmentForTask(t[1]);const assignmentText=assignment?`課題：${assignmentStatusLabels[assignment.status]}・${assignment.remaining}`:(saved.checks?.[i]?'完了 ✓':'タップで完了');return `<label class="task ${saved.checks?.[i]?'done':''}"><input type="checkbox" data-i="${i}" ${saved.checks?.[i]?'checked':''}><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span><span class="task-state">${assignmentText}</span><span class="duration">${t[2]}</span></label>`}).join('');stepInput.value=saved.step||'';bindChecks();update();renderPersonalCoach();renderTodayAssignmentsCard()}
function renderTodayAssignmentsCard(){
 const list=document.querySelector('#todayAssignmentsList');
 if(!list)return;
 const items=getAssignments().filter(a=>a.current<a.total).sort((a,b)=>daysLeft(a.deadline)-daysLeft(b.deadline)).slice(0,3);
 list.innerHTML=items.length?items.map(a=>{
  const left=daysLeft(a.deadline),remain=Math.max(0,a.total-a.current),pct=Math.min(100,Math.round(a.current/a.total*100)),today=remain?dailyTarget(a):0;
  return `<article class="assignment-item ${left<=7?'urgent':''}"><div class="assignment-top"><div><small>${a.category}</small><h2>${a.name}</h2></div><b>あと ${left}日</b></div><div class="assignment-meta"><span>現在<strong>${a.current} / ${a.total}</strong></span><span>残り<strong>${remain}</strong></span><span>今日の目安<strong>${today}</strong></span></div><div class="assignment-progress"><i style="width:${pct}%"></i></div></article>`;
 }).join(''):'<div class="empty-state">今日取り組む課題はありません。</div>';
}
document.querySelector('#todayAssignmentsMore')?.addEventListener('click',()=>openAssignments());
function renderMobileWelcome(d){
 const hour=new Date().getHours();
 const greeting=hour<11?'おはよう！':hour<18?'こんにちは！':'こんばんは！';
 const shortName=current==='iori'?'壱凰':'朔埜';
 const greetingEl=document.querySelector('#welcomeGreeting');
 const nameEl=document.querySelector('#welcomeName');
 const targetEl=document.querySelector('#welcomeTarget');
 const dateEl=document.querySelector('#welcomeDate');
 if(dateEl)dateEl.textContent='2026年7月21日（火）';
 if(greetingEl)greetingEl.textContent=greeting;
 if(nameEl)nameEl.textContent=`${shortName}、今日も一歩ずつ進もう。`;
 if(targetEl)targetEl.textContent=d.priority;
}

function renderCountdown(){
 const events=testEvents[current]||[];
 countdownStrip.innerHTML=events.map(e=>{const target=new Date(e.date+'T00:00:00');const days=Math.max(0,Math.ceil((target-TODAY)/86400000));return `<article><small>${e.subject}</small><strong>${e.title}</strong><b>あと ${days}日</b><span>${target.getMonth()+1}/${target.getDate()}</span></article>`}).join('');
}
function bindChecks(){document.querySelectorAll('.task input').forEach(c=>c.onchange=()=>{const saved=JSON.parse(localStorage.getItem(key())||'{}');saved.checks=saved.checks||{};saved.checks[c.dataset.i]=c.checked;if(c.checked&&saved.activeTaskIndex===Number(c.dataset.i))saved.activeTaskIndex=null;localStorage.setItem(key(),JSON.stringify(saved));const task=c.closest('.task');task.classList.toggle('done',c.checked);const state=task.querySelector('.task-state');if(state)state.textContent=c.checked?'完了 ✓':'タップで完了';update()})}
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
 const count=document.querySelector('#mobileMissionCount'),time=document.querySelector('#mobileMissionTime'),title=document.querySelector('#mobileMissionTitle'),duration=document.querySelector('#mobileMissionDuration'),button=document.querySelector('#completeCurrentMission'),label=document.querySelector('#mobileMissionLabel'),progress=document.querySelector('#mobileProgressBar'),remainingText=document.querySelector('#mobileRemainingText'),remainingList=document.querySelector('#mobileRemainingList');
 const percentValue=tasks.length?Math.round(done/tasks.length*100):0;
 if(count)count.textContent=`${done} / ${tasks.length} 完了`;
 if(progress)progress.style.width=percentValue+'%';
 if(remainingText)remainingText.textContent=next<0?'今日のミッションはすべて完了！':`今日はあと${tasks.length-done}個`;
 if(remainingList)remainingList.innerHTML=next<0?'':tasks.map((t,i)=>!checks[i]&&i!==next?`<span>${escapeHtml(t[1])}</span>`:'').join('');
 if(next<0){if(label)label.textContent='TODAY COMPLETE';if(time)time.textContent='DONE';if(title)title.textContent='今日の計画をすべて完了！';if(duration)duration.textContent='今日のStep Upを残して、しっかり休もう。';if(button){button.textContent='MISSION COMPLETE ✓';button.disabled=true;delete button.dataset.taskIndex;}return;}
 if(label)label.textContent=isActive?'学習中':'今やること';
 if(time)time.textContent=tasks[next][0];
 if(title)title.textContent=tasks[next][1];
 if(duration)duration.textContent=isActive?`予定時間 ${tasks[next][2]}・集中して進めよう`:`予定時間 ${tasks[next][2]}`;
 if(button){button.textContent=isActive?'完了する ✓':'開始する';button.disabled=false;button.dataset.taskIndex=String(next);button.dataset.action=isActive?'complete':'start';}
}
function update(){const cs=[...document.querySelectorAll('.task input')],done=cs.filter(x=>x.checked).length,p=cs.length?Math.round(done/cs.length*100):0;percent.textContent=p+'%';doneCount.textContent=done;totalCount.textContent=cs.length;bar.style.width=p+'%';stepMessage.textContent=p===100?'MISSION COMPLETE！今日も一歩進んだ。':done?`あと${cs.length-done}個。昨日の自分より一歩前へ。`:'まず一つ、チェックを付けよう。';const tasks=activeTasks(),checks=cs.map(x=>x.checked);updateMobileMission(tasks,checks,done);const suggestion=stepSuggestion(done,cs.length,tasks,checks);const suggestionText=document.querySelector('#stepSuggestionText');if(suggestionText)suggestionText.textContent=suggestion;renderPersonalCoach();}
saveStep.onclick=()=>{const saved=JSON.parse(localStorage.getItem(key())||'{}');saved.step=stepInput.value;localStorage.setItem(key(),JSON.stringify(saved));stepMessage.textContent=stepInput.value||'今日のStep Upを保存しました。'};
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
const useStepSuggestion=document.querySelector('#useStepSuggestion');
if(useStepSuggestion)useStepSuggestion.onclick=()=>{const text=document.querySelector('#stepSuggestionText')?.textContent||'';stepInput.value=text;stepInput.focus();};

themeToggle.onclick=()=>{if(current==='iori')mission.classList.toggle('dark')};

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
 if(rate===100)good=`今日の${total}個のミッションを最後までやり切れたね。${profile.strength}がしっかり出ています。`;
 else if(done>0)good=`${lastDone}まで進められたね。${done}個を完了できたことが、今日の確かなStep Upです。`;
 else good=`今日の目標を確認できたことが最初の一歩。${profile.strength}を生かして、一つだけ始めよう。`;
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
function childSummary(id){const saved=JSON.parse(localStorage.getItem('stepup-v4-'+PLAN_DATE+'-'+id)||'{}');const tasks=saved.customTasks||data[id].tasks;const total=tasks.length;const done=Object.values(saved.checks||{}).filter(Boolean).length;const rate=Math.round(done/total*100);const mins=tasks.reduce((sum,t,i)=>sum+((saved.checks||{})[i]?parseInt(t[2])||0:0),0);return {done,total,rate,mins,step:saved.step||'まだ記録なし'}}
function renderFamily(){
 const a=childSummary('iori'),b=childSummary('sakuya'),allDone=a.done+b.done,allTotal=a.total+b.total,rate=Math.round(allDone/allTotal*100),mins=a.mins+b.mins;
 familyStats.innerHTML=`<div><b>${rate}%</b><span>今日の達成率</span></div><div><b>${Math.floor(mins/60)}h ${mins%60}m</b><span>完了した学習時間</span></div><div><b>${allTotal-allDone}</b><span>残りミッション</span></div>`;
 childOverview.innerHTML=[['壱凰','IORI','iori',a,'#d70725'],['朔埜','SAKUYA','sakuya',b,'#146aff']].map(([name,en,key,x,color])=>`<article style="--child:${color}" data-child-open="${key}" role="button" tabindex="0" aria-label="${name}の個人ページを見る"><small>${en}</small><h2>${name}</h2><div class="child-rate"><b>${x.rate}%</b><span>${x.done}/${x.total} COMPLETE</span></div><div class="child-bar"><i style="width:${x.rate}%"></i></div><p>${x.step}</p></article>`).join('');
 childOverview.querySelectorAll('[data-child-open]').forEach(card=>{const open=()=>{current=card.dataset.childOpen;render();show(mission)};card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
}

// Calendar navigation and rendering
const calendarScreen=document.querySelector('#calendar');
const calendarGrid=document.querySelector('#calendarGrid');
const monthTitle=document.querySelector('#monthTitle');
const agendaTitle=document.querySelector('#agendaTitle');
const agendaList=document.querySelector('#agendaList');
const calendarPerson=document.querySelector('#calendarPerson');
let calendarDate=new Date(2026,6,1);
let selectedDate=new Date(2026,6,19);
const calendarEvents={
 '2026-07-19':[
  ['08:00','朝活：英単語','30分'],['08:40','数学 新研究','90分'],['10:25','社会 新研究','80分'],['13:00','ことばのきまり','60分'],['14:15','英語 新研究','60分'],['15:30','歴史の学習','45分'],['16:30','ジョイフルワーク','45分']
 ],
 '2026-07-20':[['09:00','夏休み課題の続き','60分']],
 '2026-07-21':[['10:00','どこでもスタディ','45分']]
};
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function renderCalendar(){
 const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
 monthTitle.textContent=`${y}年${m+1}月`;
 const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
 calendarGrid.innerHTML='';
 for(let i=0;i<42;i++){
  const d=new Date(start);d.setDate(start.getDate()+i);const k=dateKey(d);const ev=calendarEvents[k]||[];
  const b=document.createElement('button');b.className='day'+(d.getMonth()!==m?' muted':'')+(k===dateKey(selectedDate)?' selected':'')+(k==='2026-07-19'?' today':'');
  b.innerHTML=`<span class="day-number">${d.getDate()}</span>${ev.length?'<i class="day-dot"></i><span class="day-label">'+ev[0][1]+'</span>':''}`;
  b.onclick=()=>{selectedDate=d;renderCalendar();renderAgenda()};calendarGrid.appendChild(b);
 }
 renderAgenda();
}
function renderAgenda(){
 const k=dateKey(selectedDate),ev=calendarEvents[k]||[];
 agendaTitle.textContent=`${selectedDate.getMonth()+1}月${selectedDate.getDate()}日の予定`;
 agendaList.innerHTML=ev.length?ev.map(x=>`<div class="agenda-item"><time>${x[0]}</time><span><strong>${x[1]}</strong><small>学習ミッション</small></span><em>${x[2]}</em></div>`).join(''):'<div class="empty-agenda">予定はありません。休息や振り返りの時間にしましょう。</div>';
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
document.querySelector('#todayBtn').onclick=()=>{calendarDate=new Date(2026,6,1);selectedDate=new Date(2026,6,19);renderCalendar()};


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
  {name:'読書感想文',subject:'国語',priority:'urgent',note:'3時間で完成',current:0,total:4,todayFrom:1,todayTo:4},
  {name:'サマースクール',subject:'その他',priority:'urgent',note:'丸付け',current:18,total:40,todayFrom:18,todayTo:22},
  {name:'国語ワーク',subject:'国語',priority:'school',note:'3ページ',current:10,total:60,todayFrom:10,todayTo:13},
  {name:'理科ワーク',subject:'理科',priority:'school',note:'10ページ',current:15,total:70,todayFrom:15,todayTo:25},
  {name:'数学ワーク',subject:'数学',priority:'review',note:'3ページ',current:9,total:60,todayFrom:9,todayTo:12}
 ]
};
let materialFilter='all';
function materialKey(){return 'stepup-materials-'+current}
function getMaterials(){const saved=JSON.parse(localStorage.getItem(materialKey())||'null');return saved||defaultMaterials[current].map((x,i)=>({...x,id:Date.now()+i,done:false}))}
function saveMaterials(list){localStorage.setItem(materialKey(),JSON.stringify(list))}
function renderMaterials(){
 const list=getMaterials();const filtered=materialFilter==='all'?list:list.filter(x=>x.priority===materialFilter);
 materialList.innerHTML=filtered.length?filtered.map(x=>{const total=Number(x.total||100),currentPage=Number(x.current||0),pct=Math.min(100,Math.round(currentPage/total*100));return `<article class="material-item ${x.priority} ${x.done?'done':''}"><div><small>${x.subject} / ${x.priority==='urgent'?'PRIORITY':x.priority==='school'?'SCHOOL':'REVIEW'}</small><h2>${x.name}</h2><p>${x.note||''}</p><div class="page-target"><span>今日 P${x.todayFrom||'-'}〜${x.todayTo||'-'}</span><b>現在 P${currentPage} / ${total}</b></div><div class="material-progress"><i style="width:${pct}%"></i></div><em>残り ${Math.max(0,total-currentPage)}ページ</em></div><div class="material-actions"><button data-progress-id="${x.id}">＋進捗</button><button data-material-id="${x.id}">${x.done?'戻す':'完了'}</button></div></article>`}).join(''):'<div class="empty-state">この条件の教材はありません。</div>';
 document.querySelectorAll('[data-material-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.materialId);if(!item)return;item.done=!item.done;item.current=item.done?Number(item.total||100):0;saveMaterials(all);syncLearningProgress(current,item.name,item.current,item.total);renderMaterials()});
 document.querySelectorAll('[data-progress-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.progressId);if(!item)return;const next=prompt('現在のページを入力してください',item.current||0);if(next===null)return;item.current=Math.max(0,Math.min(Number(item.total||9999),Number(next)||0));item.done=item.current>=Number(item.total||100);saveMaterials(all);syncLearningProgress(current,item.name,item.current,item.total);renderMaterials()});
}
function openMaterials(){materialsPerson.textContent=data[current].name+' / 教材';materialForm.classList.add('hidden');renderMaterials();show(materialsScreen)}
materialsBack.onclick=()=>show(mission);
addMaterialBtn.onclick=()=>materialForm.classList.toggle('hidden');
materialFilters.querySelectorAll('button').forEach(b=>b.onclick=()=>{materialFilter=b.dataset.filter;materialFilters.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderMaterials()});
saveMaterialBtn.onclick=()=>{const name=newMaterialName.value.trim();if(!name)return;const list=getMaterials();list.push({id:Date.now(),name,subject:newMaterialSubject.value,priority:newMaterialPriority.value,note:'追加した教材',current:0,total:100,todayFrom:1,todayTo:5,done:false});saveMaterials(list);newMaterialName.value='';materialForm.classList.add('hidden');renderMaterials()};

// Growth
function openGrowth(){renderGrowth();show(growthScreen)}
function renderGrowth(){
 growthPerson.textContent=data[current].name+' / 成長記録';
 const saved=JSON.parse(localStorage.getItem(key())||'{}');const checks=saved.checks||{};const total=activeTasks().length;const done=Object.values(checks).filter(Boolean).length;const rate=Math.round(done/total*100);
 growthRate.textContent=rate+'%';growthDone.textContent=done;growthStreak.textContent=(done?3:1)+'日';growthStep.textContent=saved.step||'まだ記録がありません。小さな成長を一つ残そう。';
 const base=current==='iori'?[42,58,35,71,64,50,rate]:[30,45,52,40,68,55,rate];const days=['月','火','水','木','金','土','今日'];
 weekBars.innerHTML=base.map((v,i)=>`<div class="week-bar ${i===6?'today':''}"><span>${v}%</span><i style="height:${Math.max(v,4)}%"></i><b>${days[i]}</b></div>`).join('');
 const achievements=[];if(done)achievements.push(`${done}個のミッションを完了できた`);if(rate>=50)achievements.push('予定の半分以上を進めた');if(saved.step)achievements.push('今日のStep Upを自分の言葉で残した');
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
function openPlanner(){plannerPerson.textContent=data[current].name+' / 今日の学習計画';generatedPlan=[];planPreview.innerHTML='<div class="empty-state">条件を選んで「計画を作る」を押してください。</div>';applyPlanBtn.disabled=true;show(plannerScreen)}
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
  {id:6201,name:'読書感想文',deadline:'2026-07-22',current:0,total:4,category:'提出期限'},
  {id:6202,name:'サマースクール',deadline:'2026-08-31',current:18,total:40,category:'学校の宿題'},
  {id:6203,name:'国語ワーク',deadline:'2026-08-31',current:10,total:60,category:'学校の宿題'},
  {id:6204,name:'理科ワーク',deadline:'2026-08-31',current:15,total:70,category:'学校の宿題'},
  {id:6205,name:'数学ワーク',deadline:'2026-08-31',current:9,total:60,category:'苦手単元'}
 ]
};
function assignmentKey(){return 'stepup-assignments-'+current}
function getAssignments(){return JSON.parse(localStorage.getItem(assignmentKey())||'null')||defaultAssignments[current].map(x=>({...x}))}
function saveAssignments(list){localStorage.setItem(assignmentKey(),JSON.stringify(list))}
function daysLeft(date){return Math.max(1,Math.ceil((new Date(date+'T23:59:59')-TODAY)/86400000))}
function dailyTarget(a){return Math.max(0,Math.ceil((Number(a.total)-Number(a.current))/daysLeft(a.deadline)))}
function renderAssignments(){
 assignmentPerson.textContent=data[current].name+' / 夏休み課題';
 const list=getAssignments().sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
 const remaining=list.reduce((s,a)=>s+Math.max(0,a.total-a.current),0),urgent=list.filter(a=>daysLeft(a.deadline)<=7&&a.current<a.total).length,complete=list.filter(a=>a.current>=a.total).length;
 assignmentSummary.innerHTML=`<article><b>${list.length}</b><span>登録課題</span></article><article><b>${urgent}</b><span>7日以内の期限</span></article><article><b>${remaining}</b><span>残りページ・工程</span></article>`;
 assignmentList.innerHTML=list.map(a=>{const left=daysLeft(a.deadline),remain=Math.max(0,a.total-a.current),pct=Math.min(100,Math.round(a.current/a.total*100)),today=remain?dailyTarget(a):0;return `<article class="assignment-item ${left<=7&&remain?'urgent':''}"><div class="assignment-top"><div><small>${a.category}</small><h2>${a.name}</h2></div><b>${remain?'あと '+left+'日':'完了'}</b></div><div class="assignment-meta"><span>現在<strong>${a.current} / ${a.total}</strong></span><span>残り<strong>${remain}</strong></span><span>今日の目安<strong>${today}</strong></span></div><div class="assignment-progress"><i style="width:${pct}%"></i></div><div class="assignment-actions"><button data-assignment-progress="${a.id}">進捗を更新</button><button data-assignment-complete="${a.id}">${remain?'完了にする':'戻す'}</button></div></article>`}).join('');
 document.querySelectorAll('[data-assignment-progress]').forEach(b=>b.onclick=()=>{const all=getAssignments(),a=all.find(x=>String(x.id)===b.dataset.assignmentProgress);const v=prompt('現在のページ・工程を入力',a.current);if(v===null)return;a.current=Math.max(0,Math.min(a.total,Number(v)||0));saveAssignments(all);syncLearningProgress(current,a.name,a.current,a.total);renderAssignments()});
 document.querySelectorAll('[data-assignment-complete]').forEach(b=>b.onclick=()=>{const all=getAssignments(),a=all.find(x=>String(x.id)===b.dataset.assignmentComplete);a.current=a.current>=a.total?0:a.total;saveAssignments(all);syncLearningProgress(current,a.name,a.current,a.total);renderAssignments()});
}
function openAssignments(){assignmentForm.classList.add('hidden');renderAssignments();show(assignmentsScreen)}
openAssignmentBtn.onclick=openAssignments;assignmentBack.onclick=()=>show(mission);addAssignmentBtn.onclick=()=>assignmentForm.classList.toggle('hidden');

// Sprint 7: always-visible navigation shortcuts
quickPlanner.onclick=openPlanner;
quickAssignments.onclick=openAssignments;
quickMaterials.onclick=openMaterials;
quickGrowth.onclick=openGrowth;
quickCalendar.onclick=openCalendar;
saveAssignmentBtn.onclick=()=>{const name=newAssignmentName.value.trim();if(!name)return;const list=getAssignments();list.push({id:Date.now(),name,deadline:newAssignmentDeadline.value,current:Number(newAssignmentCurrent.value)||0,total:Math.max(1,Number(newAssignmentTotal.value)||1),category:'提出期限'});saveAssignments(list);newAssignmentName.value='';assignmentForm.classList.add('hidden');renderAssignments()};

function autoStepMessage(){
 const saved=JSON.parse(localStorage.getItem(key())||'{}'),tasks=activeTasks(),checks=saved.checks||{},done=Object.values(checks).filter(Boolean).length;
 if(!done)return '最初の一つに取り組む準備ができた。';
 if(done===tasks.length)return '予定したミッションを最後までやり切った。';
 const completed=tasks.find((t,i)=>checks[i]);
 return completed?`${completed[1]}に取り組み、今日の一歩を進めた。`:`${done}個のミッションを完了した。`;
}
const originalSaveStep=saveStep.onclick;
saveStep.onclick=()=>{if(!stepInput.value.trim())stepInput.value=autoStepMessage();originalSaveStep()};

// Replace the Sprint 5 generator with deadline-aware planning.
generatePlanBtn.onclick=()=>{
 const total=Number(planMinutes.value),session=Number(sessionMinutes.value),rest=Number(breakMinutes.value);let clock=toMinutes(planStart.value),remaining=total,result=[];
 if(includeMorning.checked){result.push([asTime(clock),'朝活：英単語・丸付け','30分']);clock+=40}
 const assignments=getAssignments().filter(a=>a.current<a.total).sort((a,b)=>daysLeft(a.deadline)-daysLeft(b.deadline));
 const materials=getMaterials().filter(x=>!x.done);
 const queue=assignments.map(a=>({name:a.name,target:`今日の目安 ${dailyTarget(a)}／期限まで${daysLeft(a.deadline)}日`}));
 materials.forEach(m=>{if(!queue.some(q=>q.name===m.name))queue.push({name:m.name,target:m.note||'復習'})});
 let idx=0;
 while(remaining>0&&queue.length){const item=queue[idx%queue.length],duration=Math.min(session,remaining);result.push([asTime(clock),`${item.name}（${item.target}）`,`${duration}分`]);clock+=duration;remaining-=duration;idx++;if(remaining>0)clock+=rest;if(idx===Math.ceil(queue.length/2)&&remaining>=30)clock+=45}
 if(hasTutor.checked){result.push([asTime(clock),'家庭教師の授業','60分']);clock+=70}
 if(includeExercise.checked){result.push([asTime(clock),'筋トレ・運動','30分']);clock+=40}
 result.push([asTime(clock),'丸付け・今日のStep Up','20分']);generatedPlan=result;
 planPreview.innerHTML=result.map((t,i)=>`<article><b>${String(i+1).padStart(2,'0')}</b><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span></article>`).join('');applyPlanBtn.disabled=false;
};

const oldRenderFamily=renderFamily;
renderFamily=function(){oldRenderFamily();const a=childSummary('iori'),b=childSummary('sakuya');const am=getMaterialsFor('iori'),bm=getMaterialsFor('sakuya');const ca=getCoachMessage('iori'),cb=getCoachMessage('sakuya');familyInsights.innerHTML=`<article><small>壱凰・今週の積み重ね</small><b>${a.done?3:1}日</b><p>本人の昨日までの積み重ねを表示しています。</p></article><article><small>朔埜・今週の積み重ね</small><b>${b.done?3:1}日</b><p>本人の昨日までの積み重ねを表示しています。</p></article><article><small>今日完了した教材・ミッション</small><b>${am.filter(x=>x.done).length+a.done}件 / ${bm.filter(x=>x.done).length+b.done}件</b><p>壱凰 / 朔埜。それぞれの進み具合です。</p></article><section class="family-ai-report"><small>PARENT AI REPORT</small><h3>保護者へのAIレポート</h3><div class="parent-coach-grid"><article><b>壱凰</b><p>${ca.good}<br>声かけ：『次は${ca.next.replace('を、まず20分だけ進めよう。終わったら休憩して、できた所にチェックを付けよう。','から始めよう')}』</p></article><article><b>朔埜</b><p>${cb.good}<br>声かけ：『次は${cb.next.replace('を、まず20分だけ進めよう。終わったら休憩して、できた所にチェックを付けよう。','から始めよう')}』</p></article></div></section>`};
function getMaterialsFor(id){const saved=JSON.parse(localStorage.getItem('stepup-materials-'+id)||'null');return saved||defaultMaterials[id].map((x,i)=>({...x,id:Date.now()+i,done:false}))}


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
 badge.textContent=recommended?'朔埜おすすめ':'音声でも記録OK';
 document.querySelector('#voiceGuide').textContent=recommended
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
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 const tasks=activeTasks(),checks=saved.checks||{};
 const items=assignmentItems(id),completedItems=[];
 tasks.forEach((task,index)=>{
  if(!checks[index])return;
  const matchedAssignment=assignmentForTask(task[1],id);
  const assignment=items.find(item=>item.id===matchedAssignment?.id);
  if(assignment){
   assignment.status='completed';
   assignment.progress='今日のチェックで完了';
   assignment.remaining='なし';
   assignment.current=Number(assignment.total||100);
  syncLearningProgress(id,assignment.title,assignment.current,assignment.total);
   if(!completedItems.some(completed=>completed.id===assignment.id))completedItems.push(assignment);
  }
 });
 const normalizedText=normalizeAssignmentText(currentText);
 items.forEach(item=>{
  const title=normalizeAssignmentText(item.title);
  const reportedPage=extractReportedPage(currentText,item.title);
  if(title&&normalizedText.includes(title)&&/(完了|終わ|進め|やった|できた|ページ|p\d+)/i.test(currentText)){
   if(reportedPage!==null){
    item.current=Math.min(Number(item.total||100),Math.max(Number(item.current||0),reportedPage));
    item.status=item.current>=Number(item.total||100)?'completed':'in-progress';
    item.progress=`P${item.current}まで完了`;
    item.remaining=item.current>=Number(item.total||100)?'なし':`P${item.current}以降`;
   }else{
    item.status='completed';
    item.current=Number(item.total||100);
    item.progress='報告内容から完了を確認';
    item.remaining='なし';
   }
  syncLearningProgress(id,item.title,item.current,item.total);
   if(item.status==='completed'&&!completedItems.some(completed=>completed.id===item.id))completedItems.push(item);
  }
 });
 saveAssignmentItems(id,items);
 return {items,completedItems,checks:{...checks},tasks};
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
 if(!text&&!checkedCount){voiceStatus.textContent='チェック項目を選ぶか、報告内容を入力してください';voiceTranscript.focus();return}
 try{
 const beforeMaterials=getMaterials().map(item=>({name:item.name,current:Number(item.current||0)}));
 const beforeAssignments=getAssignments().map(item=>({name:item.name,current:Number(item.current||0)}));
 const result=analyzeVoiceReport(text);
 const assignmentReport=applyAssignmentReport(current,text);
 const materialReport=applyMaterialReport(current,assignmentReport,text);
 const stepUp=assignmentStepText(current,assignmentReport.completedItems,text);
 const tomorrowPlan=saveTomorrowPlan(current);
 const materialChanges=materialReport.map(item=>{const before=beforeMaterials.find(entry=>normalizeAssignmentText(entry.name)===normalizeAssignmentText(item.name));const after=Number(item.current||0);return before&&before.current!==after?{name:item.subject?`${item.subject} ${item.name}`:item.name,before:before.current,after}:null}).filter(Boolean);
 const assignmentChanges=getAssignments().filter(item=>{const before=beforeAssignments.find(entry=>normalizeAssignmentText(entry.name)===normalizeAssignmentText(item.name));return before&&before.current!==Number(item.current||0)});
 const summary={checkedCount,materialChanges,assignmentChanged:assignmentChanges.length>0};
 saveAssignmentReport(current,text,assignmentReport);
 localStorage.setItem(voiceReportKey(),JSON.stringify({transcript:text,additionalProgress:text,...result,stepUp,completedAssignments:assignmentReport.completedItems.map(item=>item.id),updatedMaterials:materialReport.filter(item=>item.done).map(item=>item.name),tomorrowPlan:tomorrowPlan.map(item=>item.assignmentId),summary,savedAt:new Date().toISOString()}));
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.step=stepUp;
 localStorage.setItem(key(),JSON.stringify(saved));
 stepInput.value=stepUp;stepMessage.textContent=stepUp;
 showVoiceResult(result.response,stepUp,result.nextAction);
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
refreshedReportStatus.textContent='報告を保存しました。教材の進捗と明日の準備を更新しました。';
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
quickVoice.onclick=openReport;
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
