import {
  DataError,must,readLines,readGames,validateLine,validateGame,
  publicLine,publicGame,rosterSummary
} from './model.js';
import { verifyAdmin } from './auth.js';
import { googleStore } from './google.js';

const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}
});
const methodList='GET, POST, PUT, DELETE, OPTIONS';
function corsFor(req,env){
  const origin=req.headers.get('Origin');
  const allowed=String(env.ALLOWED_ORIGIN||'').trim();
  must(allowed,'ALLOWED_ORIGIN 尚未設定',503);
  if(origin && origin!==allowed)throw new DataError('此來源不可使用 FEV API',403);
  return origin?{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':methodList,
    'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'3600','Vary':'Origin'}:{};
}
async function bodyJson(req){
  must((req.headers.get('Content-Type')||'').includes('application/json'),'Content-Type 必須是 application/json',415);
  const text=await req.text();
  must(text.length<=12000,'資料過長',413);
  try {
    const data=JSON.parse(text);
    must(data&&typeof data==='object'&&!Array.isArray(data),'資料必須是 JSON 物件');
    return data;
  } catch(error){
    if(error instanceof DataError)throw error;
    throw new DataError('JSON 格式錯誤');
  }
}
const current=async(store)=>{
  const [l,g]=await Promise.all([store.read('line'),store.read('game')]);
  return {lines:readLines(l),games:readGames(g)};
};
const versionCheck=(current,input)=>{
  must(typeof input.expectedUpdatedAt==='string' && input.expectedUpdatedAt,'缺少資料版本，請重新整理後操作',428);
  must(current.updatedAt===input.expectedUpdatedAt,'資料已被其他管理員更新，請重新整理再修改',409);
};
async function mutate(req,path,actor,store){
  const parts=path.split('/').filter(Boolean);
  const plural=parts[1],id=parts[2]||'';
  must(['lines','games'].includes(plural)&&parts.length<=3,'路徑不存在',404);
  const type=plural==='lines'?'line':'game';
  const isCreate=req.method==='POST',isUpdate=req.method==='PUT',isDelete=req.method==='DELETE';
  must(isCreate||isUpdate||isDelete,'不支援此方法',405);
  must(isCreate?!id:!!id,'請提供有效資料 ID',400);
  const input=await bodyJson(req);
  const {lines,games}=await current(store);
  const rows=type==='line'?lines:games;
  const before=id?rows.find(x=>x.id===id):null;
  if(!isCreate)must(before,'找不到此筆資料',404);
  if(before)versionCheck(before,input);
  if(isDelete&&type==='line'){
    must(!games.some(g=>g.lineId===id),'此 LINE 成員仍被遊戲角色使用，請先解除配對',409);
  }
  const timestamp=new Date().toISOString();
  const after=isDelete?{...before,deletedAt:timestamp,updatedAt:timestamp,updatedBy:actor.email}:
    {...(before||{}),...(type==='line'
      ?validateLine(input,lines,id)
      :validateGame(input,games,lines,id)),
      id:before?.id||crypto.randomUUID(),
      updatedAt:timestamp,updatedBy:actor.email,deletedAt:''};
  // Fail closed if the private Audit worksheet is missing.
  await store.checkAudit();
  await store.write(type,after,before?.rowIndex||null);
  let auditWarning=false;
  try{
    await store.audit({
      at:timestamp,actor:actor.email,action:isCreate?'create':isUpdate?'update':'delete',
      entity:type,id:after.id,
      before:before?type==='line'?publicLine(before):publicGame(before):null,
      after:isDelete?null:type==='line'?publicLine(after):publicGame(after)
    });
  }catch(error){
    // The write may have succeeded; communicate this explicitly instead of retrying automatically.
    auditWarning=true;
    console.error('FEV audit append failed:',error?.message||'unknown');
  }
  return json({record:isDelete?null:(type==='line'?publicLine(after):publicGame(after)),auditWarning},isCreate?201:200);
}

export function createApp({authenticate=verifyAdmin,makeStore=googleStore}={}){
  return {
    async fetch(req,env){
      let cors={};
      try{
        cors=corsFor(req,env);
        const pathname=new URL(req.url).pathname;
        if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
        if(pathname==='/health' && req.method==='GET')return json({ok:true,service:'FEV Roster API'},200,cors);
        must(pathname.startsWith('/api/'),'路徑不存在',404);
        const actor=await authenticate(req,env);
        const store=makeStore(env);
        if(pathname==='/api/bootstrap'&&req.method==='GET'){
          await store.checkAudit();
          const {lines,games}=await current(store);
          return json({actor:actor.email,lines:lines.map(publicLine),games:games.map(publicGame),
            summary:rosterSummary(lines,games),syncedAt:new Date().toISOString()},200,cors);
        }
        if(pathname==='/api/audit'&&req.method==='GET'){
          return json({entries:await store.auditRead(30)},200,cors);
        }
        const response=await mutate(req,pathname,actor,store);
        // Include CORS headers even for successful updates and deletes.
        const headers=new Headers(response.headers);
        for(const [key,value] of Object.entries(cors))headers.set(key,value);
        return new Response(response.body,{status:response.status,headers});
      }catch(error){
        const status=error instanceof DataError?error.status:500;
        if(!(error instanceof DataError))console.error('FEV Worker unexpected failure:',error?.message||'unknown');
        return json({error:status===500?'伺服器錯誤，請稍後再試':error.message},status,cors);
      }
    }
  };
}
export default createApp();
