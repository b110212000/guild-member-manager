import { createRemoteJWKSet,jwtVerify } from 'jose';
import { DataError } from './model.js';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export function allowedEmails(env){
  return new Set(String(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
}
export function checkIdentity(payload,env){
  const email=String(payload.email||'').trim().toLowerCase();
  if(payload.email_verified!==true||!email||!allowedEmails(env).has(email)) throw new DataError('這個 Google 帳號沒有 FEV 管理員權限',403);
  return {email,sub:String(payload.sub)};
}
export async function verifyAdmin(req,env){
  if(!env.GOOGLE_CLIENT_ID || !env.ADMIN_EMAILS) throw new DataError('尚未設定管理員登入',503);
  const auth=req.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) throw new DataError('請先登入 Google 管理員帳號',401);
  try{
    const {payload}=await jwtVerify(auth.slice(7),keys,{
      issuer:['https://accounts.google.com','accounts.google.com'],
      audience:env.GOOGLE_CLIENT_ID,
      algorithms:['RS256']
    });
    return checkIdentity(payload,env);
  }catch(error){
    if(error instanceof DataError) throw error;
    throw new DataError('登入已過期，請重新登入',401);
  }
}
