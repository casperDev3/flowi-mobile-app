#!/usr/bin/env python3
"""Generate a traceable candidate manifest from a clean checkout; never reads secrets."""
import argparse, hashlib, json, pathlib, platform, subprocess
from datetime import datetime, timezone
p=argparse.ArgumentParser();p.add_argument('--output',default='artifacts/release-manifest.json');p.add_argument('--allow-dirty',action='store_true');args=p.parse_args()
def cmd(*argv): return subprocess.check_output(argv,text=True).strip()
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
root=pathlib.Path('.')
status=cmd('git','status','--porcelain','--untracked-files=normal')
if status and not args.allow_dirty: raise SystemExit('Release manifest requires a clean checkout: '+status)
package=json.loads(pathlib.Path('package.json').read_text()) if pathlib.Path('package.json').exists() else {}
manifest={'schema':1,'created_at':datetime.now(timezone.utc).isoformat(),'repository':cmd('git','config','--get','remote.origin.url'),'sha':cmd('git','rev-parse','HEAD'),'clean':not bool(status),'versions':{'application':package.get('version'),'python':platform.python_version(),'dependencies':package.get('dependencies',{}),'devDependencies':package.get('devDependencies',{})},'lockfiles':{str(f):digest(f) for name in ['package-lock.json','requirements.lock.txt'] if (f:=root/name).exists()},'migrations':{str(f):digest(f) for f in sorted(root.glob('*/migrations/[0-9]*.py'))},'rollback':{'procedure':'docs/releases/S1-RELEASE.md','rule':'Restore prior immutable release; do not reverse DB schema or session_version. Restore backup only after explicit data-loss assessment.'}}
try: manifest['versions']['node']=cmd('node','--version')
except FileNotFoundError: pass
out=pathlib.Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');print(out)
