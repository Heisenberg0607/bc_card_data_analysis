"""Rebuild supplemental supply from the official 2026-06 store ZIP, without publishing raw rows.

python demo/build_supply.py --source-zip <local ZIP> --source-manifest <download manifest>
Then run build_final_data.py normally. Closure rates remain separate synthetic data.
"""
from __future__ import annotations
import argparse,collections,hashlib,io,json,sys,zipfile
from pathlib import Path
import pandas as pd

HERE=Path(__file__).resolve().parent
COLS=['상가업소번호','상권업종소분류코드','상권업종소분류명','시도명','시군구명','행정동명','법정동명']
def sha256(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()

def crosswalk(config):
    mapping={};names={}
    for group,codes in config['groups'].items():
        for code,name in codes.items():
            if code in mapping:raise ValueError(f'Duplicate category mapping: {code}')
            mapping[code]=group;names[code]=name
    return mapping,names

def normalize_region(sido,ccg,config,admin_dong=None):
    sido=config['province_aliases'].get(str(sido).strip(),str(sido).strip())
    ccg='' if pd.isna(ccg) else ' '.join(str(ccg).split())
    if sido=='세종특별자치시' and ccg in ['', '세종시', '세종특별자치시']:ccg='세종특별자치시'
    source=f'{sido} {ccg}'
    split=config.get('split_districts',{}).get(source)
    if split:
        dong=str(admin_dong).strip().replace('·','.')
        if dong not in split['by_admin_dong']:raise ValueError(f'Unmapped administrative neighborhood in split district: {source}, {dong}')
        return split['by_admin_dong'][dong]
    return config.get('source_region_aliases',{}).get(source,source)

def display_filename(info):
    if info.flag_bits & 0x800:return info.filename
    try:return info.filename.encode('cp437').decode('cp949')
    except (UnicodeError,ValueError):return info.filename

def build(source_zip,source_manifest,output=HERE/'supply_data.json',audit_output=HERE/'supply_verification.json'):
    config=json.loads((HERE/'supply_mapping.json').read_text(encoding='utf-8'))
    mapping,names=crosswalk(config)
    baseline=json.loads((HERE/'supplemental.json').read_text(encoding='utf-8'))
    targets={r['id']:r for r in baseline['regions']}
    manifest=json.loads(Path(source_manifest).read_text(encoding='utf-8'))
    digest=sha256(source_zip)
    if manifest.get('snapshot_date')!='2026-06-30' or manifest.get('sha256')!=digest:raise ValueError('Source snapshot/hash does not match the download manifest')
    if manifest.get('source_page')!=config['source_page']:raise ValueError('Unexpected source authority')
    groups=list(config['groups']);seen=set();total=collections.Counter();counts=collections.Counter();taxonomy=collections.Counter();unmatched=collections.Counter();entries=[]
    n=0;boundary_rows=0
    with zipfile.ZipFile(source_zip) as archive:
        csvs=[i for i in archive.infolist() if i.filename.lower().endswith('.csv')]
        if len(csvs)!=config['expected_source_csvs']:raise ValueError(f"Expected {config['expected_source_csvs']} provincial CSV files, got {len(csvs)}")
        for info in csvs:
            name=display_filename(info)
            if '202606' not in name:raise ValueError('Mixed source period: '+name)
            rowcount=0
            with archive.open(info) as stream:
                for chunk in pd.read_csv(stream,encoding='utf-8-sig',usecols=COLS,dtype=str,chunksize=50000):
                    for col in ['상가업소번호','상권업종소분류코드','상권업종소분류명','시도명']:
                        if chunk[col].isna().any():raise ValueError('Required field missing: '+col)
                        chunk[col]=chunk[col].str.strip()
                    ids=chunk['상가업소번호']
                    if ids.duplicated().any() or any(x in seen for x in ids):raise ValueError('Duplicate store IDs; refusing to double-count')
                    seen.update(ids)
                    # Validate the names tied to mapped official codes. Unknown codes are audited, not guessed.
                    for code,source_name in chunk[['상권업종소분류코드','상권업종소분류명']].drop_duplicates().itertuples(index=False,name=None):
                        if code in names and names[code]!=source_name:raise ValueError(f'Category name changed: {code}, expected {names[code]}, got {source_name}')
                    chunk['region']=[normalize_region(s,c,config,a) for s,c,a in zip(chunk['시도명'],chunk['시군구명'],chunk['행정동명'])]
                    boundary=chunk.loc[chunk['시도명'].eq('인천광역시')&chunk['시군구명'].eq('제물포구')]
                    if len(boundary):
                        if boundary['법정동명'].isna().any():raise ValueError('Missing statutory neighborhood in boundary crosscheck')
                        dong_names=config['split_districts']['인천광역시 제물포구']['former_dong_legal_names']
                        legal_target=boundary['법정동명'].map(lambda v:'인천광역시 동구' if v in dong_names else '인천광역시 중구')
                        if not legal_target.eq(boundary['region']).all():raise ValueError('Administrative/statutory neighborhood crosschecks disagree')
                        boundary_rows+=len(boundary)
                    chunk['group']=chunk['상권업종소분류코드'].map(mapping)
                    total.update(chunk.groupby('region').size().to_dict())
                    counts.update(chunk.dropna(subset=['group']).groupby(['region','group']).size().to_dict())
                    taxonomy.update(chunk.groupby(['상권업종소분류코드','상권업종소분류명']).size().to_dict())
                    unmatched.update(chunk.loc[~chunk.region.isin(targets)].groupby('region').size().to_dict())
                    n+=len(chunk);rowcount+=len(chunk)
            entries.append(dict(name=name,rows=rowcount,uncompressed_bytes=info.file_size,crc32=f'{info.CRC:08x}'))
            print(f'Read {name}: {rowcount:,} rows',flush=True)
    if unmatched:raise ValueError('Unmatched source regions; provide an explicit verified crosswalk: '+json.dumps(unmatched,ensure_ascii=False))
    if set(total)!=set(targets):raise ValueError('Source regions differ from BC 255 region universe')
    regions=[];changes=[];zero=[]
    for rid in sorted(targets):
        stores={g:int(counts[rid,g]) for g in groups};denom=sum(stores.values())
        if denom==0:zero.append(rid);continue
        shares={g:stores[g]/denom*100 for g in groups}
        if abs(sum(shares.values())-100)>1e-10:raise ValueError('Share normalization failed')
        old=targets[rid]['ext']
        for g in groups:
            if stores[g]!=old['stores'][g]:changes.append(dict(region=rid,group=g,old_stores=old['stores'][g],rebuilt_stores=stores[g],difference=stores[g]-old['stores'][g]))
        regions.append(dict(id=rid,stores_total=int(total[rid]),stores_in_scope=denom,stores=stores,supply_share=shares))
    if zero:raise ValueError('No in-scope stores: '+json.dumps(zero,ensure_ascii=False))
    all_name_sets=collections.defaultdict(set)
    for code,name in taxonomy:all_name_sets[code].add(name)
    if any(len(ns)!=1 for ns in all_name_sets.values()):raise ValueError('One source code has multiple names')
    total_diffs=[dict(region=r['id'],old=targets[r['id']]['ext']['stores_total'],rebuilt=r['stores_total']) for r in regions if r['stores_total']!=targets[r['id']]['ext']['stores_total']]
    max_share_delta=max(abs(round(r['supply_share'][g],2)-targets[r['id']]['ext']['supply_share'][g]) for r in regions for g in groups)
    source={k:manifest[k] for k in ['source_page','download_url','source_name','snapshot_date','downloaded','sha256','bytes']}
    meta=dict(source=source,mapping_version=config['version'],mapping_sha256=sha256(HERE/'supply_mapping.json'),mapping_kind=config['mapping_kind'],denominator=config['denominator'],n_regions=len(regions),raw_rows=n,unique_store_ids=len(seen),in_scope_stores=sum(r['stores_in_scope'] for r in regions),groups=groups,verified=True)
    audit=dict(meta=meta,checks=dict(provincial_files=len(entries),all_store_ids_unique=len(seen)==n,source_regions_exactly_match_bc_255=True,no_unmatched_regions=True,no_zero_denominators=True,share_sum_100=True,incheon_admin_statutory_boundary_agrees=True,all_store_totals_match_existing=not total_diffs,all_2040_group_counts_match_existing=not changes,rounded_shares_match_existing=max_share_delta<1e-9),incheon_boundary_rows_crosschecked=boundary_rows,baseline_comparison=dict(regions_matching_all_group_counts=len(regions)-len({d['region'] for d in changes}),group_cells_matching=255*8-len(changes),changed_regions=sorted({d['region'] for d in changes}),note='Source-valid corrections are not coerced to match a previous deployment snapshot'),max_rounded_share_difference=max_share_delta,source_files=entries,mapping=config,source_categories=[dict(code=c,name=name,stores=count,group=mapping.get(c),disposition='included' if c in mapping else 'excluded: outside the eight supplementary groups') for (c,name),count in sorted(taxonomy.items())],group_count_differences=changes,all_store_total_differences=total_diffs)
    # Agreement with a previous deployment is evidence, not a validity requirement.
    # Keep legitimate corrections separate from source-integrity PASS checks.
    compare_keys=['all_store_totals_match_existing','all_2040_group_counts_match_existing','rounded_shares_match_existing']
    audit['comparison_checks']={k:audit['checks'].pop(k) for k in compare_keys}
    Path(output).write_text(json.dumps(dict(meta=meta,regions=regions),ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
    Path(audit_output).write_text(json.dumps(audit,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')
    print(json.dumps(audit['checks'],ensure_ascii=False,indent=2));return audit

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--source-zip',type=Path,required=True);parser.add_argument('--source-manifest',type=Path,default=HERE/'supply-source.json')
    args=parser.parse_args();build(args.source_zip,args.source_manifest)
