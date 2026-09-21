"""Freeze/check the implemented shared boundary. Feature-owned bodies are excluded."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
patterns=['packages/*/src/**/*.ts','packages/*/package.json','packages/*/tsconfig.json','server/src/core/*.ts','server/src/auth/*.ts','server/src/db/**/*.ts','server/src/db/migrations/*.sql','server/src/app.ts','server/src/config.ts','server/src/modules/index.ts','server/tests/helpers/fixture.ts','web/src/services/*.ts','web/src/testing/registry.ts','web/tests/modules/helpers.ts','pnpm-lock.yaml','pnpm-workspace.yaml','package.json','server/package.json','web/package.json']
paths=sorted(set(p for pattern in patterns for p in root.glob(pattern)))
files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
aggregate=hashlib.sha256(''.join(f'{k}\0{v}\n' for k,v in files.items()).encode()).hexdigest()
manifest={'version':'2.0.0','sha256':aggregate,'files':files}
target=root/'web/implementation/contract-manifest.json'
if sys.argv[1:]==['--write']:
 target.write_text(json.dumps(manifest,indent=2)+'\n')
 print(aggregate)
else:
 expected=json.loads(target.read_text())
 if manifest!=expected:
  changed=sorted(k for k in set(files)|set(expected['files']) if files.get(k)!=expected['files'].get(k))
  print('Shared contract changed:',', '.join(changed));raise SystemExit(1)
 print('Shared contract matches',aggregate)
