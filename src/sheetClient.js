const KEY='fev:google-id-token';
export const API_URL=String(import.meta.env.VITE_FEV_API_URL||'').replace(/\/+$/,'');
export const CLIENT_ID=String(import.meta.env.VITE_GOOGLE_CLIENT_ID||'').trim();

function validToken(token){
  try {
    const b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,'='))).exp*1000>Date.now()+15000;
  }catch{return false;}
}
export function getToken(){
  try {
    const token=sessionStorage.getItem(KEY)||'';
    if(validToken(token))return token;
    sessionStorage.removeItem(KEY);
  }catch{}
  return '';
}
export function saveToken(token){
  try {if(token)sessionStorage.setItem(KEY,token);else sessionStorage.removeItem(KEY);}catch{}
}
export async function sheetsRequest(token,path,method='GET',payload){
  if(!API_URL)throw new Error('尚未設定 FEV_API_URL，請依 GitHub 設定教學完成後端部署。');
  let response;
  try {
    response=await fetch(API_URL+path,{method,cache:'no-store',headers:{
      Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})
    },...(payload?{body:JSON.stringify(payload)}:{})});
  }catch{throw new Error('無法連接 Cloudflare Worker，請確認網路及 Worker 位址。');}
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=result.error||('HTTP '+response.status);
    const error=new Error(message);
    error.status=response.status;
    throw error;
  }
  return result;
}
