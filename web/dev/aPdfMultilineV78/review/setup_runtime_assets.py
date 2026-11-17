"""Restore pinned, hash-checked dependencies. Does not alter product files or Git."""
from pathlib import Path
import argparse,hashlib,io,json,shutil,ssl,sys,tarfile,tempfile,urllib.request

HERE=Path(__file__).resolve().parent
UPSTREAM='75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c'
MODEL_BASE=f'https://raw.githubusercontent.com/RedForestAI/WebEyeTrack/{UPSTREAM}/js/examples/minimal-example/public/web/'
PDF_TARBALL='https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz'
MAX_DOWNLOAD=50*1024*1024

def digest(data): return hashlib.sha256(data).hexdigest()
def fetch(url):
    try:
        import certifi
        context=ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context=ssl.create_default_context()
    request=urllib.request.Request(url,headers={'User-Agent':'NunDojang-A-Asset-Setup/1'})
    with urllib.request.urlopen(request,context=context,timeout=30) as response:
        data=response.read(MAX_DOWNLOAD+1)
    if len(data)>MAX_DOWNLOAD: raise RuntimeError('Dependency download exceeded 50MB limit')
    return data

def model_url(rel):
    if rel=='assets/models/face_landmarker.task':
        return 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    if rel.startswith('assets/vision/'):
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm/'+Path(rel).name
    if rel.startswith('assets/web/'):
        return MODEL_BASE+Path(rel).name
    raise RuntimeError('Unknown asset path: '+rel)

def safe_target(root,rel):
    target=(root/rel).resolve()
    if root.resolve() not in target.parents:raise RuntimeError('Unsafe asset path')
    return target

def put(root,rel,data,expected):
    if digest(data)!=expected:raise RuntimeError('SHA256 mismatch: '+rel)
    target=safe_target(root,rel);target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent,prefix='.asset-',delete=False) as out:
        temp=Path(out.name);out.write(data)
    try:temp.replace(target)
    finally:temp.unlink(missing_ok=True)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check-only',action='store_true',help='Verify local dependencies without downloads')
    ap.add_argument('--assets-from',type=Path,help='Copy hash-matched assets from another unpacked aPdfMultilineV78 folder first')
    ap.add_argument('--runtime-dir',type=Path,default=HERE.parent,help='Alternate isolated destination for setup verification')
    args=ap.parse_args();root=args.runtime_dir.resolve();manifest=json.loads((HERE/'ASSETS.json').read_text())
    wanted={**manifest['assets'],**manifest['pdfjsFiles']};pending=[]
    for rel,expected in wanted.items():
        target=safe_target(root,rel)
        if target.is_file() and digest(target.read_bytes())==expected:continue
        if args.assets_from and not args.check_only:
            local=safe_target(args.assets_from.resolve(),rel)
            if local.is_file() and digest(local.read_bytes())==expected:
                put(root,rel,local.read_bytes(),expected);continue
        pending.append(rel)
    if args.check_only:
        if pending:
            print(json.dumps({'verified':False,'missingOrDifferent':pending},ensure_ascii=False));return 2
        print(json.dumps({'verified':True,'dependencyFiles':len(wanted)},ensure_ascii=False));return 0
    model_paths=[p for p in pending if p.startswith('assets/')]
    for rel in model_paths:
        print('Preparing '+rel,flush=True);put(root,rel,fetch(model_url(rel)),wanted[rel])
    pdf_paths=[p for p in pending if p.startswith('vendor/pdfjs/')]
    if pdf_paths:
        print('Preparing PDF.js4.10.38 and supporting fonts/CMaps',flush=True)
        with tarfile.open(fileobj=io.BytesIO(fetch(PDF_TARBALL)),mode='r:gz') as archive:
            for rel in pdf_paths:
                inside=rel.removeprefix('vendor/pdfjs/')
                if inside in ['pdf.mjs','pdf.worker.mjs']:inside='build/'+inside
                member=archive.getmember('package/'+inside)
                if not member.isfile() or member.size>MAX_DOWNLOAD:raise RuntimeError('Unexpected archive member: '+inside)
                stream=archive.extractfile(member)
                if stream is None:raise RuntimeError('Missing archive member: '+inside)
                put(root,rel,stream.read(),wanted[rel])
    for rel,h in wanted.items():
        if digest(safe_target(root,rel).read_bytes())!=h:raise RuntimeError('Final verification failed: '+rel)
    print(json.dumps({'verified':True,'dependencyFiles':len(wanted),'downloadedOrRestored':len(pending),'productFilesChanged':False},ensure_ascii=False));return 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print('Asset setup failed: '+str(error),file=sys.stderr)
        if 'CERTIFICATE' in str(error).upper():
            print('Try: uv run --with certifi python web/dev/aPdfMultilineV78/review/setup_runtime_assets.py',file=sys.stderr)
        sys.exit(1)
