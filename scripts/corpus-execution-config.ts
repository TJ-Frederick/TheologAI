/** Render an operation-local full config; never edit the checked-in bindings. */
import {parse,stringify} from 'smol-toml';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {POLICY,TARGETS} from './norton-aquinas-release-policy.mjs';
export function corpusExecutionConfig(original:string,role:'preview'|'production',root:string):string {
 const config=parse(original) as any;
 if(config.name!=='theologai'||config.d1_databases?.length!==1||config.env?.preview?.name!=='theologai-preview'||config.env.preview.d1_databases?.length!==1)throw Error('Corpus config refused: exact Worker/binding scope');
 const production=config.d1_databases[0],preview=config.env.preview.d1_databases[0];
 if(production.binding!=='THEOLOGAI_DB'||production.database_id!==POLICY.rollback.databaseId||production.database_name!==POLICY.rollback.databaseName||preview.binding!=='THEOLOGAI_DB'||preview.database_id!==TARGETS.production.databaseId||preview.database_name!==TARGETS.production.databaseName)throw Error('Corpus config refused: reviewed predecessor bindings');
 const set=(binding:any,target:{databaseId:string;databaseName:string})=>{binding.database_id=target.databaseId;binding.database_name=target.databaseName;if(binding.migrations_dir)binding.migrations_dir=resolve(root,binding.migrations_dir);};
 set(preview,TARGETS.preview);set(production,role==='preview'?POLICY.rollback:TARGETS.production);
 config.main=resolve(root,config.main);
 return stringify(config);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[role,output,...extra]=process.argv.slice(2);if((role!=='preview'&&role!=='production')||!output||extra.length)throw Error('Usage: corpus-execution-config.ts preview|production OUTPUT');writeFileSync(output,corpusExecutionConfig(readFileSync('wrangler.toml','utf8'),role,process.cwd()),{flag:'wx',mode:0o600});}
