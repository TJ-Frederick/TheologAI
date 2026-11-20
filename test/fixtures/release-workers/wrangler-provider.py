#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
if 'wrangler' not in args:
    args[2]=str(pathlib.Path(args[2]).resolve())
    os.execv(os.environ['REAL_NPX'], [os.environ['REAL_NPX'], *args])
command = args[args.index('wrangler') + 1:]
if not command or command[0] not in {'d1', 'deployments', 'versions', 'deploy'}:
    sys.exit('Wrangler requires the release command before the multi-value --env-file option')
root=pathlib.Path(os.environ['RUNNER_TEMP'])
p=json.loads((root/'provider.json').read_text())
with (root/'provider.log').open('a') as f:
    print(' '.join(args),file=f)
role='preview' if '--env' in args and args[args.index('--env')+1]=='preview' else 'production'
a=p['assignments'][role]
remote=(root/'provider-switched').exists() and role == p['role']
new='223e4567-e89b-42d3-a456-426614174000'
deployment='323e4567-e89b-42d3-a456-426614174000'
version=new if remote else a['versionId']
if 'd1' in args and 'list' in args:
    print(json.dumps(p['inventory']))
elif 'deployments' in args and 'list' in args:
    print(json.dumps([dict(id=deployment if remote else a['deploymentId'],
        created_on='2026-11-20T06:00:01Z' if remote else '2026-11-20T06:00:00Z',
        versions=[dict(version_id=version, percentage=100)])]))
elif 'versions' in args and 'view' in args:
    assert args[args.index('view')+1]==version
    database_id=p['bindings'][role]['databaseId'] if remote else a['databaseId']
    tag = (root / 'provider-switched').read_text() if remote else p['production_tag'] if role == 'production' else None
    print(json.dumps(dict(id=version, annotations={'workers/tag':tag},
        resources=dict(bindings=[dict(type='d1',name='THEOLOGAI_DB',id=database_id,database_id=database_id)]))))
elif 'versions' in args and 'list' in args:
    def v(id,number):
        return dict(id=id,number=number,metadata=dict(created_on=f'2026-11-20T05:00:0{number}Z'),
            annotations={'workers/triggered_by':'version_upload'})
    out=[v(a['versionId'],1)]
    if remote: out.insert(0,v(new,2))
    print(json.dumps(out))
elif 'deploy' in args:
    assert '--no-bundle' in args
    preserve=pathlib.Path(args[args.index('--secrets-file')+1])
    assert json.loads(preserve.read_text())=={}
    assert not (root/'provider-switched').exists()
    if p['role'] == 'production':
        assert '--tag' in args
    tag = args[args.index('--tag')+1] if '--tag' in args else ''
    (root/'provider-switched').write_text(tag)
    if p['ambiguous']: sys.exit(91)
    print('Current Version ID: '+new)
else:
    sys.exit('Unexpected provider call '+repr(args))
