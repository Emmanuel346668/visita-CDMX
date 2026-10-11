'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const mins=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);
const clock=n=>{n=Math.max(0,Math.min(1439,Math.round(n)));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const key='entre-calles-cdmx-v1';let state={contentVersion:2,stops:structuredClone(initialStops),transport:'mixed',arrival:'07:00',departure:'16:30',meeting:'Primera sección de Chapultepec · punto exacto por confirmar'};
let day=0,view='plan',filter='Todos',editId=null,map=null,mapLayer=null,toastTimer;
function validState(v){return v&&Array.isArray(v.stops)&&v.stops.length<=250&&v.stops.every(s=>s&&typeof s.id==='string'&&s.id.length<100&&Number.isInteger(s.day)&&s.day>=0&&s.day<=2&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)&&Number.isFinite(s.duration)&&s.duration>=5&&s.duration<=600&&Number.isFinite(s.wait)&&s.wait>=0&&s.wait<=180&&typeof s.fixed==='boolean'&&(s.suggestedBy==null||typeof s.suggestedBy==='string'&&s.suggestedBy.length<=60)&&(places.some(p=>p.id===s.place)||typeof s.name==='string')&&(s.lat==null||Number.isFinite(s.lat)&&Math.abs(s.lat)<=90)&&(s.lng==null||Number.isFinite(s.lng)&&Math.abs(s.lng)<=180))&&new Set(v.stops.map(s=>s.id)).size===v.stops.length&&['walk','car','bus','mixed'].includes(v.transport)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.arrival)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.departure)&&typeof v.meeting==='string'}
try{const v=JSON.parse(localStorage.getItem(key));if(validState(v))state=v}catch{}
if(upgradeItinerary(state)){try{localStorage.setItem(key,JSON.stringify(state))}catch{}}
let planScope='personal',personalState=state;
function save(){if(planScope==='group'){saveShared();return}personalState=state;try{localStorage.setItem(key,JSON.stringify(state));$('#save-state').textContent='● Cambios guardados en este navegador'}catch{$('#save-state').textContent='No se pudo guardar: descarga una copia'}}
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500)}
function placeOf(s){const p=places.find(p=>p.id===s.place)||{name:s.name,zone:'Personalizado',category:'Tu parada',tip:'Parada personalizada. Confirma ubicación y disponibilidad.',hours:'Horario no verificado.'};return {...p,...s,name:s.name||p.name,lat:s.lat??p.lat,lng:s.lng??p.lng}}
function located(p){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)}
function distance(a,b){if(!located(a)||!located(b))return null;const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function travel(a,b){const d=distance(a,b);if(d==null)return null;if(d<.03)return {km:d,min:0,mode:'Mismo punto'};const mode=state.transport==='mixed'?(d<1.7?'walk':'car'):state.transport;const t=mode==='walk'?d*1.25/4.2*60:mode==='car'?d*1.35/16*60+10:d*1.4/12*60+15;return {km:d,min:Math.ceil(t),mode:{walk:'A pie',car:'Auto / taxi',bus:'Camión / transporte'}[mode]}}
function dayStops(){return state.stops.filter(s=>s.day===day)}
function locationUrl(p){return located(p)?`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`:(p.url?.includes('maps')?safeUrl(p.url):`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' CDMX')}`)}
function warnings(list){const w=[];for(let i=0;i<list.length;i++){const s=list[i],p=placeOf(s),start=mins(s.time),end=start+s.duration+s.wait;const exterior=/exterior/i.test(s.notes||'');if(!exterior&&p.open!=null&&(start<p.open||end>(day===1?p.saturdayClose??p.close:p.close)))w.push(`${p.name}: el bloque queda fuera del horario de referencia (${clock(p.open)}–${clock(day===1?p.saturdayClose??p.close:p.close)}).`);if(p.onlyDay!=null&&p.onlyDay!==day)w.push(`${p.name}: la actividad de referencia funciona el domingo.`);if(i){const prev=list[i-1],t=travel(placeOf(prev),p),free=start-(mins(prev.time)+prev.duration+prev.wait);if(free<0)w.push(`${p.name}: se superpone ${Math.abs(free)} min con la parada anterior.`);else if(t&&free<t.min)w.push(`${p.name}: hay ${free} min entre visitas; el traslado estimado necesita ${t.min} min.`)}if(day===2&&s.place!=='hotel'&&!/Salida a AGS/.test(s.notes||'')&&end>mins(state.departure))w.push(`${p.name}: termina después de la hora de salida a AGS.`);if(end>1440)w.push(`${p.name}: el bloque pasa de medianoche.`)}if(day===0&&list.length&&mins(list[0].time)<mins(state.arrival))w.push('Hay una parada anterior a la llegada del viernes.');if(day===2){const free=list.filter(s=>!s.fixed);const last=free.at(-1);if(last&&mins(last.time)+last.duration+last.wait>mins(state.departure)-45)w.push('El último recorrido deja menos de 45 min antes de salir a AGS; revisar reunión, equipaje y punto del camión.')}return [...new Set(w)]}
function render(){const info=dayInfo[day],list=dayStops();$('#day-title').textContent=info.title;$('#day-description').textContent=info.description;$('#day-tip').textContent=info.tip;$('#transport').value=state.transport;$('#return-time').textContent=state.departure+' → AGS';$('#meeting-note').textContent=state.meeting;$$('.day').forEach(b=>{b.classList.toggle('active',+b.dataset.day===day);b.setAttribute('aria-selected',String(+b.dataset.day===day))});const w=warnings(list);$('#warnings').innerHTML=w.length?`<details class="warning"><summary>${w.length} ajuste${w.length>1?'s':''} por revisar · ver detalles</summary>${w.map(t=>`<div>• ${esc(t)}</div>`).join('')}</details>`:'';$('#timeline').innerHTML=list.map((s,i)=>{const p=placeOf(s),t=i?travel(placeOf(list[i-1]),p):null,prev=list[i-1],next=list[i+1];return `${i?`<div class="leg">↳ ${t?`${t.mode} · ~${t.min} min · ${t.km.toFixed(1)} km en línea recta`:'Ubicación pendiente · traslado sin estimar'}</div>`:''}<article class="stop ${s.fixed?'fixed':''}" data-stop="${esc(s.id)}"><span class="stop-number">${i+1}</span><div><div class="stop-top"><span class="time">${s.time} — ${clock(mins(s.time)+s.duration+s.wait)} · ${s.duration} min${s.wait?` + ${s.wait} de margen`:''}</span>${s.fixed?'<span class="fixed-label">▣ AGENDA DEL GRUPO</span>':''}</div><h4>${esc(p.name)}</h4>${suggestionCredit(s)}<p>${esc(s.notes||p.zone)}</p><div class="stop-actions"><button data-action="edit">Editar</button><button data-action="detail">Ver lugar ↗</button><a href="${esc(locationUrl(p))}" target="_blank" rel="noopener">Mapa</a><button class="move" data-action="up" aria-label="Subir ${esc(p.name)}" ${s.fixed||!prev||prev.fixed?'disabled':''}>↑</button><button class="move" data-action="down" aria-label="Bajar ${esc(p.name)}" ${s.fixed||!next||next.fixed?'disabled':''}>↓</button></div></div></article>`}).join('');renderMap(list);if(typeof renderProgress==='function')renderProgress();if(typeof syncGroupEditing==='function')syncGroupEditing()}
function initMap(){
 if(!window.L){$('#map-fallback').textContent='No se pudo cargar el visor. Revisa la conexión o abre las ubicaciones en Google Maps.';$('#map-fallback').hidden=false;return}
 map=L.map('map',{scrollWheelZoom:false}).setView([19.426,-99.158],12);
 mapLayer=L.layerGroup().addTo(map);
 if(window.location.protocol==='file:'){
  $('#map-fallback').innerHTML='<strong>Modo archivo: se muestra solo el croquis.</strong> Para cargar las calles, abre <a href="http://127.0.0.1:8765/" target="_blank" rel="noopener">la versión web local ↗</a>. Si no está disponible, ejecuta Abrir-CDMX.cmd del paquete completo.';
  $('#map-fallback').hidden=false;
  return;
 }
 let errors=0;
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
 tiles.on('tileerror',()=>{if(++errors>=4){map.removeLayer(tiles);$('#map-fallback').textContent='El proveedor no pudo cargar las calles. El croquis y las paradas siguen disponibles; abre las rutas reales en Google Maps.';$('#map-fallback').hidden=false}}).addTo(map);
}
function renderMap(list){if(!map)return;map.invalidateSize({pan:false});mapLayer.clearLayers();const points=[];list.forEach((s,i)=>{const p=placeOf(s);if(!located(p))return;points.push([p.lat,p.lng]);const marker=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'map-marker '+(s.fixed?'anchor':''),html:String(i+1),iconSize:[32,32],iconAnchor:[16,16]})});marker.bindPopup(`<strong>${esc(p.name)}</strong><br>${esc(s.time)} · ${esc(s.duration)} min${s.suggestedBy?'<br>Sugerido por '+esc(s.suggestedBy):''}${s.modifiedBy?'<br>Modificado por '+esc(s.modifiedBy):''}<br><a href="${esc(locationUrl(p))}" target="_blank" rel="noopener">Abrir ubicación ↗</a>`).addTo(mapLayer)});if(points.length>1)L.polyline(points,{color:'#d85936',weight:3,dashArray:'6 8',opacity:.8}).addTo(mapLayer);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15});setTimeout(()=>{map.invalidateSize({pan:false});if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15})},120)}
function setView(v){
 if(v==='plan'||v==='group')selectScope(v==='group'?'group':'personal');
 view=v;$('#plan-view').hidden=!['plan','group'].includes(v);$('#discover-view').hidden=v!=='discover';$('#guide-view').hidden=v!=='guide';
 $$('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-current',b.dataset.view===v?'page':'false')});
 if(v==='discover')renderPlaces();if(v==='plan'||v==='group')render();
}
function showDetails(id,stopId){const raw=places.find(p=>p.id===id),s=state.stops.find(s=>s.id===stopId),p=s?placeOf(s):raw;if(!p)return;$('#details-content').innerHTML=`<div class="dialog-top"><div><span class="eyebrow">${esc(p.zone)} · ${esc(p.category)}</span><h2>${esc(p.name)}</h2></div><button class="close" aria-label="Cerrar">×</button></div>${placeImage(p,true)}<div class="detail-body">${s?suggestionCredit(s):suggestionCredit(p)}${placeHistory(p)}<h4>Horario de referencia</h4><p>${esc(p.hours)}</p><h4>Para disfrutarlo mejor</h4><p>${esc(p.tip)}</p><h4>Tiempo & espera</h4><p>Visita propuesta: ${p.duration} min. Fila / espera real: desconocida. El margen del plan se puede editar.</p>${s?.notes?`<h4>Tu nota</h4><p>${esc(s.notes)}</p>`:''}<a class="source" href="${esc(safeUrl(p.url)||locationUrl(p))}" target="_blank" rel="noopener">${p.url?.includes('maps')?'Enlace del documento / ubicación':'Consultar fuente / sitio oficial'} ↗</a>${safeUrl(s?.video)?`<p><a href="${esc(safeUrl(s.video))}" target="_blank" rel="noopener">Tu video o referencia ↗</a></p>`:''}<div class="actions">${s?`<button class="primary" data-detail-edit="${esc(s.id)}">Editar esta parada</button><a class="outline" href="${esc(googleCalendar(s))}" target="_blank" rel="noopener">Añadir a Google Calendar ↗</a>`:`<button class="primary" data-detail-add="${esc(p.id)}">Añadir al ${['viernes','sábado','domingo'][day]}</button>`}</div></div>`;$('#details').showModal()}
function renderPlaces(){const q=$('#search').value.toLocaleLowerCase('es');const filtered=places.filter(p=>!['hotel','onu','cu'].includes(p.id)&&((filter==='Todos')||(filter==='Comida'?p.category==='Comida':filter==='Otros'?['Carso','Naucalpan','Roma','Reforma','Lomas'].includes(p.zone):p.zone===filter))&&`${p.name} ${p.zone} ${p.category}`.toLocaleLowerCase('es').includes(q));$('#place-grid').innerHTML=filtered.length?filtered.map(p=>`<article class="place-card">${placeImage(p)}<div class="place-card-body"><span class="category">${esc(p.zone)} · ${esc(p.category)}</span><h3>${esc(p.name)}</h3>${suggestionCredit(p)}${p.historyTitle?`<p class="history-teaser">${esc(p.historyTitle)}</p>`:''}<p>${esc(p.tip)}</p><div class="actions"><button class="primary" data-place-add="${esc(p.id)}">＋ ${['Viernes','Sábado','Domingo'][day]}</button><button class="text-button" data-place-detail="${esc(p.id)}">Horario & detalles ↗</button></div></div></article>`).join(''):'<p>No hay lugares con ese filtro. Prueba otra zona o búsqueda.</p>';if(typeof syncGroupEditing==='function')syncGroupEditing()}
function openEditor(id,placeId){if(!requireGroupEditor())return;if(planScope==='group'&&!shared){toast('Primero crea o abre un grupo en la versión publicada.');return}editId=id;const f=$('#edit-form'),s=id?state.stops.find(s=>s.id===id):null,p=s?placeOf(s):places.find(p=>p.id===placeId);f.reset();f.dataset.place=s?.place||placeId||'';const list=dayStops(),last=list.at(-1);const vals={name:p?.name||'',suggestedBy:s?.suggestedBy||(!s?(planScope==='group'?groupEditorName:currentSuggestionAuthor()):''),day:s?.day??day,time:s?.time||(last?clock(mins(last.time)+last.duration+30):'10:00'),duration:s?.duration??p?.duration??60,wait:s?.wait??0,lat:p?.lat??'',lng:p?.lng??'',notes:s?.notes||'',video:s?.video||''};Object.entries(vals).forEach(([k,v])=>f.elements[k].value=v);f.elements.suggestedBy.required=!s;f.elements.suggestedBy.readOnly=planScope==='group';f.elements.suggestedBy.placeholder=planScope==='group'?'Autor por indicar':'Tu nombre';f.elements.suggestedBy.closest('label').querySelector('small').textContent=planScope==='group'?'Se asigna al sugerir la parada. Las ediciones posteriores conservan al autor original y muestran quién la modificó.':'Se conserva al editar la parada. En propuestas anteriores puedes completar quién la sugirió.';f.elements.fixed.checked=s?.fixed||false;$('#delete-stop').hidden=!s;$('#editor-title').textContent=s?'Editar parada':'Añadir una parada';$('#editor').showModal();resetPlacePicker()}
function swap(id,delta){if(!requireGroupEditor())return;const list=dayStops(),i=list.findIndex(s=>s.id===id),a=list[i],b=list[i+delta];if(!a||!b||a.fixed||b.fixed)return;const start=Math.min(mins(a.time),mins(b.time));[a.time,b.time]=[clock(start+(delta<0?0:b.duration+b.wait+(travel(placeOf(b),placeOf(a))?.min||0))),clock(start+(delta>0?0:a.duration+a.wait+(travel(placeOf(a),placeOf(b))?.min||0)))];const ai=state.stops.indexOf(a),bi=state.stops.indexOf(b);[state.stops[ai],state.stops[bi]]=[state.stops[bi],state.stops[ai]];save();render();}
function optimize(){if(!requireGroupEditor())return;let list=dayStops(),output=[],i=0;while(i<list.length){if(list[i].fixed||!located(placeOf(list[i]))){output.push(list[i++]);continue}const block=[];while(i<list.length&&!list[i].fixed&&located(placeOf(list[i])))block.push(list[i++]);let current=output.at(-1)?placeOf(output.at(-1)):placeOf(block[0]);let pending=[...block],sorted=[];while(pending.length){let best=0;let dBest=Infinity;pending.forEach((s,k)=>{const d=distance(current,placeOf(s));if(d!=null&&d<dBest){dBest=d;best=k}});const s=pending.splice(best,1)[0];sorted.push(s);current=placeOf(s)}let time=Math.min(...block.map(s=>mins(s.time)));sorted.forEach((s,k)=>{if(k)time+=travel(placeOf(sorted[k-1]),placeOf(s))?.min||15;s.time=clock(time);time+=s.duration+s.wait});output.push(...sorted)}let j=0;state.stops=state.stops.map(s=>s.day===day?output[j++]:s);save();render();toast('Paradas libres ordenadas por cercanía. Revisa horarios y márgenes.');}
function download(name,content,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function utcStamp(s,end=false){const t=mins(s.time)+(end?s.duration+s.wait:0),d=new Date(Date.UTC(2026,9,16+s.day,6,0)+t*60000);return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}
function googleCalendar(s){const p=placeOf(s),loc=located(p)?`${p.name} (${p.lat}, ${p.lng})`:p.name;const u=new URL('https://calendar.google.com/calendar/render');u.search=new URLSearchParams({action:'TEMPLATE',text:p.name,dates:`${utcStamp(s)}/${utcStamp(s,true)}`,details:`Plan tentativo CDMX. ${s.notes||''}\n${safeUrl(p.url)||''}`,location:loc,ctz:'America/Mexico_City'}).toString();return u.href}
function exportICS(){const e=v=>String(v??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VISITA CDMX//CDMX//ES','CALSCALE:GREGORIAN','X-WR-CALNAME:CDMX · 16–18 octubre'];state.stops.forEach(s=>{const p=placeOf(s);lines.push('BEGIN:VEVENT',`UID:${e(s.id)}-cdmx202610@entre-calles.local`,`DTSTAMP:${now}`,`DTSTART:${utcStamp(s)}`,`DTEND:${utcStamp(s,true)}`,`SUMMARY:${e(p.name)}`,`DESCRIPTION:${e('Plan tentativo. '+(s.notes||'')+' '+(safeUrl(p.url)||''))}`,`LOCATION:${e(p.name)}`,'STATUS:TENTATIVE','END:VEVENT')});lines.push('END:VCALENDAR');const folded=lines.flatMap(line=>{const result=[];let chunk='',size=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(size+n>73){result.push(chunk);chunk=' '+c;size=1+n}else{chunk+=c;size+=n}}result.push(chunk);return result});download('cdmx-16-18-octubre.ics',folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8');toast('Calendario exportado. Puedes importarlo en Google Calendar.');}
$$('.nav').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$$('.day').forEach(b=>b.addEventListener('click',()=>{day=+b.dataset.day;render()}));$$('.close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));$('#details').addEventListener('click',e=>{if(e.target.closest('.close'))$('#details').close();const edit=e.target.closest('[data-detail-edit]'),add=e.target.closest('[data-detail-add]');if(edit||add){$('#details').close();openEditor(edit?.dataset.detailEdit||null,add?.dataset.detailAdd)}});
$('#timeline').addEventListener('click',e=>{const b=e.target.closest('[data-action]'),card=e.target.closest('[data-stop]');if(!b||!card)return;const id=card.dataset.stop,s=state.stops.find(s=>s.id===id);if(b.dataset.action==='edit')openEditor(id);if(b.dataset.action==='detail')showDetails(s.place,id);if(b.dataset.action==='up')swap(id,-1);if(b.dataset.action==='down')swap(id,1)});
$('#place-grid').addEventListener('click',e=>{const a=e.target.closest('[data-place-add]'),d=e.target.closest('[data-place-detail]');if(a)openEditor(null,a.dataset.placeAdd);if(d)showDetails(d.dataset.placeDetail)});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;$$('#filters button').forEach(x=>x.classList.toggle('active',x===b));renderPlaces()});$('#search').addEventListener('input',renderPlaces);$('#discover-button').addEventListener('click',()=>setView('discover'));$('#add-stop').addEventListener('click',()=>openEditor(null));$('#transport').addEventListener('change',e=>{if(!requireGroupEditor()){e.target.value=state.transport;return}state.transport=e.target.value;save();render()});$('#optimize').addEventListener('click',optimize);$('#fit-map').addEventListener('click',()=>renderMap(dayStops()));
$('#edit-form').addEventListener('submit',e=>{e.preventDefault();if(!requireGroupEditor())return;const f=e.target,num=k=>f.elements[k].value===''?null:Number(f.elements[k].value);const values={suggestedBy:f.elements.suggestedBy.value.trim(),place:f.dataset.place||'',name:f.elements.name.value.trim(),day:+f.elements.day.value,time:f.elements.time.value,duration:num('duration'),wait:num('wait'),lat:num('lat'),lng:num('lng'),video:safeUrl(f.elements.video.value),notes:f.elements.notes.value,fixed:f.elements.fixed.checked};if(!values.name){toast('Escribe un nombre para la parada.');return}if(!editId&&!values.suggestedBy){toast('Escribe quién sugiere esta parada.');f.elements.suggestedBy.focus();return}let s=state.stops.find(s=>s.id===editId);if(s){const changedDay=s.day!==values.day;Object.assign(s,values);if(changedDay){state.stops=state.stops.filter(x=>x!==s);state.stops.push(s)}}else state.stops.push({id:crypto.randomUUID(),place:f.dataset.place,...values});state.stops=[0,1,2].flatMap(d=>state.stops.filter(s=>s.day===d).sort((a,b)=>mins(a.time)-mins(b.time)));day=values.day;if(s?.role==='departure')state.departure=s.time;if(s?.role==='arrival')state.arrival=s.time;if(s?.role==='meeting')state.meeting=s.notes;save();$('#editor').close();setView(planScope==='group'?'group':'plan');toast(values.lat!==null&&values.lng!==null?'Parada guardada. El mapa y los avisos están actualizados.':'Parada guardada sin ubicación. Elígela en Editar para verla en el mapa.');});
$('#delete-stop').addEventListener('click',()=>{if(!requireGroupEditor())return;state.stops=state.stops.filter(s=>s.id!==editId);save();$('#editor').close();render();toast('Parada quitada. Puedes volver a añadirla desde Sugerencias.');});
$('#backup').addEventListener('click',()=>download('mi-viaje-cdmx.json',JSON.stringify(state,null,2),'application/json'));$('#export-calendar').addEventListener('click',exportICS);$('#import-button').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!requireGroupEditor()){e.target.value='';return}if(planScope==='group'&&!shared){toast('Primero crea o abre un grupo.');e.target.value='';return}try{if(file.size>1000000)throw Error();const v=JSON.parse(await file.text());if(!validState(v))throw Error();upgradeItinerary(v);if(!requireGroupEditor()){e.target.value='';return}state=v;save();setView(planScope==='group'?'group':'plan');toast('Copia cargada. Tu plan está actualizado.')}catch{toast('No se pudo cargar: elige una copia válida de este sitio.')}e.target.value=''});
$('#map-route').addEventListener('click',()=>{const points=dayStops().map(placeOf).filter(located).filter((p,i,arr)=>i===0||distance(arr[i-1],p)>.03);if(points.length<2){toast('Se necesitan al menos dos ubicaciones.');return}const mode=state.transport==='walk'?'walking':state.transport==='bus'?'transit':'driving';const chunks=[];for(let i=0;i<points.length-1;i+=4){const part=points.slice(i,i+5),u=new URL('https://www.google.com/maps/dir/');u.search=new URLSearchParams({api:'1',origin:`${part[0].lat},${part[0].lng}`,destination:`${part.at(-1).lat},${part.at(-1).lng}`,waypoints:part.slice(1,-1).map(p=>`${p.lat},${p.lng}`).join('|'),travelmode:mode}).toString();chunks.push({url:u.href,part})}$('#details-content').innerHTML=`<div class="dialog-top"><div><span class="eyebrow">RUTAS PARA SEGUIR EN LA CALLE</span><h2>El recorrido del ${['viernes','sábado','domingo'][day]}</h2></div><button class="close" aria-label="Cerrar">×</button></div><div class="detail-body"><p>Abre los tramos en orden. Google Maps calculará calles y tráfico. En transporte público puede omitir paradas intermedias: usa cada ubicación del itinerario para buscar el siguiente traslado.</p>${chunks.map((c,i)=>`<p><a class="primary" href="${esc(c.url)}" target="_blank" rel="noopener">Abrir tramo ${i+1} ↗</a></p><p>${c.part.map(p=>esc(p.name)).join(' → ')}</p>`).join('')}<p>Ubicaciones sin coordenadas quedan fuera de estos tramos. Para caminar o ir en auto, cambia el modo en el plan o directamente en Google Maps.</p></div>`;$('#details').showModal()});
$('#settings-button').addEventListener('click',()=>{if(!requireGroupEditor())return;const f=$('#settings-form');['arrival','departure','meeting'].forEach(k=>f.elements[k].value=state[k]);$('#settings').showModal()});$('#settings-form').addEventListener('submit',e=>{e.preventDefault();if(!requireGroupEditor())return;const f=e.target;['arrival','departure','meeting'].forEach(k=>state[k]=f.elements[k].value);const arrival=state.stops.find(s=>s.role==='arrival');if(arrival)arrival.time=state.arrival;const depart=state.stops.find(s=>s.role==='departure');if(depart){depart.time=state.departure;depart.notes='Salida a AGS a las '+state.departure+'. Ubicación exacta del camión pendiente del organizador; marcador de referencia de zona.'}const meet=state.stops.find(s=>s.role==='meeting');if(meet){meet.time=clock(mins(state.departure)-30);meet.notes=state.meeting}save();$('#settings').close();render();toast('Horarios actualizados. Revisa los avisos del itinerario.');});
window.addEventListener('resize',()=>{if(view==='plan'||view==='group')renderMap(dayStops())});
initMap();render();

