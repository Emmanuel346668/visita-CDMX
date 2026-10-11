const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control':'no-store'}});
const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const text = (v, max) => typeof v === 'string' && v.length <= max;
export const validAuthor = v => text(v,60) && v.trim().length>0 && !/[\u0000-\u001f\u007f]/.test(v);
const timestamp = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
const attribution = s => (s.modifiedBy==null||validAuthor(s.modifiedBy)) && (s.modifiedAt==null||timestamp(s.modifiedAt));
export function validPlan(v) {
  return v && Array.isArray(v.stops) && v.stops.length <= 250 &&
    v.stops.every(s => s && text(s.id,100) && s.id.length && Number.isInteger(s.day) && s.day>=0 && s.day<=2 && time(s.time) && Number.isFinite(s.duration) && s.duration>=5 && s.duration<=600 && Number.isFinite(s.wait) && s.wait>=0 && s.wait<=180 && typeof s.fixed==='boolean' && (s.suggestedBy==null||text(s.suggestedBy,60)) && attribution(s) && (text(s.place,120)||text(s.name,120)) && (s.name==null||text(s.name,120)) && (s.notes==null||text(s.notes,1800)) && (s.video==null||text(s.video,2048)&&(!s.video||/^https?:\/\//.test(s.video))) && (s.lat==null||Number.isFinite(s.lat)&&Math.abs(s.lat)<=90) && (s.lng==null||Number.isFinite(s.lng)&&Math.abs(s.lng)<=180)) &&
    new Set(v.stops.map(s=>s.id)).size===v.stops.length && ['walk','car','bus','mixed'].includes(v.transport) && time(v.arrival) && time(v.departure) && text(v.meeting,220);
}

// The server derives attribution from the actual changes, not from incoming labels.
export function attributePlanChanges(previous, incoming, author, now) {
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
