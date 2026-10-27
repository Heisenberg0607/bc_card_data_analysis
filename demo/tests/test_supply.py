"""Synthetic fixtures only. Never contains real establishment records."""
import contextlib,copy,hashlib,io,json,sys,uuid,unittest,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import build_supply as bs
TEMP_ROOT=Path(__file__).resolve().parent/'.tmp'
TEMP_ROOT.mkdir(exist_ok=True)
@contextlib.contextmanager
def fixture_dir():
    resolved=(TEMP_ROOT/('fixture_'+uuid.uuid4().hex)).resolve()
    if not resolved.is_relative_to(TEMP_ROOT.resolve()):raise RuntimeError('Temporary path escaped test directory')
    resolved.mkdir()
    try:yield str(resolved)
    finally:
        for file in resolved.iterdir():
            if file.is_dir():raise RuntimeError('Unexpected subdirectory in fixture')
            file.unlink()
        resolved.rmdir()

class SupplyTests(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((bs.HERE/'supply_mapping.json').read_text(encoding='utf-8'))

    def test_source_category_boundaries(self):
        mapping,_=bs.crosswalk(self.config)
        self.assertEqual(mapping['I20111'],'일식·회')
        self.assertEqual(mapping['I20112'],'한식')
        self.assertEqual(mapping['I21003'],'양식·카페')
        self.assertEqual(mapping['I21006'],'분식·치킨')
        self.assertEqual(mapping['I21008'],'제과·떡')
        self.assertEqual(mapping['G20499'],'대형·슈퍼')
        self.assertNotIn('I20501',mapping)
        self.assertNotIn('I21101',mapping)

    def test_no_double_mapping(self):
        bad=copy.deepcopy(self.config);bad['groups']['편의점']['I20111']='횟집'
        with self.assertRaisesRegex(ValueError,'Duplicate'):bs.crosswalk(bad)

    def test_region_keys(self):
        self.assertEqual(bs.normalize_region('강원도','강릉시',self.config),'강원특별자치도 강릉시')
        self.assertEqual(bs.normalize_region('세종특별자치시',None,self.config),'세종특별자치시 세종특별자치시')
        self.assertNotEqual(bs.normalize_region('서울특별시','중구',self.config),bs.normalize_region('부산광역시','중구',self.config))
        self.assertEqual(bs.normalize_region('경기도',' 화성시   동탄구 ',self.config),'경기도 화성시 동탄구')
        self.assertEqual(bs.normalize_region('전남광주통합특별시','동구',self.config),'광주광역시 동구')
        self.assertEqual(bs.normalize_region('전남광주통합특별시','영암군',self.config),'전라남도 영암군')
        self.assertEqual(bs.normalize_region('인천광역시','제물포구',self.config,'금창동'),'인천광역시 동구')
        self.assertEqual(bs.normalize_region('인천광역시','제물포구',self.config,'신포동'),'인천광역시 중구')
        self.assertEqual(bs.normalize_region('인천광역시','검단구',self.config),'인천광역시 서구')
        with self.assertRaisesRegex(ValueError,'Unmapped administrative'):bs.normalize_region('인천광역시','제물포구',self.config,'UNKNOWN')

    def fixture(self,root,duplicate=False,unmatched=False,bad_name=False):
        base=json.loads((bs.HERE/'supplemental.json').read_text(encoding='utf-8'))
        import csv
        sources={}
        for i,r in enumerate(base['regions']):
            sido,ccg=r['id'].split(' ',1)
            rows=sources.setdefault('전남광주' if sido in ['전라남도','광주광역시'] else sido,[])
            for group,entries in self.config['groups'].items():
                code=next(iter(entries));name=entries[code]
                rows.append([f'TEST_ONLY_{i}_{code}',code,'bad name' if bad_name and i==0 else name,sido,'Unknown fixture district' if unmatched and i==0 else ccg,'TEST_DONG','TEST_LEGAL_DONG'])
        if duplicate:
            rows=next(iter(sources.values()));rows.append(rows[0])
        path=root/'synthetic_fixture.zip'
        with zipfile.ZipFile(path,'w') as z:
            for i,(sido,rows) in enumerate(sources.items()):
                out=io.StringIO();w=csv.writer(out);w.writerow(bs.COLS);w.writerows(rows)
                z.writestr(f'TEST_ONLY_{i}_202606.csv',out.getvalue())
        manifest=dict(source_page=self.config['source_page'],snapshot_date='2026-06-30',sha256=bs.sha256(path),download_url='SYNTHETIC TEST ONLY',source_name='SYNTHETIC TEST ONLY',downloaded='test',bytes=path.stat().st_size)
        mp=root/'manifest.json';mp.write_text(json.dumps(manifest),encoding='utf-8')
        return path,mp

    def test_exact_store_count_denominator_and_coverage(self):
        with fixture_dir() as tmp:
            root=Path(tmp);z,m=self.fixture(root)
            with contextlib.redirect_stdout(io.StringIO()):audit=bs.build(z,m,root/'out.json',root/'audit.json')
            result=json.loads((root/'out.json').read_text(encoding='utf-8'))
            self.assertEqual(audit['meta']['raw_rows'],2040)
            self.assertEqual(len(result['regions']),255)
            for r in result['regions']:
                self.assertEqual(r['stores_total'],8);self.assertEqual(r['stores_in_scope'],8)
                self.assertEqual(set(r['stores'].values()),{1});self.assertEqual(set(r['supply_share'].values()),{12.5})
            self.assertFalse(audit['comparison_checks']['all_2040_group_counts_match_existing'])

    def test_duplicate_ids_rejected(self):
        with fixture_dir() as tmp:
            root=Path(tmp);z,m=self.fixture(root,duplicate=True)
            with self.assertRaisesRegex(ValueError,'Duplicate'),contextlib.redirect_stdout(io.StringIO()):bs.build(z,m,root/'out',root/'audit')

    def test_unmatched_regions_rejected(self):
        with fixture_dir() as tmp:
            root=Path(tmp);z,m=self.fixture(root,unmatched=True)
            with self.assertRaisesRegex(ValueError,'Unmatched'),contextlib.redirect_stdout(io.StringIO()):bs.build(z,m,root/'out',root/'audit')

    def test_changed_category_names_rejected(self):
        with fixture_dir() as tmp:
            root=Path(tmp);z,m=self.fixture(root,bad_name=True)
            with self.assertRaisesRegex(ValueError,'Category name changed'),contextlib.redirect_stdout(io.StringIO()):bs.build(z,m,root/'out',root/'audit')

    def test_wrong_hash_rejected(self):
        with fixture_dir() as tmp:
            root=Path(tmp);z,m=self.fixture(root)
            with z.open('ab') as f:f.write(b'changed')
            with self.assertRaisesRegex(ValueError,'snapshot/hash'),contextlib.redirect_stdout(io.StringIO()):bs.build(z,m,root/'out',root/'audit')

if __name__=='__main__':unittest.main()