// Search runs only on an explicit click. Coordinates remain compatible with
// existing personal backups and shared plans, but visitors never need to type them.
let resetPlacePicker=()=>{};
(()=>{
 const form=$('#edit-form'),editor=$('#editor');
 const panel=document.createElement('section');
 panel.className='full place-picker';panel.setAttribute('aria-label','Ubicación de la parada');
 panel.innerHTML=`<strong>¿Dónde queda?</strong><p>Busca el nombre o la dirección, o elige un punto en el mapa.</p>
 <label for="place-query">Nombre o dirección en CDMX y alrededores</label>
 <div class="place-search-row"><input id="place-query" maxlength="180" placeholder="Ej. Salón Tenampa o Plaza Garibaldi 12" autocomplete="off"><button type="button" class="primary" id="place-search">Buscar lugar</button></div>
 <div id="place-results" aria-label="Resultados de lugares"></div>
 <p id="place-status" role="status" aria-live="polite"></p>
 <div class="actions"><button type="button" class="outline" id="place-map-toggle">Elegir en el mapa</button><button type="button" class="text-button" id="place-clear" hidden>Quitar ubicación</button></div>
 <div id="place-map-wrap" hidden><p>Acerca el mapa y toca el lugar. También puedes mover el mapa y usar su centro.</p><div id="place-picker-map" role="region" aria-label="Elegir ubicación de la parada"></div><button type="button" class="outline" id="place-map-center">Usar centro del mapa</button></div>
 <small>Búsqueda: <a href="https://photon.komoot.io/" target="_blank" rel="noopener">Photon</a> · datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>. Revisa el punto antes de guardar.</small>`;
 form.elements.name.closest('label').after(panel);
 // Keep the original fields for compatibility; the picker fills them internally.
 for(const key of ['lat','lng'])form.elements[key].closest('label').hidden=true;
 const note=form.querySelector(':scope > p.muted');
 if(note)note.textContent='Elige una ubicación para que la parada aparezca en el croquis y al ordenar por cercanía. El margen de espera es tu reserva de tiempo; no predice la fila.';
 const style=document.createElement('style');
 style.textContent=`.place-picker{padding:16px;background:#edf1e8;border:1px solid #ccd8c4;border-radius:9px;min-width:0}.place-picker>strong{font-size:15px}.place-picker p{font-size:12px;line-height:1.6;margin:8px 0}.place-picker>label{font-size:11px}.place-picker small{font-size:10px;line-height:1.6;display:block;margin-top:12px}.place-picker a{text-decoration:underline}.place-search-row{display:flex;gap:8px;align-items:stretch;margin-top:6px}.place-search-row input{min-width:0;flex:1;width:100%;margin:0}.place-search-row button{white-space:nowrap;padding:10px 12px}.place-picker .actions{flex-wrap:wrap;gap:10px;margin-top:12px}#place-results{display:grid;gap:7px;margin-top:10px}#place-results button{display:block;width:100%;text-align:left;padding:10px 12px;background:#fffef9;border:1px solid #c5d2bc;border-radius:6px}#place-results strong,#place-results span{display:block}#place-results span{font-size:11px;color:#526354;margin-top:4px;line-height:1.5}#place-status{color:#315c3a;font-weight:600}#place-picker-map{height:240px;width:100%;border-radius:7px;cursor:crosshair}#place-map-center{margin-top:10px}.place-picker-pin{width:22px!important;height:22px!important;background:#d85936;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px #0006}.place-picker button:disabled{opacity:.55;cursor:wait}@media(max-width:520px){.place-search-row{flex-direction:column}.place-picker{padding:12px}#place-picker-map{height:215px}}`;
 document.head.append(style);
 const query=$('#place-query'),searchButton=$('#place-search'),results=$('#place-results'),status=$('#place-status'),wrap=$('#place-map-wrap'),clear=$('#place-clear');
 const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
 const catalog=[...places.filter(located).map(p=>({name:p.name,address:p.zone||'Lista del viaje',lat:p.lat,lng:p.lng})),{name:'Salón Tenampa',address:'Plaza Garibaldi 12, Centro, Ciudad de México',lat:19.4410361,lng:-99.13895}];
 const cache=new Map();
 let pickerMap=null,pin=null,request=null,generation=0,lastSearch=0;
 const hasPoint=()=>form.elements.lat.value!==''&&form.elements.lng.value!==''&&Number.isFinite(+form.elements.lat.value)&&Number.isFinite(+form.elements.lng.value);
 function setPin(lat,lng){
  if(!pickerMap)return;
  if(pin)pin.setLatLng([lat,lng]);
  else pin=L.marker([lat,lng],{draggable:true,icon:L.divIcon({className:'place-picker-pin',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(pickerMap).on('dragend',()=>{const p=pin.getLatLng();choose(p.lat,p.lng,'Punto ajustado en el mapa')});
 }
 function showMap(){
  if(!window.L){status.textContent='No se pudo cargar el mapa. Revisa tu conexión y vuelve a abrir esta parada.';return false}
  wrap.hidden=false;
  if(!pickerMap){
   pickerMap=L.map('place-picker-map',{scrollWheelZoom:false}).setView([19.433,-99.145],13);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(pickerMap);
   pickerMap.on('click',e=>choose(e.latlng.lat,e.latlng.lng,'Punto elegido en el mapa'));
  }
  pickerMap.invalidateSize({pan:false});
  if(hasPoint()){setPin(+form.elements.lat.value,+form.elements.lng.value);pickerMap.setView([+form.elements.lat.value,+form.elements.lng.value],17)}
  return true;
 }
 function choose(lat,lng,label){
  form.elements.lat.value=String(lat);form.elements.lng.value=String(lng);
  status.textContent='✓ '+label+'. Guarda los cambios para añadirlo al recorrido.';clear.hidden=false;
  setPin(lat,lng);
 }
 function showResults(items){
  results.replaceChildren();
  for(const item of items){
   const button=document.createElement('button');button.type='button';
   const name=document.createElement('strong'),address=document.createElement('span');
   name.textContent=item.name;address.textContent=item.address||'CDMX y alrededores';button.append(name,address);
   button.addEventListener('click',()=>{
    if(!form.elements.name.value.trim())form.elements.name.value=item.name;
    choose(item.lat,item.lng,item.name);results.replaceChildren();showMap();
   });results.append(button);
  }
  status.textContent=items.length?'Elige el resultado correcto para marcarlo en el mapa.':'No encontramos ese lugar. Prueba con su dirección o usa «Elegir en el mapa».';
 }
 async function searchPlaces(){
  const text=query.value.trim()||form.elements.name.value.trim();query.value=text;
  if(text.length<3){status.textContent='Escribe al menos tres letras del nombre o de la dirección.';query.focus();return}
  cancelSearch();const version=generation;
  const words=normalize(text).split(/\s+/),local=catalog.filter(p=>words.every(w=>normalize(p.name+' '+p.address).includes(w))).slice(0,6);
  if(local.length){showResults(local);return}
  const cacheKey=normalize(text);
  if(cache.has(cacheKey)){showResults(cache.get(cacheKey));return}
  if(Date.now()-lastSearch<1500){status.textContent='Espera un momento antes de buscar otra vez.';return}
  lastSearch=Date.now();request=new AbortController();const controller=request;
  const timeout=setTimeout(()=>controller.abort(),12000);
  searchButton.disabled=true;results.replaceChildren();status.textContent='Buscando en CDMX y alrededores…';
  try{
   const url=new URL(window.CDMX_PLACE_SEARCH_URL||'https://photon.komoot.io/api/');
   url.search=new URLSearchParams({q:text,limit:'6',lat:'19.433',lon:'-99.145',bbox:'-99.7,18.9,-98.6,19.9'}).toString();
   const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
   if(!response.ok)throw Error('search');
   const data=await response.json();
   const items=(Array.isArray(data.features)?data.features:[]).flatMap(feature=>{
    const c=feature?.geometry?.coordinates,p=feature?.properties;
    if(feature?.geometry?.type!=='Point'||!Array.isArray(c)||!p||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<-99.7||c[0]>-98.6||c[1]<18.9||c[1]>19.9)return [];
    return [{name:String(p.name||p.street||text),address:[p.street,p.housenumber,p.district,p.city,p.state].filter(Boolean).join(', '),lat:c[1],lng:c[0]}];
   }).slice(0,6);
   if(version!==generation||!editor.open)return;
   if(cache.size>=30)cache.delete(cache.keys().next().value);cache.set(cacheKey,items);showResults(items);
  }catch(error){if(version===generation&&editor.open)status.textContent='La búsqueda no está disponible ahora. Puedes elegir el punto directamente en el mapa.'}
  finally{clearTimeout(timeout);if(version===generation)searchButton.disabled=false}
 }
 function cancelSearch(){generation++;request?.abort();request=null;searchButton.disabled=false}
 resetPlacePicker=()=>{
  cancelSearch();query.value=form.elements.name.value;results.replaceChildren();wrap.hidden=true;
  if(pin){pin.remove();pin=null}
  if(pickerMap)pickerMap.setView([19.433,-99.145],13);
  clear.hidden=!hasPoint();status.textContent=hasPoint()?'✓ Esta parada ya tiene ubicación. Puedes revisarla en el mapa.':'Ubicación pendiente: busca el lugar o marca un punto en el mapa.';
 };
 query.addEventListener('input',()=>{cancelSearch();results.replaceChildren()});
 query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlaces()}});
 searchButton.addEventListener('click',searchPlaces);
 $('#place-map-toggle').addEventListener('click',showMap);
 $('#place-map-center').addEventListener('click',()=>{if(pickerMap){const point=pickerMap.getCenter();choose(point.lat,point.lng,'Centro del mapa elegido')}});
 clear.addEventListener('click',()=>{form.elements.lat.value='';form.elements.lng.value='';form.dataset.place='';if(pin){pin.remove();pin=null}clear.hidden=true;status.textContent='Ubicación quitada. Esta parada no aparecerá en el mapa hasta que elijas otro punto.'});
 editor.addEventListener('close',cancelSearch);
})();

function currentSuggestionAuthor(){
 const alias=$('#group-alias')?.value.trim();
 if(alias)return alias.slice(0,60);
 try{return (localStorage.getItem('visita-cdmx-editor-name-v1')||'').slice(0,60)}catch{return ''}
}
function suggestionCredit(item){
 const name=typeof item.suggestedBy==='string'?item.suggestedBy.trim():'';
 const suggestion=name?`<span class="suggestion-credit">Sugerido por <strong>${esc(name)}</strong></span>`:!item.fixed?'<span class="suggestion-credit pending">Autor original por indicar</span>':'';const edit=item.modifiedBy?`<span class="suggestion-credit modified-credit">Modificado por <strong>${esc(item.modifiedBy)}</strong></span>`:'';return suggestion+edit;
}
function placeImage(p,detail=false){
 if(!p.photo)return '';
 const credit=p.photoCredit;
 return `<figure class="place-media${detail?' detail-media':''}"><img class="${detail?'detail-photo':'place-card-image'}" src="${esc(safeUrl(p.photo)||p.photo)}" alt="${esc(p.photoCaption||p.name)}" loading="lazy" decoding="async"><figcaption>${esc(p.photoCaption||p.name)}${credit?`<br><a href="${esc(safeUrl(credit.source))}" target="_blank" rel="noopener">${esc(credit.author)} · ${esc(credit.license)}</a>${credit.licenseUrl?` · <a href="${esc(safeUrl(credit.licenseUrl))}" target="_blank" rel="noopener">Licencia</a>`:''}`:''}</figcaption></figure>`;
}
function placeHistory(p){
 if(!p.history)return '';
 return `<aside class="place-history"><h4>${esc(p.historyTitle||'Historia del lugar')}</h4><p>${esc(p.history)}</p><div class="history-sources">${(p.historySources||[]).map(s=>`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</div></aside>`;
}
(()=>{
 const form=$('#edit-form'),label=document.createElement('label');label.className='full';
 label.innerHTML='Sugerido por<input name="suggestedBy" maxlength="60" placeholder="Tu nombre" autocomplete="nickname"><small>Se conserva al editar la parada. En propuestas anteriores puedes completar quién la sugirió.</small>';
 form.elements.name.closest('label').after(label);
 form.addEventListener('submit',()=>{const name=form.elements.suggestedBy.value.trim();if(name&&!editId&&planScope!=='group'){try{localStorage.setItem('visita-cdmx-editor-name-v1',name)}catch{}}});
 $('#group-alias')?.addEventListener('change',e=>{try{localStorage.setItem('visita-cdmx-editor-name-v1',e.target.value.trim().slice(0,60))}catch{}});
 document.addEventListener('error',e=>{
  if(!(e.target instanceof HTMLImageElement)||!e.target.closest('.place-media')||e.target.dataset.fallback)return;
  e.target.dataset.fallback='true';e.target.src='assets/lugares/referencia.svg';
  e.target.closest('figure').querySelector('figcaption').textContent='Ilustración de referencia · imagen temporalmente no disponible';
 },true);
})();

function attributePlanChanges(previous, incoming, author, now) {
  const result=structuredClone(incoming), before=new Map((previous?.stops||[]).map(s=>[s.id,s]));
  const afterIds=new Set(result.stops.map(s=>s.id));
  const oldOrder=(previous?.stops||[]).filter(s=>afterIds.has(s.id)).map(s=>s.id);
  const newOrder=result.stops.filter(s=>before.has(s.id)).map(s=>s.id);
  const fields=['place','name','day','time','duration','wait','fixed','notes','video','lat','lng','role'];
  const added=[],changed=[],removed=(previous?.stops||[]).filter(s=>!afterIds.has(s.id));
  for(const s of result.stops){
    const old=before.get(s.id);
    if(!old){s.suggestedBy=previous?author:(s.suggestedBy?.trim()||author);delete s.modifiedBy;delete s.modifiedAt;added.push(s);continue}
    for(const key of ['suggestedBy','modifiedBy','modifiedAt']){delete s[key];if(old[key]!=null)s[key]=old[key]}
    const edited=fields.some(key=>JSON.stringify(old[key]??null)!==JSON.stringify(s[key]??null))||oldOrder.indexOf(s.id)!==newOrder.indexOf(s.id);
    if(edited){s.modifiedBy=author;s.modifiedAt=now;changed.push(s)}
  }
  const name=s=>s.name||s.place||'una parada';
  let message;
  if(!previous)message='creó el plan del grupo';
  else if(added.length===1&&!changed.length&&!removed.length)message='sugirió “'+name(added[0])+'”';
  else if(removed.length===1&&!added.length&&!changed.length)message='quitó “'+name(removed[0])+'”';
  else if(changed.length===1&&!added.length&&!removed.length)message='modificó “'+name(changed[0])+'”';
  else if(added.length||removed.length||changed.length)message='actualizó el itinerario ('+[added.length?'añadió '+added.length:null,changed.length?'modificó '+changed.length:null,removed.length?'quitó '+removed.length:null].filter(Boolean).join(', ')+')';
  else if(['transport','arrival','departure','meeting'].some(k=>previous[k]!==result[k]))message='actualizó los ajustes del viaje';
  if(message)result.lastChange={author,message,at:now};
  else if(previous?.lastChange)result.lastChange=structuredClone(previous.lastChange);
  else delete result.lastChange;
  return result;
}
