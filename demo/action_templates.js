/* All languages use the same plan, numeric fields, evidence IDs and intensity IDs. */
window.ActionTemplates = (() => {
  const cite=ids=>ids.map(id=>`[${id}]`).join('');
  const sign=v=>(v>0?'+':'')+v.toFixed(2);
  function generate(r,plan,{KB,D,EV,tourPlan}) {
    const L=window.I18n, lang=L.lang;
    const fill=s=>L.text(s).replaceAll('{GAP}',L.text(plan.tg.g1)).replaceAll('{GAP2}',L.text(plan.tg.g2));
    return plan.actions.map(a=>{
      const {sh,cell,strength,timing,retrieved,level}=a;
      const valid=new Set(retrieved.valid.map(e=>e.id));
      const ids=cell.evidence.filter(id=>valid.has(id));
      const base=fill(cell.action);
      const parts=[base+' '+cite(ids)];
      const fact=L.msg('Scale {0}% · TVD {1} · CNT {2} / ATV {3} log %p · Confidence {4}.',(r.scale_share*100).toFixed(4),r.tvd.toFixed(3),sign(r.momentum.cnt_pct),sign(r.momentum.atv_pct),r.confidence);
      if(r.ctx.strict) {
        parts.push(L.msg(level===1?'권고 수준에 따라 소규모 검증과 추가 관찰을 먼저 진행한다.':'전체 CNT와 ATV의 초과변화를 점검하고 실행 시점을 조정한다.')+' [EV-RES-02]');
        parts.push(L.msg('Context {0} · ContextGap {1}.',L.text(r.context),sign(r.ctx.gap))+' [EV-RES-04]');
        if(sh.key==='MER' && plan.tg.hasGap) parts.push(L.msg('추가 기능: {0} Supply Gap {1}%p, 폐업률 {2}% (합성). 공급은 공식 원본에서 재집계·검증했다.',L.text(plan.tg.g1),sign(plan.tg.gap1),plan.tg.closure1.toFixed(1))+' [EV-SUPPLY-01][EV-LOCAL-01]');
        const tour=tourPlan(r,sh.key);
        const used=new Set(tour.map(t=>t.id));
        if(r.context_sub==='산업' && sh.key!=='BC') parts.push(L.msg('추가 기능: 근로자 생활권 가설을 검토하고 주말·야간 운영을 소규모로 시험한다.')+' [EV-LIT-01]');
        if(used.has('EV-TOUR-04')) {
          if(r.tour.stay_type==='숙박 체류형') parts.push(L.msg('추가 기능: 평균 숙박 {0}일로 숙박 연계 상품을 검토한다.',r.tour.nights)+' [EV-TOUR-04]');
          if(r.tour.stay_type==='단시간 방문형') parts.push(L.msg('추가 기능: 평균 체류 {0}분으로 동선·야간 프로그램을 소규모로 검토한다.',r.tour.dwell_min)+' [EV-TOUR-04]');
        }
        if(used.has('EV-TOUR-06')) parts.push(L.msg('추가 기능: 시도 방문자 증가율 {0}%는 핵심 Momentum과 별도로 해석한다.',r.tour.sido.growth)+' [EV-TOUR-06]');
        if(used.has('EV-TOUR-07')) {
          const e=D.meta.national.tourism.easy_nat[0];
          parts.push(L.msg('추가 기능: 전국 외국인 간편결제 관광소비 중 {0}의 비중은 {1}%다.',L.text(e.nat),e.pct)+' [EV-TOUR-07]');
        }
        if(tour.some(t=>t.id==='EV-TOUR-05') && r.tour.attractions.length) {
          const title=r.tour.attractions[0].name;
          parts.push(L.msg('추가 기능: 검색 관광지 {0}, 평균 숙박 {1}일, 체류 {2}분.',title,r.tour.nights??'—',r.tour.dwell_min??'—')+' [EV-TOUR-05][EV-TOUR-04]');
        }
        if(sh.key==='BC') {
          const type=r.context==='정주우세형'?'정주':r.context==='방문우세형'?'방문':'정주·방문';
          parts.push(L.msg('추가 기능: 전국 {0} 국적 분포를 참고한다. 지역 고객 국적을 직접 측정한 값은 아니다.',L.text(type))+' '+cite([r.context==='정주우세형'?'EV-MOJ-01':'EV-TOUR-03']));
        }
        retrieved.valid.filter(e=>e.type==='정책').slice(0,2).forEach(e=>parts.push(L.msg('지원사업 원문: {0}. 자격·유효기간은 개별 공고를 확인한다.',e.title)+' '+cite([e.id])));
      }
      // All template sentence evidence must belong to the actually retrieved set.
      const action=parts.map(s=>s.replace(/\[([A-Z]+-[A-Z0-9-]+)\]/g,(m,id)=>valid.has(id)?m:'')).join(' ');
      const evidence_ids=[...new Set([...action.matchAll(/\[([A-Z]+-[A-Z0-9-]+)\]/g)].map(m=>m[1]))];
      return {stakeholder:sh.key,label:L.text(sh.label),cell_id:cell.id,strategy:cell.strategy,strength,timing,action,why:fact,
        kpi:cell.kpi.map(L.text),expected_effect:L.text(cell.expected_effect),
        caution:L.text(cell.avoid_when),evidence_ids,language:lang};
    });
  }
  function forbidden(lang){return ({ko:['즉시 확대','대규모 투자','적극 투자','전면 확대','적극 확대'],en:['invest immediately','large-scale investment','aggressive investment','full rollout'], 'zh-CN':['立即扩大','大规模投资','积极投资','全面扩大']})[lang];}
  function languageOk(card,lang){
    // Original evidence and attraction titles may remain in Korean as named sources.
    let body=card.action;
    for(const e of window.ACTION_KB.evidence)body=body.replaceAll(e.title,'');
    for(const r of window.BC_DATA.regions) for(const t of r.tour.attractions)body=body.replaceAll(t.name,'');
    return lang==='ko'?/[가-힣]/.test(body):lang==='en'?!/[가-힣\u4e00-\u9fff]/.test(body):/[\u4e00-\u9fff]/.test(body)&&!/[가-힣]/.test(body);
  }
  return {generate,forbidden,languageOk};
})();
