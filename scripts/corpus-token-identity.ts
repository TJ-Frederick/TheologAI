/** Two fixed self-verification GETs at most. No token listing, value retention, mutation or retry. */
import {ACCOUNT} from './norton-aquinas-release-policy.mjs';
export async function identifyProtectedPreviewToken(token:string,fetchImpl:typeof fetch=fetch,deadline=Date.now()+30000){
 const routes=[['user','https://api.cloudflare.com/client/v4/user/tokens/verify'],['account',`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/verify`]] as const;
 for(const [owner,url]of routes){
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('Bounded token identity deadline');
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(Math.min(15000,remaining)),headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
  if(owner==='user'&&(response.status===401||response.status===403)){await response.body?.cancel();continue;}
  if(response.status!==200||response.redirected||!/^application\/json/.test(response.headers.get('content-type')??'')||!response.body)throw Error('Bounded token identity refused');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16384)throw Error('Bounded token identity response');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
  const value=JSON.parse(Buffer.concat(chunks).toString());
  if(value.success!==true||(value.errors!==undefined&&(!Array.isArray(value.errors)||value.errors.length))||value.result?.status!=='active'||typeof value.result?.id!=='string'||!/^[a-f0-9]{32}$/.test(value.result.id))throw Error('Bounded token identity shape');
  return {tokenOwner:owner,tokenId:value.result.id,status:'active',environment:'preview',secret:'CLOUDFLARE_API_TOKEN',sqlCalls:0,writes:0};
 }
 throw Error('Bounded preview token identity unavailable');
}
