const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control':'no-store'}});
const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const text = (v, max) => typeof v === 'string' && v.length <= max;
export function validPlan(v) {
  return v && Array.isArray(v.stops) && v.stops.length <= 250 &&
    v.stops.every(s => s && text(s.id,100) && s.id.length && Number.isInteger(s.day) && s.day>=0 && s.day<=2 && time(s.time) && Number.isFinite(s.duration) && s.duration>=5 && s.duration<=600 && Number.isFinite(s.wait) && s.wait>=0 && s.wait<=180 && typeof s.fixed==='boolean' && (s.suggestedBy==null||text(s.suggestedBy,60)) && (text(s.place,120)||text(s.name,120)) && (s.name==null||text(s.name,120)) && (s.notes==null||text(s.notes,1800)) && (s.video==null||text(s.video,2048)&&(!s.video||/^https?:\/\//.test(s.video))) && (s.lat==null||Number.isFinite(s.lat)&&Math.abs(s.lat)<=90) && (s.lng==null||Number.isFinite(s.lng)&&Math.abs(s.lng)<=180)) &&
    new Set(v.stops.map(s=>s.id)).size===v.stops.length && ['walk','car','bus','mixed'].includes(v.transport) && time(v.arrival) && time(v.departure) && text(v.meeting,220);
}
