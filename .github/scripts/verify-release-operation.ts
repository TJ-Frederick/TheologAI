/** Local validation only, before a protected job exposes any provider credential. */
import{readFileSync}from'node:fs';
import{join}from'node:path';
import{createRequire}from'node:module';
import{selectReleaseProofPolicy,verifySourcePlanPolicy,requireSameReleasePolicy}from'./release-proof-policy.mjs';
import{requireOperatorChallenge,verifyOperatorEnvelope}from'../../scripts/operator-corpus-proof.js';
const authority=createRequire(import.meta.url)('./operator-authorization.cjs');
const [mode,directory,digest,authorizationFile,challengeFile,envelopeFile,...extra]=process.argv.slice(2);
if(!['owner','complete'].includes(mode??'')||!directory||!digest||!authorizationFile||extra.length||(mode==='owner'&&(challengeFile||envelopeFile))||(mode==='complete'&&(!challengeFile||!envelopeFile)))throw Error('Release operation refused: exact arguments');
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const selected=selectReleaseProofPolicy(process.cwd());verifySourcePlanPolicy(process.cwd(),directory,digest);
const plan=json(join(directory,'plan.json'));
const p=authority.requirePackage(json(authorizationFile),{sourceCommit:selected.classification.sourceCommit,sourceTree:selected.classification.sourceTree,sourcePlanSha256:digest});
requireSameReleasePolicy(selected,p.authorization.releasePolicy);
if(mode==='complete'){
 const challenge=requireOperatorChallenge(json(challengeFile!));
 requireSameReleasePolicy(selected,challenge.releasePolicy);
 if(JSON.stringify(challenge.authorization)!==JSON.stringify(p))throw Error('Release operation refused: independently admitted authorization');
 verifyOperatorEnvelope(json(envelopeFile!),challenge,plan);
}
process.stdout.write(selected.id+'\n');
