const data={
 iori:{name:'壱凰 / IORI',focus:'7月21日 今日のミッション',sub:'午前は英語と数学、夜は課題テスト対策を一つずつ進める。',priority:'午前の予定を守り、夜は数学・社会・ことばのきまりを優先する',priorityText:'外出後は無理に詰め込まず、筋トレを挟んで集中を切り替える。丸付けまでできたら大きなStep Up。',goals:['英語 新研究とジョイフルワークを進める','どこスタ数学に1時間取り組む','夜に数学・社会・ことばのきまりを進める','丸付け・振り返りまで行う'],tasks:[['09:00','朝活：最重要不規則動詞','20分'],['09:20','英語 新研究','60分'],['10:30','ジョイフルワーク','60分'],['11:30','どこスタ数学','60分'],['13:00','昼食・外出','17:30まで'],['18:00','夕食・休憩','60分'],['19:00','筋トレ','20分'],['19:20','数学 新研究','60分'],['20:30','社会 新研究','60分'],['21:40','ことばのきまり','40分'],['22:20','国語・理科の丸付け／今日のStep Up','40分']]},
 sakuya:{name:'朔埜 / SAKUYA',focus:'読書感想文チャレンジ',sub:'楽しく進めて、今日のゴールを一つずつクリア。',priority:'読書感想文を3時間で仕上げる',priorityText:'最初に構成を作り、本文、見直しの順で進めよう。',goals:['読書感想文を完成させる','サマースクールの丸付け','国語3ページ・理科10ページ','数学3ページ'],tasks:[['08:00','朝活：サマースクール丸付け','30分'],['09:00','感想文：構成を作る','40分'],['09:50','感想文：本文を書く①','60分'],['11:00','感想文：本文を書く②','60分'],['13:30','感想文：見直し・清書','40分'],['14:30','理科 10ページ','50分'],['15:30','国語 3ページ','30分'],['16:10','数学 3ページ','30分']]}
};
const testEvents={
 iori:[{title:'5教科課題テスト①',date:'2026-08-25',subject:'国語・数学・社会'},{title:'5教科課題テスト②',date:'2026-08-26',subject:'理科・英語'},{title:'不規則動詞テスト',date:'2026-09-02',subject:'英語'},{title:'単元テスト',date:'2026-09-03',subject:'英語'}],
 sakuya:[{title:'確認テスト',date:'2026-08-28',subject:'国語・算数'},{title:'漢字テスト',date:'2026-08-05',subject:'国語'}]
};
const TODAY=new Date(2026,6,21);
const PLAN_DATE='2026-07-21';

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

const select=document.querySelector('#select'),mission=document.querySelector('#mission'),family=document.querySelector('#family'),materialsScreen=document.querySelector('#materials'),growthScreen=document.querySelector('#growth'),plannerScreen=document.querySelector('#planner');let current='iori';
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
function render(){const d=data[current];mission.classList.toggle('sakuya-theme',current==='sakuya');personName.textContent=d.name;focusTitle.innerHTML=formatFocusTitle(d.focus);focusSub.textContent=d.sub;priorityTitle.textContent=d.priority;priorityText.textContent=d.priorityText;renderMobileWelcome(d);renderCountdown();goals.innerHTML=d.goals.map(x=>`<li>${x}</li>`).join('');const saved=JSON.parse(localStorage.getItem(key())||'{}');const tasks=activeTasks();scheduleList.innerHTML=tasks.map((t,i)=>`<label class="task ${saved.checks?.[i]?'done':''}"><input type="checkbox" data-i="${i}" ${saved.checks?.[i]?'checked':''}><time>${t[0]}</time><span><strong>${t[1]}</strong><small>${t[2]}</small></span><span class="task-state">${saved.checks?.[i]?'完了 ✓':'タップで完了'}</span><span class="duration">${t[2]}</span></label>`).join('');stepInput.value=saved.step||'';bindChecks();update();renderPersonalCoach()}
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
 const saved=JSON.parse(localStorage.getItem('stepup-v3-'+id)||'{}');
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
function childSummary(id){const saved=JSON.parse(localStorage.getItem('stepup-v3-'+id)||'{}');const tasks=saved.customTasks||data[id].tasks;const total=tasks.length;const done=Object.values(saved.checks||{}).filter(Boolean).length;const rate=Math.round(done/total*100);const mins=tasks.reduce((sum,t,i)=>sum+((saved.checks||{})[i]?parseInt(t[2])||0:0),0);return {done,total,rate,mins,step:saved.step||'まだ記録なし'}}
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
 document.querySelectorAll('[data-material-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.materialId);if(item)item.done=!item.done;saveMaterials(all);renderMaterials()});
 document.querySelectorAll('[data-progress-id]').forEach(b=>b.onclick=()=>{const all=getMaterials();const item=all.find(x=>String(x.id)===b.dataset.progressId);if(!item)return;const next=prompt('現在のページを入力してください',item.current||0);if(next===null)return;item.current=Math.max(0,Math.min(Number(item.total||9999),Number(next)||0));saveMaterials(all);renderMaterials()});
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
 document.querySelectorAll('[data-assignment-progress]').forEach(b=>b.onclick=()=>{const all=getAssignments(),a=all.find(x=>String(x.id)===b.dataset.assignmentProgress);const v=prompt('現在のページ・工程を入力',a.current);if(v===null)return;a.current=Math.max(0,Math.min(a.total,Number(v)||0));saveAssignments(all);renderAssignments()});
 document.querySelectorAll('[data-assignment-complete]').forEach(b=>b.onclick=()=>{const all=getAssignments(),a=all.find(x=>String(x.id)===b.dataset.assignmentComplete);a.current=a.current>=a.total?0:a.total;saveAssignments(all);renderAssignments()});
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
function saveVoiceReport(){
 const text=voiceTranscript.value.trim();
 if(!text){voiceStatus.textContent='報告内容を話すか入力してください';voiceTranscript.focus();return}
 const result=analyzeVoiceReport(text);
 localStorage.setItem(voiceReportKey(),JSON.stringify({transcript:text,...result,savedAt:new Date().toISOString()}));
 const saved=JSON.parse(localStorage.getItem(key())||'{}');
 saved.step=result.stepUp;
 localStorage.setItem(key(),JSON.stringify(saved));
 stepInput.value=result.stepUp;stepMessage.textContent=result.stepUp;
 showVoiceResult(result.response,result.stepUp,result.nextAction);
 voiceStatus.textContent='報告を保存しました';
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

quickVoice.onclick=()=>{voiceCoach.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>voiceStart.focus(),350)};
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
render=function(){sprint8Render();updateVoicePersonalization()};
