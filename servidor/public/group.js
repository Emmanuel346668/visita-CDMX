'use strict';
let shared=null,groupPlan=null,sharedDirty=0,sharedSaving=false,sharedConflict=false,sharedTimer,serviceReady=false,signedIn=false;
const groupKey='visita-cdmx-group-v1';
const groupEditorKey='visita-cdmx-group-editor-v1';let groupEditorName='',sharedDraftAuthor='';
try{const name=localStorage.getItem(groupEditorKey);if(validGroupEditorName(name))groupEditorName=name.trim()}catch{}
let groupLink=null;
try{groupLink=JSON.parse(localStorage.getItem(groupKey))}catch{}
async function groupRequest(path,method='GET',body){
 const headers=body?{'Content-Type':'application/json'}:{};
 if(groupLink?.invite)headers.Authorization='Bearer '+groupLink.invite;
 const base=(window.CDMX_GROUP_SERVER||'').replace(/\/$/,'');
 const response=await fetch(base+path,{method,credentials:'omit',cache:'no-store',headers,body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json()}catch{throw Error('El plan compartido necesita la versión publicada con guardado en línea.')}
 if(!response.ok){const error=Error(data.error||'No se pudo conectar.');error.status=response.status;error.data=data;throw error}return data;
}
function groupStatus(message){$('#group-status').textContent=message;if(planScope==='group')$('#save-state').textContent=message}
function persistGroupLink(){try{localStorage.setItem(groupKey,JSON.stringify(groupLink))}catch{}}
function rememberDraft(){if(!shared||!groupPlan)return;try{localStorage.setItem('visita-cdmx-draft-'+shared.id,JSON.stringify({revision:shared.revision,plan:groupPlan,author:sharedDraftAuthor}))}catch{}}
function dropDraft(){try{localStorage.removeItem('visita-cdmx-draft-'+shared.id)}catch{}}
function selectScope(scope){
 if(planScope==='personal')personalState=state;else if(groupPlan)groupPlan=state;
 planScope=scope;state=scope==='personal'?personalState:(groupPlan||structuredClone(personalState));
 $('#group-panel').hidden=scope!=='group';$('#plan-content').hidden=scope==='group'&&!shared;
 $('.progress-card').hidden=scope==='group'&&!shared;$('#backup').disabled=scope==='group'&&!shared;
 $('#settings-button').disabled=scope==='group'&&!shared;
 $('#backup').textContent=scope==='group'?'↓ Guardar copia del grupo':'↓ Guardar mi viaje';
 $('#plan-heading').textContent=scope==='group'?'El plan de todos':'Mi plan, a mi ritmo';
 $('#save-state').textContent=scope==='group'?$('#group-status').textContent:'● Mi plan se guarda en este navegador';
 renderProgress();syncGroupEditing();
}
function acceptShared(data){
 shared=data;sharedDraftAuthor='';groupPlan=structuredClone(data.plan);const adjusted=upgradeItinerary(groupPlan);sharedDirty=0;sharedConflict=false;$('#group-conflict').hidden=true;
 $('#group-title').textContent=data.title;$('#copy-group-link').hidden=false;$('#copy-group-plan').hidden=false;$('#group-setup').hidden=true;$('#group-connected').hidden=false;
 if(planScope==='group'){state=groupPlan;$('#plan-content').hidden=false;$('.progress-card').hidden=false;$('#backup').disabled=false;$('#settings-button').disabled=false;render()}
 groupStatus('● Al día · '+data.updatedBy+' · '+new Date(data.updatedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'}));
 syncGroupEditing();if(adjusted){sharedDirty=1;try{if(!localStorage.getItem('visita-cdmx-draft-'+shared.id))rememberDraft()}catch{}groupStatus('Actualizando CU como sugerencia opcional…');clearTimeout(sharedTimer);sharedTimer=setTimeout(flushShared,500)}
}
function saveShared(){
 if(!requireGroupEditor())return;sharedDraftAuthor=groupEditorName;groupPlan=attributePlanChanges(shared.plan,state,groupEditorName,new Date().toISOString());state=groupPlan;sharedDirty++;rememberDraft();groupStatus('● Cambios pendientes de guardar…');
 clearTimeout(sharedTimer);sharedTimer=setTimeout(flushShared,500);
}
async function flushShared(){
 if(!shared||!sharedDirty||sharedSaving||sharedConflict)return;
 if(!groupEditorName){groupStatus('Agrega tu nombre para guardar los cambios del grupo.');return}if(!sharedDraftAuthor)sharedDraftAuthor=groupEditorName;
 sharedSaving=true;const version=sharedDirty,plan=structuredClone(groupPlan),id=shared.id,revision=shared.revision;
 groupStatus('● Guardando para todos…');
 try{
  const data=await groupRequest('/api/groups/'+id,'PUT',{plan,revision,author:sharedDraftAuthor});
  shared.revision=data.revision;shared.updatedAt=data.updatedAt;shared.updatedBy=data.updatedBy;shared.plan=structuredClone(data.plan);
  if(version===sharedDirty){sharedDirty=0;sharedDraftAuthor='';groupPlan=structuredClone(data.plan);if(planScope==='group'){state=groupPlan;render()}dropDraft();groupStatus('● Guardado para todos · '+data.updatedBy)}else{rememberDraft();groupStatus('● Guardando tus últimos cambios…')}syncGroupEditing();
 }catch(error){
  if(error.status===409){sharedConflict=true;$('#group-conflict').hidden=false;groupStatus('Otro amigo cambió el plan. Tu borrador está protegido en este dispositivo.')}
  else groupStatus('Sin conexión al guardado. Tu borrador está en este dispositivo; reintentaremos.');
 }finally{sharedSaving=false;syncGroupEditing();if(sharedDirty&&!sharedConflict)sharedTimer=setTimeout(flushShared,4000)}
}
async function refreshShared(){
 if(!shared||sharedDirty||sharedSaving||sharedConflict||document.hidden||$('#editor').open||$('#settings').open)return;
 try{const data=await groupRequest('/api/groups/'+shared.id);if(sharedDirty||sharedSaving||sharedConflict||$('#editor').open||$('#settings').open)return;if(data.revision!==shared.revision)acceptShared(data);else groupStatus('● Al día · '+data.updatedBy)}catch{groupStatus('No se pudo actualizar. Reintentaremos cuando vuelva la conexión.')}
}
function restoreDraft(){
 try{const draft=JSON.parse(localStorage.getItem('visita-cdmx-draft-'+shared.id));if(draft&&validState(draft.plan)){
  groupPlan=draft.plan;sharedDraftAuthor=validGroupEditorName(draft.author)?draft.author.trim():'';upgradeItinerary(groupPlan);sharedDirty=1;sharedConflict=draft.revision!==shared.revision;
  if(planScope==='group'){state=groupPlan;render()}
  if(sharedConflict){$('#group-conflict').hidden=false;groupStatus('Hay un borrador tuyo y cambios nuevos del grupo. Revisa ambas versiones.')}else{groupStatus('Recuperamos tu borrador; guardando…');flushShared()}
 }}catch{}
}
function shareUrl(){if(!groupLink?.id||!groupLink.invite)return '';const url=new URL(location.href);url.search='';url.hash=new URLSearchParams({grupo:groupLink.id,invitacion:groupLink.invite}).toString();return url.href}
async function enterGroup(){
 if(!groupLink?.id)return;
 if(!groupLink.invite){groupStatus('Abre la invitación original del grupo para volver a entrar.');return}
 groupStatus('Conectando con el grupo…');
 try{let data;if(groupLink.invite)data=await groupRequest('/api/groups/'+groupLink.id+'/join','POST',{invite:groupLink.invite});else data=await groupRequest('/api/groups/'+groupLink.id);
  acceptShared(data);restoreDraft();history.replaceState(null,'','#grupo='+groupLink.id);
 }catch(error){groupStatus(error.message);$('#group-retry').hidden=false}
}
async function initShared(){
 const fragment=new URLSearchParams(location.hash.slice(1));
 if(fragment.get('grupo')&&fragment.get('invitacion')){groupLink={id:fragment.get('grupo'),invite:fragment.get('invitacion')};persistGroupLink()}
 if(location.hash.startsWith('#grupo'))setView('group');
 if(location.protocol==='file:'){groupStatus('Esta copia es personal. El plan del grupo estará disponible cuando se publique el sitio.');return}
 try{const service=await groupRequest('/api/collaboration');serviceReady=service.available;signedIn=service.access==='invitation'||service.signedIn;
  if(!serviceReady)throw Error('El guardado compartido todavía no está disponible.');
  if(!signedIn){groupStatus('Abre la invitación original del grupo.');return}
  $('#group-alias').value=groupEditorName;syncGroupEditing();
  groupStatus('Crea el grupo una vez y comparte su invitación. Todos podrán editar.');if(groupLink?.id)await enterGroup();
 }catch(error){groupStatus(error.message)}
}
function renderProgress(){
 const now=new Date(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value])),date=p.year+'-'+p.month+'-'+p.day,t=Number(p.hour)*60+Number(p.minute),all=[...state.stops].sort((a,b)=>a.day-b.day||mins(a.time)-mins(b.time));
 const dateOf=s=>'2026-10-'+(16+s.day),current=all.find(s=>dateOf(s)===date&&mins(s.time)<=t&&mins(s.time)+s.duration+s.wait>t),next=all.find(s=>dateOf(s)>date||dateOf(s)===date&&mins(s.time)>t);
 $('#progress-now').textContent=current?placeOf(current).name:(date<'2026-10-16'?'El viaje está por comenzar':date>'2026-10-18'?'Viaje terminado':'Tiempo entre visitas');
 $('#progress-next').textContent=next?`${['Vie 16','Sáb 17','Dom 18'][next.day]} · ${next.time} · ${placeOf(next).name}`:'No hay más visitas programadas';
 $('#progress-caption').textContent=planScope==='group'?'Según el plan del grupo · hora de CDMX':'Según mi plan · hora de CDMX';
}
$('#create-group').addEventListener('click',async()=>{
 if(!requireGroupEditor(true))return;
 const title=$('#new-group-name').value.trim();if(!title){toast('Dale un nombre al grupo.');return}
 $('#create-group').disabled=true;
 try{const data=await groupRequest('/api/groups','POST',{title,plan:structuredClone(personalState),author:groupEditorName});groupLink={id:data.id,invite:data.invite};persistGroupLink();acceptShared(data);history.replaceState(null,'','#grupo='+data.id);toast('Grupo creado. Copia la invitación para tus amigos.')}
 catch(error){groupStatus(error.message)}finally{$('#create-group').disabled=!serviceReady||!signedIn||!groupEditorName}
});
$('#copy-group-link').addEventListener('click',async()=>{const url=shareUrl();if(!url){toast('Usa la invitación original para compartir este grupo.');return}try{await navigator.clipboard.writeText(url);toast('Invitación copiada. Envíala por WhatsApp; permite entrar y editar el grupo.')}catch{$('#share-link').value=url;$('#share-dialog').showModal();$('#share-link').select()}});
$('#group-retry').addEventListener('click',enterGroup);
$('#group-draft').addEventListener('click',()=>download('mi-borrador-del-grupo-cdmx.json',JSON.stringify(groupPlan,null,2),'application/json'));
$('#group-latest').addEventListener('click',async()=>{try{const data=await groupRequest('/api/groups/'+shared.id);$('#compare-plan').textContent=data.plan.stops.map(s=>`${['Vie','Sáb','Dom'][s.day]} ${s.time} · ${placeOf(s).name}${s.notes?' — '+s.notes:''}`).join('\n');$('#compare-dialog').showModal()}catch(error){toast(error.message)}});
$('#accept-group-latest').addEventListener('click',async()=>{try{const data=await groupRequest('/api/groups/'+shared.id);download('mi-borrador-del-grupo-cdmx.json',JSON.stringify(groupPlan,null,2),'application/json');dropDraft();acceptShared(data);$('#compare-dialog').close();toast('Borrador descargado. Ahora ves el plan más reciente del grupo.')}catch(error){toast(error.message)}});
$('#copy-group-plan').addEventListener('click',()=>{if(!shared)return;personalState=structuredClone(groupPlan);try{localStorage.setItem(key,JSON.stringify(personalState));toast('Copiaste el grupo a Mi plan. Los cambios personales seguirán separados.')}catch{toast('No se pudo guardar la copia personal.')}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShared()});
$('#group-alias').value=groupEditorName;
$('#group-alias').addEventListener('input',()=>{if($('#group-alias').value.trim()!==groupEditorName){groupEditorName='';try{localStorage.removeItem(groupEditorKey)}catch{}}syncGroupEditing()});
$('#confirm-group-name').addEventListener('click',confirmGroupEditor);
syncGroupEditing();
setInterval(refreshShared,5000);setInterval(renderProgress,30000);initShared();renderProgress();

function validGroupEditorName(value){return typeof value==='string'&&value.length<=60&&value.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(value)}
function requireGroupEditor(creating=false){
 if(planScope!=='group'&&!creating)return true;
 if(!creating&&!shared){toast('Primero crea o abre un grupo.');return false}
 if(groupEditorName)return true;
 for(const id of ['#details','#editor','#settings'])if($(id).open)$(id).close();
 setView('group');$('#group-alias').focus();toast('Agrega tu nombre y pulsa «Usar mi nombre» para editar.');return false;
}
function confirmGroupEditor(){
 const name=$('#group-alias').value.trim();
 if(!validGroupEditorName(name)){toast('Escribe tu nombre (hasta 60 caracteres).');$('#group-alias').focus();return}
 groupEditorName=name;$('#group-alias').value=name;
 try{localStorage.setItem(groupEditorKey,name);localStorage.setItem('visita-cdmx-editor-name-v1',name)}catch{}
 syncGroupEditing();if(sharedDirty&&!sharedConflict)flushShared();toast('Listo, editas como '+name+'.');
}
function syncGroupEditing(){
 const locked=planScope==='group'&&(!groupEditorName||!shared);
 const selector='#add-stop,#optimize,#transport,#import-button,#timeline [data-action="edit"],#timeline [data-action="up"],#timeline [data-action="down"],[data-place-add],[data-detail-add],[data-detail-edit],#delete-stop,#edit-form button[type="submit"],#settings-form button[type="submit"]';
 for(const el of $$(selector)){
  if(locked){if(!el.hasAttribute('data-name-locked'))el.dataset.nameLocked=String(el.disabled);el.disabled=true}
  else if(!locked&&el.hasAttribute('data-name-locked')){el.disabled=el.dataset.nameLocked==='true';delete el.dataset.nameLocked}
 }
 $('#group-identity-status').textContent=groupEditorName?'Editas como '+groupEditorName+'. Tus propuestas y cambios llevarán tu nombre.':'Puedes ver el plan. Agrega tu nombre y pulsa «Usar mi nombre» para editar o sugerir paradas.';
 $('#settings-button').disabled=locked;
 const savingIdentity=!!groupEditorName&&(!!sharedDirty||sharedSaving)&&!sharedConflict;
 $('#group-alias').disabled=savingIdentity;$('#confirm-group-name').disabled=savingIdentity;
 $('#create-group').disabled=!serviceReady||!signedIn||!groupEditorName;
 const change=shared?.plan?.lastChange;
 $('#group-activity').hidden=!change;
 $('#group-activity').textContent=change?'Último cambio: '+change.author+' '+change.message+'.':'';
}
