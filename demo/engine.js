/* Rule Engine → RAG → LLM → Evaluator  (기획서 6·7·10·11장)
 *
 * 1) buildPacket   : 분석 엔진 결과를 JSON 진단 패킷으로 정형화
 * 2) runRules      : Structure·Context로 Action Cell 선택, Momentum=시점, Confidence=강도
 * 3) retrieve      : Cell 근거 + 이해관계자 대상 정책 검색, 유효기간 지난 정책 제외
 * 4) generateTemplate / generateQwen : 근거 범위 안에서 문장 생성
 * 5) evaluate      : Groundedness·Citation·KPI·Confidence 준수 자동 점검
 */
window.Engine = (function () {
  const KB = window.ACTION_KB;
  const D = window.BC_DATA;
  const EV = Object.fromEntries(KB.evidence.map((e) => [e.id, e]));
  const GAP_MIN = 5;          // Supply Gap 기준값(%p)
  const CLOSURE_MAX = 15;     // 폐업률 경고(%)
  const LEVELS = { 3: "적극", 2: "파일럿→확대", 1: "파일럿·추가 관찰" };
  const CONF_LEVEL = { High: 3, Medium: 2, Low: 1 };
  const FORBIDDEN_LOW = ["즉시", "대규모 투자", "적극 투자", "전면 확대", "적극 확대"];
  const POLICY_TARGET = { BC: [], MER: ["소상공인", "창업자"], GOV: ["지자체"] };
  const POLICY_PICK = 2;   // 이해관계자당 연계 정책 수
  // External Context (보고서 7.3): ContextGap 3분위
  const RES = "정주우세형", MIX = "혼합형", VIS = "방문우세형";
  const hasVisit = (r) => r.ctx.strict && r.context !== RES;      // 방문 수요 신호(관광지·체류·방문 국적)를 쓰는 지역
  const hasResident = (r) => r.ctx.strict && r.context !== VIS;   // 정주 수요 신호(등록외국인·생활권)를 쓰는 지역

  /** 진단 결과 → 필요한 정책 태그(우선순위 순). BC는 정책 집행 주체가 아니라 비움. */
  function policyTags(r, shKey, tg) {
    if (shKey === "BC" || !r.ctx.strict) return [];
    if (shKey === "GOV") {
      return { [VIS]: ["관광", "외국인", "상권"], [MIX]: ["상권", "관광", "생활"], [RES]: ["생활", "협업", "상권"] }[r.context];
    }
    const t = [];
    if (tg.closure1 >= CLOSURE_MAX) t.push("재기");
    if (tg.hasGap) t.push("창업");
    t.push(...({ [VIS]: ["외국인"], [MIX]: ["외국인", "디지털"], [RES]: ["디지털"] }[r.context]), "판로", "경영안정");
    return t;
  }

  function pickPolicies(r, shKey, tg) {
    const tags = policyTags(r, shKey, tg);
    if (!tags.length) return [];
    const block = r.context === RES ? ["관광"] : [];   // 정주우세형에는 관광 전용 사업을 붙이지 않는다
    return KB.evidence
      .filter((e) => e.type === "정책" && POLICY_TARGET[shKey].includes(e.target)
        && !(e.valid_to && e.valid_to < KB.TODAY) && (e.tags || []).some((x) => tags.includes(x))
        && !(e.tags || []).some((x) => block.includes(x)))
      .map((e) => ({ e, rank: Math.min(...(e.tags || []).map((x) => (tags.indexOf(x) + 1 || 99))) }))
      .sort((a, b) => a.rank - b.rank || (b.e.budget || 0) - (a.e.budget || 0))
      .reduce((acc, x) => {   // 같은 성격(태그)의 사업이 겹치지 않게 한 건씩
        if (acc.length < POLICY_PICK && !acc.some((y) => y.rank === x.rank)) acc.push(x);
        return acc;
      }, [])
      .map((x) => x.e);
  }

  const eok = (v) => (v / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
  const TN = D.meta.national.tourism;
  const NAT_V = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 3);
  const NAT_R = D.meta.national.moj_top.slice(0, 3).map((x) => ({ nat: x.nat, pct: +(x.n / D.meta.national.moj_total * 100).toFixed(1) }));
  const EASY = TN.easy_nat[0];
  const natText = (xs) => xs.map((x) => `${x.nat}(${x.pct}%)`).join("·");

  // 데이터랩 관광 신호 → 이해관계자별 추가 문장 + 근거 ID. retrieve와 generateTemplate이 같이 쓴다.
  function tourPlan(r, shKey) {
    const t = r.tour, c = r.ctx, out = [];
    if (!r.ctx.strict) return out;
    const g = t.sido.growth;
    if (shKey === "BC") {
      out.push({ id: "EV-RES-04", text: `외국인 방문비중 ${c.visit_share}%(백분위 ${c.visitor_pctile})와 등록외국인 비율 ${c.registered_share}%(백분위 ${c.resident_pctile})의 차이 ContextGap ${c.gap > 0 ? "+" : ""}${c.gap}로 ${r.context}이다${c.strict ? "" : " (KTO 관측 " + c.observed_days + "일 — 민감도 판정)"}.` });
      if (hasResident(r))
        out.push({ id: "EV-MOJ-02", text: `이 지역 등록외국인은 ${r.ext.reg_foreigners.toLocaleString()}명(주민 대비 ${r.ext.resident_intensity}%)이다.` });
      if (r.context === RES)
        out.push({ id: "EV-MOJ-01", text: `타깃 국적은 전국 등록외국인 상위 ${natText(NAT_R)}에 맞춰 안내 언어와 혜택을 정한다.` });
      if (r.context === VIS)
        out.push({ id: "EV-TOUR-03", text: `방한 방문객 비중이 큰 ${natText(NAT_V)} 고객을 우선 타깃 국적으로 한다.` });
      if (r.context === MIX)
        out.push({ id: "EV-TOUR-03", text: `정주 고객은 등록외국인 상위 ${natText(NAT_R)}, 방문 고객은 방한 상위 ${natText(NAT_V)}로 타깃을 나눈다.` });
      if (hasVisit(r))
        out.push({ id: "EV-TOUR-07", text: `외국인 간편결제 관광소비의 ${EASY.pct}%가 ${EASY.nat} 국적이므로 참여 가맹점의 해당 간편결제 수용 여부를 함께 점검한다.` });
    }
    if (!hasVisit(r)) return out;
    const attr = t.attractions;
    if (attr.length && shKey !== "BC")
      out.push({ id: "EV-TOUR-05", text: `검색 상위 관광지 '${attr[0].name}'(${attr[0].rank}위)${attr.length > 1 ? ` 등 ${attr.length}곳` : ""}과 인근 상권을 잇는 동선을 우선 검토한다.` });
    if (t.stay_type === "숙박 체류형" && shKey !== "GOV")
      out.push({ id: "EV-TOUR-04", text: `방문자 평균 숙박일수가 ${t.nights}일로 길어(상위 ${Math.max(1, 100 - t.nights_pct)}%) 숙박 가맹점과 묶은 교차소비 구성이 맞다.` });
    if (t.stay_type === "단시간 방문형" && shKey !== "BC")
      out.push({ id: "EV-TOUR-04", text: `방문자 평균 체류시간이 ${t.dwell_min}분으로 짧아(하위 ${Math.max(1, t.dwell_pct)}%) 야간·연계 코스로 체류를 늘리는 것이 먼저다.` });
    if (g != null && g >= 2 && shKey !== "MER")
      out.push({ id: "EV-TOUR-06", text: `${r.sido} 방문자가 ${g}% 늘고 있어 방문 수요 대응을 앞당길 근거가 있다.` });
    if (g != null && g < 0 && shKey !== "MER")
      out.push({ id: "EV-TOUR-06", text: `${r.sido} 방문자가 ${g}% 줄고 있어 관광형 신규 투자는 신중하게 판단한다.` });
    return out;
  }

  function buildPacket(r) {
    const gaps = Object.entries(r.ext.supply_gap).sort((a, b) => b[1] - a[1]);
    const t = D.meta.thresholds;
    return {
      region: r.id,
      structure: r.structure,
      momentum: `CNT ${r.momentum.cnt} / ATV ${r.momentum.atv}`,
      momentum_signal: r.momentum.signal,
      confidence: r.confidence,
      context: r.context,
      external_context: {
        foreign_visit_share_pct: r.ctx.visit_share, visitor_pctile: r.ctx.visitor_pctile,
        registered_foreign_share_pct: r.ctx.registered_share, resident_pctile: r.ctx.resident_pctile,
        context_gap: r.ctx.gap, tertile_cuts: [t.context.q33, t.context.q67],
        strict_sample: r.ctx.strict, kto_observed_days: r.ctx.observed_days,
      },
      metrics: {
        foreign_amt_eok: +eok(r.famt).replace(/,/g, ""),
        foreign_share_pct: r.foreign_share,
        tvd: r.tvd, tvd_cut: t.tvd_cut,
        scale_share: r.scale_share, scale_share_cut: t.scale_cut,
        momentum_unit: "log percentage points; all transactions including corporations",
        core_tvd_categories: 11,
        momentum_cnt_3m_logpct: r.momentum.cnt_pct, momentum_atv_3m_logpct: r.momentum.atv_pct,
        momentum_cnt_2m_logpct: r.momentum.cnt2_pct, momentum_atv_2m_logpct: r.momentum.atv2_pct,
        confidence_stability: {cnt: r.conf_detail.stable_cnt, atv: r.conf_detail.stable_atv, robust_scale: t.confidence_robust_scale},
        registered_foreigners: r.ext.reg_foreigners,
        supply_gap_top: gaps.slice(0, 3).map(([g, v]) => ({ group: g, gap_pctp: v, closure_risk_pct: r.ext.closure_risk[g] })),
      },
      tourism_datalab: {
        stay_type: r.tour.stay_type, avg_dwell_min: r.tour.dwell_min, avg_nights: r.tour.nights,
        top100_attractions: r.tour.attractions.slice(0, 3).map((a) => `${a.name}(${a.rank}위)`),
        sido_visitor_growth_pct: r.tour.sido.growth,
        target_nationality: !r.ctx.strict ? null : r.context === VIS ? NAT_V : r.context === RES ? NAT_R : { resident: NAT_R, visitor: NAT_V },
      },
      evidence: [
        r.structure.includes("고괴리") ? "BC 소비구조 괴리(TVD 중앙값 이상)" : "BC 소비구조 괴리 낮음",
        r.ctx.strict ? `ContextGap ${r.ctx.gap.toFixed(2)} (방문비중 백분위 ${r.ctx.visitor_pctile.toFixed(2)} − 등록외국인비율 백분위 ${r.ctx.resident_pctile.toFixed(2)})` : "관측기간 부족: Context 분류보류",
        r.tour.stay_type ? `데이터랩 체류특성: ${r.tour.stay_type}` : "데이터랩 체류특성 없음",
        "추가 기능: 공식 상가정보 재집계·검증 (8개 그룹)",
      ],
      synthetic_fields: ["supply_gap_top[].closure_risk_pct"],
      supplemental_provenance: D.meta.provenance,
      supplemental_industrial_subtype: r.context_sub,
      context_dependent_actions_allowed: r.ctx.strict,
    };
  }

  function targets(r) {
    const gaps = Object.entries(r.ext.supply_gap).sort((a, b) => b[1] - a[1]);
    const hasGap = gaps[0][1] > GAP_MIN;
    const byDemand = Object.entries(r.mix_foreign).sort((a, b) => b[1] - a[1]);
    const g1 = hasGap ? gaps[0][0] : byDemand[0][0];
    const g2 = hasGap && gaps[1][1] > 2 ? gaps[1][0] : byDemand.find(([g]) => g !== g1)[0];
    return { hasGap, g1, g2, gap1: r.ext.supply_gap[g1], closure1: r.ext.closure_risk[g1] };
  }

  const t_cut = (g) => { const q = D.meta.thresholds.context; return g <= q.q33 ? `≤ ${q.q33}` : g <= q.q67 ? `${q.q33} ~ ${q.q67}` : `> ${q.q67}`; };

  function runRules(r) {
    const tg = targets(r);
    const trace = [];
    const fire = (id, fired, detail) => trace.push({ id, fired, detail, rule: KB.rules.find((x) => x.id === id) });

    let level = CONF_LEVEL[r.confidence];
    fire("R-CONF-H", r.confidence === "High", `Confidence=${r.confidence}`);
    fire("R-CONF-M", r.confidence === "Medium", `Confidence=${r.confidence}`);
    fire("R-CONF-L", r.confidence === "Low", `Confidence=${r.confidence}`);
    const m = r.momentum;
    fire("R-MOM-UP", m.cnt === "상승", `전체 CNT 전국대비 ${sign(m.cnt_pct)} log %p`);
    fire("R-MOM-FLAT", m.cnt === "안정", `전체 CNT 전국대비 ${sign(m.cnt_pct)} log %p`);
    fire("R-MOM-DOWN", m.cnt === "하락", `전체 CNT 전국대비 ${sign(m.cnt_pct)} log %p`);
    if (m.cnt === "하락") level = Math.max(1, level - 1);
    fire("R-ATV-UP", m.atv === "상승", `전체 ATV 전국대비 ${sign(m.atv_pct)} log %p`);
    fire("R-ATV-DOWN", m.atv === "하락", `전체 ATV 전국대비 ${sign(m.atv_pct)} log %p`);
    fire("R-GAP", tg.hasGap, `최대 Gap ${tg.g1} ${sign(tg.gap1)}%p (기준 ${GAP_MIN}%p)`);
    fire("R-GAP-NONE", !tg.hasGap, `최대 Gap ${sign(r.ext.supply_gap[tg.g1])}%p`);
    fire("R-CLOSURE", tg.closure1 >= CLOSURE_MAX, `${tg.g1} 폐업률 ${tg.closure1}%`);
    fire("R-SUB-IND", r.ctx.strict && r.context_sub === "산업", `추가 기능 세부=${r.context_sub}`);
    const t = r.tour, visit = hasVisit(r), c = r.ctx;
    const gapTxt = c.strict ? `ContextGap ${c.gap > 0 ? "+" : ""}${c.gap} (구간 ${t_cut(c.gap)})` : "관측기간 부족: Context 분류보류";
    fire("R-CTX-R", r.context === RES, gapTxt);
    fire("R-CTX-M", r.context === MIX, gapTxt);
    fire("R-CTX-V", r.context === VIS, gapTxt);
    fire("R-CTX-SENS", !c.strict, `KTO 관측 ${c.observed_days}일`);
    if (!c.strict) level = 1;
    fire("R-STAY-LONG", visit && t.stay_type === "숙박 체류형", t.nights != null ? `숙박 ${t.nights}일 (백분위 ${t.nights_pct})` : "체류 데이터 없음");
    fire("R-STAY-SHORT", visit && t.stay_type === "단시간 방문형", t.dwell_min != null ? `체류 ${t.dwell_min}분 (백분위 ${t.dwell_pct})` : "체류 데이터 없음");
    fire("R-ATTR", visit && t.attractions.length > 0, `Top100 관광지 ${t.attractions.length}곳`);
    fire("R-TOUR-UP", visit && t.sido.growth >= 2, `${r.sido} 방문자 ${t.sido.growth ?? "-"}%`);
    fire("R-TOUR-DOWN", visit && t.sido.growth < 0, `${r.sido} 방문자 ${t.sido.growth ?? "-"}%`);

    const timing = m.cnt === "상승" ? "이번 분기 선점" : m.cnt === "하락" ? "원인 진단 후 재정비" : "정기 계획 반영";

    const actions = KB.STAKEHOLDERS.map((sh) => {
      const cell = r.ctx.strict ? KB.cells.find((c) => c.structure === r.structure && c.context === r.context && c.stakeholder === sh.key) : { id: `HOLD-${sh.key}`, structure: r.structure, context: "분류보류", stakeholder: sh.key, strategy: "관찰", action: "관측기간이 부족해 Context 분류와 Context 기반 추천을 보류하고 추가 데이터를 관찰한다.", why: "KTO 181일 완전관측 조건 미충족", avoid_when: "Context 기반 투자·관광·정주·국적·정책 추천", kpi: ["관측일수", "전체 CNT", "전체 ATV"], expected_effect: "추가 관측 후 재평가", evidence: ["EV-RES-02", "EV-BC-01"] };
      let strength = LEVELS[level];
      if (sh.key === "MER" && tg.closure1 >= CLOSURE_MAX && level > 1) strength += "/선별";
      const retrieved = retrieve(cell, sh.key, r, tg);
      return { sh, cell, level, strength, timing, retrieved };
    });

    const expired = KB.evidence.filter((e) => e.valid_to && e.valid_to < KB.TODAY);
    fire("R-POLICY", expired.length > 0, `제외: ${expired.map((e) => e.id).join(", ")}`);
    return { tg, trace, actions, level };
  }

  function retrieve(cell, shKey, r, tg) {
    const ids = new Set(cell.evidence);
    if (!r.ctx.strict) return { valid: [...ids].map(id => EV[id]), dropped: [] };
    ids.add("EV-RES-02"); ids.add("EV-RES-04");                                                   // Momentum·Confidence 근거는 항상
    if (shKey === "MER" && tg.hasGap) ids.add("EV-LOCAL-01"); // 폐업률 경고
    if (r.ctx.strict && r.context_sub === "산업" && shKey !== "BC") ids.add("EV-LIT-01");     // 근로자 생활권
    if (tg.hasGap) ids.add("EV-SUPPLY-01");                                   // 점포 수(상가정보) 기반 공급비중
    if (hasResident(r)) ids.add("EV-MOJ-02");                                 // 시군구 등록외국인
    tourPlan(r, shKey).forEach((x) => ids.add(x.id));
    if (hasVisit(r)) ids.add("EV-TOUR-04");                         // 데이터랩 관광 신호
    pickPolicies(r, shKey, tg).forEach((e) => ids.add(e.id));                 // 조건에 맞는 현행 지원사업
    const expired = KB.evidence.filter((e) => e.type === "정책" && e.valid_to && e.valid_to < KB.TODAY
      && POLICY_TARGET[shKey].includes(e.target));
    const all = [...ids].map((id) => EV[id]).concat(expired);
    const valid = all.filter((e) => !(e.valid_to && e.valid_to < KB.TODAY));
    const dropped = all.filter((e) => e.valid_to && e.valid_to < KB.TODAY);
    return { valid, dropped };
  }

  const cite = (ids) => ids.map((id) => `[${id}]`).join("");

  function fill(text, tg) {
    return text.replaceAll("{GAP}", tg.g1).replaceAll("{GAP2}", tg.g2);
  }

  // ── 오프라인 생성기: KB 문장 + 진단값만으로 조합 (LLM 없이 재현 가능) ──
  function generateTemplate(r, plan) { return window.ActionTemplates.generate(r, plan, { KB, D, EV, tourPlan, GAP_MIN, CLOSURE_MAX }); }

  // ── Qwen API (브라우저 직접 호출, 사용자 키) ──
  const SYSTEM = `당신은 BC카드 외국인 상권 Action Knowledge Base의 설명 계층이다.
지역 유형을 스스로 판단하지 않는다. 분석 엔진이 준 진단 패킷과 규칙 엔진이 고른 Action 후보·근거만 사용해 이해관계자별 실행 문장을 쓴다.

지켜야 할 규칙:
${KB.guardrails.map(([k, v]) => `- ${k}: ${v}`).join("\n")}
- strength·timing·cell_id는 규칙 엔진이 준 값을 그대로 쓴다. 바꾸지 않는다.
- Confidence가 Low이면 다음 표현을 쓰지 않는다: ${FORBIDDEN_LOW.join(", ")}.
- 근거로 쓰는 문장 끝에 [Evidence ID]를 붙인다. 제공된 retrieved_evidence 목록에 있는 ID만 쓴다.
- 수치는 패킷에 있는 값만 인용한다. 합성(synthetic) 지표를 인용할 때는 '(합성)'을 붙인다.
- 한국어로, 각 action은 2~4문장.

출력은 JSON 하나만. 다른 텍스트 없이:
{"cards":[{"stakeholder":"BC|MER|GOV","cell_id":"...","strength":"...","timing":"...","action":"...","why":"...","kpi":["..."],"expected_effect":"...","caution":"...","evidence_ids":["..."]}]}`;

  function llmInput(r, plan) {
    return {
      output_language: window.I18n.lang,
      context_restrictions: !r.ctx.strict ? "Only observe: no context-specific nationality, tourism, settlement or policy recommendations" : null,
      diagnosis_packet: buildPacket(r),
      candidates: plan.actions.map(({ sh, cell, strength, timing, retrieved }) => ({
        stakeholder: sh.key, stakeholder_label: sh.label, stakeholder_goal: sh.goal,
        cell_id: cell.id, strategy: cell.strategy, strength, timing,
        action_template: fill(cell.action, plan.tg), why: cell.why, avoid_when: cell.avoid_when,
        kpi: cell.kpi, expected_effect: cell.expected_effect,
        retrieved_evidence: retrieved.valid.map((e) => ({ id: e.id, grade: e.grade, title: e.title, desc: e.desc, valid_to: e.valid_to || null })),
      })),
      fired_rules: plan.trace.filter((t) => t.fired).map((t) => `${t.id}: ${t.rule.effect} (${t.detail})`),
    };
  }

  async function generateQwen(r, plan) {
    let res;
    try {
      res = await fetch(new URL('api/qwen', location.href).pathname, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: r.id, lang: window.I18n.lang }),
      });
    } catch (_) { throw new Error(window.I18n.msg('Qwen 서버에 연결할 수 없습니다. npm start로 실행했는지 확인하세요.')); }
    let json;
    try { json = await res.json(); }
    catch (_) { throw new Error(window.I18n.msg('Qwen 서버에 연결할 수 없습니다. npm start로 실행했는지 확인하세요.')); }
    if (!res.ok) throw new Error(`${res.status}: ${window.I18n.msg(json.error?.code || 'QWEN_SERVER_ERROR')}`);
    const choice = json.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error(window.I18n.msg("응답이 길이 제한으로 잘렸습니다. 다시 생성하세요."));
    if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw new Error(window.I18n.msg("모델이 요청을 거절했습니다."));
    const text = choice?.message?.content;
    if (typeof text !== 'string') throw new Error(window.I18n.msg("JSON 응답을 찾지 못했습니다."));
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(window.I18n.msg("JSON 응답을 찾지 못했습니다."));
    let cards;
    try { cards = JSON.parse(m[0]).cards; }
    catch (_) { throw new Error(window.I18n.msg('LLM 응답의 Action Card 형식이 올바르지 않습니다.')); }
    if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(c=>c.stakeholder)).size !== 3 || cards.some(c=>!plan.actions.some(a=>a.sh.key===c.stakeholder) || typeof c.action !== 'string' || typeof c.why !== 'string' || !Array.isArray(c.kpi) || !Array.isArray(c.evidence_ids))) throw new Error(window.I18n.msg('LLM 응답의 Action Card 형식이 올바르지 않습니다.'));
    const label = Object.fromEntries(KB.STAKEHOLDERS.map((s) => [s.key, s.label]));
    return {
      cards: cards.map((c) => ({ ...c, label: label[c.stakeholder] || c.stakeholder,
        strategy: plan.actions.find((a) => a.sh.key === c.stakeholder)?.cell.strategy })),
      usage: { input_tokens: json.usage?.prompt_tokens, output_tokens: json.usage?.completion_tokens }, model: json.model,
    };
  }

  // ── 평가 (기획서 11장) ──
  function packetNumbers(r) {
    const nums = new Set();
    const walk = (v) => {
      if (typeof v === "number") [v, Math.abs(v)].forEach((x) => { nums.add(x.toFixed(1)); nums.add(x.toFixed(3)); nums.add(x.toFixed(2)); nums.add(x.toFixed(4)); nums.add(String(Math.round(x))); });
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(r); walk({scale_pct:r.scale_share*100}); walk(D.meta.thresholds); walk(NAT_V); walk(NAT_R); walk(EASY);
    if (r.tour.nights_pct != null) nums.add(String(Math.max(1, 100 - r.tour.nights_pct)));
    if (r.tour.dwell_pct != null) nums.add(String(Math.max(1, r.tour.dwell_pct)));
    [r.famt, D.meta.thresholds.scale_cut].forEach((v) => nums.add(eok(v)));
    KB.evidence.forEach((e) => {
      (e.valid_to || "").split("-").forEach((p) => nums.add(String(+p)));
      if (e.budget != null) { nums.add(String(e.budget)); nums.add(e.budget.toFixed(1)); }
      (e.scale || "").match(/[\d,]+/g)?.forEach((n) => nums.add(n));
      (e.notice || "").match(/[\d.]+/g)?.forEach((n) => nums.add(n.replace(/\.$/, "")));
    });
    [GAP_MIN, CLOSURE_MAX, 1, 2, 3, 4].forEach((v) => nums.add(String(v)));
    return nums;
  }

  function evaluate(r, plan, cards) {
    const nums = packetNumbers(r);
    return cards.map((c) => {
      const a = plan.actions.find((x) => x.sh.key === c.stakeholder);
      const valid = a ? a.retrieved.valid.map((e) => e.id) : [];
      // 근거율: 인용 블록으로 끝나는 구간의 글자 수 / 전체 글자 수 (인용 없이 끝나는 꼬리 문장은 미근거)
      const segs = c.action.split(/((?:\s*\[[A-Z]+-[A-Z0-9-]+\])+)/);
      let citedLen = 0, totalLen = 0;
      for (let i = 0; i < segs.length; i += 2) {
        const len = segs[i].trim().length;
        totalLen += len;
        if (segs[i + 1]) citedLen += len;
      }
      const ids = [...new Set([...(c.evidence_ids || []), ...((c.action.match(/\[([A-Z]+-[A-Z0-9-]+)\]/g) || []).map((x) => x.slice(1, -1)))])];
      const badIds = ids.filter((id) => !valid.includes(id) || (EV[id]?.valid_to && EV[id].valid_to < KB.TODAY));
      const numTokens = (c.action + " " + c.why).replace(/\[[^\]]+\]/g, "").match(/\d[\d,]*\.?\d*/g) || [];
      const numOk = numTokens.filter((n) => nums.has(n.replace(/,$/, "")) || nums.has((+n.replace(/,/g, "")).toFixed(1)));
      const forbidden = (r.confidence === "Low" || a?.level === 1) ? window.ActionTemplates.forbidden(window.I18n.lang).filter((w) => c.action.toLowerCase().includes(w.toLowerCase())) : [];
      const contextOk = r.ctx.strict || (c.cell_id === `HOLD-${c.stakeholder}` && c.strength === LEVELS[1] &&
        ids.every(id=>['EV-RES-02','EV-BC-01'].includes(id)) &&
        /관찰|보류|observ|defer|观察|暂缓/i.test(c.action) &&
        !/관광.*(?:투자|캠페인)|국적.*타깃|tourism (?:investment|campaign)|nationality targeting|旅游投资|国籍定向/i.test(c.action));
      return {
        stakeholder: c.stakeholder,
        groundedness: totalLen ? citedLen / totalLen : 0,
        numbers: numTokens.length ? numOk.length / numTokens.length : 1,
        citation_valid: ids.length > 0 && badIds.length === 0, badIds,
        kpi: Array.isArray(c.kpi) && c.kpi.length > 0,
        actionable: !!(c.stakeholder && c.expected_effect && c.kpi?.length),
        rule_match: a ? c.cell_id === a.cell.id && c.strength === a.strength : false,
        stakeholder_fit: c.stakeholder !== "BC" || ids.some((id) => id.startsWith("EV-BC")),
        confidence_ok: forbidden.length === 0, forbidden,
        context_ok: contextOk,
        language_ok: window.ActionTemplates.languageOk(c, window.I18n.lang),
      };
    });
  }

  function batchEvaluate() {
    const groups = {};
    const agg = { g: 0, n: 0, cit: 0, kpi: 0, act: 0, fit: 0, conf: 0, num: 0, cards: 0, context: 0, language: 0 };
    const strengthDist = {};
    D.regions.forEach((r) => {
      const plan = runRules(r);
      const cards = generateTemplate(r, plan);
      const ev = evaluate(r, plan, cards);
      const key = [r.structure, r.context, r.confidence, r.momentum.cnt, r.ctx.strict].join("|");
      const sig = cards.map((c) => c.cell_id + ":" + c.strength.split("/")[0]).join(",");  // '/선별'은 업종 폐업률 조건이라 제외
      (groups[key] = groups[key] || []).push(sig);
      ev.forEach((e) => {
        agg.context += e.context_ok; agg.language += e.language_ok;
        agg.cards++; agg.g += e.groundedness; agg.num += e.numbers;
        agg.cit += e.citation_valid; agg.kpi += e.kpi; agg.act += e.actionable; agg.fit += e.stakeholder_fit; agg.conf += e.confidence_ok;
      });
      cards.forEach((c) => { strengthDist[c.strength] = (strengthDist[c.strength] || 0) + 1; });
    });
    let consistent = 0, total = 0;
    Object.values(groups).forEach((sigs) => {
      const mode = sigs.sort((a, b) => sigs.filter((x) => x === b).length - sigs.filter((x) => x === a).length)[0];
      consistent += sigs.filter((s) => s === mode).length; total += sigs.length;
    });
    const n = agg.cards;
    return {
      regions: D.regions.length, cards: n, label_groups: Object.keys(groups).length,
      context_eligibility: agg.context / n, language_compliance: agg.language / n,
      groundedness: agg.g / n, numbers: agg.num / n, rule_consistency: consistent / total,
      citation_validity: agg.cit / n, kpi: agg.kpi / n, actionability: agg.act / n,
      stakeholder_fit: agg.fit / n, confidence_ok: agg.conf / n, strengthDist,
    };
  }

  return { buildPacket, runRules, generateTemplate, generateQwen, evaluate, batchEvaluate, llmInput, SYSTEM, EV, GAP_MIN, CLOSURE_MAX };
})();
