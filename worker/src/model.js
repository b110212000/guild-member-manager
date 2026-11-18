export const GROUPS = ['第一團','第二團','第三團','第四團','第五團','無遊戲團'];
export const LINE_HEADER = ['id','lineName','updatedAt','updatedBy','deletedAt'];
export const GAME_HEADER = ['id','group','gameId','team','accountType','lineId','updatedAt','updatedBy','deletedAt'];
export const AUDIT_HEADER = ['at','actor','action','entity','entityId','before','after'];
const safe = x => String(x ?? '').trim();
export const key = x => safe(x).toLocaleLowerCase();
export const noFormula = x => safe(x); // Sheets API always uses valueInputOption=RAW.
export const asText = (value,field,required=false) => {
  const text=safe(value);
  if((required&&!text)||text.length>100) throw new DataError(field+'格式錯誤（必填欄位不可空白、最多100字）');
  return text;
};
export class DataError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const must = (condition,message,status=400) => {if(!condition)throw new DataError(message,status);};
export function readLines(values) {
  must(Array.isArray(values)&&JSON.stringify(values[0]||[])===JSON.stringify(LINE_HEADER),'LINE Sheet Members 標題列格式不正確',503);
  return values.slice(1).map((row,i)=>({
    id:safe(row[0]),lineName:safe(row[1]),updatedAt:safe(row[2]),updatedBy:safe(row[3]),
    deletedAt:safe(row[4]),rowIndex:i+2
  })).filter(item=>item.id&&!item.deletedAt);
}
export function readGames(values){
  must(Array.isArray(values)&&JSON.stringify(values[0]||[])===JSON.stringify(GAME_HEADER),'遊戲 Sheet Members 標題列格式不正確',503);
  return values.slice(1).map((row,i)=>({
    id:safe(row[0]),group:safe(row[1]),gameId:safe(row[2]),team:safe(row[3]),
    accountType:safe(row[4])||'main',lineId:safe(row[5]),updatedAt:safe(row[6]),
    updatedBy:safe(row[7]),deletedAt:safe(row[8]),rowIndex:i+2
  })).filter(item=>item.id&&!item.deletedAt);
}
export function lineValues(row){return [row.id,row.lineName,row.updatedAt,row.updatedBy,row.deletedAt||''];}
export function gameValues(row){return [row.id,row.group,row.gameId,row.team,row.accountType,row.lineId||'',row.updatedAt,row.updatedBy,row.deletedAt||''];}
export function validateLine(input,existing=[] ,ignoreId=''){
  const lineName=asText(input?.lineName,'LINE 名稱',true);
  must(!existing.some(item=>item.id!==ignoreId&&key(item.lineName)===key(lineName)),'LINE 名稱已存在',409);
  return {lineName};
}
export function validateGame(input, games=[],lines=[],ignoreId=''){
  const gameId=asText(input?.gameId,'遊戲 ID',true);
  const group=asText(input?.group,'團別',true);
  must(GROUPS.includes(group),'團別無效');
  const team=asText(input?.team,'隊伍');
  const accountType=input?.accountType==='alt'?'alt':'main';
  const lineId=asText(input?.lineId,'LINE 關聯 ID');
  must(!lineId||lines.some(x=>x.id===lineId),'對應 LINE 成員不存在',400);
  must(!games.some(x=>x.id!==ignoreId&&key(x.gameId)===key(gameId)),'遊戲 ID 已存在',409);
  return {gameId,group,team,accountType,lineId};
}
export function publicLine(row){return {id:row.id,lineName:row.lineName,updatedAt:row.updatedAt};}
export function publicGame(row){return {id:row.id,gameId:row.gameId,group:row.group,team:row.team,accountType:row.accountType,lineId:row.lineId,updatedAt:row.updatedAt};}
export function rosterSummary(lines,games) {
  const used=new Set(games.map(g=>g.lineId).filter(Boolean));
  return {
    accountCount:games.length,lineCount:lines.length,
    pairedGames:games.filter(g=>g.lineId).length,
    unpairedGames:games.filter(g=>!g.lineId).length,
    unpairedLines:lines.filter(l=>!used.has(l.id)).length
  };
}
