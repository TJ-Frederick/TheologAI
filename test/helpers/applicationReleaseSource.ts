/** Preserve the original app source/corpus while exercising the shared successor tooling. */
import{copyFileSync}from'node:fs';
import{resolve,join}from'node:path';
import{execFileSync}from'node:child_process';
export function prepareApplicationReleaseSource(root:string){
 execFileSync('git',['checkout','--detach','328168d5b817e9eaa0e702de382adc2c46c858ef'],{cwd:root,stdio:'pipe'});
 for(const path of [
  'scripts/application-release-policy.mjs','scripts/application-release-policy.d.mts','scripts/application-corpus-check.ts','scripts/operator-corpus-proof.ts','scripts/corpus-proof-transport.ts','scripts/corpus-source-proof.ts',
  'scripts/norton-aquinas-release-policy.mjs','scripts/norton-aquinas-release-policy.d.mts','scripts/corpus-release-api.ts','scripts/corpus-release-control.ts','scripts/corpus-token-identity.ts',
  '.github/scripts/release-proof-policy.mjs','.github/scripts/release-proof-policy.d.mts','.github/scripts/norton-aquinas-policy.cjs','.github/scripts/operator-authorization.cjs','.github/scripts/operator-readiness.cjs',
 ])copyFileSync(resolve(path),join(root,path));
}
