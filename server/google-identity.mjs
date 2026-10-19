// Google customer identity verification. Owner/admin identity remains Sites-managed.
import { createRemoteJWKSet, jwtVerify } from 'jose';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogleIdentity(token,{clientId,nonce,keySet=googleKeys}={}) {
  if(!clientId||!/^[-\w.]+\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('Google OAuth client ID is not configured.');
  if(typeof nonce!=='string'||nonce.length<24)throw new Error('A server-bound nonce is required.');
  const {payload}=await jwtVerify(token,keySet,{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],clockTolerance:5});
  if(payload.nonce!==nonce||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255)throw new Error('Invalid Google identity.');
  if(payload.email_verified!==true||typeof payload.email!=='string'||payload.email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(payload.email))throw new Error('Verified Google email is required.');
  return {provider:'google',subject:payload.sub,email:typeof payload.email==='string'?payload.email:null,fullName:typeof payload.name==='string'?payload.name:null};
}
