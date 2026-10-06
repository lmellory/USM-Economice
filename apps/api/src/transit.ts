export type TransitStatus = {available:boolean; source:string; checkedAt:string; note:string; route:null; estimateMinutes:number; liveVehicleCount?:number};
/** Adapter boundary: Tranzy is an evolving beta API; never infer traffic or departures from positions alone. */
export async function getTransitStatus():Promise<TransitStatus>{
 const checkedAt=new Date().toISOString(); const key=process.env.TRANZY_API_KEY;
 if(!key)return {available:false,source:'Tranzy OpenData (не настроен)',checkedAt,note:'Ключ Tranzy не задан. Сейчас используется обычная оценка около 30 минут; реальные позиции, пересадки и пробки не подтверждены.',route:null,estimateMinutes:30};
 try {
  const response=await fetch(process.env.TRANZY_VEHICLES_URL||'https://api.tranzy.ai/v1/opendata/vehicle',{headers:{'X-Api-Key':key,'X-City':'chisinau'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const payload:any=await response.json(); const list=Array.isArray(payload)?payload:(payload.data??payload.vehicles??[]);
  return {available:true,source:'Tranzy OpenData (RTEC/PUA)',checkedAt,note:'Endpoint доступен. Время свежести позиций не подтверждено и они не используются для расчёта прибытия; пробки, маршрут и пересадки неизвестны.',route:null,estimateMinutes:30,liveVehicleCount:list.length};
 } catch { return {available:false,source:'Tranzy OpenData',checkedAt,note:'Живые данные сейчас недоступны или не прошли проверку. Используется приблизительная оценка около 30 минут.',route:null,estimateMinutes:30}; }
}
