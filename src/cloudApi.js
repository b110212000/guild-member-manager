export const CLOUD_CONFIG = {
  apiBase: String(import.meta.env.VITE_FEV_API_BASE_URL || '').replace(/\/+$/,''),
  clientId: String(import.meta.env.VITE_FEV_GOOGLE_CLIENT_ID || '')
};
export const CLOUD_CONFIGURED = Boolean(CLOUD_CONFIG.apiBase && CLOUD_CONFIG.clientId);
export class CloudError extends Error {
  constructor(message,status){super(message);this.status=status;}
}
export async function apiRequest(token,path,options={}){
  const res=await fetch(CLOUD_CONFIG.apiBase + path,{
    method:options.method||'GET',
    headers:{Authorization:'Bearer '+token,
      ...(options.body?{'Content-Type':'application/json'}:{})},
    ...(options.body?{body:JSON.stringify(options.body)}:{})
  });
  let data;
  try{data=await res.json();}catch{throw new CloudError('伺服器回應格式錯誤，請稍後再試',res.status);}
  if(!res.ok)throw new CloudError(data.error||'Google Sheets 同步失敗',res.status);
  return data;
}
export function formatSyncTime(date){
  return date?new Date(date).toLocaleString('zh-TW'):'尚未同步';
}
export function createDisplayRows(lines,games,group,query,filter='all'){
  const lineById=new Map(lines.map(line=>[line.id,line]));
  const linkedIds=new Set(games.map(game=>game.lineId).filter(Boolean));
  const virtual=lines.filter(line=>!linkedIds.has(line.id)).map(line=>({
    id:'line-only:'+line.id,kind:'line',group:'無遊戲團',lineId:line.id,
    lineName:line.lineName,gameId:'',team:'',accountType:'',updatedAt:line.updatedAt
  }));
  const regular=games.map(game=>({
    ...game,kind:'game',lineName:lineById.get(game.lineId)?.lineName||''
  }));
  const q=String(query||'').trim().toLocaleLowerCase();
  return [...regular,...virtual].filter(row=>{
    if(group!=='全部團別'&&row.group!==group)return false;
    const paired=row.kind==='game'&&Boolean(row.lineId)&&Boolean(row.lineName);
    if(filter==='paired'&&!paired)return false;
    if(filter==='game-unpaired'&&!(row.kind==='game'&&!paired))return false;
    if(filter==='line-only'&&row.kind!=='line')return false;
    return !q||[row.gameId,row.lineName,row.group,row.team].some(x=>String(x||'').toLocaleLowerCase().includes(q));
  });
}
