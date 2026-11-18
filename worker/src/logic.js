export const GROUPS = ['第一團','第二團','第三團','第四團','第五團','無遊戲團'];
export const LINE_HEADERS = ['id','lineName','updatedAt','deletedAt'];
export const GAME_HEADERS = ['id','group','gameId','team','accountType','lineMemberId','updatedAt','deletedAt'];
export const AUDIT_HEADERS = ['timestamp','actor','entity','action','recordId','before','after'];

const clean = value => String(value??'').trim();
const key = value => clean(value).toLocaleLowerCase();
export const stamp = () => new Date().toISOString();

export function readTable(values,headers) {
  if (!values?.length || headers.some((header,i) => values[0][i]!==header)) throw new Error('INVALID_SHEET_HEADERS');
  const rows = values.slice(1).map((cells,index) => ({
    rowNumber:index+2, value:Object.fromEntries(headers.map((name,i) => [name,clean(cells[i])]))
  }));
  if (rows.some(row => row.value.id && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.value.id))) throw new Error('INVALID_MEMBER_IDS');
  const ids=rows.filter(row=>row.value.id).map(row=>row.value.id);
  if(new Set(ids).size!==ids.length)throw new Error('DUPLICATE_MEMBER_IDS');
  return rows.filter(row=>row.value.id && !row.value.deletedAt);
}
export function lineView(lines, games) {
  const lookup=new Map(lines.map(line=>[line.id,line]));
  const members=games.map(game=>({
    ...game, lineName:lookup.get(game.lineMemberId)?.lineName||'',
    lineLinked:!game.lineMemberId || lookup.has(game.lineMemberId)
  }));
  const linked=new Set(games.map(g=>g.lineMemberId).filter(Boolean));
  const lineOnly=lines.filter(line=>!linked.has(line.id))
    .map(line=>({id:'line:'+line.id,virtual:true,group:GROUPS[5],gameId:'',lineMemberId:line.id,
      lineName:line.lineName,team:'',accountType:'main',updatedAt:line.updatedAt}));
  return {members:[...members,...lineOnly],lineCount:lines.length,gameCount:games.length};
}
export function validateLine(value) {
  const lineName=clean(value?.lineName);
  if(!lineName || lineName.length>100)throw new Error('LINE_NAME_REQUIRED');
  return {lineName};
}
export function validateGame(value,lines,games,ignoreId='') {
  const group=clean(value?.group),gameId=clean(value?.gameId),team=clean(value?.team);
  const accountType=clean(value?.accountType||'main'),lineMemberId=clean(value?.lineMemberId);
  if(!GROUPS.includes(group))throw new Error('INVALID_GROUP');
  if(!gameId||gameId.length>100||team.length>100)throw new Error('INVALID_GAME');
  if(!['main','alt'].includes(accountType))throw new Error('INVALID_ACCOUNT_TYPE');
  if(lineMemberId&&!lines.some(line=>line.id===lineMemberId))throw new Error('INVALID_LINE_LINK');
  if(games.some(game=>game.id!==ignoreId&&key(game.gameId)===key(gameId)))throw new Error('DUPLICATE_GAME_ID');
  return {group,gameId,team,accountType,lineMemberId};
}
export function packLine(line) {
  return LINE_HEADERS.map(field=>line[field]||'');
}
export function packGame(game) {
  return GAME_HEADERS.map(field=>game[field]||'');
}
export function assertRevision(current,expected) {
  if(!expected||current.updatedAt!==expected)throw new Error('STALE_REVISION');
}
