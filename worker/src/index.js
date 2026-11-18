import {verifyGoogleIdToken,authorizedEmail} from './auth.js';
import {sheetRows,appendSheetRow,replaceSheetRow} from './sheets.js';
import {GROUPS,LINE_HEADERS,GAME_HEADERS,AUDIT_HEADERS,readTable,lineView,validateLine,validateGame,packLine,packGame,assertRevision,stamp} from './logic.js';

const errorStatus={
  INVALID_JSON:400,INVALID_ENTITY:400,INVALID_ACTION:400,LINE_NAME_REQUIRED:400,INVALID_GROUP:400,
  INVALID_GAME:400,INVALID_ACCOUNT_TYPE:400,INVALID_LINE_LINK:400,
  DUPLICATE_GAME_ID:409,STALE_REVISION:409,LINKED_LINE_CANNOT_DELETE:409,NOT_FOUND:404,
  INVALID_SHEET_HEADERS:503,INVALID_MEMBER_IDS:503,DUPLICATE_MEMBER_IDS:503,
  UNAUTHORIZED:401,FORBIDDEN:403,NOT_CONFIGURED:503
};
const publicConfigured=env=>Boolean(env.GOOGLE_CLIENT_ID&&env.LINE_SHEET_ID&&env.GAME_SHEET_ID&&
  env.SERVICE_ACCOUNT_EMAIL&&env.SERVICE_ACCOUNT_PRIVATE_KEY&&env.ADMIN_EMAILS&&env.FRONTEND_ORIGIN);
function json(data,status,origin){
  const headers={'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
  if(origin){headers['access-control-allow-origin']=origin;headers['access-control-allow-headers']='authorization,content-type';headers['access-control-allow-methods']='GET,POST,OPTIONS';}
  return new Response(JSON.stringify(data),{status,headers});
}
async function load(env) {
  const [lineRows,gameRows]=await Promise.all([
    sheetRows(env,env.LINE_SHEET_ID,'Members','D'),
    sheetRows(env,env.GAME_SHEET_ID,'Members','H')
  ]);
  return {
    lines:readTable(lineRows,LINE_HEADERS),
    games:readTable(gameRows,GAME_HEADERS)
  };
}
function simple(rows) {return rows.map(row=>row.value);}
async function audit(env,actor,entity,action,id,before,after) {
  try{
    await appendSheetRow(env,env.GAME_SHEET_ID,'Audit','G',[
      stamp(),actor,entity,action,id,JSON.stringify(before||null),JSON.stringify(after||null)
    ]);
    return true;
  }catch{return false;}
}
async function mutate(env,actor,input) {
  const entity=input.entity,action=input.action;
  if(!['line','game'].includes(entity))throw new Error('INVALID_ENTITY');
  if(!['create','update','delete'].includes(action))throw new Error('INVALID_ACTION');
  const data=await load(env);
  const lines=simple(data.lines),games=simple(data.games);
  const id=String(input.id||'');
  const table=entity==='line'?data.lines:data.games;
  const found=table.find(row=>row.value.id===id);
  if(action!=='create'&&!found)throw new Error('NOT_FOUND');
  if(action!=='create')assertRevision(found.value,input.expectedUpdatedAt);
  if(action==='create'&&id)throw new Error('INVALID_ACTION');
  const now=stamp(),before=found?.value||null;
  let next;
  if(action==='delete'){
    if(entity==='line'&&games.some(game=>game.lineMemberId===id))throw new Error('LINKED_LINE_CANNOT_DELETE');
    next={...found.value,updatedAt:now,deletedAt:now};
  }else if(entity==='line'){
    next={...before,...validateLine(input.data),id:action==='create'?crypto.randomUUID():id,updatedAt:now,deletedAt:''};
  }else{
    next={...before,...validateGame(input.data,lines,games,action==='create'?'':id),
      id:action==='create'?crypto.randomUUID():id,updatedAt:now,deletedAt:''};
  }
  const sheetId=entity==='line'?env.LINE_SHEET_ID:env.GAME_SHEET_ID;
  const columns=entity==='line'?'D':'H';
  const row=entity==='line'?packLine(next):packGame(next);
  if(action==='create')await appendSheetRow(env,sheetId,'Members',columns,row);
  else await replaceSheetRow(env,sheetId,'Members',columns,found.rowNumber,row);
  const auditSaved=await audit(env,actor,entity,action,next.id,before,next);
  return {record:next,auditSaved};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin');
    const allowed=env.FRONTEND_ORIGIN||'';
    // No wildcard CORS; a browser can only call from this configured frontend origin.
    if(origin&&origin!==allowed)return json({error:'FORBIDDEN_ORIGIN'},403);
    if(request.method==='OPTIONS')return json({},204,origin||allowed);
    if(url.pathname==='/api/config'&&request.method==='GET')
      return json({configured:publicConfigured(env),clientId:env.GOOGLE_CLIENT_ID||''},200,origin||allowed);
    if(!url.pathname.startsWith('/api/'))return json({error:'NOT_FOUND'},404,origin||allowed);
    if(!publicConfigured(env))return json({error:'NOT_CONFIGURED'},503,origin||allowed);
    const bearer=request.headers.get('authorization')||'';
    if(!bearer.startsWith('Bearer '))return json({error:'UNAUTHORIZED'},401,origin||allowed);
    let actor;
    try {
      const profile=await verifyGoogleIdToken(bearer.slice(7),env.GOOGLE_CLIENT_ID);
      if(!authorizedEmail(profile.email,env.ADMIN_EMAILS))return json({error:'FORBIDDEN'},403,origin||allowed);
      actor=profile.email;
    }catch{return json({error:'UNAUTHORIZED'},401,origin||allowed);}
    try{
      if(url.pathname==='/api/snapshot'&&request.method==='GET'){
        const [data,auditRows]=await Promise.all([
          load(env),sheetRows(env,env.GAME_SHEET_ID,'Audit','G')
        ]);
        readTableAudit(auditRows);
        const lines=simple(data.lines),games=simple(data.games);
        const auditEntries=auditRows.slice(-41).slice(1).reverse().map(row=>({
          timestamp:row[0]||'',actor:row[1]||'',entity:row[2]||'',action:row[3]||'',recordId:row[4]||''
        }));
        return json({lines,games,...lineView(lines,games),audit:auditEntries,syncedAt:stamp(),actor},200,origin||allowed);
      }
      if(url.pathname==='/api/mutate'&&request.method==='POST'){
        if(Number(request.headers.get('content-length')||0)>16384)return json({error:'INVALID_JSON'},400,origin||allowed);
        let input;try{input=JSON.parse(await request.text());}catch{throw new Error('INVALID_JSON');}
        if(!input||JSON.stringify(input).length>16384)throw new Error('INVALID_JSON');
        const result=await mutate(env,actor,input);
        return json({ok:true,...result},200,origin||allowed);
      }
      return json({error:'NOT_FOUND'},404,origin||allowed);
    }catch(error){
      const code=error.message||'INTERNAL';
      const isGoogle=code.startsWith('GOOGLE_');
      return json({error:isGoogle?'SHEETS_UNAVAILABLE':errorStatus[code]?code:'INTERNAL'},isGoogle?502:errorStatus[code]||500,origin||allowed);
    }
  }
};
function readTableAudit(values) {
  if(!values.length||AUDIT_HEADERS.some((h,i)=>values[0][i]!==h))throw new Error('INVALID_SHEET_HEADERS');
}
