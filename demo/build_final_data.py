"""Read local private inputs, verify final CSVs against BC_analysis.ipynb, emit aggregates only.

Usage: python demo/build_final_data.py --data-root <private 02_data directory>
Never copy that directory into this repository or the deployment.
Supplemental tourism/supply/policy features are preserved from the existing public deployment.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import argparse
import hashlib
import json
import re
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
GROUP_CODES = {8001:'한식',8002:'한식',8003:'한식',8004:'일식·회',8005:'중식',8006:'양식·카페',8021:'분식·치킨',8301:'제과·떡',4004:'대형·슈퍼',4020:'대형·슈퍼',4010:'편의점'}

def build(root):
    # Notebook cells 4, 9, 11, 15: preserve populations and original 11 categories.
    eda = pd.read_csv(root/'raw/ABP_CONTEST_DATA.csv')
    for c in ['GENDER_CD','AGE_CD','SIDO_NM','CCG_NM']:
        eda[c] = eda[c].astype(str).str.strip()
    eda['TP_BUZ_NM_CLEAN'] = eda.TP_BUZ_NM.astype(str).str.replace(' ','',regex=False).str.strip()
    eda['region'] = eda.SIDO_NM+' '+eda.CCG_NM
    personal = eda[eda.GENDER_CD.isin(['1','2','3'])].copy()
    personal['nat'] = np.where(personal.GENDER_CD.eq('3'),'foreign','domestic')
    def tvd(value):
        z=personal.groupby(['region','nat','TP_BUZ_NM_CLEAN'])[value].sum().reset_index()
        z['share']=z.groupby(['region','nat'])[value].transform(lambda s:s/s.sum())
        p=z.pivot_table(index=['region','TP_BUZ_NM_CLEAN'],columns='nat',values='share',fill_value=0).reset_index()
        return p.assign(gap=(p.foreign-p.domestic).abs()).groupby('region').gap.sum()/2
    tv=tvd('amt'); rc=eda.groupby('region')['cnt'].sum(); cs=rc/rc.sum()
    scale_cut=float(cs.median()); tvd_cut=float(tv.median())
    structure=pd.Series(np.where(cs>=scale_cut,'대규모','소규모'),index=cs.index)+'·'+pd.Series(np.where(tv>=tvd_cut,'고괴리','저괴리'),index=tv.index)
    rm=eda.groupby(['region','STRD_YYMM']).agg(amt=('amt','sum'),cnt=('cnt','sum')).reset_index()
    # Notebook cell 23, same sum-then-divide ATV and national log subtraction.
    def momentum(m1,m2):
        a=rm[rm.STRD_YYMM.isin(m1)].groupby('region')[['amt','cnt']].sum()
        b=rm[rm.STRD_YYMM.isin(m2)].groupby('region')[['amt','cnt']].sum()
        na=a.sum(); nb=b.sum()
        out=pd.DataFrame(index=a.index)
        out['CNT']=(np.log(b.cnt/a.cnt)-np.log(nb.cnt/na.cnt))*100
        out['ATV']=(np.log((b.amt/b.cnt)/(a.amt/a.cnt))-np.log((nb.amt/nb.cnt)/(na.amt/na.cnt)))*100
        out['AMT']=out.CNT+out.ATV
        return out
    m3=momentum([202601,202602,202603],[202604,202605,202606])
    m2=momentum([202601,202602],[202605,202606])
    scales={}; stable={}
    for axis in ['CNT','ATV']:
        delta=m3[axis]-m2[axis]
        scales[axis]=float(1.4826*np.median(np.abs(delta-np.median(delta))))
        stable[axis]=(np.sign(m3[axis])==np.sign(m2[axis]))&(np.minimum(abs(m3[axis]),abs(m2[axis]))>scales[axis])
    conf=pd.Series(np.where(stable['CNT']&stable['ATV'],'High',np.where(stable['CNT']|stable['ATV'],'Medium','Low')),index=m3.index)
    foreign=personal[personal.nat.eq('foreign')]
    totals=foreign.groupby('region').agg(BC_foreign_amt_total=('amt','sum'),BC_foreign_cnt_total=('cnt','sum'))
    rg=personal.groupby(['region','nat']).amt.sum().unstack(fill_value=0)
    computed=pd.DataFrame({'cnt_share':cs,'tvd_amt':tv,'tvd_cnt':tvd('cnt'),'structure':structure,'confidence':conf,'foreign_amt_share_personal':rg.foreign/(rg.foreign+rg.domestic)}).join(totals)
    for axis in ['CNT','ATV']:
        computed[f'momentum_{axis.lower()}_3m_logpct']=m3[axis]
        computed[f'momentum_{axis.lower()}_2m_logpct']=m2[axis]
    computed['momentum_amt_3m_logpct']=m3.AMT
    computed['momentum_signal']=np.select([(m3.CNT>0)&(m3.ATV>0),m3.CNT>0,m3.ATV>0],['거래·객단가 동반 상승 신호','거래 확대 신호','객단가 상승 신호'],default='동반 약화 신호')
    check={}
    def compare(frame, expected, fields, name):
        assert not expected.index.has_duplicates, name+' duplicate region'
        assert set(frame.index)==set(expected.index),name+' region mismatch'
        expected=expected.reindex(frame.index)
        diffs={}
        for c in fields:
            if pd.api.types.is_numeric_dtype(frame[c]):
                diffs[c]=float((frame[c]-expected[c]).abs().max())
                assert np.allclose(frame[c],expected[c],rtol=1e-9,atol=1e-9,equal_nan=True),(name,c,diffs[c])
            else:
                assert frame[c].fillna('').eq(expected[c].fillna('')).all(),(name,c)
        check[name]={'regions':len(frame),'numeric_max_abs_diff':diffs,'labels_match':True}
    final=pd.read_csv(root/'derived/BC_external_context_final_255.csv').set_index('region')
    action=pd.read_csv(root/'derived/BC_action_matrix_recomputed_255.csv').set_index('region')
    strict_csv=pd.read_csv(root/'derived/BC_external_context_strict_251.csv').set_index('region')
    assert len(computed)==255 and eda.TP_BUZ_NM_CLEAN.nunique()==11
    compare(computed,action,list(computed.columns),'action_csv')
    compare(computed,final,list(computed.columns),'final_core')
    # Notebook cells 28, 46, 48, 50, 52: real external values and strict-only ranks.
    moj=pd.read_csv(root/'external/MOJ_registered_foreigners_202606_255.csv').set_index('region')
    pop=pd.read_csv(root/'external/MOIS_resident_population_202606_255.csv').set_index('region')
    core=computed.join(pop[['resident_population_202606']]).join(moj[['MOJ_registered_foreigners_202606']])
    core['registered_foreign_share']=core.MOJ_registered_foreigners_202606/(core.resident_population_202606+core.MOJ_registered_foreigners_202606)
    kto=pd.read_csv(root/'external/KTO_visitors_2026H1_raw.csv',dtype={'signguCode':str,'touDivCd':str,'baseYmd':str})
    kto['touDivCd']=kto.touDivCd.str.replace('.0','',regex=False)
    smap=dict(zip(['11','26','27','28','29','30','31','36','41','43','44','46','47','48','50','51','52'],['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','충청북도','충청남도','전라남도','경상북도','경상남도','제주특별자치도','강원특별자치도','전북특별자치도']))
    kto['region']=kto.signguCode.str[:2].map(smap)+' '+kto.signguNm
    kp=kto[kto.touDivCd.isin(['2','3'])].groupby(['region','touDivCd']).touNum.sum().unstack(fill_value=0)
    kp['kto_foreign_visit_share']=kp['3']/(kp['3']+kp['2'])
    kp['kto_foreign_observed_days']=kto[kto.touDivCd.eq('3')].groupby('region').baseYmd.nunique()
    core=core.join(kp[['kto_foreign_visit_share','kto_foreign_observed_days']])
    compare(core,final,['resident_population_202606','MOJ_registered_foreigners_202606','registered_foreign_share','kto_foreign_visit_share','kto_foreign_observed_days'],'external_inputs_all_255')
    strict=core[core.kto_foreign_observed_days.eq(181)].copy()
    assert len(strict)==251
    strict['visitor_pctile']=strict.kto_foreign_visit_share.rank(method='average',pct=True)*100
    strict['resident_pctile']=strict.registered_foreign_share.rank(method='average',pct=True)*100
    strict['context_gap']=strict.visitor_pctile-strict.resident_pctile
    q33,q67=strict.context_gap.quantile([1/3,2/3])
    strict['external_context']=pd.cut(strict.context_gap,[-np.inf,q33,q67,np.inf],labels=['정주우세형','혼합형','방문우세형'],include_lowest=True).astype(str)
    # OLS with an intercept, mathematically identical to notebook statsmodels. No new model.
    x=np.column_stack([np.ones(len(strict)),np.log1p(strict.MOJ_registered_foreigners_202606)])
    y=np.log1p(strict.BC_foreign_amt_total)
    strict['bc_spend_residual']=y-x@np.linalg.lstsq(x,y,rcond=None)[0]
    fields=['registered_foreign_share','kto_foreign_visit_share','kto_foreign_observed_days','visitor_pctile','resident_pctile','context_gap','external_context','bc_spend_residual']
    compare(strict,strict_csv,fields,'strict_context_csv')
    compare(strict,final.loc[strict.index],fields,'final_context_csv')
    pending=core.index.difference(strict.index)
    assert len(pending)==4 and all('화성시' in r for r in pending)
    assert final.loc[pending,'external_context'].isna().all()
    extra=json.loads((HERE/'supplemental.json').read_text(encoding='utf-8'))
    supply_path=HERE/'supply_data.json'
    if not supply_path.is_file():
        raise FileNotFoundError('Run build_supply.py with the official source ZIP before building final web data.')
    supply=json.loads(supply_path.read_text(encoding='utf-8'))
    supply_mapping=json.loads((HERE/'supply_mapping.json').read_text(encoding='utf-8'))
    supply_audit=json.loads((HERE/'supply_verification.json').read_text(encoding='utf-8'))
    core_checks=['all_store_ids_unique','source_regions_exactly_match_bc_255','no_unmatched_regions','no_zero_denominators','share_sum_100','incheon_admin_statutory_boundary_agrees']
    assert supply['meta']['verified'] and all(supply_audit['checks'][key] for key in core_checks),'Supply audit incomplete'
    assert supply['meta']['mapping_sha256']==hashlib.sha256((HERE/'supply_mapping.json').read_bytes()).hexdigest(),'Supply mapping changed: rebuild supply'
    supplies={r['id']:r for r in supply['regions']}
    assert set(supplies)==set(core.index),'Supply/BC region mismatch'
    meta=extra['meta']; regions=[]
    # Expose only aggregates; retain supplementary public-deployment features and provenance.
    months=sorted(eda.STRD_YYMM.unique())
    def monthly(frame,value):
        return frame.pivot_table(index='region',columns='STRD_YYMM',values=value,aggfunc='sum').reindex(columns=months)
    allcnt=monthly(eda,'cnt'); allamt=monthly(eda,'amt'); fcnt=monthly(foreign,'cnt'); famt=monthly(foreign,'amt')
    personal['group']=personal.TP_BUZ_NO.map(GROUP_CODES)
    assert personal['group'].notna().all()
    mixes={}
    for nat in ['foreign','domestic']:
        mix=personal[personal.nat.eq(nat)].groupby(['region','group']).amt.sum().unstack(fill_value=0)
        mixes[nat]=mix.div(mix.sum(axis=1),axis=0)*100
    def direction(v):return '상승' if v>0 else '하락' if v<0 else '안정'
    for old in extra['regions']:
        rid=old['id']; r=core.loc[rid]; s=strict.loc[rid] if rid in strict.index else None
        sido,ccg=rid.split(' ',1)
        ext={**old['ext'],**{key:supplies[rid][key] for key in ['stores_total','stores','supply_share','stores_in_scope']}}
        ext.update(reg_foreigners=int(r.MOJ_registered_foreigners_202606),population=int(r.resident_population_202606),resident_intensity=float(r.registered_foreign_share*100),visitors=float(kp.loc[rid,'3']/6))
        demand=mixes['foreign'].loc[rid].to_dict()
        ext['supply_gap']={g:float(demand[g]-ext['supply_share'][g]) for g in meta['groups']}
        regions.append(dict(id=rid,sido=sido,ccg=ccg,cluster=old['cluster'],context_sub=old['context_sub'],tour=old['tour'],ext=ext,
            famt=int(r.BC_foreign_amt_total),fcnt=int(r.BC_foreign_cnt_total),amt_all=int(allamt.loc[rid].sum()),cnt_all=int(rc[rid]),scale_share=float(cs[rid]),foreign_share=float(r.foreign_amt_share_personal*100),
            tvd=float(tv[rid]),structure=structure[rid],confidence=conf[rid],context=s.external_context if s is not None else '분류보류',
            momentum=dict(signal=computed.loc[rid,'momentum_signal'],cnt=direction(m3.loc[rid,'CNT']),atv=direction(m3.loc[rid,'ATV']),cnt_pct=float(m3.loc[rid,'CNT']),atv_pct=float(m3.loc[rid,'ATV']),amt_pct=float(m3.loc[rid,'AMT']),cnt2_pct=float(m2.loc[rid,'CNT']),atv2_pct=float(m2.loc[rid,'ATV'])),
            conf_detail=dict(block3=direction(m3.loc[rid,'CNT']),block2=direction(m2.loc[rid,'CNT']),stable_cnt=bool(stable['CNT'][rid]),stable_atv=bool(stable['ATV'][rid]),notes=[]),
            ctx=dict(visit_share=float(r.kto_foreign_visit_share*100),registered_share=float(r.registered_foreign_share*100),visitor_pctile=float(s.visitor_pctile) if s is not None else None,resident_pctile=float(s.resident_pctile) if s is not None else None,gap=float(s.context_gap) if s is not None else None,bc_residual=float(s.bc_spend_residual) if s is not None else None,observed_days=int(r.kto_foreign_observed_days),strict=s is not None),
            monthly=dict(famt=famt.loc[rid].astype(int).tolist(),fcnt=fcnt.loc[rid].astype(int).tolist(),amt_all=allamt.loc[rid].astype(int).tolist(),cnt_all=allcnt.loc[rid].astype(int).tolist()),mix_foreign=demand,mix_domestic=mixes['domestic'].loc[rid].to_dict()))
    cm=meta['thresholds']['context']
    cm.update(q33=float(q33),q67=float(q67),n_strict=251,n_sensitivity=4,sensitivity_regions=pending.tolist(),verify=dict(compared=251,label_match=251,max_gap_diff=check['strict_context_csv']['numeric_max_abs_diff']['context_gap']))
    def corr(a,b,method='pearson'):return float(strict[a].corr(strict[b],method=method))
    # Spearman is the Pearson correlation of average ranks (no scipy dependency).
    def rho(a,b):return float(strict[a].rank().corr(strict[b].rank()))
    cm.update(r_gap_residual=corr('context_gap','bc_spend_residual'),rho_gap_residual=rho('context_gap','bc_spend_residual'),r_gap_tvd=corr('context_gap','tvd_amt'),rho_gap_tvd=rho('context_gap','tvd_amt'),r_visit_residual=corr('kto_foreign_visit_share','bc_spend_residual'))
    cm['summary']=[dict(context=k,n=len(g),visit_share_median=float(g.kto_foreign_visit_share.median()*100),registered_share_median=float(g.registered_foreign_share.median()*100),bc_residual_median=float(g.bc_spend_residual.median()),tvd_median=float(g.tvd_amt.median())) for k,g in strict.groupby('external_context',sort=False)]
    meta['thresholds'].update(scale_cut=scale_cut,tvd_cut=tvd_cut,mom_band_pct=0,confidence_robust_scale=scales)
    meta['thresholds'].pop('min_conf_amt',None)
    meta.update(bc_period=f'{months[0]}~{months[-1]}',months=[int(v) for v in months],n_regions=len(regions))
    meta['national']['total_famt']=int(foreign.amt.sum())
    meta['national']['total_amt']=int(eda.amt.sum())
    meta['national']['total_personal_amt']=int(personal.amt.sum())
    meta['national']['bc_foreign_cnt']={str(k):int(v) for k,v in foreign.groupby('STRD_YYMM')['cnt'].sum().items()}
    meta['national']['bc_foreign_amt']={str(k):int(v) for k,v in foreign.groupby('STRD_YYMM')['amt'].sum().items()}
    national=eda.groupby('STRD_YYMM')[['amt','cnt']].sum()
    na=national.iloc[:3].sum(); nb=national.iloc[3:].sum()
    meta['national_momentum']=dict(cnt_pct=float(np.log(nb.cnt/na.cnt)*100),atv_pct=float(np.log((nb.amt/nb.cnt)/(na.amt/na.cnt))*100))
    meta['national']['bc_all_cnt']={str(k):int(v) for k,v in national.cnt.items()}
    meta['industry_mapping']={str(k):v for k,v in GROUP_CODES.items()}
    meta['core_industries']=sorted(eda.TP_BUZ_NM_CLEAN.unique())
    meta['supply']={**supply['meta'],'checks':supply_audit['checks']}
    meta['supply_industry_mapping']=supply_mapping['groups']
    meta['provenance']=dict(core='BC_analysis.ipynb, verified non-legacy final CSVs',supply='Official SEMAS 2026-06-30 ZIP independently aggregated with versioned explicit analytical crosswalk; 255 regions and eight-group denominator verified',supplemental='Existing Vercel public tourism/nationality/cluster aggregates and synthetic closure rates, retrieved 2026-10-27',synthetic=['ext.closure_risk'],estimated=['tourism spending unit: assumed thousand KRW'])
    meta['generated']='2026-10-27 (verified notebook aggregates)'
    check.update(pending_context_regions=pending.tolist(),confidence_robust_scale=scales,scale_cut=scale_cut,tvd_cut=tvd_cut,source_hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['raw/ABP_CONTEST_DATA.csv','derived/BC_action_matrix_recomputed_255.csv','derived/BC_external_context_final_255.csv','derived/BC_external_context_strict_251.csv']})
    (HERE/'data.js').write_text('window.BC_DATA = '+json.dumps(dict(meta=meta,regions=regions),ensure_ascii=False,allow_nan=False,separators=(',',':'))+';\n',encoding='utf-8')
    (HERE/'verification.json').write_text(json.dumps(check,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    # Content-derived asset versions prevent a previous deployment's cached JS/CSS from mixing with new data.
    index=HERE/'index.html'
    html=index.read_text(encoding='utf-8')
    def version(match):
        filename=match[2]
        digest=hashlib.sha256((HERE/filename).read_bytes()).hexdigest()[:12]
        return f'{match[1]}="{filename}?v={digest}"'
    html=re.sub(r'(src|href)="([^"?]+\.(?:js|css))(?:\?[^\"]*)?"',version,html)
    index.write_text(html,encoding='utf-8')
    print(json.dumps(check,ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--data-root',type=Path,required=True)
    build(parser.parse_args().data_root)
