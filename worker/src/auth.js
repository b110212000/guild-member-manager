const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = null;
let jwksUntil = 0;

function bytesFromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function jsonPart(part) {
  return JSON.parse(new TextDecoder().decode(bytesFromBase64Url(part)));
}
export function assertGoogleClaims(claims, clientId, now = Math.floor(Date.now() / 1000)) {
  if (!clientId || claims.aud !== clientId) throw new Error('WRONG_AUDIENCE');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('WRONG_ISSUER');
  if (typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60) throw new Error('EXPIRED_TOKEN');
  if (claims.nbf && claims.nbf > now + 60) throw new Error('TOKEN_NOT_YET_VALID');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('UNVERIFIED_EMAIL');
  if (!claims.sub || !claims.email) throw new Error('MISSING_IDENTITY');
  return { sub: claims.sub, email: String(claims.email).trim().toLowerCase(), name: claims.name || '' };
}
async function googleKeys(force = false) {
  if (!force && jwksCache && Date.now() < jwksUntil) return jwksCache;
  const response = await fetch(GOOGLE_KEYS);
  if (!response.ok) throw new Error('GOOGLE_KEYS_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error('INVALID_GOOGLE_KEYS');
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 1200);
  jwksCache = data.keys;
  jwksUntil = Date.now() + Math.min(3600, Math.max(60, maxAge)) * 1000;
  return jwksCache;
}
export async function verifyGoogleIdToken(token, clientId) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('INVALID_TOKEN');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('INVALID_TOKEN');
  let head, claims;
  try { head = jsonPart(parts[0]); claims = jsonPart(parts[1]); }
  catch { throw new Error('INVALID_TOKEN'); }
  if (head.alg !== 'RS256' || !head.kid) throw new Error('INVALID_ALGORITHM');
  // Claim validation here is an early rejection; the JWT signature is still verified below.
  const identity = assertGoogleClaims(claims, clientId);
  let key = (await googleKeys()).find(k => k.kid === head.kid && k.kty === 'RSA');
  if (!key) key = (await googleKeys(true)).find(k => k.kid === head.kid && k.kty === 'RSA');
  if (!key) throw new Error('UNKNOWN_KEY');
  const publicKey = await crypto.subtle.importKey('jwk', key, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, bytesFromBase64Url(parts[2]), signed);
  if (!valid) throw new Error('BAD_SIGNATURE');
  return identity;
}
export function authorizedEmail(email, allowed) {
  const set = new Set(String(allowed || '').split(/[,;\s]+/).map(x => x.toLowerCase().trim()).filter(Boolean));
  return set.size > 0 && set.has(String(email || '').toLowerCase().trim());
}
