(function () {
  const D = window.BC_DATA, KB = window.ACTION_KB, E = window.Engine, C = window.Charts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eok = (v) => (v / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  const pct = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const G = D.meta.groups;
  const byId = Object.fromEntries(D.regions.map((r) => [r.id, r]));
  const MON = D.meta.months.map((m) => `${String(m).slice(2, 4)}.${String(m).slice(4)}`);
  const state = { sel: "전라남도 영암군", mode: "template", apiKey: "", model: "claude-opus-5", tab: "region", llmLog: [], result: null };

  const confTag = (c) => `<span class="conf ${c}">${c === "High" ? "●" : c === "Medium" ? "◐" : "○"} ${c}</span>`;
  const ctxColor = (r) => (r.context === "방문형" ? "var(--s2)" : "var(--s1)");
  const ctxLabel = (r) => (r.context === "방문형" ? "관광·방문형" : r.context_sub === "산업" ? "정주·산업형" : "정주·생활형");
  const arrow = (d) => (d === "상승" ? "▲" : d === "하락" ? "▼" : "▶");
  const TN = D.meta.national.tourism;
  const SQ = D.meta.thresholds.stay;
  const man = (v) => (v / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: v >= 1e6 ? 0 : 1 }) + "만";
  const pbar = (pctile, lowLabel, highLabel) => `<div class="pbar" title="229개 시군구 중 백분위 ${pctile}"><i style="left:${pctile}%"></i></div><div class="pbar-l"><span>${lowLabel}</span><span>${highLabel}</span></div>`;
  const levelClass = (s) => (s.startsWith("적극") ? "l3" : s.startsWith("파일럿→") ? "l2" : "l1");

  // ── 헤더 ──
  $("#period").textContent = `BC 거래 ${D.meta.bc_period} · ${D.meta.n_regions}개 시군구`;
  $("#themeBtn").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  };
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch (e) {}

  // ── 사이드바 ──
  const PRESETS = [["영암(정주·산업)", "전라남도 영암군"], ["제주시(방문)", "제주특별자치도 제주시"], ["안산 단원구", "경기도 안산시 단원구"], ["서울 중구", "서울특별시 중구"]];
  $("#presets").innerHTML = PRESETS.map(([l, id]) => `<button data-id="${esc(id)}">${esc(l)}</button>`).join("");
  $("#presets").onclick = (e) => { const b = e.target.closest("button"); if (b) select(b.dataset.id); };
  const opts = (el, all, list) => (el.innerHTML = `<option value="">${all}</option>` + list.map((v) => `<option>${esc(v)}</option>`).join(""));
  opts($("#fSido"), "전체 시도", [...new Set(D.regions.map((r) => r.sido))]);
  opts($("#fStruct"), "전체 유형", ["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"]);
  opts($("#fCtx"), "전체 맥락", ["정주형", "방문형"]);
  ["#search", "#fSido", "#fStruct", "#fCtx"].forEach((s) => $(s).addEventListener("input", renderList));

  function renderList() {
    const q = $("#search").value.trim(), sd = $("#fSido").value, st = $("#fStruct").value, cx = $("#fCtx").value;
    const list = D.regions.filter((r) => (!q || r.id.includes(q)) && (!sd || r.sido === sd) && (!st || r.structure === st) && (!cx || r.context === cx))
      .sort((a, b) => b.famt - a.famt);
    $("#listMeta").textContent = `${list.length}개 지역 · 외국인 결제금액 순`;
    $("#regionList").innerHTML = list.map((r) => `
      <li data-id="${esc(r.id)}" class="${r.id === state.sel ? "sel" : ""}">
        <span class="nm">${esc(r.ccg)} <span class="small">${esc(r.sido.replace(/특별자치도|특별자치시|특별시|광역시/, ""))}</span></span>
        <span class="amt num">${eok(r.famt)}억</span>
        <span class="tags"><span class="tag">${r.structure}</span><span class="tag"><span class="dot" style="background:${ctxColor(r)}"></span>${ctxLabel(r)}</span><span class="tag">${confTag(r.confidence)}</span></span>
      </li>`).join("");
  }
  $("#regionList").onclick = (e) => { const li = e.target.closest("li"); if (li) select(li.dataset.id); };

  function select(id) {
    state.sel = id; state.result = null;
    renderList(); renderRegion(); setTab("region");
    const li = $(`#regionList li[data-id="${CSS.escape(id)}"]`); if (li) li.scrollIntoView({ block: "nearest" });
    setPipeline(2, true);
  }

  // ── 탭 ──
  function setTab(t) {
    state.tab = t;
    $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    $$(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + t));
    if (t === "nation") renderNation();
    if (t === "kb") renderKB();
    if (t === "eval") renderEval();
    if (t === "data") renderData();
  }
  $$(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

  function setPipeline(n, doneBefore) {
    $$(".step").forEach((s) => {
      const k = +s.dataset.step;
      s.classList.toggle("active", k === n);
      s.classList.toggle("done", doneBefore && k < n);
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 지역 진단 탭 ──
  function renderRegion() {
    const r = byId[state.sel];
    const pk = E.buildPacket(r);
    const t = D.meta.thresholds;
    const nm = D.meta.national_momentum;
    const cd = r.conf_detail;
    $("#tab-region").innerHTML = `
      <div class="region-head">
        <div><div class="meta">${esc(r.sido)}</div><h2>${esc(r.ccg)}</h2></div>
        <div class="row">
          <span class="tag">전략 축 · ${KB.STRATEGY[r.structure]}</span>
          ${r.cluster ? `<span class="tag">외국인 군집 · ${esc(r.cluster)}</span>` : ""}
        </div>
      </div>

      <div class="grid g4">
        <div class="stat"><div class="k">외국인 결제금액 <span class="tag real">실데이터</span></div><div class="v num">${eok(r.famt)}억원</div><div class="d">대규모 기준 ${eok(t.scale_cut)}억 이상 (상위 30%)</div></div>
        <div class="stat"><div class="k">외국인 결제 비중</div><div class="v num">${r.foreign_share.toFixed(1)}%</div><div class="d">전국 ${(D.meta.national.total_famt / D.meta.national.total_amt * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="k">TVD (소비구조 괴리)</div><div class="v num">${r.tvd.toFixed(3)}</div><div class="d">고괴리 기준 ${t.tvd_cut.toFixed(3)} (중앙값)</div></div>
        <div class="stat"><div class="k">외국인 CNT 변화 (전국 대비)</div><div class="v num">${pct(r.momentum.cnt_pct)}</div><div class="d">ATV ${pct(r.momentum.atv_pct)} · 전국 CNT 자체는 ${pct(nm.cnt_pct)}</div></div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <div class="row spread"><h3>Input Packet</h3><button class="btn ghost" id="jsonBtn" style="padding:4px 10px;font-size:12px">JSON 보기</button></div>
          <p class="hint">분석 엔진이 계산한 라벨. LLM은 이 값을 바꾸지 않는다.</p>
          <table class="packet">
            <tr><th>Region</th><td class="label-big">${esc(r.id)}</td></tr>
            <tr><th>Structure</th><td><span class="label-big">${r.structure}</span><div class="small">Scale ${r.famt >= t.scale_cut ? "≥" : "<"} ${eok(t.scale_cut)}억 · TVD ${r.tvd.toFixed(3)} ${r.tvd >= t.tvd_cut ? "≥" : "<"} ${t.tvd_cut.toFixed(3)}</div></td></tr>
            <tr><th>Momentum</th><td><span class="label-big">CNT ${arrow(r.momentum.cnt)} ${r.momentum.cnt} / ATV ${arrow(r.momentum.atv)} ${r.momentum.atv}</span><div class="small">H1(1~3월)→H2(4~6월), 전국 외국인 추세 대비 ±${t.mom_band_pct}% 밖이면 상승/하락</div></td></tr>
            <tr><th>Confidence</th><td><span class="label-big">${confTag(r.confidence)}</span>
              <div class="blocks mt" style="margin-top:6px">
                <span class="block">3개월 블록 ${arrow(cd.block3)} ${cd.block3} <span class="small num">${pct(r.momentum.cnt_pct)}</span></span>
                <span class="block">2개월 블록 ${arrow(cd.block2)} ${cd.block2} <span class="small num">${pct(r.momentum.cnt2_pct)}</span></span>
                <span class="block">1개월 블록 ${arrow(cd.block1)} ${cd.block1} <span class="small num">${pct(r.momentum.cnt1_pct)}</span></span>
              </div>${cd.notes.length ? `<div class="small">${cd.notes.map(esc).join(" · ")}</div>` : ""}</td></tr>
            <tr><th>Context</th><td><span class="label-big"><span class="dot" style="background:${ctxColor(r)}"></span> ${ctxLabel(r)}</span>
              <div class="small">Visitor Intensity ${r.ext.visitor_intensity} (전국 평균=1, ≥ ${t.visitor_cut}이면 방문형) <span class="tag syn">추정</span> · Resident Intensity ${r.ext.resident_intensity}% <span class="tag syn">합성</span></div>
              ${r.tour.stay_type ? `<div class="small">체류특성: <b>${r.tour.stay_type}</b> <span class="tag real">데이터랩</span></div>` : ""}</td></tr>
            <tr><th>Evidence</th><td>${pk.evidence.map(esc).join(" + ")}</td></tr>
          </table>
          <pre class="json" id="jsonBox" hidden>${esc(JSON.stringify(pk, null, 2))}</pre>
        </div>
        <div class="card">
          <h3>외국인 vs 내국인 업종 구성 <span class="tag real">실데이터</span></h3>
          <p class="hint">두 분포의 차이 절반 합이 TVD — 외국인 소비가 지역 평균과 얼마나 다른지</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>외국인</span><span><i style="background:var(--s2)"></i>내국인</span></div>
          <div class="chart" id="chMix"></div>
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3>관광 Context <span class="tag real">한국관광 데이터랩</span></h3>
          <p class="hint">체류특성·검색 상위 관광지는 시군구 실측, 방문자수·지출액은 시도 실측${r.tour.stay_matched_to ? ` · 체류특성은 ${esc(r.tour.stay_matched_to)} 전체 값` : ""}${r.tour.sido.merged ? " · 지출액·검색은 전남광주 통합값" : ""}</p>
          ${r.tour.dwell_min != null ? `
          <div class="grid g2">
            <div><div class="small">평균 체류시간</div><div class="label-big num">${r.tour.dwell_min.toLocaleString()}분 <span class="small">(≈${(r.tour.dwell_min / 60).toFixed(1)}시간)</span></div>${pbar(r.tour.dwell_pct, "짧음", "김")}</div>
            <div><div class="small">평균 숙박일수</div><div class="label-big num">${r.tour.nights}일</div>${pbar(r.tour.nights_pct, "짧음", "김")}</div>
          </div>
          <div class="small" style="margin-top:6px">체류 유형: <b>${r.tour.stay_type}</b> · 숙박일수 상위 25%(≥ ${SQ.nights_q75}일) = 숙박 체류형, 체류시간 하위 25%(≤ ${SQ.dwell_q25}분) = 단시간 방문형</div>` : `<p class="small">체류특성 데이터 없음</p>`}
          <table class="tbl mt">
            <tr><th>${esc(r.sido)} 방문자수</th><td class="num">${r.tour.sido.visitors != null ? man(r.tour.sido.visitors) + "명" : "-"}</td><th>방문자 증가율</th><td class="num">${r.tour.sido.growth != null ? pct(r.tour.sido.growth) : "-"}</td></tr>
            <tr><th>관광지출액</th><td class="num" title="데이터랩 원자료 값(천원 단위로 가정)">${r.tour.sido.spend != null ? (r.tour.sido.spend * 1000 / 1e12).toFixed(1) + "조원*" : "-"}</td><th>목적지 검색</th><td class="num">${r.tour.sido.search != null ? man(r.tour.sido.search) + "건" : "-"}</td></tr>
            <tr><th>외국인 방문(월, 이 시군구)</th><td class="num" colspan="3">${r.ext.visitors.toLocaleString()}명 <span class="tag syn">추정</span> <span class="small">전국 월평균 ${man(Object.values(TN.foreign_visitors).reduce((a, b) => a + b, 0) / Object.keys(TN.foreign_visitors).length)}명(실측)을 관광지표로 배분</span></td></tr>
          </table>
          <p class="small" style="margin:4px 0 0">* 관광지출액은 데이터랩 원자료를 천원 단위로 가정해 환산</p>
          <div class="mt"><div class="small" style="margin-bottom:4px">검색 상위 100 관광지 (이 시군구)</div>
            ${r.tour.attractions.length ? r.tour.attractions.map((a) => `<span class="tag" style="margin:0 4px 4px 0">${a.rank}위 ${esc(a.name)} · ${esc(a.sub)}</span>`).join("") : `<span class="small">없음</span>`}</div>
        </div>
        <div class="card">
          <h3>타깃 국적 — ${r.context === "방문형" ? "방문 외국인" : "정주 외국인"} 기준</h3>
          <p class="hint">Context가 어떤 국적 분포를 쓸지 정한다 · 이 지역은 <b>${r.context === "방문형" ? "데이터랩 방문 비율" : "법무부 등록외국인"}</b> 사용</p>
          <div class="grid g2">
            <div style="opacity:${r.context === "방문형" ? 1 : .45}"><div class="small">방문 외국인 (데이터랩, %)</div><div class="chart" id="chNatV"></div></div>
            <div style="opacity:${r.context === "방문형" ? .45 : 1}"><div class="small">등록외국인 (법무부, %)</div><div class="chart" id="chNatR"></div></div>
          </div>
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3>월별 외국인 거래건수 지수 (1월=100) <span class="tag real">실데이터</span></h3>
          <p class="hint">지역 추세가 전국 외국인 추세와 벌어질 때만 Momentum이 상승/하락으로 잡힌다</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>${esc(r.ccg)}</span><span><i style="background:var(--muted)"></i>전국 외국인</span></div>
          <div class="chart" id="chTrend"></div>
        </div>
        <div class="card">
          <h3>Supply Gap = 외국인 수요비중 − 지역 공급비중 <span class="tag syn">공급 합성</span></h3>
          <p class="hint">+ 는 외국인 수요 대비 점포가 부족한 업종 · 기준값 ${E.GAP_MIN}%p 초과 시 타깃 업종 · 막대에 올리면 폐업률</p>
          <div class="legend"><span><i style="background:var(--pos)"></i>공급 부족(+)</span><span><i style="background:var(--neg)"></i>공급 여유(−)</span></div>
          <div class="chart" id="chGap"></div>
        </div>
      </div>

      <h2 class="mt" style="margin-top:22px">Action 생성</h2>
      <p class="small" style="margin:2px 0 10px">Rule Engine이 후보 Action을 거르고 → 근거를 검색하고 → 생성기가 근거 범위 안에서 문장을 만든다</p>
      <div class="genbar">
        <div class="seg" role="group" aria-label="생성 모드">
          <button data-mode="template" class="${state.mode === "template" ? "on" : ""}">규칙 기반 생성 (오프라인)</button>
          <button data-mode="claude" class="${state.mode === "claude" ? "on" : ""}">Claude API</button>
        </div>
        <button class="btn" id="genBtn">Action 생성 ▶</button>
        <span class="small" id="genStatus"></span>
        <div class="apikey ${state.mode === "claude" ? "on" : ""}" id="apiRow">
          <input type="password" id="apiKey" placeholder="Anthropic API 키 (sk-ant-…) — 이 탭 메모리에만 보관" value="${esc(state.apiKey)}" autocomplete="off">
          <select id="model"><option value="claude-opus-5">Claude Opus 5</option><option value="claude-sonnet-5">Claude Sonnet 5</option></select>
          <span class="small">키는 저장·전송되지 않고 api.anthropic.com 호출에만 쓰입니다.</span>
        </div>
      </div>
      <div id="genOut" class="mt"></div>
    `;

    $("#jsonBtn").onclick = () => { const b = $("#jsonBox"); b.hidden = !b.hidden; };
    $$(".seg button").forEach((b) => (b.onclick = () => {
      state.mode = b.dataset.mode;
      $$(".seg button").forEach((x) => x.classList.toggle("on", x === b));
      $("#apiRow").classList.toggle("on", state.mode === "claude");
    }));
    $("#apiKey").oninput = (e) => (state.apiKey = e.target.value.trim());
    $("#model").value = state.model;
    $("#model").onchange = (e) => (state.model = e.target.value);
    $("#genBtn").onclick = () => generate();

    C.hbarGrouped($("#chMix"), { categories: G, series: [
      { name: "외국인", values: G.map((g) => r.mix_foreign[g]), color: "var(--s1)" },
      { name: "내국인", values: G.map((g) => r.mix_domestic[g]), color: "var(--s2)" }] });

    const natCnt = D.regions.reduce((a, x) => a.map((v, i) => v + x.monthly.fcnt[i]), [0, 0, 0, 0, 0, 0]);
    const idx = (arr) => arr.map((v) => (arr[0] ? (v / arr[0]) * 100 : 0));
    C.line($("#chTrend"), { labels: MON, fmt: (v) => v.toFixed(0), series: [
      { name: r.ccg, values: idx(r.monthly.fcnt), color: "var(--s1)" },
      { name: "전국 외국인", values: idx(natCnt), color: "var(--muted)", dash: "5 4" }] });

    const gs = [...G].sort((a, b) => r.ext.supply_gap[b] - r.ext.supply_gap[a]);
    C.diverging($("#chGap"), { categories: gs, values: gs.map((g) => r.ext.supply_gap[g]),
      extra: (i) => `외국인 수요 ${r.mix_foreign[gs[i]].toFixed(1)}% · 공급 ${r.ext.supply_share[gs[i]].toFixed(1)}% (${r.ext.stores[gs[i]].toLocaleString()}개 점포, 합성)<br>폐업률 ${r.ext.closure_risk[gs[i]]}%${r.ext.closure_risk[gs[i]] >= E.CLOSURE_MAX ? " ⚠ 높음" : ""} (합성)` });

    const nv = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 6);
    C.hbar($("#chNatV"), { categories: nv.map((x) => x.nat), values: nv.map((x) => x.pct), color: "var(--s2)", fmt: (v) => v + "%", compact: true });
    const nr = D.meta.national.moj_top.slice(0, 6);
    C.hbar($("#chNatR"), { categories: nr.map((x) => x.nat), values: nr.map((x) => +(x.n / D.meta.national.moj_total * 100).toFixed(1)), color: "var(--s1)", fmt: (v) => v + "%", compact: true });

    if (state.result && state.result.id === r.id) renderResult(state.result);
  }

  async function generate() {
    const r = byId[state.sel];
    const btn = $("#genBtn"), status = $("#genStatus"), out = $("#genOut");
    if (state.mode === "claude" && !state.apiKey) { status.innerHTML = `<span class="err">API 키를 입력하거나 '규칙 기반 생성'을 선택하세요.</span>`; return; }
    btn.disabled = true; out.innerHTML = "";
    const steps = ["BC 거래 로딩", "진단 라벨 확인", "외부 Context 결합", "Action KB 규칙 필터·근거 검색", state.mode === "claude" ? `${state.model} 생성 중…` : "규칙 기반 문장 생성", "이해관계자별 출력"];
    try {
      for (let i = 1; i <= 4; i++) { setPipeline(i, true); status.textContent = steps[i - 1]; await sleep(220); }
      const plan = E.runRules(r);
      setPipeline(5, true); status.textContent = steps[4];
      let cards, meta = { mode: state.mode };
      if (state.mode === "claude") {
        const t0 = performance.now();
        const res = await E.generateClaude(r, plan, { apiKey: state.apiKey, model: state.model });
        cards = res.cards; meta = { mode: "claude", model: res.model, usage: res.usage, ms: Math.round(performance.now() - t0) };
      } else { await sleep(260); cards = E.generateTemplate(r, plan); }
      const evals = E.evaluate(r, plan, cards);
      setPipeline(6, true); status.textContent = steps[5]; await sleep(150);
      state.result = { id: r.id, plan, cards, evals, meta };
      if (meta.mode === "claude") state.llmLog.push({ region: r.id, model: meta.model, evals, ms: meta.ms });
      renderResult(state.result);
      $$(".step").forEach((s) => s.classList.add("done")); $$(".step").forEach((s) => s.classList.remove("active"));
      status.textContent = meta.mode === "claude" ? `완료 · ${meta.model} · ${(meta.ms / 1000).toFixed(1)}초 · 입력 ${meta.usage?.input_tokens ?? "-"} / 출력 ${meta.usage?.output_tokens ?? "-"} 토큰` : "완료 · 동일 입력이면 항상 같은 출력";
    } catch (e) {
      status.innerHTML = `<span class="err">생성 실패: ${esc(e.message)}</span>`;
      setPipeline(5, true);
    } finally { btn.disabled = false; }
  }

  function citeHtml(text, validIds) {
    return esc(text).replace(/\[([A-Z]+-[A-Z0-9-]+)\]/g, (m, id) => {
      const ev = E.EV[id];
      const bad = !validIds.includes(id);
      return `<span class="cite${bad ? " bad" : ""}" data-ev="${id}">${id}</span>`;
    });
  }

  function renderResult({ plan, cards, evals, meta }) {
    const out = $("#genOut");
    const cardHtml = cards.map((c, i) => {
      const a = plan.actions.find((x) => x.sh.key === c.stakeholder);
      const valid = a ? a.retrieved.valid.map((e) => e.id) : [];
      const ev = evals[i];
      const chk = (ok, l) => `<span class="chk ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} ${l}</span>`;
      return `<article class="acard">
        <div class="who"><h3>${esc(c.label)}</h3><span class="strength ${levelClass(c.strength || "")}">${esc(c.strength)}</span></div>
        <div class="strategy">${esc(c.cell_id)} · ${esc(c.strategy || "")} · 시점: ${esc(c.timing)}</div>
        <div class="txt">${citeHtml(c.action, valid)}</div>
        <dl>
          <dt>Why</dt><dd>${esc(c.why)}</dd>
          <dt>KPI</dt><dd>${(c.kpi || []).map(esc).join(" · ")}</dd>
          <dt>기대효과</dt><dd>${esc(c.expected_effect)}</dd>
          <dt>주의</dt><dd>${esc(c.caution)}</dd>
        </dl>
        <div class="checks">
          ${chk(ev.groundedness >= 0.99, `근거율 ${(ev.groundedness * 100).toFixed(0)}%`)}
          ${chk(ev.citation_valid, "출처 유효")}
          ${chk(ev.numbers >= 0.99, `수치 일치 ${(ev.numbers * 100).toFixed(0)}%`)}
          ${chk(ev.kpi, "KPI")}
          ${chk(ev.rule_match, "규칙 일치")}
          ${chk(ev.confidence_ok, "Confidence 준수")}
        </div>
      </article>`;
    }).join("");

    const traceRows = plan.trace.map((t) => `<tr class="${t.fired ? "" : "off"}"><td>${t.fired ? "●" : "○"}</td><td><b>${t.id}</b></td><td>${esc(t.rule.effect)}</td><td>${esc(t.detail)}</td></tr>`).join("");
    const evRows = plan.actions.map((a) => [
      ...a.retrieved.valid.map((e) => `<tr><td>${a.sh.label}</td><td><b>${e.id}</b></td><td>${e.grade}</td><td>${esc(e.title)} ${e.demo ? '<span class="tag demo">데모용</span>' : ""}</td><td>${e.valid_to ? "~" + e.valid_to : "-"}</td></tr>`),
      ...a.retrieved.dropped.map((e) => `<tr class="drop"><td>${a.sh.label}</td><td><b>${e.id}</b></td><td>${e.grade}</td><td>${esc(e.title)} — 유효기간 경과로 제외</td><td>~${e.valid_to}</td></tr>`),
    ].join("")).join("");

    out.innerHTML = `
      <div class="note">${meta.mode === "claude" ? `<b>${esc(meta.model)}</b>이 규칙 엔진의 후보·근거만 받아 문장을 생성했습니다. 아래 체크는 출력물을 자동 검증한 결과입니다.` : "<b>규칙 기반 생성</b>: KB 문장과 진단값만 조합합니다. LLM 없이 재현 가능한 기준 출력이며, Claude API 모드 출력과 비교하는 기준선입니다."}</div>
      <div class="actions mt">${cardHtml}</div>
      <div class="grid g2 mt">
        <details class="box" open><summary>Rule Engine 추적 — 발동 ${plan.trace.filter((t) => t.fired).length} / ${plan.trace.length}</summary>
          <div class="tbl-wrap mt" style="max-height:340px"><table class="tbl"><tr><th></th><th>규칙</th><th>효과</th><th>조건값</th></tr>${traceRows}</table></div></details>
        <details class="box" open><summary>검색된 근거 (RAG) — 유효기간 지난 정책은 제외</summary>
          <div class="tbl-wrap mt" style="max-height:340px"><table class="tbl"><tr><th>대상</th><th>ID</th><th>등급</th><th>근거</th><th>유효</th></tr>${evRows}</table></div></details>
      </div>
      ${meta.mode === "claude" ? "" : `<details class="box mt"><summary>Claude API 모드에서 전송되는 입력 (System Guardrail + JSON)</summary><pre class="json">${esc(E.SYSTEM)}\n\n${esc(JSON.stringify(E.claudeInput(byId[state.sel], plan), null, 1))}</pre></details>`}
    `;
    $$(".cite", out).forEach((c) => {
      c.addEventListener("mousemove", (e) => { const ev = E.EV[c.dataset.ev]; C.showTip(e, ev ? `<b>${ev.id} · ${ev.grade}등급 · ${esc(ev.type)}</b>${esc(ev.title)}<br><span class="small">${esc(ev.desc)}</span>${ev.demo ? "<br>⚠ 데모용 가상 근거" : ""}` : "KB에 없는 ID"); });
      c.addEventListener("mouseleave", C.hideTip);
    });
  }

  // ── 전국 탭 ──
  function renderNation() {
    const n = D.meta.national, t = D.meta.thresholds, V = n.validation;
    const count = (f) => D.regions.filter(f).length;
    const S = ["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"];
    const mrow = (s) => `<tr><th>${s}<div class="small">${KB.STRATEGY[s]}</div></th>` + ["정주형", "방문형"].map((cx) => {
      const rs = D.regions.filter((r) => r.structure === s && r.context === cx);
      const c = { High: 0, Medium: 0, Low: 0 }; rs.forEach((r) => c[r.confidence]++);
      return `<td><b class="num">${rs.length}</b><div class="small">H ${c.High} · M ${c.Medium} · L ${c.Low}</div></td>`;
    }).join("") + "</tr>";
    const mojKeys = Object.keys(n.moj_series);
    $("#tab-nation").innerHTML = `
      <div class="grid g4">
        <div class="stat"><div class="k">분석 시군구</div><div class="v num">${D.meta.n_regions}</div><div class="d">사람이 해석하지 않고 동일 규칙으로 진단</div></div>
        <div class="stat"><div class="k">외국인 결제금액 <span class="tag real">BC</span></div><div class="v num">${eok(n.total_famt).split(".")[0]}억</div><div class="d">전체의 ${(n.total_famt / n.total_amt * 100).toFixed(1)}% · ${D.meta.bc_period}</div></div>
        <div class="stat"><div class="k">등록외국인 <span class="tag real">법무부</span></div><div class="v num">${(n.moj_total / 1e4).toFixed(1)}만명</div><div class="d">${String(n.moj_latest).slice(0, 4)}년 ${+String(n.moj_latest).slice(4)}월 기준</div></div>
        <div class="stat"><div class="k">방문형 지역</div><div class="v num">${count((r) => r.context === "방문형")}</div><div class="d">정주형 ${count((r) => r.context === "정주형")} (산업 ${count((r) => r.context_sub === "산업")})</div></div>
      </div>
      <div class="card mt">
        <h3>Structure 4분면: Scale × TVD</h3>
        <p class="hint">점 = 시군구 · 색 = Context · 점을 누르면 해당 지역 진단으로 이동 · 점선 = 대규모 기준 ${eok(t.scale_cut)}억 / 고괴리 기준 TVD ${t.tvd_cut.toFixed(3)}</p>
        <div class="legend"><span><i style="background:var(--s1)"></i>정주형</span><span><i style="background:var(--s2)"></i>방문형</span></div>
        <div class="chart" id="chScatter"></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>24개 Action Cell 매핑 (Structure × Context)</h3><p class="hint">셀 하나 = 이해관계자 3종 Action · 괄호는 Confidence 분포</p>
          <table class="matrix"><tr><th></th><th>정주형</th><th>방문형</th></tr>${S.map(mrow).join("")}</table></div>
        <div class="card"><h3>등록외국인 국적 Top 10 <span class="tag real">법무부</span></h3><p class="hint">${String(n.moj_latest).slice(0, 4)}.${String(n.moj_latest).slice(4)} 기준, 명</p><div class="chart" id="chNat"></div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>등록외국인 추이 (만명) <span class="tag real">법무부</span></h3><p class="hint">${mojKeys[0].slice(0, 4)}.${mojKeys[0].slice(4)} ~ ${mojKeys.at(-1).slice(0, 4)}.${mojKeys.at(-1).slice(4)} 월별 합계</p><div class="chart" id="chMoj"></div></div>
        <div class="card"><h3>BC 외국인 결제건수 (만건) <span class="tag real">BC</span></h3><p class="hint">월별 전국 합계 — Momentum 보정에 쓰는 전국 기준선</p><div class="chart" id="chBc"></div></div>
      </div>
      <h2 style="margin:22px 0 10px">한국관광 데이터랩 연계</h2>
      <div class="grid g2">
        <div class="card"><h3>외부 타당성: BC 외국인 결제 vs 데이터랩 (1월=100)</h3>
          <p class="hint">월별 상관 — 결제건수↔방문자수 r = <b>${V.r_cnt_visitors}</b> · 결제금액↔관광소비 r = <b>${V.r_amt_spend}</b> · 결제금액↔식음료 관광소비 r = <b>${V.r_amt_food}</b> (6개월)</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>BC 외국인 결제건수</span><span><i style="background:var(--s2)"></i>데이터랩 외국인 방문자수</span><span><i style="background:var(--s3)"></i>데이터랩 외국인 관광소비</span></div>
          <div class="chart" id="chValid"></div>
          <p class="small">1~3월→4~6월 증가율: BC 결제건수 ${pct(V.h2h1.bc_cnt)} · 방문자수 ${pct(V.h2h1.visitors)} · 관광소비 ${pct(V.h2h1.spend)}. 방향은 같지만 BC 외국인 결제는 정주 외국인을 포함해 관광 유입보다 완만하다 — Momentum을 전국 추세 대비로 보정하는 이유.</p></div>
        <div class="card"><h3>외국인 관광소비 업종 구성 (%)</h3>
          <p class="hint">데이터랩 · BC 데이터는 이 중 <b>식음료업(${TN.spend_major_pct["식음료업"]}%)</b>과 쇼핑업 일부(대형·슈퍼·편의점)만 포함 — 해석 범위의 한계</p>
          <div class="chart" id="chSpendMix"></div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>국적 비교: 방문 외국인 vs 정주 외국인 (%)</h3>
          <p class="hint">방문(데이터랩)은 중국·일본·미국, 정주(법무부)는 베트남·중국·한국계중국인 중심 — Context에 따라 타깃 국적이 달라진다</p>
          <div class="grid g2"><div><div class="small">방문 (데이터랩)</div><div class="chart" id="chNV"></div></div><div><div class="small">등록 (법무부)</div><div class="chart" id="chNR"></div></div></div></div>
        <div class="card"><h3>시도별 관광 지표 <span class="tag real">데이터랩</span></h3>
          <p class="hint">방문자수·증가율과 BC 외국인 결제금액, 방문형 시군구 수</p>
          <div class="tbl-wrap" style="max-height:360px"><table class="tbl"><tr><th>시도</th><th>방문자수</th><th>증가율</th><th>BC 외국인 결제</th><th>방문형</th></tr>
          ${Object.entries(TN.sido).sort((a, b) => b[1].visitors - a[1].visitors).map(([sd, v]) => {
            const rs = D.regions.filter((x) => x.sido === sd);
            return `<tr><td>${esc(sd)}</td><td class="num">${man(v.visitors)}</td><td class="num">${v.growth == null || isNaN(v.growth) ? "-" : pct(v.growth)}</td><td class="num">${eok(rs.reduce((a, x) => a + x.famt, 0))}억</td><td class="num">${rs.filter((x) => x.context === "방문형").length}</td></tr>`;
          }).join("")}</table></div></div>
      </div>`;
    C.scatter($("#chScatter"), {
      points: D.regions.map((r) => ({ id: r.id, x: r.famt, y: r.tvd, color: ctxColor(r),
        tip: `<b>${esc(r.id)}</b>${r.structure} · ${ctxLabel(r)}<br>외국인 결제 ${eok(r.famt)}억 · TVD ${r.tvd.toFixed(3)}<br>Confidence ${r.confidence}` })),
      xCut: t.scale_cut, yCut: t.tvd_cut, selected: state.sel, onClick: select });
    C.hbar($("#chNat"), { categories: n.moj_top.map((x) => x.nat), values: n.moj_top.map((x) => x.n) });
    C.line($("#chMoj"), { labels: mojKeys.map((k) => `${k.slice(2, 4)}.${k.slice(4)}`), fmt: (v) => (v / 1e4).toFixed(0), series: [{ name: "등록외국인", values: mojKeys.map((k) => n.moj_series[k]), color: "var(--s1)" }] });
    const bk = Object.keys(n.bc_foreign_cnt);
    C.line($("#chBc"), { labels: bk.map((k) => `${k.slice(2, 4)}.${k.slice(4)}`), fmt: (v) => (v / 1e4).toFixed(0), series: [{ name: "외국인 결제건수", values: bk.map((k) => n.bc_foreign_cnt[k]), color: "var(--s1)" }] });
    const idx = (vals) => vals.map((v) => (v / vals[0]) * 100);
    C.line($("#chValid"), { labels: bk.map((k) => `${k.slice(2, 4)}.${k.slice(4)}`), fmt: (v) => v.toFixed(0), series: [
      { name: "BC 외국인 결제건수", values: idx(bk.map((k) => n.bc_foreign_cnt[k])), color: "var(--s1)" },
      { name: "데이터랩 외국인 방문자수", values: idx(bk.map((k) => TN.foreign_visitors[k])), color: "var(--s2)" },
      { name: "데이터랩 외국인 관광소비", values: idx(bk.map((k) => TN.foreign_spend[k])), color: "var(--s3)" }] });
    const sm = Object.entries(TN.spend_major_pct);
    C.hbar($("#chSpendMix"), { categories: sm.map((x) => x[0]), values: sm.map((x) => x[1]), color: "var(--s2)", fmt: (v) => v + "%" });
    const nv = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 8);
    C.hbar($("#chNV"), { categories: nv.map((x) => x.nat), values: nv.map((x) => x.pct), color: "var(--s2)", fmt: (v) => v + "%", compact: true });
    const nr = n.moj_top.slice(0, 8);
    C.hbar($("#chNR"), { categories: nr.map((x) => x.nat), values: nr.map((x) => +(x.n / n.moj_total * 100).toFixed(1)), color: "var(--s1)", fmt: (v) => v + "%", compact: true });
  }

  // ── KB 탭 ──
  function renderKB() {
    const host = $("#tab-kb");
    if (!host.dataset.init) {
      host.dataset.init = 1;
      host.innerHTML = `
        <div class="note">Action KB는 문서 모음이 아니라 <b>"어떤 조건에서 어떤 Action을 고려할 수 있는지"</b>를 저장하는 의사결정 규칙 DB입니다. Structure·Context가 Action 종류를, Momentum이 실행 시점을, Confidence가 권고 강도를 결정합니다.</div>
        <div class="card mt"><h3>기본 Action Cell (24개 = 4 Structure × 2 Context × 3 Stakeholder)</h3>
          <div class="kbfilters mt">
            <select id="kSh"><option value="">전체 이해관계자</option>${KB.STAKEHOLDERS.map((s) => `<option value="${s.key}">${s.label}</option>`).join("")}</select>
            <select id="kSt"><option value="">전체 Structure</option>${Object.keys(KB.STRATEGY).map((s) => `<option>${s}</option>`).join("")}</select>
            <select id="kCx"><option value="">전체 Context</option><option>정주형</option><option>방문형</option></select>
          </div>
          <div class="tbl-wrap"><table class="tbl" id="kbTbl"></table></div></div>
        <div class="grid g2 mt">
          <div class="card"><h3>결정 규칙 (Modifier)</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>ID</th><th>입력</th><th>조건</th><th>효과</th></tr>${KB.rules.map((r) => `<tr><td><b>${r.id}</b></td><td>${esc(r.on)}</td><td>${esc(r.when)}</td><td>${esc(r.effect)}</td></tr>`).join("")}</table></div></div>
          <div class="card"><h3>System Guardrail</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>항목</th><th>LLM 출력 제약</th></tr>${KB.guardrails.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v)}</td></tr>`).join("")}</table></div>
            <p class="small mt">근거 등급 — A: BC 공식·정부 통계·본 연구 실증 · B: 논문·보고서 · C: 가설(“파일럿 검증 필요” 표시) · X: 등록 안 함</p></div>
        </div>
        <div class="card mt"><h3>Evidence 저장소 (${KB.evidence.length}건)</h3><p class="hint">기준일 ${KB.TODAY} · 취소선 = 유효기간 경과로 추천에서 제외</p>
          <div class="tbl-wrap"><table class="tbl"><tr><th>ID</th><th>등급</th><th>유형</th><th>근거</th><th>출처</th><th>유효기간</th></tr>
          ${KB.evidence.map((e) => `<tr class="${e.valid_to && e.valid_to < KB.TODAY ? "drop" : ""}"><td><b>${e.id}</b></td><td>${e.grade}</td><td>${esc(e.type)}</td><td>${esc(e.title)}<div class="small">${esc(e.desc)}</div></td><td>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${esc(e.source)}</a>` : esc(e.source)} ${e.demo ? '<span class="tag demo">데모용</span>' : ""}</td><td>${e.valid_from ? `${e.valid_from} ~ ${e.valid_to}` : "상시"}</td></tr>`).join("")}</table></div></div>`;
      ["#kSh", "#kSt", "#kCx"].forEach((s) => $(s).addEventListener("input", drawKB));
    }
    drawKB();
  }
  function drawKB() {
    const sh = $("#kSh").value, st = $("#kSt").value, cx = $("#kCx").value;
    const lab = Object.fromEntries(KB.STAKEHOLDERS.map((s) => [s.key, s.label]));
    const rows = KB.cells.filter((c) => (!sh || c.stakeholder === sh) && (!st || c.structure === st) && (!cx || c.context === cx));
    $("#kbTbl").innerHTML = `<tr><th>ID</th><th>Stakeholder</th><th>Structure</th><th>Context</th><th>Action</th><th>Why</th><th>Avoid When</th><th>KPI</th><th>Evidence</th></tr>` +
      rows.map((c) => `<tr><td><b>${c.id}</b></td><td>${lab[c.stakeholder]}</td><td>${c.structure}</td><td>${c.context}</td><td>${esc(c.action)}</td><td>${esc(c.why)}</td><td>${esc(c.avoid_when)}</td><td>${c.kpi.map(esc).join(", ")}</td><td>${c.evidence.join(" ")}</td></tr>`).join("");
  }

  // ── 평가 탭 ──
  let batch = null;
  function renderEval() {
    if (!batch) batch = E.batchEvaluate();
    const b = batch;
    const m = (k, v, target, d) => `<div class="stat metric"><div class="k">${k}</div><div class="v num">${(v * 100).toFixed(1)}%</div><div class="d">${d} · 목표 ${target}</div><div class="bar-track"><i style="width:${v * 100}%"></i></div></div>`;
    const log = state.llmLog;
    const avg = (f) => log.length ? log.reduce((a, x) => a + x.evals.reduce((s, e) => s + f(e), 0) / x.evals.length, 0) / log.length : 0;
    $("#tab-eval").innerHTML = `
      <div class="note">공모전 평가 관점: LLM 문장 품질보다 <b>근거를 벗어나지 않는가</b>와 <b>동일 입력에서 일관된 Action이 나오는가</b>. 아래는 ${b.regions}개 지역 × 3 이해관계자 = ${b.cards}개 Action을 규칙 기반 생성기로 만든 뒤 자동 검증한 결과입니다.</div>
      <div class="grid g5 mt">
        ${m("Groundedness", b.groundedness, "높을수록", "인용으로 끝나는 문장 비율")}
        ${m("Rule Consistency", b.rule_consistency, "90%+", `동일 라벨 ${b.label_groups}개 그룹 내 Action 유형 유지`)}
        ${m("Citation Validity", b.citation_validity, "100%", "인용 ID가 검색 근거에 존재·유효")}
        ${m("Stakeholder Fit", b.stakeholder_fit, "높을수록", "BC Action은 BC 실행수단 근거 포함 (자동 점검)")}
        ${m("Actionability", b.actionability, "100%", "Target·Expected Effect·KPI 모두 포함")}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>권고 강도 분포 (${b.cards}개 Action)</h3><p class="hint">Confidence가 강도를, Momentum 하락이 1단계 하향을 결정</p><div class="chart" id="chStr"></div></div>
        <div class="card"><h3>추가 가드레일 점검</h3>
          <table class="tbl"><tr><th>항목</th><th>결과</th></tr>
            <tr><td>Low Confidence 금지 표현 미사용</td><td class="num">${(b.confidence_ok * 100).toFixed(1)}%</td></tr>
            <tr><td>본문 수치가 진단 패킷과 일치</td><td class="num">${(b.numbers * 100).toFixed(1)}%</td></tr>
            <tr><td>유효기간 지난 정책 인용</td><td class="num">0건 (${KB.evidence.filter((e) => e.valid_to && e.valid_to < KB.TODAY).map((e) => e.id).join(", ")} 제외)</td></tr>
            <tr><td>KPI 1개 이상 포함</td><td class="num">${(b.kpi * 100).toFixed(1)}%</td></tr>
          </table>
          <p class="small mt">Stakeholder Fit의 최종 판정은 기획서대로 전문가 평가가 필요합니다. 여기서는 권한 범위를 규칙으로 근사한 값입니다.</p></div>
      </div>
      <div class="card mt"><h3>Claude API 출력 검증 로그 (이번 세션)</h3>
        ${log.length ? `<p class="hint">${log.length}회 생성 · 평균 근거율 ${(avg((e) => e.groundedness) * 100).toFixed(0)}% · 출처 유효 ${(avg((e) => +e.citation_valid) * 100).toFixed(0)}% · 규칙 일치 ${(avg((e) => +e.rule_match) * 100).toFixed(0)}% · 수치 일치 ${(avg((e) => e.numbers) * 100).toFixed(0)}%</p>
        <div class="tbl-wrap"><table class="tbl"><tr><th>지역</th><th>모델</th><th>이해관계자</th><th>근거율</th><th>출처 유효</th><th>수치 일치</th><th>규칙 일치</th><th>Confidence 준수</th></tr>
        ${log.flatMap((l) => l.evals.map((e) => `<tr><td>${esc(l.region)}</td><td>${esc(l.model)}</td><td>${e.stakeholder}</td><td>${(e.groundedness * 100).toFixed(0)}%</td><td>${e.citation_valid ? "✓" : "✗ " + e.badIds.join(",")}</td><td>${(e.numbers * 100).toFixed(0)}%</td><td>${e.rule_match ? "✓" : "✗"}</td><td>${e.confidence_ok ? "✓" : "✗ " + e.forbidden.join(",")}</td></tr>`)).join("")}</table></div>`
        : `<p class="hint">아직 없음 — '지역 진단 · Action' 탭에서 Claude API 모드로 생성하면 같은 지표로 자동 검증되어 여기에 쌓입니다. 같은 지역을 여러 번 생성하면 Rule Consistency를 직접 확인할 수 있습니다.</p>`}
      </div>`;
    const order = ["적극", "적극/선별", "파일럿→확대", "파일럿→확대/선별", "파일럿·추가 관찰"].filter((k) => b.strengthDist[k]);
    C.hbar($("#chStr"), { categories: order, values: order.map((k) => b.strengthDist[k]), fmt: (v) => v + "개" });
  }

  // ── 데이터·가정 탭 ──
  function renderData() {
    const t = D.meta.thresholds;
    const rows = [
      ["① BC 분석결과", "공모전 BC 거래데이터 (bc카드 데이터.csv)", "실데이터", "외국인(성별코드 3)·내국인 결제의 금액·건수, 업종 구성 → Scale, TVD, Momentum, Confidence"],
      ["② 외국인 정주", "법무부 등록외국인 국적(지역)별 현황", "실데이터 + 합성", "전국 총량·국적·추이는 실데이터. 원자료에 시군구 구분이 없어 시군구 분포는 BC 외국인 결제건수×정주 가중치로 전국 총량을 배분한 합성값"],
      ["③ 관광·방문", "한국관광 데이터랩 (3개 폴더 17개 파일)", "실데이터 + 추정", "실측: 시군구 체류시간·숙박일수(229개), 검색 Top100 관광지(주소→시군구 100% 매칭), 시도 방문자수·지출액·검색·증가율, 전국 외국인 방문자수·관광소비·국적·간편결제. 추정: 시군구 외국인 방문자 = 전국 월평균 외국인 방문자(실측) × [BC 외국인 결제건수 × 관광지 사전가정 × (1+0.4×Top100 관광지 수) × (숙박일수/중앙값)³] 비중"],
      ["④ 상권 공급", "소상공인365 / LOCALDATA", "합성", "업종별 점포 비중 = 내국인 결제건수 구성^0.85 × 노이즈, 총 점포 수 = 인구/95. 폐업률 = 업종 기준값 × 노이즈"],
      ["⑤ 정책·지원", "중기부 2026 소상공인 지원사업 통합공고", "데모용 예시", "사업명·기간은 예시. valid_to 가드레일 시연을 위해 기간 경과 정책 2건 포함"],
      ["⑥ BC 실행수단", "BC IDEA / BC 빅데이터 비즈니스", "공개 서비스 설명", "BC Action은 이 수행역량 범위 안에서만 생성"],
      ["주민등록인구", "행정안전부 (가정)", "합성", "총 5,120만명을 지역 전체 결제액 비중으로 배분 (Resident Intensity 분모)"],
    ];
    const unused = TN.unused;
    $("#tab-data").innerHTML = `
      <div class="note">데이터가 없는 항목은 <b>임의의 합성값</b>으로 채웠습니다. 합성값은 지역명 해시 기반이라 몇 번을 다시 만들어도 같은 값이 나오며, 화면에 <span class="tag syn">합성</span> 표시가 붙습니다. 실제 구현 시 해당 공공데이터로 교체하면 동일한 규칙이 그대로 적용됩니다.</div>
      <div class="card mt"><h3>데이터군별 출처와 처리</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>데이터군</th><th>출처</th><th>상태</th><th>처리 방법</th></tr>
        ${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2].includes("합성") || r[2].includes("예시") ? `<span class="tag syn">${r[2]}</span>` : `<span class="tag real">${r[2]}</span>`}</td><td>${r[3]}</td></tr>`).join("")}</table></div></div>
      <div class="card mt"><h3>데이터랩 파일 중 반영하지 않은 것</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>파일</th><th>사유</th></tr>
        ${unused.map(([f, why]) => `<tr><td>${esc(f)}</td><td>${esc(why)}</td></tr>`).join("")}</table></div>
        <p class="small mt">시군구별 외국인 방문자·관광소비는 이번 다운로드에 전국 값만 있어 추정으로 배분했습니다. 데이터랩에서 시군구를 선택해 '외국인 방문자 현황'을 받으면 추정값을 실측으로 바꿀 수 있습니다.</p></div>
      <div class="card mt"><h3>진단 라벨 정의 (Analytics Engine)</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>라벨</th><th>정의</th><th>기준값</th></tr>
        <tr><td><b>Scale</b></td><td>외국인 결제금액 (${D.meta.bc_period} 합계)</td><td>상위 30% (${eok(t.scale_cut)}억원 이상) = 대규모</td></tr>
        <tr><td><b>TVD</b></td><td>½ Σ |외국인 업종비중 − 내국인 업종비중| (8개 업종 그룹)</td><td>중앙값 ${t.tvd_cut.toFixed(3)} 이상 = 고괴리</td></tr>
        <tr><td><b>Momentum</b></td><td>H1(1~3월)→H2(4~6월) CNT·ATV 변화를 전국 외국인 변화로 나눈 초과 증감률. 1~6월 계절성(전국 CNT ${pct(D.meta.national_momentum.cnt_pct)})을 제거하기 위함</td><td>±${t.mom_band_pct}% 밖 = 상승/하락</td></tr>
        <tr><td><b>Confidence</b></td><td>3개월(1~3 vs 4~6)·2개월(1~2 vs 5~6)·1개월(1 vs 6) 블록의 CNT 방향 일치 여부</td><td>3개 일치 High · 3·2개월 일치 Medium · 그 외/반대 신호 Low · 외국인 결제 20억 미만은 1단계 하향</td></tr>
        <tr><td><b>Context</b></td><td>Visitor Intensity = (외국인 방문자 / 등록외국인) ÷ 전국 평균, Resident Intensity = 등록외국인 / (주민 + 등록외국인)</td><td>Visitor ≥ ${t.visitor_cut} = 방문형, 그 외 정주형(대형·슈퍼+편의점 ≥ 55% 또는 산업단지 군집이면 산업)</td></tr>
        <tr><td><b>체류특성</b></td><td>데이터랩 평균 숙박일수·체류시간 (일반구는 상위 시 값 사용)</td><td>숙박일수 ≥ ${SQ.nights_q75}일 = 숙박 체류형 · 체류시간 ≤ ${SQ.dwell_q25}분 = 단시간 방문형</td></tr>
        <tr><td><b>Supply Gap(k)</b></td><td>외국인 업종 k 수요비중 − 지역 업종 k 공급비중</td><td>${E.GAP_MIN}%p 초과 = 타깃 업종, 폐업률 ${E.CLOSURE_MAX}% 이상 = 선별</td></tr>
      </table></div></div>
      <div class="card mt"><h3>재생성</h3><p class="hint" style="margin:0">프로젝트 폴더에서 <code>python demo/build_demo_data.py</code> 를 실행하면 원자료로부터 <code>demo/data.js</code>가 다시 만들어집니다. (생성 ${esc(D.meta.generated)})</p></div>`;
  }

  // ── 시작 ──
  renderList();
  renderRegion();
  setPipeline(2, true);
})();
