const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
let accessCache = { token:null, expires:0, principal:'' };
const encoder = new TextEncoder();

function toUrlSafe(bytes) {
  let base64 = '';
  for (const byte of bytes) base64 += String.fromCharCode(byte);
  return btoa(base64).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function importPrivatePem(privateKey) {
  const pem = privateKey.replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  return Uint8Array.from(atob(pem), char => char.charCodeAt(0));
}
export async function serviceAccountAccessToken(env) {
  const principal = env.SERVICE_ACCOUNT_EMAIL;
  if (accessCache.token && accessCache.principal === principal && accessCache.expires > Date.now()+60_000) return accessCache.token;
  const privateKey = await crypto.subtle.importKey('pkcs8',importPrivatePem(env.SERVICE_ACCOUNT_PRIVATE_KEY),
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },false,['sign']);
  const now = Math.floor(Date.now()/1000);
  const encodeJson = obj => toUrlSafe(encoder.encode(JSON.stringify(obj)));
  const unsigned = encodeJson({alg:'RS256',typ:'JWT'})+'.'+encodeJson({
    iss:principal,scope:SCOPE,aud:GOOGLE_TOKEN_URL,iat:now,exp:now+3500
  });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,encoder.encode(unsigned));
  const assertion = unsigned + '.' + toUrlSafe(new Uint8Array(signature));
  const body = new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion });
  const response = await fetch(GOOGLE_TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if (!response.ok) throw new Error('GOOGLE_SERVICE_AUTH_FAILED');
  const result = await response.json();
  if (!result.access_token) throw new Error('GOOGLE_SERVICE_AUTH_FAILED');
  accessCache = {token:result.access_token,expires:Date.now()+Math.min(3500,result.expires_in||3500)*1000,principal};
  return result.access_token;
}
function rangePath(id,range) {
  return 'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id)+'/values/'+encodeURIComponent(range);
}
async function requestSheets(env,url,options={}) {
  const token = await serviceAccountAccessToken(env);
  const response = await fetch(url,{...options,headers:{
    authorization:'Bearer '+token,
    ...(options.body?{'content-type':'application/json'}:{}),
    ...(options.headers||{})
  }});
  if (!response.ok) {
    // Do not leak Sheet IDs, response bodies or access credentials to callers.
    throw new Error('GOOGLE_SHEETS_'+response.status);
  }
  return response.json();
}
export async function sheetRows(env,id,tab,columns) {
  const result = await requestSheets(env,rangePath(id,tab+'!A1:'+columns));
  return result.values||[];
}
export async function appendSheetRow(env,id,tab,columns,row) {
  const url = rangePath(id,tab+'!A:'+columns)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  return requestSheets(env,url,{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
}
export async function replaceSheetRow(env,id,tab,columns,at,row) {
  const range=tab+'!A'+at+':'+columns+at;
  const url=rangePath(id,range)+'?valueInputOption=RAW';
  return requestSheets(env,url,{method:'PUT',body:JSON.stringify({range,majorDimension:'ROWS',values:[row]})});
}
