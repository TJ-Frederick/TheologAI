import {it,expect,vi} from 'vitest';
import {identifyProtectedPreviewToken} from '../../../scripts/corpus-token-identity.js';
const id='dac2ed85288c21310268159147e942dc';
it('identifies only the existing preview token using two fixed read-only routes at most',async()=>{
 const calls:string[]=[];
 const fetchImpl=vi.fn(async(input:any,init:any)=>{calls.push(String(input));expect(init.method).toBe('GET');expect(init.redirect).toBe('error');expect(init.headers.authorization).toBe('Bearer private-sentinel');return calls.length===1?new Response('',{status:403}):Response.json({success:true,errors:[],result:{id,status:'active',extra:'private-provider-message'}});}) as typeof fetch;
 const result=await identifyProtectedPreviewToken('private-sentinel',fetchImpl);
 expect(result).toEqual({tokenOwner:'account',tokenId:id,status:'active',environment:'preview',secret:'CLOUDFLARE_API_TOKEN',sqlCalls:0,writes:0});
 expect(calls).toEqual(['https://api.cloudflare.com/client/v4/user/tokens/verify','https://api.cloudflare.com/client/v4/accounts/0594ed1e4c9fe35ab7d9f47991e99f3e/tokens/verify']);
 expect(JSON.stringify(result)).not.toMatch(/private-sentinel|private-provider-message/);
});
it('does not fall back or retry a transport failure',async()=>{
 const fetchImpl=vi.fn(async()=>{throw Error('network failed');});
 await expect(identifyProtectedPreviewToken('sentinel',fetchImpl)).rejects.toThrow();expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(['inactive','invalid-id','error-envelope','oversized','redirect','500'])('refuses %s without a second request',async fault=>{
 const fetchImpl=vi.fn(async()=>fault==='500'?new Response('',{status:500}):fault==='redirect'?new Response('',{status:302}):Response.json(fault==='oversized'?{padding:'x'.repeat(17000)}:{success:true,errors:fault==='error-envelope'?[{code:10000}]:[],result:{id:fault==='invalid-id'?'bad':id,status:fault==='inactive'?'disabled':'active'}}));
 await expect(identifyProtectedPreviewToken('sentinel',fetchImpl)).rejects.toThrow();expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('refuses expired authority before credential dispatch',async()=>{const fetchImpl=vi.fn();await expect(identifyProtectedPreviewToken('sentinel',fetchImpl,Date.now()-1)).rejects.toThrow('deadline');expect(fetchImpl).not.toHaveBeenCalled();});
