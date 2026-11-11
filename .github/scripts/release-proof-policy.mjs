/** Two reviewed release policies. Selection is bound to checked source, never provider observations. */
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import * as application from '../../scripts/application-release-policy.mjs';
import * as norton from '../../scripts/norton-aquinas-release-policy.mjs';
export function policyForIdentity(identity){
 if(identity===undefined||identity==='application-only')return {id:'application-only',module:application,reservedReads:3510997,hardReadCap:3800000};
 if(identity==='norton-aquinas.v1')return {id:identity,module:norton,reservedReads:norton.POLICY.reservedReads,hardReadCap:norton.POLICY.hardReadCap};
 throw Error('Release policy refused: unknown identity');
}
export function policyForClassification(classification){
 const selected=policyForIdentity(classification?.releasePolicy);
 if(selected.id==='norton-aquinas.v1'&&classification.applicationOnly!==false)throw Error('Release policy refused: corpus classification identity');
 if(selected.id==='application-only'&&classification?.applicationOnly===false)throw Error('Release policy refused: application classification identity');
 return selected;
}
export function selectReleaseProofPolicy(root){
 // Coexisting declarations mean the closed activation declaration takes precedence.
 // It must pass its complete Git/blob/source check. Missing/invalid identity never falls back.
 const selected=existsSync(join(root,'release/norton-aquinas.json'))?policyForIdentity('norton-aquinas.v1'):policyForIdentity('application-only');
 const classification=selected.module.classifyApplicationRelease(root);
 return {...selected,classification};
}
export function requireSameReleasePolicy(selected,identity){
 if(policyForIdentity(identity).id!==selected.id)throw Error('Release policy refused: cross-policy substitution');
}

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function verifySourcePlanPolicy(root,directory,digest){
 const selected=selectReleaseProofPolicy(root),bytes=readFileSync(join(directory,'plan.json'));
 if(!/^[a-f0-9]{64}$/.test(digest)||createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('Release policy refused: source plan digest');
 const plan=JSON.parse(bytes);
 if(plan.schemaVersion!=='theologai-application-corpus-source-plan.v1'||JSON.stringify(plan.classification)!==JSON.stringify(selected.classification))throw Error('Release policy refused: exact source plan identity');
 requireSameReleasePolicy(selected,plan.releasePolicy);
 return selected.id;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,directory,digest,...extra]=process.argv.slice(2);
 if(command!=='verify-source-plan'||!directory||!digest||extra.length)throw Error('Release policy refused: exact CLI arguments');
 process.stdout.write(verifySourcePlanPolicy(process.cwd(),directory,digest)+'\n');
}
