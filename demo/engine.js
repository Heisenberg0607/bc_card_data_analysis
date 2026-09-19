/* Rule Engine → RAG → LLM → Evaluator  (기획서 6·7·10·11장)
 *
 * 1) buildPacket   : 분석 엔진 결과를 JSON 진단 패킷으로 정형화
 * 2) runRules      : Structure·Context로 Action Cell 선택, Momentum=시점, Confidence=강도
 * 3) retrieve      : Cell 근거 + 이해관계자 대상 정책 검색, 유효기간 지난 정책 제외
 * 4) generateTemplate / generateClaude : 근거 범위 안에서 문장 생성
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

  const eok = (v) => (v / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
  const TN = D.meta.national.tourism;
  const NAT_V = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 3);
  const NAT_R = D.meta.national.moj_top.slice(0, 3).map((x) => ({ nat: x.nat, pct: +(x.n / D.meta.national.moj_total * 100).toFixed(1) }));
  const EASY = TN.easy_nat[0];
  const natText = (xs) => xs.map((x) => `${x.nat}(${x.pct}%)`).join("·");

  // 데이터랩 관광 신호 → 이해관계자별 추가 문장 + 근거 ID. retrieve와 generateTemplate이 같이 쓴다.
  function tourPlan(r, shKey) {
    const t = r.tour, out = [];
    const visit = r.context === "방문형";
    const g = t.sido.growth;
    if (shKey === "BC") {
      if (visit) {
        out.push({ id: "EV-TOUR-03", text: `방한 방문객 비중이 큰 ${natText(NAT_V)} 고객을 우선 타깃 국적으로 한다.` });
        out.push({ id: "EV-TOUR-07", text: `외국인 간편결제 관광소비의 ${EASY.pct}%가 ${EASY.nat} 국적이므로 참여 가맹점의 해당 간편결제 수용 여부를 함께 점검한다.` });
      } else {
        out.push({ id: "EV-MOJ-01", text: `타깃 국적은 등록외국인 상위 ${natText(NAT_R)}에 맞춰 안내 언어와 혜택을 정한다.` });
      }
    }
    if (!visit) return out;
    const attr = t.attractions;
    if (attr.length && shKey !== "BC")
      out.push({ id: "EV-TOUR-05", text: `검색 상위 관광지 '${attr[0].name}'(${attr[0].rank}위)${attr.length > 1 ? ` 등 ${attr.length}곳` : ""}과 인근 상권을 잇는 동선을 우선 검토한다.` });
    if (t.stay_type === "숙박 체류형" && shKey !== "GOV")
      out.push({ id: "EV-TOUR-04", text: `방문자 평균 숙박일수가 ${t.nights}일로 길어(상위 ${Math.max(1, 100 - t.nights_pct)}%) 숙박 가맹점과 묶은 교차소비 구성이 맞다.` });
    if (t.stay_type === "단시간 방문형" && shKey !== "BC")
      out.push({ id: "EV-TOUR-04", text: `방문자 평균 체류시간이 ${t.dwell_min}분으로 짧아(하위 ${Math.max(1, t.dwell_pct)}%) 야간·연계 코스로 체류를 늘리는 것이 먼저다.` });
    if (g != null && g >= 2 && shKey !== "MER")
      out.push({ id: "EV-TOUR-06", text: `${r.sido} 방문자가 ${g}% 늘고 있어 방문형 Action을 앞당길 근거가 있다.` });
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
      confidence: r.confidence,
      context: r.context === "방문형" ? "관광·방문형" : r.context_sub === "산업" ? "정주·산업형" : "정주·생활형",
      metrics: {
        foreign_amt_eok: +eok(r.famt).replace(/,/g, ""),
        foreign_share_pct: r.foreign_share,
        tvd: r.tvd, tvd_cut: t.tvd_cut,
        scale_cut_eok: +eok(t.scale_cut).replace(/,/g, ""),
        cnt_change_rel_pct: r.momentum.cnt_pct, atv_change_rel_pct: r.momentum.atv_pct,
        confidence_blocks: [r.conf_detail.block3, r.conf_detail.block2, r.conf_detail.block1],
        resident_intensity_pct: r.ext.resident_intensity,
        visitor_intensity: r.ext.visitor_intensity,
        supply_gap_top: gaps.slice(0, 3).map(([g, v]) => ({ group: g, gap_pctp: v, closure_risk_pct: r.ext.closure_risk[g] })),
      },
      tourism_datalab: {
        stay_type: r.tour.stay_type, avg_dwell_min: r.tour.dwell_min, avg_nights: r.tour.nights,
        top100_attractions: r.tour.attractions.slice(0, 3).map((a) => `${a.name}(${a.rank}위)`),
        sido_visitor_growth_pct: r.tour.sido.growth,
        target_nationality: r.context === "방문형" ? NAT_V : NAT_R,
      },
      evidence: [
        r.structure.includes("고괴리") ? "BC 소비구조 괴리(TVD 중앙값 이상)" : "BC 소비구조 괴리 낮음",
        r.context === "방문형" ? `등록외국인 대비 방문 유입 전국 평균의 ${r.ext.visitor_intensity}배(추정)` : `등록외국인 비중 ${r.ext.resident_intensity}%(합성)`,
        r.tour.stay_type ? `데이터랩 체류특성: ${r.tour.stay_type}` : "데이터랩 체류특성 없음",
        "상권 공급 데이터(합성)",
      ],
      synthetic_fields: ["resident_intensity_pct", "visitor_intensity(데이터랩 전국 총량 배분 추정)", "supply_gap_top"],
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

  function runRules(r) {
    const tg = targets(r);
    const trace = [];
    const fire = (id, fired, detail) => trace.push({ id, fired, detail, rule: KB.rules.find((x) => x.id === id) });

    let level = CONF_LEVEL[r.confidence];
    fire("R-CONF-H", r.confidence === "High", `Confidence=${r.confidence}`);
    fire("R-CONF-M", r.confidence === "Medium", `Confidence=${r.confidence}`);
    fire("R-CONF-L", r.confidence === "Low", `Confidence=${r.confidence}`);
    const m = r.momentum;
    fire("R-MOM-UP", m.cnt === "상승", `CNT 전국대비 ${sign(m.cnt_pct)}%`);
    fire("R-MOM-FLAT", m.cnt === "안정", `CNT 전국대비 ${sign(m.cnt_pct)}%`);
    fire("R-MOM-DOWN", m.cnt === "하락", `CNT 전국대비 ${sign(m.cnt_pct)}%`);
    if (m.cnt === "하락") level = Math.max(1, level - 1);
    fire("R-ATV-UP", m.atv === "상승", `ATV 전국대비 ${sign(m.atv_pct)}%`);
    fire("R-ATV-DOWN", m.atv === "하락", `ATV 전국대비 ${sign(m.atv_pct)}%`);
    fire("R-GAP", tg.hasGap, `최대 Gap ${tg.g1} ${sign(tg.gap1)}%p (기준 ${GAP_MIN}%p)`);
    fire("R-GAP-NONE", !tg.hasGap, `최대 Gap ${sign(r.ext.supply_gap[tg.g1])}%p`);
    fire("R-CLOSURE", tg.closure1 >= CLOSURE_MAX, `${tg.g1} 폐업률 ${tg.closure1}%`);
    fire("R-SUB-IND", r.context_sub === "산업", `Context 세부=${r.context_sub}`);
    const t = r.tour, visit = r.context === "방문형";
    fire("R-NAT-V", visit, `방문 상위: ${natText(NAT_V)}`);
    fire("R-NAT-R", !visit, `등록 상위: ${natText(NAT_R)}`);
    fire("R-STAY-LONG", visit && t.stay_type === "숙박 체류형", t.nights != null ? `숙박 ${t.nights}일 (백분위 ${t.nights_pct})` : "체류 데이터 없음");
    fire("R-STAY-SHORT", visit && t.stay_type === "단시간 방문형", t.dwell_min != null ? `체류 ${t.dwell_min}분 (백분위 ${t.dwell_pct})` : "체류 데이터 없음");
    fire("R-ATTR", visit && t.attractions.length > 0, `Top100 관광지 ${t.attractions.length}곳`);
    fire("R-TOUR-UP", visit && t.sido.growth >= 2, `${r.sido} 방문자 ${t.sido.growth ?? "-"}%`);
    fire("R-TOUR-DOWN", visit && t.sido.growth < 0, `${r.sido} 방문자 ${t.sido.growth ?? "-"}%`);

    const timing = m.cnt === "상승" ? "이번 분기 선점" : m.cnt === "하락" ? "원인 진단 후 재정비" : "정기 계획 반영";

    const actions = KB.STAKEHOLDERS.map((sh) => {
      const cell = KB.cells.find((c) => c.structure === r.structure && c.context === r.context && c.stakeholder === sh.key);
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
    ids.add("EV-RES-02");                                                   // Momentum·Confidence 근거는 항상
    if (shKey === "MER" && tg.closure1 >= CLOSURE_MAX) ids.add("EV-LOCAL-01"); // 폐업률 경고
    if (r.context_sub === "산업" && shKey !== "BC") ids.add("EV-LIT-01");     // 근로자 생활권
    tourPlan(r, shKey).forEach((x) => ids.add(x.id));                         // 데이터랩 관광 신호
    KB.evidence.filter((e) => e.type === "정책" && POLICY_TARGET[shKey].includes(e.target)).forEach((e) => ids.add(e.id));
    const all = [...ids].map((id) => EV[id]);
    const valid = all.filter((e) => !(e.valid_to && e.valid_to < KB.TODAY));
    const dropped = all.filter((e) => e.valid_to && e.valid_to < KB.TODAY);
    return { valid, dropped };
  }

  const cite = (ids) => ids.map((id) => `[${id}]`).join("");

  function fill(text, tg) {
    return text.replaceAll("{GAP}", tg.g1).replaceAll("{GAP2}", tg.g2);
  }

  // ── 오프라인 생성기: KB 문장 + 진단값만으로 조합 (LLM 없이 재현 가능) ──
  function generateTemplate(r, plan) {
    const { tg } = plan;
    return plan.actions.map(({ sh, cell, level, strength, timing, retrieved }) => {
      const validIds = retrieved.valid.map((e) => e.id);
      const cellEv = cell.evidence.filter((id) => validIds.includes(id));
      const pol = retrieved.valid.filter((e) => e.type === "정책" && !cellEv.includes(e.id)).slice(0, 1).map((e) => e.id);
      const s = [];
      s.push(`${fill(cell.action, tg)} ${cite(cellEv)}`);
      if (level === 1) s.push(`신뢰도가 낮아 투자 대신 1개 분기 소규모 실증을 먼저 하고, 추가 관찰 결과에 따라 확대 여부를 정한다. [EV-RES-02]`);
      else if (r.momentum.cnt === "상승") s.push(`외국인 거래건수가 전국 추세보다 ${sign(r.momentum.cnt_pct)}% 더 늘고 있어 이번 분기에 먼저 실행한다. [EV-RES-02]`);
      else if (r.momentum.cnt === "하락") s.push(`외국인 거래건수가 전국 추세 대비 ${sign(r.momentum.cnt_pct)}%로 줄고 있어 원인을 진단한 뒤 재정비한다. [EV-RES-02]`);
      if (r.momentum.atv === "상승" && sh.key !== "GOV") s.push(`건당금액이 전국 대비 ${sign(r.momentum.atv_pct)}% 올라 세트·프리미엄 구성을 함께 검토한다. [EV-RES-02]`);
      if (r.momentum.atv === "하락" && sh.key !== "GOV") s.push(`건당금액이 전국 대비 ${sign(r.momentum.atv_pct)}% 낮아져 소액·다빈도 결제 혜택이 맞다. [EV-RES-02]`);
      if (sh.key === "MER" && tg.closure1 >= CLOSURE_MAX) s.push(`${tg.g1}은 폐업률이 ${tg.closure1}%로 높아 소규모 테스트 후 확대한다. [EV-LOCAL-01]`);
      if (r.context_sub === "산업" && sh.key !== "BC") s.push(`근로자 생활권이므로 주말·야간 영업과 생활필수품 구성을 우선한다. [EV-LIT-01]`);
      tourPlan(r, sh.key).forEach((x) => s.push(`${x.text} [${x.id}]`));
      if (pol.length) s.push(`현행 지원사업 '${EV[pol[0]].title}'(~${EV[pol[0]].valid_to})과 연계할 수 있다. [${pol[0]}]`);

      const why = `${cell.why} 외국인 결제 ${eok(r.famt)}억원, TVD ${r.tvd.toFixed(3)}(기준 ${D.meta.thresholds.tvd_cut.toFixed(3)})` +
        (tg.hasGap ? `, ${tg.g1} Supply Gap ${sign(tg.gap1)}%p.` : ", 뚜렷한 공급 부족 업종 없음.");
      return {
        stakeholder: sh.key, label: sh.label, cell_id: cell.id, strategy: cell.strategy,
        strength, timing, action: s.join(" "), why, kpi: cell.kpi, expected_effect: cell.expected_effect,
        caution: cell.avoid_when, evidence_ids: [...new Set((s.join(" ").match(/\[([A-Z]+-[A-Z0-9-]+)\]/g) || []).map((x) => x.slice(1, -1)))],
      };
    });
  }

  // ── Claude API (브라우저 직접 호출, 사용자 키) ──
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

  function claudeInput(r, plan) {
    return {
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

  async function generateClaude(r, plan, { apiKey, model }) {
    const body = {
      model, max_tokens: 16000, system: SYSTEM,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: "다음 입력으로 3개 이해관계자 Action Card를 생성하라.\n\n" + JSON.stringify(claudeInput(r, plan), null, 1) }],
    };
    const headers = {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (model === "claude-opus-5") {        // 거절 시 서버 측 대체 모델로 재시도
      body.fallbacks = "default";
      headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${json.error?.type || ""}: ${json.error?.message || "요청 실패"}`);
    if (json.stop_reason === "refusal") throw new Error("모델이 요청을 거절했습니다 (stop_reason=refusal).");
    const text = json.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON 응답을 찾지 못했습니다.");
    const cards = JSON.parse(m[0]).cards;
    const label = Object.fromEntries(KB.STAKEHOLDERS.map((s) => [s.key, s.label]));
    return {
      cards: cards.map((c) => ({ ...c, label: label[c.stakeholder] || c.stakeholder,
        strategy: plan.actions.find((a) => a.sh.key === c.stakeholder)?.cell.strategy })),
      usage: json.usage, model: json.model,
    };
  }

  // ── 평가 (기획서 11장) ──
  function packetNumbers(r) {
    const nums = new Set();
    const walk = (v) => {
      if (typeof v === "number") [v, Math.abs(v)].forEach((x) => { nums.add(x.toFixed(1)); nums.add(x.toFixed(3)); nums.add(String(Math.round(x))); });
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(r); walk(D.meta.thresholds); walk(NAT_V); walk(NAT_R); walk(EASY);
    if (r.tour.nights_pct != null) nums.add(String(Math.max(1, 100 - r.tour.nights_pct)));
    if (r.tour.dwell_pct != null) nums.add(String(Math.max(1, r.tour.dwell_pct)));
    [r.famt, D.meta.thresholds.scale_cut].forEach((v) => nums.add(eok(v)));
    KB.evidence.forEach((e) => (e.valid_to || "").split("-").forEach((p) => nums.add(String(+p))));
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
      const forbidden = r.confidence === "Low" ? FORBIDDEN_LOW.filter((w) => c.action.includes(w)) : [];
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
      };
    });
  }

  function batchEvaluate() {
    const groups = {};
    const agg = { g: 0, n: 0, cit: 0, kpi: 0, act: 0, fit: 0, conf: 0, num: 0, cards: 0 };
    const strengthDist = {};
    D.regions.forEach((r) => {
      const plan = runRules(r);
      const cards = generateTemplate(r, plan);
      const ev = evaluate(r, plan, cards);
      const key = [r.structure, r.context, r.confidence, r.momentum.cnt].join("|");
      const sig = cards.map((c) => c.cell_id + ":" + c.strength.split("/")[0]).join(",");  // '/선별'은 업종 폐업률 조건이라 제외
      (groups[key] = groups[key] || []).push(sig);
      ev.forEach((e) => {
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
      groundedness: agg.g / n, numbers: agg.num / n, rule_consistency: consistent / total,
      citation_validity: agg.cit / n, kpi: agg.kpi / n, actionability: agg.act / n,
      stakeholder_fit: agg.fit / n, confidence_ok: agg.conf / n, strengthDist,
    };
  }

  return { buildPacket, runRules, generateTemplate, generateClaude, evaluate, batchEvaluate, claudeInput, SYSTEM, EV, GAP_MIN, CLOSURE_MAX };
})();
