"""Fetch the pinned official source to a LOCAL directory outside demo; no API key needed."""
import argparse,hashlib,http.cookiejar,json,sys,urllib.parse,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent
def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def fetch(output_dir):
    root=output_dir.resolve()
    if root.is_relative_to(HERE):raise ValueError('Raw source must be stored outside the web/demo directory')
    root.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((HERE/'supply-source.json').read_text(encoding='utf-8'))
    dest=root/'stores_20260630.zip'
    if dest.exists() and file_hash(dest)==manifest['sha256']:
        print('Pinned source already present and SHA-256 verified');return dest
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.open(manifest['source_page'],timeout=60).read()
    query=urllib.parse.parse_qs(urllib.parse.urlparse(manifest['download_url']).query)
    params={k:query[k][0] for k in ['atchFileId','fileDetailSn']}
    request=urllib.request.Request('https://www.data.go.kr/cmm/cmm/check-limit.json',data=urllib.parse.urlencode(params).encode(),headers={'Referer':manifest['source_page'],'X-Requested-With':'XMLHttpRequest'})
    with opener.open(request,timeout=60) as response:limit=json.load(response)
    if limit.get('needCaptcha'):raise RuntimeError('Portal requires a CAPTCHA. Download manually from the official page; no bypass attempted.')
    request=urllib.request.Request(manifest['download_url'],headers={'Referer':manifest['source_page']})
    partial=dest.with_suffix('.partial');h=hashlib.sha256();size=0
    with opener.open(request,timeout=120) as response,partial.open('wb') as out:
        for b in iter(lambda:response.read(4*1024*1024),b''):
            if size==0 and not b.startswith(b'PK'):raise ValueError('Portal did not return a ZIP')
            out.write(b);h.update(b);size+=len(b)
    if h.hexdigest()!=manifest['sha256'] or size!=manifest['bytes']:raise ValueError('Downloaded source differs from the pinned source. Review before using it.')
    partial.replace(dest);print('Downloaded and SHA-256 verified:',dest);return dest
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--output-dir',required=True,type=Path);fetch(parser.parse_args().output_dir)
