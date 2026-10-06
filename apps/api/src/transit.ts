export type TransitStatus = {available:boolean; source:string; checkedAt:string; note:string; route:null; estimateMinutes:number; liveVehicleCount?:number; trolleyCount?:number; busCount?:number; routesSummary?:string};
/** Adapter boundary: Tranzy is an evolving beta API; never infer traffic or departures from positions alone. */
export async function getTransitStatus():Promise<TransitStatus>{
 const checkedAt=new Date().toISOString(); const key=process.env.TRANZY_API_KEY;
 if(!key)return {available:false,source:'Tranzy OpenData (не настроен)',checkedAt,note:'Ключ Tranzy не задан. Сейчас используется обычная оценка около 30 минут; реальные позиции, пересадки и пробки не подтверждены.',route:null,estimateMinutes:30};
 try {
  let vehiclesUrl=(process.env.TRANZY_VEHICLES_URL||'https://api.tranzy.ai/v1/opendata/vehicles').trim();
  if(vehiclesUrl.endsWith('/v1/opendata/vehicle'))vehiclesUrl=vehiclesUrl.replace(/\/v1\/opendata\/vehicle$/,'/v1/opendata/vehicles');
  let agencyId=process.env.TRANZY_AGENCY_ID?.trim();
  let agencyName='';
  if(!agencyId){
   const baseUrl=vehiclesUrl.replace(/\/vehicles(?:\?.*)?$/,'');
   const agencyRes=await fetch(`${baseUrl}/agency`,{headers:{'X-API-KEY':key},signal:AbortSignal.timeout(6000)});
   if(!agencyRes.ok){
    const detail=(await agencyRes.text()).replaceAll(key,'[скрыто]').replace(/[\r\n\t ]+/g,' ').trim().slice(0,300);
    let reason=`HTTP ${agencyRes.status}`;
    if(agencyRes.status===403)reason='HTTP 403 (доступ запрещён: неверный TRANZY_API_KEY)';
    else if(agencyRes.status===429)reason='HTTP 429 (превышен лимит запросов к Tranzy)';
    return {available:false,source:'Tranzy OpenData',checkedAt,note:`Tranzy /agency ответил ${reason}${detail?`: ${detail}`:''}. Используется оценка около 30 минут.`,route:null,estimateMinutes:30};
   }
   const agencies:any=await agencyRes.json();
   const list=Array.isArray(agencies)?agencies:[];
   const matched=list.find((a:any)=>String(a.agency_timezone||'').toLowerCase().includes('chisinau')||/chisinau|chișinău|rtec|pua/i.test(String(a.agency_name||'')))||list[0];
   if(matched){agencyId=String(matched.agency_id);agencyName=matched.agency_name?` (${matched.agency_name})`:'';}
  }
  const headers:Record<string,string>={'X-API-KEY':key};
  if(agencyId)headers['X-Agency-Id']=agencyId;
  const response=await fetch(vehiclesUrl,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   const detail=(await response.text()).replaceAll(key,'[скрыто]').replace(/[\r\n\t ]+/g,' ').trim().slice(0,300);
   let reason=`HTTP ${response.status}`;
   if(response.status===403)reason='HTTP 403 (доступ запрещён: неверный ключ или не указан X-Agency-Id)';
   else if(response.status===404)reason='HTTP 404 (маршрут не найден: проверь URL)';
   else if(response.status===429)reason='HTTP 429 (превышен лимит запросов к Tranzy)';
   return {available:false,source:'Tranzy OpenData',checkedAt,note:`Tranzy ответил ${reason}${detail?`: ${detail}`:''}. Используется оценка около 30 минут.`,route:null,estimateMinutes:30};
  }
  const payload:any=await response.json(); const list=Array.isArray(payload)?payload:(payload.data??payload.vehicles??[]);
  const trolleyCount=list.filter((v:any)=>v.vehicle_type===11).length;
  const busCount=list.filter((v:any)=>v.vehicle_type===3).length;
  const routesSummary=JSON.stringify({trolleyCount,busCount,centralRoutes:['2','3','7','10','12','24','46'],ismailRoutes:['1','4','8','17','22','30']});
  return {available:true,source:`Tranzy OpenData${agencyName}`,checkedAt,note:'Данные RTEC/PUA поступают в реальном времени.',route:null,estimateMinutes:30,liveVehicleCount:list.length,trolleyCount,busCount,routesSummary};
 } catch { return {available:false,source:'Tranzy OpenData',checkedAt,note:'Живые данные сейчас недоступны или не прошли проверку. Используется приблизительная оценка около 30 минут.',route:null,estimateMinutes:30}; }
}
