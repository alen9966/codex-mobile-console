import {Discovery} from './discovery.js';
const $=s=>document.querySelector(s);
const key='dsss.remote.v1';let saved;try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{saved={};}
let endpoint=saved.endpoint||'',token=saved.token||'',updating=false,loadingCatalog=false,rendered='',retryRequest=null,selectedThread=saved.threadId||'',catalog=null;
let automatic=saved.automatic!==false,discoveryAt=saved.discoveryAt||'';
let currentMessages=[];
const store=()=>localStorage.setItem(key,JSON.stringify({endpoint,token,threadId:selectedThread,automatic,discoveryAt}));
const discovery=new Discovery({fetch:(...args)=>fetch(...args),endpoint,updatedAt:discoveryAt,onChange:(next,date)=>{endpoint=next;discoveryAt=date;store();$('#endpoint').value=next;$('#discoveryHint').textContent='已自动获取当前电脑地址';}});
async function updateEndpoint(force=false){if(!automatic)return false;return discovery.refresh(force);}
const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
function pickThread(id){
 selectedThread=id;retryRequest=null;rendered='';currentMessages=[];store();$('#messages').replaceChildren();$('#jobs').replaceChildren();
 drawDetails({},0);$('#historyHint').textContent='';
 $('#status').textContent=id?'读取中':'暂无会话';$('#messageCount').textContent='';$('#queueCount').textContent='0';
 const t=catalog.threads.find(t=>t.id===id);$('#targetHint').textContent=t?'发送目标：'+t.title:'该工程暂无会话；请先在电脑 Codex 中创建会话。';
 $('#sendBtn').disabled=!t;$('#taskTitle').textContent=t?.title||'暂无会话';$('#activity').textContent=t?'正在读取该会话…':'可在电脑打开工程并创建会话，再刷新工程列表。';$('#sendResult').textContent='';
 if(t)refresh();
}
function drawThreads(projectId){
 const list=catalog.threads.filter(t=>t.projectId===projectId),select=$('#threadSelect');select.replaceChildren();
 for(const t of list)select.append(option(t.id,t.title+' · '+({active:'正在工作',idle:'空闲',notLoaded:'未加载',systemError:'需处理'}[t.status]||'状态待同步')));
 const id=list.some(t=>t.id===selectedThread)?selectedThread:list[0]?.id||'';select.value=id;select.disabled=!list.length;pickThread(id);
}
async function loadCatalog(force=false){
 catalog=await api('/api/catalog'+(force?'?refresh=1':''));
 $('#projectSummary').textContent=catalog.projects.length+' 个工程 · '+catalog.threads.length+' 个会话 · '+catalog.threads.filter(x=>x.status==='active').length+' 个正在工作';
 const p=$('#projectSelect');p.replaceChildren();
 for(const project of catalog.projects){const n=catalog.threads.filter(t=>t.projectId===project.id).length;p.append(option(project.id,project.label+' · '+n+' 个会话'));}
 if(!catalog.threads.some(t=>t.id===selectedThread))selectedThread=catalog.defaultThreadId;
 p.value=catalog.threads.find(t=>t.id===selectedThread)?.projectId||catalog.projects[0]?.id||'';drawThreads(p.value);
}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(path,options={},retried=false){
 const requestedEndpoint=endpoint;
 let r;try{r=await fetch(endpoint+path,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(30000),cache:'no-store'});}catch(e){
  if(!retried&&automatic){await updateEndpoint(true);if(endpoint!==requestedEndpoint&&(!options.method||options.method==='GET'))return api(path,options,true);}
  throw Error(e.name==='TimeoutError'?'电脑响应超时，正在等待恢复':'暂时无法连接电脑，正在自动查找最新地址；请确认电脑和连接服务正在运行');
 }
 if([502,503,504,530].includes(r.status)&&!retried&&automatic){await updateEndpoint(true);if(endpoint!==requestedEndpoint&&(!options.method||options.method==='GET'))return api(path,options,true);}
 if([502,503,504,530].includes(r.status))throw Error('外网隧道或电脑连接器不可用，请在电脑运行 start-console.ps1 -Restart 检查连接');
 let j;try{j=await r.json();}catch{throw Error('连接器未返回有效数据，请确认电脑连接地址');}
 if(!r.ok){if(r.status===401&&path!=='/api/login'){token='';store();showPair();}throw Error(j.error||'请求失败');}return j;
}
function showPair(){ $('#pairPanel').hidden=false;$('#workspace').hidden=true;$('#logoutBtn').hidden=true;$('#endpoint').value=endpoint;$('#connectionText').textContent='尚未配对';$('#dot').className='dot';}
function connected(){ $('#pairPanel').hidden=true;$('#workspace').hidden=false;$('#logoutBtn').hidden=false;}
function textEl(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;}
const clockText=value=>value?new Date(value).toLocaleString('zh-CN'):'暂无记录';
function duration(ms){if(!Number.isFinite(ms)||ms<0)return '暂无记录';const seconds=Math.floor(ms/1000);if(seconds<60)return seconds+'秒';if(seconds<3600)return Math.floor(seconds/60)+'分'+seconds%60+'秒';return Math.floor(seconds/3600)+'小时'+Math.floor(seconds%3600/60)+'分';}
function drawDetails(state,latency){
 const task=state.task||{},stats=task.stats||{},jobs=state.jobs||[];
 const elapsed=task.status==='inProgress'&&task.startedAt?Date.now()-Date.parse(task.startedAt):task.durationMs;
 $('#taskTiming').textContent=task.startedAt?'开始于 '+clockText(task.startedAt)+' · '+(task.status==='inProgress'?'已运行 ':'本轮耗时 ')+duration(elapsed):'等待任务时间信息';
 const attention=state.attention||[];$('#attention').hidden=!attention.length;$('#attention').textContent=attention.join('\n');
 $('#workStats').replaceChildren();
 for(const [label,value,problem] of [['操作',stats.total,false],['变更文件',stats.files,false],['进行中',stats.running,false],['操作异常',stats.failed,true]]){
  const el=textEl('div','work-stat'+(problem&&value?' problem':''),'');el.append(textEl('strong','',value??'—'),textEl('span','',label));$('#workStats').append(el);
 }
 $('#taskRequest').textContent=task.request||'当前读取范围内没有任务要求';
 $('#lastReplyText').textContent=state.lastReply?.text||'当前读取范围内暂无完成回复';$('#lastReplyTime').textContent=state.lastReply?.turnStartedAt?'（该轮开始于 '+clockText(state.lastReply.turnStartedAt)+'）':'';
 const operations=task.operations||[],labels={inProgress:'进行中',completed:'已结束',failed:'异常',declined:'未批准',recorded:'已记录',unknown:'状态未知'};
 $('#operations').replaceChildren();$('#operationCount').textContent=stats.total?stats.total+' 次操作，展示最近 '+operations.length+' 条':'';
 for(const op of operations){const status=op.exitCode!==null&&op.exitCode!==undefined&&op.exitCode!==0?'异常（退出码 '+op.exitCode+'）':labels[op.status]||'状态未知';$('#operations').append(textEl('li',status.startsWith('异常')?'error':'',op.label+' · '+status+(Number.isFinite(op.durationMs)?' · '+duration(op.durationMs):'')));}
 if(!operations.length)$('#operations').append(textEl('li','muted','本轮暂无可展示的工作记录'));
 $('#changedFiles').replaceChildren();$('#fileCount').textContent=stats.files?stats.files+' 个文件':'';
 for(const file of task.files||[]){const kind={add:'新增',create:'新增',delete:'删除',update:'修改',move:'移动'}[file.kind]||'变更';$('#changedFiles').append(textEl('li','',kind+' · '+file.path+(file.status==='failed'?'（操作异常）':'')));}
 if(!(task.files||[]).length)$('#changedFiles').append(textEl('li','muted','本轮暂无文件变更记录'));
 $('#connectionDetails').textContent=state.connector?'接口响应 '+latency+'毫秒 · 连接器已运行 '+duration(state.connector.uptimeSeconds*1000)+'\n会话更新于 '+clockText(state.thread?.updatedAt)+(state.connector.sessionExpiresAt?'\n此设备配对有效至 '+clockText(state.connector.sessionExpiresAt):''):'等待连接信息';
 $('#queueSummary').textContent=jobs.length?'手机发送记录：'+jobs.filter(x=>x.state==='queued').length+' 条排队 · '+jobs.filter(x=>x.state==='accepted').length+' 条已接收 · '+jobs.filter(x=>['failed','uncertain'].includes(x.state)).length+' 条需核对':'当前会话暂无手机发送记录';
}
function drawMessages(messages){
 currentMessages=messages;
 const mode=$('#messageFilter').value||'all',query=($('#messageSearch').value||'').trim().toLowerCase(),total=messages.length;
 messages=messages.filter(x=>(mode==='all'||(mode==='progress'?x.phase==='commentary':x.role==='user'||['final','final_answer'].includes(x.phase)))&&(!query||x.text.toLowerCase().includes(query)));
 const signature=mode+query+messages.map(x=>x.id+':'+x.text).join('|');if(signature===rendered)return;rendered=signature;
 const box=$('#messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90||!box.children.length;
 const oldScroll=box.scrollTop;box.replaceChildren();
 for(const m of messages){const el=textEl('article','message '+m.role+' '+m.phase,'');el.append(textEl('div','who',m.role==='user'?'你 / 任务输入':m.phase==='commentary'?'CODEX / 进度更新':'CODEX / 回复'));el.append(textEl('div','bubble',m.text));box.append(el);}
 if(!messages.length)box.append(textEl('p','empty',total?'没有匹配的对话，请调整筛选或搜索':'当前会话暂无消息'));
 if(nearBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=oldScroll;
 $('#messageCount').textContent='显示 '+messages.length+' / '+total+' 条';
}
function drawJobs(jobs){
 const box=$('#jobs');box.replaceChildren();$('#queueCount').textContent=jobs.filter(x=>x.state==='queued').length;
 const labels={queued:'排队中',sending:'正在发送',accepted:'桌面已接收',failed:'发送失败',uncertain:'需要核对',cancelled:'已取消'};
 for(const j of [...jobs].reverse().slice(0,10)){
   const el=textEl('article','job',''),top=textEl('div','job-head','');top.append(textEl('small','',j.kind==='task'?'安排任务':'提问 / 补充'));top.append(textEl('span','badge '+(['queued','uncertain','failed'].includes(j.state)?'warn':'neutral'),labels[j.state]||j.state));el.append(top,textEl('p','',j.text),textEl('small','',new Date(j.createdAt).toLocaleString('zh-CN')));
   if(j.error)el.append(textEl('p','error',j.error));
   if(j.state==='accepted')el.append(textEl('p','muted','已接收不等于已完成，执行结果见对话。'));
   if(j.state==='queued'){const b=textEl('button','text-btn','取消排队');b.onclick=async()=>{try{await api('/api/messages/'+encodeURIComponent(j.id),{method:'DELETE'});await refresh();}catch(e){toast(e.message);}};el.append(b);}
   box.append(el);
 }
 if(!jobs.length)box.append(textEl('p','empty','暂无手机发送记录'));
}
async function refresh(){
 if(updating||loadingCatalog)return;
 await updateEndpoint();
 if(!token||updating||loadingCatalog)return;
 if(!catalog){
  loadingCatalog=true;
  try{await loadCatalog();}catch(e){$('#dot').className='dot offline';$('#connectionText').textContent='连接中断';$('#activity').textContent=e.message;$('#syncTime').textContent='正在自动重试连接';}
  finally{loadingCatalog=false;}
  if(!catalog||!token)return;
 }
 if(!selectedThread)return;updating=true;const requested=selectedThread;
 try{
   const started=Date.now();
   const j=await api('/api/state?threadId='+encodeURIComponent(requested));if(requested!==selectedThread)return;connected();$('#dot').className='dot '+(j.connected?'online':'offline');$('#connectionText').textContent=j.connected?'电脑已连接':'桌面连接异常';
   $('#syncTime').textContent=j.syncedAt?'最近同步 '+new Date(j.syncedAt).toLocaleTimeString('zh-CN'):'等待首次同步';
   const t=j.thread||{};$('#status').textContent=t.statusLabel||'未连接';$('#status').className='badge '+(t.status==='active'?'':'neutral');$('#taskTitle').textContent=t.title||'当前桌面任务';$('#activity').textContent=j.error||j.activity||'等待任务';
   drawMessages(j.messages||[]);drawJobs(j.jobs||[]);
   drawDetails(j,Date.now()-started);$('#historyHint').textContent='已加载最近 '+(j.history?.turns??'若干')+' 轮对话'+(j.history?.hasMore?'，更早内容请在电脑查看':'')+'；支持筛选和搜索。';
 }catch(e){if(requested===selectedThread){$('#dot').className='dot offline';$('#connectionText').textContent='连接中断';$('#syncTime').textContent='保留上次内容；联网后自动重试';$('#activity').textContent=e.message;}}
 finally{updating=false;if(requested!==selectedThread&&selectedThread)refresh();}
}
$('#pairForm').onsubmit=async e=>{
 e.preventDefault();$('#pairError').textContent='';const b=e.submitter;b.disabled=true;
 try{
  await updateEndpoint(true);
  if(!$('#endpoint').value.trim())throw Error('尚未获取到电脑地址，请确认电脑连接服务已启动，稍后重试');
  const u=new URL($('#endpoint').value.trim());if(u.protocol!=='https:'&&!(u.hostname==='127.0.0.1'&&u.protocol==='http:'))throw Error('外网连接地址必须使用HTTPS');if(u.username||u.password||u.search||u.hash)throw Error('连接地址不能包含密码或查询参数');endpoint=u.origin;
  const result=await api('/api/login',{method:'POST',body:JSON.stringify({code:$('#pairCode').value})});token=result.token;store();$('#pairCode').value='';connected();await loadCatalog();await refresh();toast('配对成功，已连接桌面');
 }catch(e){$('#pairError').textContent=e.message;}finally{b.disabled=false;}
};
$('#sendForm').onsubmit=async e=>{
 e.preventDefault();const text=$('#prompt').value.trim(),kind=$('input[name=kind]:checked').value;if(!text)return;
 if(!selectedThread)return;const target=selectedThread;const signature=target+'\n'+kind+'\n'+text;if(!retryRequest||retryRequest.signature!==signature)retryRequest={signature,id:crypto.randomUUID()};
 $('#sendBtn').disabled=true;$('#sendResult').textContent='正在发送…';
 $('#projectSelect').disabled=true;$('#threadSelect').disabled=true;$('#catalogBtn').disabled=true;
 try{const j=await api('/api/messages',{method:'POST',body:JSON.stringify({text,kind,threadId:target,requestId:retryRequest.id})});if(target===selectedThread){$('#sendResult').textContent=j.note||'已记录，请查看发送记录';$('#prompt').value='';retryRequest=null;}await refresh();}
 catch(e){$('#sendResult').textContent=e.message+'。重试会沿用同一请求标识，避免重复发送。';}
 finally{$('#sendBtn').disabled=!selectedThread;$('#projectSelect').disabled=false;$('#threadSelect').disabled=!selectedThread;$('#catalogBtn').disabled=false;}
};
document.querySelectorAll('input[name=kind]').forEach(el=>el.onchange=()=>{$('#sendHint').textContent=el.value==='task'?'桌面忙碌时先排队，空闲后自动发送到当前会话。':'发送到当前会话，忙碌时也可补充问题。';$('#prompt').placeholder=el.value==='task'?'例如：完成当前工作后，继续定位独立铷钟下的坏帧。':'例如：目前坏帧定位到哪一步了？';});
$('#settingsBtn').onclick=()=>{$('#pairPanel').hidden=!$('#pairPanel').hidden;$('#endpoint').value=endpoint;};
$('#refreshBtn').onclick=refresh;$('#bottomBtn').onclick=()=>$('#messages').scrollTop=$('#messages').scrollHeight;
$('#logoutBtn').onclick=async()=>{try{await api('/api/logout',{method:'POST'});}catch{}token='';store();showPair();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
$('#autoEndpoint').checked=automatic;
$('#endpoint').readOnly=automatic;
$('#endpoint').required=!automatic;
$('#autoEndpoint').onchange=async()=>{automatic=$('#autoEndpoint').checked;discovery.endpoint=endpoint;discovery.updatedAt=discoveryAt;$('#endpoint').readOnly=automatic;$('#endpoint').required=!automatic;store();if(automatic)await updateEndpoint(true);$('#discoveryHint').textContent=automatic?'自动查找电脑地址，无需手动修改':'手动填写电脑连接地址';};
await updateEndpoint(true);
$('#projectSelect').onchange=()=>drawThreads($('#projectSelect').value);
$('#threadSelect').onchange=()=>pickThread($('#threadSelect').value);
$('#catalogBtn').onclick=async()=>{try{await loadCatalog(true);}catch(e){toast(e.message);}};
$('#messageFilter').onchange=()=>{rendered='';drawMessages(currentMessages);};
$('#messageSearch').oninput=()=>{rendered='';drawMessages(currentMessages);};
window.addEventListener('online',()=>refresh());
$('#endpoint').value=endpoint;if(token){connected();await refresh();}else showPair();
setInterval(()=>{if(!document.hidden)refresh();},4000);
