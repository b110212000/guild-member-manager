import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';
import { DataError,LINE_HEADER,GAME_HEADER,readLines,readGames,validateGame,rosterSummary } from '../src/model.js';
import { checkIdentity } from '../src/auth.js';

function fixture(){
  const lines=[],games=[],audits=[];
  const store={
    async read(type){
      const items=type==='line'?lines:games;
      return [type==='line'?LINE_HEADER:GAME_HEADER,
        ...items.map(item=>type==='line'
          ? [item.id,item.lineName,item.updatedAt,item.updatedBy,item.deletedAt||'']
          : [item.id,item.group,item.gameId,item.team,item.accountType,item.lineId,item.updatedAt,item.updatedBy,item.deletedAt||''])
      ];
    },
    async write(type,record,rowIndex){
      const items=type==='line'?lines:games;
      if(rowIndex) items[rowIndex-2]=record; else items.push(record);
    },
    async checkAudit(){},
    async audit(entry){audits.push(entry);},
    async auditRead(){return audits}
  };
  const env={ALLOWED_ORIGIN:'https://b110212000.github.io'};
  const app=createApp({authenticate:async()=>({email:'admin@example.com',sub:'u123'}),makeStore:()=>store});
  const request=(method,path,body,origin='https://b110212000.github.io')=>new Request('https://fev-roster-api.workers.dev'+path,{
    method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const call=async(method,path,body,origin)=>{
    const res=await app.fetch(request(method,path,body,origin),env);
    return {status:res.status,data:await res.json(),cors:res.headers.get('Access-Control-Allow-Origin')};
  };
  return {env,app,request,call,lines,games,audits,store};
}
test('private sheets models parse rows and calculate linked game/LINE summary',()=>{
  const lines=readLines([LINE_HEADER,['line-1','小明','2026-11-01','',''],['line-2','美美','','','']]);
  const games=readGames([GAME_HEADER,['game-1','第一團','Knight','A隊','main','line-1','','',''],['game-2','第二團','Knight2','','alt','line-1','','','']]);
  assert.equal(lines.length,2);
  assert.equal(games[0].group,'第一團');
  assert.equal(rosterSummary(lines,games).pairedGames,2);
  assert.equal(rosterSummary(lines,games).unpairedLines,1);
});
test('Google admin white list rejects unverified or unauthorized emails',()=>{
  const env={ADMIN_EMAILS:'admin@example.com'};
  assert.equal(checkIdentity({email:'ADMIN@example.com',email_verified:true,sub:'123'},env).email,'admin@example.com');
  assert.throws(()=>checkIdentity({email:'admin@example.com',email_verified:false},env),/管理員權限/);
  assert.throws(()=>checkIdentity({email:'viewer@example.com',email_verified:true},env),/管理員權限/);
});
test('unauthorized request does not read private rosters',async()=>{
  let readCount=0;
  const app=createApp({authenticate:async()=>{throw new DataError('未登入',401)},makeStore:()=>({read:async()=>{readCount++}})});
  const res=await app.fetch(new Request('https://worker.example/api/bootstrap',{headers:{Origin:'https://b110212000.github.io'}}),{ALLOWED_ORIGIN:'https://b110212000.github.io'});
  assert.equal(res.status,401);
  assert.equal(readCount,0);
});
test('CORS disallows other origins before accessing sheets',async()=>{
  const f=fixture();
  const res=await f.call('GET','/api/bootstrap',null,'https://attacker.example');
  assert.equal(res.status,403);
  assert.equal(res.cors,null);
});
test('create, update and soft-delete LINE and game members with audit',async()=>{
  const f=fixture();
  const line=await f.call('POST','/api/lines',{lineName:'小明'});
  assert.equal(line.status,201);
  const lineId=line.data.record.id;
  const game=await f.call('POST','/api/games',{group:'第一團',gameId:'Knight',team:'A隊',accountType:'main',lineId});
  assert.equal(game.status,201);
  const alt=await f.call('POST','/api/games',{group:'第二團',gameId:'Knight-Alt',team:'B隊',accountType:'alt',lineId});
  assert.equal(alt.status,201);
  const dashboard=await f.call('GET','/api/bootstrap');
  assert.equal(dashboard.data.summary.pairedGames,2);
  assert.equal(dashboard.data.lines.length,1);
  const removeLinked=await f.call('DELETE','/api/lines/'+lineId,{expectedUpdatedAt:line.data.record.updatedAt});
  assert.equal(removeLinked.status,409);
  const move=await f.call('PUT','/api/games/'+game.data.record.id,{
    expectedUpdatedAt:game.data.record.updatedAt,group:'第三團',gameId:'Knight',team:'Z隊',accountType:'main',lineId
  });
  assert.equal(move.status,200);
  assert.equal(move.data.record.group,'第三團');
  assert.equal(move.data.record.lineId,lineId);
  assert.equal((await f.call('DELETE','/api/games/'+alt.data.record.id,{expectedUpdatedAt:alt.data.record.updatedAt})).status,200);
  assert.equal((await f.call('GET','/api/bootstrap')).data.games.length,1);
  assert.equal(f.audits.length,5);
});
test('rejects stale edits, invalid group, duplicate game IDs and non-existing line association',async()=>{
  const f=fixture();
  const first=await f.call('POST','/api/games',{group:'第一團',gameId:'ABC',lineId:''});
  assert.equal(first.status,201);
  const other=await f.call('POST','/api/games',{group:'第二團',gameId:'abc',lineId:''});
  assert.equal(other.status,409);
  const invalid=await f.call('POST','/api/games',{group:'第六團',gameId:'DEF'});
  assert.equal(invalid.status,400);
  const missing=await f.call('POST','/api/games',{group:'第一團',gameId:'DEF',lineId:'does-not-exist'});
  assert.equal(missing.status,400);
  const stale=await f.call('PUT','/api/games/'+first.data.record.id,{expectedUpdatedAt:'old',group:'第二團',gameId:'ABC'});
  assert.equal(stale.status,409);
});
test('RAW text validation prevents oversized fields',()=>{
  assert.throws(()=>validateGame({group:'第一團',gameId:'x'.repeat(101)},[],[]),/格式錯誤/);
});
