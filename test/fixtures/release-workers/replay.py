"""Replay the protected Worker shell against fixture Wrangler responses.

Run directly with python3 test/fixtures/release-workers/replay.py.
"""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

fixture_dir = pathlib.Path(__file__).resolve().parent
repo = fixture_dir.parents[2]
real_npx = subprocess.check_output(["which", "npx"], text=True).strip()
reviewed = json.loads((repo / "release/serving.json").read_text())
plan = "a" * 64
read_ceiling = int(subprocess.check_output(
    ["node", "-p", "require('./.github/scripts/corpus-policy.cjs').accountReadCeiling"], cwd=repo, text=True))

def j(path, value):
    path.write_text(json.dumps(value, separators=(",", ":")) + "\n")

def replay(case, role, mode, wrong=False, ambiguous=False, stale=False, tamper=False, expired=False, wrong_route=False, tagged=False, wrong_tag=False, stale_deployment=False, stale_database=False, rebaseline=False):
    other = "production" if role == "preview" else "preview"
    with tempfile.TemporaryDirectory(prefix="theologai-release-replay-") as run:
        root = pathlib.Path(run).resolve()
        config = json.loads(json.dumps(reviewed))
        previous_production = {
            "databaseName": "theologai-production-20260811-schema0009-a",
            "databaseId": "9bc79346-338b-439e-a2a5-424f4418eb21",
            "deploymentId": "f6c9a995-0940-4758-a9a9-14f1389a9ab3",
            "versionId": "d2e2bd87-1213-4ba5-891d-e0f9b3293cb9",
        }
        if role == "production" and mode == "corpus":
            config["predecessors"]["production"] = previous_production
        later_production = {
            **config["predecessors"]["production"],
            "deploymentId": "bbc8d4b1-a8bc-4af9-8adf-cf4e07669afb",
            "versionId": "3a74b8d2-03aa-4667-bffa-f18be5c850af",
        }
        if rebaseline:
            config["productionSource"] = "1" * 40
            config["productionRunNumber"] += 1
            config["predecessors"]["production"] = later_production
        if mode == "application":
            for r in ("preview", "production"):
                config["targets"][r] = {k: config["predecessors"][r][k] for k in ("databaseName", "databaseId")}
        (root / "release").mkdir()
        j(root / "release/serving.json", config)
        (root / ".github").symlink_to(repo / ".github")
        (root / "scripts").mkdir()
        for script in (repo / "scripts").iterdir():
            if script.name in ("worker-release-artifact.mjs", "release-promotion.mjs", "classify-ci-changes.mjs", "classify-production-deployment.mjs", "hosted-corpus-profile.mjs"):
                shutil.copyfile(script, root / "scripts" / script.name)
            elif script.is_file():
                (root / "scripts" / script.name).symlink_to(script)
        (root / "node_modules").symlink_to(repo / "node_modules")
        bindings = {r: config["targets"][r] if r == role else config["predecessors"][r] for r in ("preview", "production")}
        # A previously accepted preview is already bound when production is approved.
        if role == "production":
            bindings["preview"] = config["targets"]["preview"]
        assignments = {}
        for r in ("preview","production"):
            target = config["predecessors"][r]
            assignments[r] = {k: target[k] for k in ("databaseId","versionId","deploymentId")}
        if role == "production":
            assignments["preview"]["databaseId"] = bindings["preview"]["databaseId"]
        accepted_production = later_production if tagged else config["predecessors"]["production"]
        if tagged:
            assignments["production"].update({k: accepted_production[k] for k in ("versionId", "deploymentId")})
        if stale:
            assignments["production"]["versionId"] = previous_production["versionId"]
        if stale_deployment:
            assignments["production"]["deploymentId"] = previous_production["deploymentId"]
        if stale_database:
            bindings["production"] = previous_production
            assignments["production"]["databaseId"] = previous_production["databaseId"]
        baseline_source = "1" * 40 if tagged else config["productionSource"]
        j(root / "production-baseline.json", {
            "productionSource": baseline_source,
            "requireVersionTag": tagged,
            "productionAssignment": accepted_production,
            "targets": {r: {k: config["predecessors"][r][k] for k in ("databaseName", "databaseId")}
                        for r in ("production", "preview")},
        })
        executor_receipt={"role":role,"databaseId":bindings[role]["databaseId"],
            "databaseName":bindings[role]["databaseName"],"sourcePlanSha256":plan,"controlsUnchanged":True}
        def toml_binding(r):
            return f'binding = "THEOLOGAI_DB"\ndatabase_name = "{bindings[r]["databaseName"]}"\ndatabase_id = "{bindings[r]["databaseId"]}"\nmigrations_dir = "migrations"\n'
        (root / "corpus-wrangler.toml").write_text(
            'name = "theologai"\n[[d1_databases]]\n'+toml_binding("production")+
            '[env.preview]\nname = "theologai-preview"\n[[env.preview.d1_databases]]\n'+toml_binding("preview"))
        domain = 'preview-mcp.theologai.xyz' if role == 'preview' else 'mcp.theologai.xyz'
        if wrong_route: domain = 'different.example'
        selected = bindings[role]["databaseId"] if not wrong else "70cc3000-0000-4000-a000-000000000000"
        bundle = root / "worker-bundle"
        bundle.mkdir()
        (bundle / "worker.js").write_text("export default {};\n")
        (bundle / "worker.js.map").write_text("{}\n")
        shutil.copyfile(repo / "package-lock.json", root / "package-lock.json")
        shutil.copyfile(root / "corpus-wrangler.toml", root / "wrangler.toml")
        def git(*args):
            subprocess.run(["git", *args], cwd=root, check=True, stdout=subprocess.DEVNULL)
        git("init", "-q")
        git("add", "release/serving.json", "wrangler.toml", "package-lock.json")
        git("-c","user.email=fixture@example.test","-c","user.name=Fixture","-c","commit.gpgsign=false","commit","-qm","release fixture")
        sha = subprocess.check_output(["node","scripts/worker-release-artifact.mjs","create","preview",str(bundle)],cwd=root,text=True).strip()
        j(root / "worker-release.json", {"main":str(bundle/"worker.js"),"no_bundle":True,"find_additional_modules":False,"name":"theologai" + ("-preview" if role == "preview" else ""),
            "routes":[{"pattern":domain,"custom_domain":True}], "workers_dev":True,
            "d1_databases":[{"binding":"THEOLOGAI_DB","database_name":bindings[role]["databaseName"],"database_id":selected}]})
        j(root / "verified-preview.json", assignments["preview"])
        databases = {entry["databaseId"]:entry["databaseName"] for entry in (
            *config["targets"].values(), *config["predecessors"].values(), previous_production)}
        j(root / "provider.json",dict(role=role,assignments=assignments,bindings=bindings,ambiguous=ambiguous,
            production_tag=("2" * 40 if wrong_tag else baseline_source) if tagged else None,
            inventory=[{"uuid":key,"name":name} for key,name in databases.items()]))
        today = datetime.datetime.now(datetime.timezone.utc).date()
        midnight = datetime.datetime.combine(today, datetime.time(), datetime.timezone.utc)
        auth = dict(schemaVersion="theologai-operator-authorization.v1",scope="new-additional-operation",
            repository="TJ-Frederick/TheologAI",ownerActorId=40179660, role=role, pullRequestNumber=1,
            headBranch="main" if role == "production" else "test", sourceCommit="a"*40, sourceTree="b"*40,
            baseCommit="c"*40,sourcePlanSha256=plan,targetRunId="42",targetRunAttempt=1,
            authorizationId="operation-test-run",ledgerId="operation-test-run",notBefore=midnight.isoformat(),
            expiresAt=(midnight+datetime.timedelta(days=1)).isoformat(),reservedReads=1000,hardReadCap=2000,
            diagnosticCommands=4,maxWrites=4,previousReadsSpentOrReserved=0,previousWritesSpentOrReserved=0,
            previousDiagnosticCommands=0,outstandingPriorReservationsAccepted=True,exclusiveDataWritesDuringWindow=True,
            candidateWriteJobsPaused=True,liveControlReserve=11000,expectedLedgerSha256="b"*64,releasePolicy="corpus.v1",
            databaseId=bindings[role]["databaseId"],assignments=assignments,accountReadCeiling=read_ceiling,
            accountReadCeilingDay=today.isoformat(),accountReadsHeld=0,accountWritesHeld=0)
        raw = json.dumps(auth,separators=(",",":")).encode()
        j(root/"operator-authorization.json",{"authorization":auth,"provenance":{"artifactId":"51","runId":"50",
            "contentSha256":hashlib.sha256(raw).hexdigest(),"digest":"sha256:"+"a"*64}})
        fake = root / "npx"
        shutil.copyfile(fixture_dir / "wrangler-provider.py", fake)
        fake.chmod(0o755)
        env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}", REAL_NPX=real_npx,
            RUNNER_TEMP=str(root), GITHUB_STEP_SUMMARY=str(root/"summary"), GITHUB_RUN_ID="42", CORPUS_PLAN_SHA256=plan, WORKER_SHA256=sha)
        # There are no provider credentials in the replay process.
        env.pop("CLOUDFLARE_API_TOKEN",None)
        env.pop("CLOUDFLARE_ACCOUNT_ID",None)
        def execute(phase, expect_ok=True):
            result = subprocess.run(["bash", str(repo/".github/scripts/release-workers.sh"), phase,role,mode],
                cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
            assert (result.returncode == 0) == expect_ok, f"{case} {phase}: {result.returncode} {result.stdout}"
        bad_preflight = wrong or stale or wrong_route or wrong_tag or stale_deployment or stale_database
        bad_mutation = tamper or expired or ambiguous
        execute("preflight", not bad_preflight)
        if bad_preflight:
            assert not (root/"provider-switched").exists()
        else:
            j(root/"release-evidence/corpus-readiness.json",executor_receipt)
            if tamper:
                (bundle / "worker.js").write_text("export default {unapproved: true};\n")
            if expired:
                auth["expiresAt"] = midnight.isoformat()
                raw = json.dumps(auth,separators=(",",":")).encode()
                package = json.loads((root/"operator-authorization.json").read_text())
                package["authorization"] = auth
                package["provenance"]["contentSha256"] = hashlib.sha256(raw).hexdigest()
                j(root/"operator-authorization.json", package)
            execute("deploy", not bad_mutation)
            if ambiguous:
                execute("reconcile")
                observation=json.loads((root/f"release-evidence/{role}-post-mutation-observation.json").read_text())
                assert observation["candidateBindingMatches"] and observation["observedActiveVersionId"] != assignments[role]["versionId"]
                execute("deploy", False)
            elif bad_mutation:
                assert not (root/"provider-switched").exists()
            else:
                execute("confirm")
                execute("finish")
                if role == "production":
                    execute("record")
                    accepted = json.loads((root / "release-evidence/accepted-production.json").read_text())
                    assert accepted["productionSource"] == subprocess.check_output(
                        ["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
                    assert accepted["databaseId"] == bindings[role]["databaseId"]
                final=json.loads((root/f"release-evidence/{role}-worker-deployment-identity.json").read_text())
                assert final["deployedVersionId"] == "223e4567-e89b-42d3-a456-426614174000"
        requests=(root/"provider.log").read_text().splitlines() if (root/"provider.log").exists() else []
        deploys=[request for request in requests if ' wrangler deploy ' in request]
        assert len(deploys) == (0 if bad_preflight or expired or tamper else 1), requests
        assert all(" d1 " not in request or " d1 list " in request for request in requests)
        print(f"{case}: PASS {len(requests)} provider operations, {len(deploys)} deployment attempts",flush=True)

replay("application preview", "preview", "application")
replay("application production", "production", "application")
replay("corpus preview prepared and already bound", "preview", "corpus")
replay("corpus production candidate cutover", "production", "corpus")
replay("wrong D1 refused", "production", "application", wrong=True)
replay("ambiguous successful cutover reconciled without a second mutation", "production", "corpus", ambiguous=True)

replay("stale production control refused during preview", "preview", "application", stale=True)
replay("stale production predecessor refused in production", "production", "application", stale=True)
replay("unexpected custom domain refused before provider access", "preview", "application", wrong_route=True)
replay("tampered bundle refused before mutation", "production", "application", tamper=True)
replay("expired approval refused at mutation boundary", "production", "corpus", expired=True)

replay("routine release after a tagged production release", "production", "application", tagged=True)
replay("preview after a tagged production release", "preview", "application", tagged=True)
replay("wrong accepted production tag refused", "preview", "application", tagged=True, wrong_tag=True)
replay("stale production deployment refused during preview", "preview", "application", stale_deployment=True)
replay("stale production D1 refused during preview", "preview", "application", stale_database=True)
replay("tagged production Worker mismatch refused during preview", "preview", "application", tagged=True, stale=True)
replay("tagged production deployment mismatch refused during preview", "preview", "application", tagged=True, stale_deployment=True)
replay("tagged production Worker mismatch refused during promotion", "production", "application", tagged=True, stale=True)
replay("tagged production deployment mismatch refused during promotion", "production", "application", tagged=True, stale_deployment=True)
replay("reviewed rebaseline verified as initial assignment", "production", "application", rebaseline=True)
