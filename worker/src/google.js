import { DataError,must } from './model.js';
const enc = encodeURIComponent;
const origin = 'https://sheets.googleapis.com/v4/spreadsheets/';
let cachedToken=null;
function b64Url(bytes){
  let binary='';
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function accessToken(env){
  if(cachedToken&&cachedToken.email===env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&cachedToken.expiry>Date.now()+60000)return cachedToken.value;
  must(env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,'未設定 Google Service Account',503);
  const pem=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g,'\n').trim();
  const der=Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')),c=>c.charCodeAt(0));
  const privateKey=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const encodePart=v=>b64Url(new TextEncoder().encode(JSON.stringify(v)));
  const unsigned=encodePart({alg:'RS256',typ:'JWT'})+'.'+encodePart({
    iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,exp:now+3300
  });
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(unsigned));
  const assertion=unsigned+'.'+b64Url(new Uint8Array(sig));
  const res=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  if(!res.ok)throw new DataError('Google Service Account 授權失敗，請檢查密鑰與 Sheets 權限',502);
  const payload=await res.json();
  cachedToken={value:payload.access_token,expiry:Date.now()+Number(payload.expires_in||3500)*1000,email:env.GOOGLE_SERVICE_ACCOUNT_EMAIL};
  return cachedToken.value;
}
async function googleRequest(env,sheetId,path,method='GET',body=null){
  must(sheetId,'Google Sheet ID 尚未設定',503);
  const token=await accessToken(env);
  const res=await fetch(origin+enc(sheetId)+'/'+path,{
    method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!res.ok){
    if(res.status===429)throw new DataError('Google Sheets 用量超過限制，請稍後重試',429);
    if(res.status===403||res.status===404)throw new DataError('私人 Google Sheet 權限不足，或 ID/工作表名稱錯誤',502);
    throw new DataError('Google Sheets API 同步失敗 ('+res.status+')',502);
  }
  return res.json();
}
const quote = sheet => "'" + sheet.replace(/'/g,"''") + "'";
const range=(sheet,area)=>enc(quote(sheet)+'!'+area);
export function googleStore(env){
  const ids={line:env.LINE_SHEET_ID,game:env.GAME_SHEET_ID};
  return {
    async read(type){
      const id=ids[type];
      must(id,'Google Sheet ID 尚未設定',503);
      const area=type==='line'?'A1:E5000':'A1:I5000';
      const json=await googleRequest(env,id,'values/'+range('Members',area));
      return json.values||[];
    },
    async write(type,row,rowIndex){
      const id=ids[type];
      const values=type==='line'
        ? [row.id,row.lineName,row.updatedAt,row.updatedBy,row.deletedAt||'']
        : [row.id,row.group,row.gameId,row.team,row.accountType,row.lineId||'',row.updatedAt,row.updatedBy,row.deletedAt||''];
      const lastCol=type==='line'?'E':'I';
      if(rowIndex){
        const cellRange='A'+rowIndex+':'+lastCol+rowIndex;
        await googleRequest(env,id,'values/'+range('Members',cellRange)+'?valueInputOption=RAW','PUT',{values:[values]});
      }else{
        await googleRequest(env,id,'values/'+range('Members','A1:'+lastCol)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:[values]});
      }
    },
    async audit(entry){
      must(env.GAME_SHEET_ID,'遊戲試算表 ID 尚未設定',503);
      await googleRequest(env,env.GAME_SHEET_ID,'values/'+range('Audit','A1:G')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{
        values:[[entry.at,entry.actor,entry.action,entry.entity,entry.id,JSON.stringify(entry.before||null),JSON.stringify(entry.after||null)]]
      });
    },
    async auditRead(limit=30){
      const json=await googleRequest(env,env.GAME_SHEET_ID,'values/'+range('Audit','A1:G1000'));
      const rows=json.values||[];
      return rows.slice(1).filter(r=>r.length>2).slice(-limit).reverse().map(r=>({
        at:r[0],actor:r[1],action:r[2],entity:r[3],id:r[4]
      }));
    },
    async checkAudit(){
      const json=await googleRequest(env,env.GAME_SHEET_ID,'values/'+range('Audit','A1:G1'));
      must(JSON.stringify(json.values?.[0]||[])===JSON.stringify(['at','actor','action','entity','entityId','before','after']),
        '遊戲 Sheet Audit 工作表標題列格式不正確',503);
    }
  };
}
