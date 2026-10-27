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
  const state = { sel: "전라남도 영암군", mode: "template", tab: "region", llmLog: [], result: null };

  const confTag = (c) => `<span class="conf ${c}">${c === "High" ? "●" : c === "Medium" ? "◐" : "○"} ${I18n.msg("CONF_" + c)}</span>`;
  // External Context (보고서 7.3): 정주우세형 / 혼합형 / 방문우세형 — 범주 색 1·3·2번 슬롯(전 쌍 CVD 검증 통과)
  const CTXS = ["정주우세형", "혼합형", "방문우세형", "분류보류"];
  const CTX_COLOR = { 정주우세형: "var(--s1)", 혼합형: "var(--s3)", 방문우세형: "var(--s2)", 분류보류: "var(--muted)" };
  const ctxColor = (r) => CTX_COLOR[r.context];
  const ctxLabel = (r) => r.context + (r.ctx.strict ? "" : "*");
  const CM = D.meta.thresholds.context;
  const gapFmt = (g) => g == null ? "—" : (g > 0 ? "+" : "") + g.toFixed(2);
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
  const PRESETS = [["영암(정주우세)", "전라남도 영암군"], ["제주시(방문우세)", "제주특별자치도 제주시"], ["거제(혼합)", "경상남도 거제시"], ["서울 중구(혼합)", "서울특별시 중구"]];
  $("#presets").innerHTML = PRESETS.map(([l, id]) => `<button data-id="${esc(id)}">${esc(l)}</button>`).join("");
  $("#presets").onclick = (e) => { const b = e.target.closest("button"); if (b) select(b.dataset.id); };
  const opts = (el, all, list) => (el.innerHTML = `<option value="">${all}</option>` + list.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(""));
  opts($("#fSido"), "전체 시도", [...new Set(D.regions.map((r) => r.sido))]);
  opts($("#fStruct"), "전체 유형", ["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"]);
  opts($("#fCtx"), "전체 Context", CTXS);
  // 정렬: Confidence는 High > Medium > Low, 같은 등급 안에서는 외국인 결제금액순
  const CONF_RANK = { High: 3, Medium: 2, Low: 1 };
  const SORTS = {
    famt: { label: "외국인 결제금액순", cmp: (a, b) => b.famt - a.famt },
    conf_desc: { label: "Confidence 높은순", cmp: (a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence] || b.famt - a.famt },
    conf_asc: { label: "Confidence 낮은순", cmp: (a, b) => CONF_RANK[a.confidence] - CONF_RANK[b.confidence] || b.famt - a.famt },
  };
  try { const v = localStorage.getItem("sort"); if (v && SORTS[v]) $("#fSort").value = v; } catch (e) {}
  $("#fSort").addEventListener("input", () => {
    try { localStorage.setItem("sort", $("#fSort").value); } catch (e) {}
    renderList();
  });
  ["#search", "#fSido", "#fStruct", "#fCtx"].forEach((s) => $(s).addEventListener("input", renderList));

  function renderList() {
    const q = $("#search").value.trim(), sd = $("#fSido").value, st = $("#fStruct").value, cx = $("#fCtx").value;
    const list = D.regions.filter((r) => (!q || I18n.searchRegion(r, q)) && (!sd || r.sido === sd) && (!st || r.structure === st) && (!cx || r.context === cx))
      .sort(SORTS[$("#fSort").value].cmp);
    const cc = { High: 0, Medium: 0, Low: 0 }; list.forEach((r) => cc[r.confidence]++);
    $("#listMeta").textContent = `${list.length}곳 · H${cc.High} M${cc.Medium} L${cc.Low}`;
    $("#listMeta").title = `Confidence High ${cc.High} · Medium ${cc.Medium} · Low ${cc.Low}`;
    $("#regionList").innerHTML = list.length ? list.map((r) => `
      <li data-id="${esc(r.id)}" class="${r.id === state.sel ? "sel" : ""}">
        <span class="nm">${esc(r.ccg)} <span class="small">${esc(r.sido.replace(/특별자치도|특별자치시|특별시|광역시/, ""))}</span></span>
        <span class="amt num">${eok(r.famt)}억</span>
        <span class="tags"><span class="tag">${r.structure}</span><span class="tag"><span class="dot" style="background:${ctxColor(r)}"></span>${ctxLabel(r)}</span><span class="tag">${confTag(r.confidence)}</span></span>
      </li>`).join("") : `<li class="empty">검색 결과가 없습니다.</li>`;
  }
  $("#regionList").onclick = (e) => { const li = e.target.closest("li"); if (li?.dataset.id) select(li.dataset.id); };

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
        <div class="stat"><div class="k">외국인 결제금액 <span class="tag real">실데이터</span></div><div class="v num">${eok(r.famt)}억원</div><div class="d">Scale ${(r.scale_share * 100).toFixed(4)}% · 중앙값 ${(t.scale_cut * 100).toFixed(4)}%</div></div>
        <div class="stat"><div class="k">외국인 결제 비중</div><div class="v num">${r.foreign_share.toFixed(1)}%</div><div class="d">전국 ${(D.meta.national.total_famt / D.meta.national.total_personal_amt * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="k">TVD (소비구조 괴리)</div><div class="v num">${r.tvd.toFixed(3)}</div><div class="d">고괴리 기준 ${t.tvd_cut.toFixed(3)} (중앙값)</div></div>
        <div class="stat"><div class="k">전체 CNT 초과변화 (log %p)</div><div class="v num">${pct(r.momentum.cnt_pct).replace("%", " log %p")}</div><div class="d">ATV ${r.momentum.atv_pct.toFixed(2)} log %p · 전국 CNT 로그변화 ${nm.cnt_pct.toFixed(2)}%</div></div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <div class="row spread"><h3>Input Packet</h3><button class="btn ghost" id="jsonBtn" style="padding:4px 10px;font-size:12px">JSON 보기</button></div>
          <p class="hint">분석 엔진이 계산한 라벨. LLM은 이 값을 바꾸지 않는다.</p>
          <table class="packet">
            <tr><th>Region</th><td class="label-big">${esc(r.id)}</td></tr>
            <tr><th>Structure</th><td><span class="label-big">${r.structure}</span><div class="small">Scale ${(r.scale_share * 100).toFixed(4)}% ${r.scale_share >= t.scale_cut ? "≥" : "<"} ${(t.scale_cut * 100).toFixed(4)}% · TVD ${r.tvd.toFixed(3)} ${r.tvd >= t.tvd_cut ? "≥" : "<"} ${t.tvd_cut.toFixed(3)}</div></td></tr>
            <tr><th>Momentum</th><td><div class="small">${r.momentum.signal}</div><span class="label-big">CNT ${arrow(r.momentum.cnt)} ${r.momentum.cnt} / ATV ${arrow(r.momentum.atv)} ${r.momentum.atv}</span><div class="small">전체 거래(법인 포함) · 100 × [지역 ln(H2/H1) − 전국 ln(H2/H1)] · 0 기준</div></td></tr>
            <tr><th>Confidence</th><td><span class="label-big">${confTag(r.confidence)}</span>
              <div class="blocks mt" style="margin-top:6px">
                <span class="block">3개월 블록 ${arrow(cd.block3)} ${cd.block3} <span class="small num">${r.momentum.cnt_pct.toFixed(2)} log %p</span></span>
                <span class="block">2개월 블록 ${arrow(cd.block2)} ${cd.block2} <span class="small num">${r.momentum.cnt2_pct.toFixed(2)} log %p</span></span>
                <span class="block">CNT Stable ${cd.stable_cnt ? "✓" : "✗"} · ATV Stable ${cd.stable_atv ? "✓" : "✗"}</span>
              </div><div class="small">ATV 3M ${r.momentum.atv_pct.toFixed(2)} / 2M ${r.momentum.atv2_pct.toFixed(2)} log %p · robust scale CNT ${t.confidence_robust_scale.CNT.toFixed(3)} / ATV ${t.confidence_robust_scale.ATV.toFixed(3)}</div>${cd.notes.length ? `<div class="small">${cd.notes.map(esc).join(" · ")}</div>` : ""}</td></tr>
            <tr><th>Context</th><td><span class="label-big"><span class="dot" style="background:${ctxColor(r)}"></span> ${ctxLabel(r)}</span>
              <div class="small">ContextGap <b>${gapFmt(r.ctx.gap)}</b> = 외국인 방문비중 백분위 ${r.ctx.visitor_pctile?.toFixed(2) ?? "—"} − 등록외국인 비율 백분위 ${r.ctx.resident_pctile?.toFixed(2) ?? "—"} · 3분위 경계 ${CM.q33.toFixed(3)} / ${CM.q67.toFixed(3)}</div>
              <div class="small">외국인 방문비중 ${r.ctx.visit_share.toFixed(2)}% <span class="tag real">KTO 2026H1</span> · 등록외국인 비율 ${r.ctx.registered_share.toFixed(2)}% (${r.ext.reg_foreigners.toLocaleString()}명 / 주민 ${r.ext.population.toLocaleString()}명) <span class="tag real">법무부·행안부</span></div>
              ${r.ctx.strict ? "" : `<div class="small" style="color:var(--warn-ink)">* KTO 관측 ${r.ctx.observed_days}일(181일 미만) — Context 분류보류 · Context 기반 추천 제한</div>`}
              ${r.tour.stay_type ? `<div class="small">체류특성: <b>${r.tour.stay_type}</b> <span class="tag real">데이터랩</span></div>` : ""}</td></tr>
            <tr><th>Evidence</th><td>${pk.evidence.map(esc).join(" + ")}</td></tr>
          </table>
          <pre class="json" id="jsonBox" hidden>${esc(JSON.stringify(pk, null, 2))}</pre>
        </div>
        <div class="card">
          <h3>외국인 vs 내국인 업종 구성 <span class="tag real">실데이터</span></h3>
          <p class="hint">추가 기능용 8개 그룹 비교 · 핵심 TVD는 원래 11개 업종으로 별도 계산</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>외국인</span><span><i style="background:var(--s2)"></i>내국인</span></div>
          <div class="chart" id="chMix"></div>
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3>추가 기능: 관광·체류 <span class="tag real">한국관광 데이터랩</span></h3>
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
            <tr><th>외국인 방문(월평균)</th><td class="num">${r.ext.visitors.toLocaleString()}명 <span class="tag real">KTO</span></td><th>외국인 방문비중</th><td class="num">${r.ctx.visit_share.toFixed(2)}% <span class="small">(외국인/(외지인+외국인))</span></td></tr>
          </table>
          <p class="small" style="margin:4px 0 0">* 관광지출액은 데이터랩 원자료를 천원 단위로 가정해 환산</p>
          <div class="mt"><div class="small" style="margin-bottom:4px">검색 상위 100 관광지 (이 시군구)</div>
            ${r.tour.attractions.length ? r.tour.attractions.map((a) => `<span class="tag" style="margin:0 4px 4px 0">#${a.rank} <span data-original-title>${esc(a.name)}</span> · ${esc(a.sub)}</span>`).join("") : `<span class="small">없음</span>`}</div>
        </div>
        <div class="card">
          <h3>타깃 국적 — ${{ 정주우세형: "정주 외국인", 혼합형: "정주·방문 외국인 모두", 방문우세형: "방문 외국인", 분류보류: "선택 보류" }[r.context]} 기준</h3>
          <p class="hint">Context가 어떤 국적 분포를 쓸지 정한다 · 이 지역(${r.context})은 <b>${{ 정주우세형: "법무부 등록외국인", 혼합형: "두 분포 모두", 방문우세형: "데이터랩 방문 비율", 분류보류: "Context 기반 선택 보류" }[r.context]}</b> 사용</p>
          <div class="grid g2">
            <div style="opacity:${!r.ctx.strict || r.context === "정주우세형" ? .45 : 1}"><div class="small">방문 외국인 (데이터랩, %)</div><div class="chart" id="chNatV"></div></div>
            <div style="opacity:${!r.ctx.strict || r.context === "방문우세형" ? .45 : 1}"><div class="small">등록외국인 (법무부, %)</div><div class="chart" id="chNatR"></div></div>
          </div>
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3>월별 전체 거래건수 지수 (1월=100) <span class="tag real">실데이터</span></h3>
          <p class="hint">전체 거래(법인 포함) · Momentum은 두 기간의 CNT·ATV 로그 초과변화</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>${esc(r.ccg)}</span><span><i style="background:var(--muted)"></i>전국 전체</span></div>
          <div class="chart" id="chTrend"></div>
        </div>
        <div class="card">
          <h3>Supply Gap = 외국인 수요비중 − 지역 공급비중 <span class="tag real">공급: 공식 원본 재집계·검증</span></h3>
          <p class="hint">+ 는 외국인 수요 대비 점포가 부족한 업종 · 기준값 ${E.GAP_MIN}%p 초과 시 타깃 업종 · 이 시군구 8개 업종 점포 ${Object.values(r.ext.stores).reduce((a, b) => a + b, 0).toLocaleString()}개 / 전체 ${r.ext.stores_total.toLocaleString()}개 · 막대에 올리면 폐업률(합성)</p>
          <p class="hint">공급비중의 분모는 이 지역 8개 그룹 점포 합계입니다. 결제금액 비중과 점포 수 비중의 차이로, 실제 미충족 수요를 입증하지 않습니다.</p><div class="legend"><span><i style="background:var(--pos)"></i>공급 부족(+)</span><span><i style="background:var(--neg)"></i>공급 여유(−)</span></div>
          <div class="chart" id="chGap"></div>
        </div>
      </div>

      <h2 class="mt" style="margin-top:22px">Action 생성</h2>
      <p class="small" style="margin:2px 0 10px">Rule Engine이 후보 Action을 거르고 → 근거를 검색하고 → 생성기가 근거 범위 안에서 문장을 만든다</p>
      <div class="genbar">
        <div class="seg" role="group" aria-label="생성 모드">
          <button data-mode="template" class="${state.mode === "template" ? "on" : ""}">규칙 기반 생성 (오프라인)</button>
          <button data-mode="qwen" class="${state.mode === "qwen" ? "on" : ""}">Qwen API</button>
        </div>
        <button class="btn" id="genBtn">Action 생성 ▶</button>
        <span class="small" id="genStatus"></span>
        <div class="apikey ${state.mode === "qwen" ? "on" : ""}" id="apiRow">
          <span class="small">Qwen 모델과 API 키는 서버 환경변수에서 관리합니다.</span>
        </div>
      </div>
      <div id="genOut" class="mt"></div>
    `;

    $("#jsonBtn").onclick = () => { const b = $("#jsonBox"); b.hidden = !b.hidden; };
    $$("[data-mode]").forEach((b) => (b.onclick = () => {
      state.mode = b.dataset.mode;
      $$("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      $("#apiRow").classList.toggle("on", state.mode === "qwen");
    }));
    $("#genBtn").onclick = () => generate();

    C.hbarGrouped($("#chMix"), { categories: G, series: [
      { name: "외국인", values: G.map((g) => r.mix_foreign[g]), color: "var(--s1)" },
      { name: "내국인", values: G.map((g) => r.mix_domestic[g]), color: "var(--s2)" }] });

    const natCnt = D.regions.reduce((a, x) => a.map((v, i) => v + x.monthly.cnt_all[i]), [0, 0, 0, 0, 0, 0]);
    const idx = (arr) => arr.map((v) => (arr[0] ? (v / arr[0]) * 100 : 0));
    C.line($("#chTrend"), { labels: MON, fmt: (v) => v.toFixed(0), series: [
      { name: r.ccg, values: idx(r.monthly.cnt_all), color: "var(--s1)" },
      { name: "전국 전체", values: idx(natCnt), color: "var(--muted)", dash: "5 4" }] });

    const gs = [...G].sort((a, b) => r.ext.supply_gap[b] - r.ext.supply_gap[a]);
    C.diverging($("#chGap"), { categories: gs, values: gs.map((g) => r.ext.supply_gap[g]),
      extra: (i) => `외국인 수요 ${r.mix_foreign[gs[i]].toFixed(1)}% · 공급 ${r.ext.supply_share[gs[i]].toFixed(1)}% (${r.ext.stores[gs[i]].toLocaleString()}개 점포, 2026.06)<br>폐업률 ${r.ext.closure_risk[gs[i]]}%${r.ext.closure_risk[gs[i]] >= E.CLOSURE_MAX ? " ⚠ 높음" : ""} (합성)` });

    const nv = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 6);
    C.hbar($("#chNatV"), { categories: nv.map((x) => x.nat), values: nv.map((x) => x.pct), color: "var(--s2)", fmt: (v) => v + "%", compact: true });
    const nr = D.meta.national.moj_top.slice(0, 6);
    C.hbar($("#chNatR"), { categories: nr.map((x) => x.nat), values: nr.map((x) => +(x.n / D.meta.national.moj_total * 100).toFixed(1)), color: "var(--s1)", fmt: (v) => v + "%", compact: true });

    if (state.result && state.result.id === r.id) renderResult(state.result);
  }

  async function generate() {
    const r = byId[state.sel];
    const requestLang = I18n.lang;
    const btn = $("#genBtn"), status = $("#genStatus"), out = $("#genOut");
    btn.disabled = true; out.innerHTML = "";
    const steps = ["BC 거래 로딩", "진단 라벨 확인", "외부 Context 결합", "Action KB 규칙 필터·근거 검색", state.mode === "qwen" ? "Qwen 생성 중…" : "규칙 기반 문장 생성", "이해관계자별 출력"];
    try {
      for (let i = 1; i <= 4; i++) { setPipeline(i, true); status.textContent = steps[i - 1]; await sleep(220); }
      const plan = E.runRules(r);
      setPipeline(5, true); status.textContent = steps[4];
      let cards, meta = { mode: state.mode };
      if (state.mode === "qwen") {
        const t0 = performance.now();
        const res = await E.generateQwen(r, plan);
        cards = res.cards; meta = { mode: "qwen", model: res.model, usage: res.usage, ms: Math.round(performance.now() - t0) };
      } else { await sleep(260); cards = E.generateTemplate(r, plan); }
      const evals = E.evaluate(r, plan, cards);
      setPipeline(6, true); status.textContent = steps[5]; await sleep(150);
      if (I18n.lang !== requestLang || state.sel !== r.id) return;
      state.result = { id: r.id, plan, cards, evals, meta };
      if (meta.mode === "qwen") state.llmLog.push({ region: r.id, model: meta.model, evals, ms: meta.ms });
      renderResult(state.result);
      $$(".step").forEach((s) => s.classList.add("done")); $$(".step").forEach((s) => s.classList.remove("active"));
      status.textContent = meta.mode === "qwen" ? `완료 · ${meta.model} · ${(meta.ms / 1000).toFixed(1)}초 · 입력 ${meta.usage?.input_tokens ?? "-"} / 출력 ${meta.usage?.output_tokens ?? "-"} 토큰` : "완료 · 동일 입력이면 항상 같은 출력";
    } catch (e) {
      status.innerHTML = `<span class="err">생성 실패: ${esc(e.message)}</span>`;
      setPipeline(5, true);
    } finally { btn.disabled = false; }
  }

  function citeHtml(text, validIds) {
    let html=esc(text);
    const titles=[...KB.evidence.map(e=>e.title),...D.regions.flatMap(r=>r.tour.attractions.map(a=>a.name))].sort((a,b)=>b.length-a.length);
    for(const title of new Set(titles)) if(title && html.includes(esc(title))) html=html.split(esc(title)).join(`<span data-original-title>${esc(title)}</span>`);
    return html.replace(/\[([A-Z]+-[A-Z0-9-]+)\]/g, (m, id) => {
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
          ${chk(ev.confidence_ok, "Confidence 준수")} ${chk(ev.context_ok, "Context 적용범위 준수")} ${chk(ev.language_ok, "선택 언어 준수")}
        </div>
      </article>`;
    }).join("");

    const traceRows = plan.trace.map((t) => `<tr class="${t.fired ? "" : "off"}"><td>${t.fired ? "●" : "○"}</td><td><b>${t.id}</b></td><td>${esc(t.rule.effect)}</td><td>${esc(t.detail)}</td></tr>`).join("");
    const evRows = plan.actions.map((a) => [
      ...a.retrieved.valid.map((e) => `<tr><td>${a.sh.label}</td><td><b>${e.id}</b></td><td>${e.grade}</td><td><span data-original-title>${esc(e.title)}</span> ${e.demo ? '<span class="tag demo">데모용</span>' : ""}</td><td>${e.valid_to ? "~" + e.valid_to : "-"}</td></tr>`),
      ...a.retrieved.dropped.map((e) => `<tr class="drop"><td>${a.sh.label}</td><td><b>${e.id}</b></td><td>${e.grade}</td><td><span data-original-title>${esc(e.title)}</span> — 유효기간 경과로 제외</td><td>~${e.valid_to}</td></tr>`),
    ].join("")).join("");

    out.innerHTML = `
      <div class="note">${meta.mode === "qwen" ? `<b>${esc(meta.model)}</b>이 규칙 엔진의 후보·근거만 받아 문장을 생성했습니다. 아래 체크는 출력물을 자동 검증한 결과입니다.` : "<b>규칙 기반 생성</b>: KB 문장과 진단값만 조합합니다. LLM 없이 재현 가능한 기준 출력이며, Qwen API 모드 출력과 비교하는 기준선입니다."}</div>
      <div class="actions mt">${cardHtml}</div>
      <div class="grid g2 mt">
        <details class="box" open><summary>Rule Engine 추적 — 발동 ${plan.trace.filter((t) => t.fired).length} / ${plan.trace.length}</summary>
          <div class="tbl-wrap mt" style="max-height:340px"><table class="tbl"><tr><th></th><th>규칙</th><th>효과</th><th>조건값</th></tr>${traceRows}</table></div></details>
        <details class="box" open><summary>검색된 근거 (RAG) — 유효기간 지난 정책은 제외</summary>
          <div class="tbl-wrap mt" style="max-height:340px"><table class="tbl"><tr><th>대상</th><th>ID</th><th>등급</th><th>근거</th><th>유효</th></tr>${evRows}</table></div></details>
      </div>
      ${meta.mode === "qwen" ? "" : `<details class="box mt"><summary>Qwen API 모드에서 전송되는 입력 (System Guardrail + JSON)</summary><pre class="json">${esc(E.SYSTEM)}\n\n${esc(JSON.stringify(E.llmInput(byId[state.sel], plan), null, 1))}</pre></details>`}
    `;
    $$(".cite", out).forEach((c) => {
      c.addEventListener("mousemove", (e) => { const ev = E.EV[c.dataset.ev]; C.showTip(e, ev ? `<b>${ev.id} · ${ev.grade}등급 · ${esc(ev.type)}</b><span data-original-title>${esc(ev.title)}</span><br><span class="small">${esc(ev.desc)}</span>${ev.demo ? "<br>⚠ 데모용 가상 근거" : ""}` : "KB에 없는 ID"); });
      c.addEventListener("mouseleave", C.hideTip);
    });
  }

  // ── 전국 탭 ──
  function renderNation() {
    const n = D.meta.national, t = D.meta.thresholds, V = n.validation;
    const count = (f) => D.regions.filter(f).length;
    const S = ["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"];
    const mrow = (s) => `<tr><th>${s}<div class="small">${KB.STRATEGY[s]}</div></th>` + CTXS.map((cx) => {
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
        <div class="stat"><div class="k">External Context</div><div class="v num" style="font-size:17px">${CTXS.map((c) => count((r) => r.context === c)).join(" / ")}</div><div class="d">정주우세 / 혼합 / 방문우세 · 분류보류 ${CM.n_sensitivity}곳</div></div>
      </div>
      <div class="card mt">
        <h3>Structure 4분면: Scale × TVD</h3>
        <p class="hint">점 = 시군구 · 색 = Context · 점을 누르면 해당 지역 진단으로 이동 · 점선 = 전체 CNT 비중 기준 ${(t.scale_cut * 100).toFixed(4)}% / 고괴리 기준 TVD ${t.tvd_cut.toFixed(3)}</p>
        <div class="legend">${CTXS.map((c) => `<span><i style="background:${CTX_COLOR[c]}"></i>${c}</span>`).join("")}</div>
        <div class="chart" id="chScatter"></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>36개 Action Cell 매핑 (Structure × Context)</h3><p class="hint">셀 하나 = 이해관계자 3종 Action · 괄호는 Confidence 분포</p>
          <table class="matrix"><tr><th></th>${CTXS.map((c) => `<th>${c}</th>`).join("")}</tr>${S.map(mrow).join("")}</table></div>
        <div class="card"><h3>등록외국인 국적 Top 10 <span class="tag real">법무부</span></h3><p class="hint">${String(n.moj_latest).slice(0, 4)}.${String(n.moj_latest).slice(4)} 기준, 명</p><div class="chart" id="chNat"></div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>등록외국인 추이 (만명) <span class="tag real">법무부</span></h3><p class="hint">${mojKeys[0].slice(0, 4)}.${mojKeys[0].slice(4)} ~ ${mojKeys.at(-1).slice(0, 4)}.${mojKeys.at(-1).slice(4)} 월별 합계</p><div class="chart" id="chMoj"></div></div>
        <div class="card"><h3>BC 전체 거래건수 (만건) <span class="tag real">BC</span></h3><p class="hint">월별 전국 합계 — Momentum 보정에 쓰는 전국 기준선</p><div class="chart" id="chBc"></div></div>
      </div>
      <div class="card mt">
        <h3>External Context 검증 — 정주우세 · 혼합 · 방문우세 <span class="tag real">KTO 2026H1 · 법무부 · 행안부</span></h3>
        <p class="hint">ContextGap = Pctl(외국인 방문비중) − Pctl(등록외국인 비율) · 181일 완전관측 엄격표본 ${CM.n_strict}개의 3분위(${CM.q33.toFixed(3)} / ${CM.q67.toFixed(3)}) · 노트북 최종 산출물과 라벨 ${CM.verify.label_match}/${CM.verify.compared} 일치</p>
        <div class="grid g2">
          <div class="tbl-wrap"><table class="tbl"><tr><th>Context</th><th>n</th><th>방문비중 중앙값</th><th>등록외국인 비율 중앙값</th><th>BC 소비잔차 중앙값</th><th>TVD 중앙값</th></tr>
            ${CM.summary.map((x) => `<tr><td><span class="dot" style="background:${CTX_COLOR[x.context]}"></span> <b>${x.context}</b></td><td class="num">${x.n}</td><td class="num">${x.visit_share_median.toFixed(3)}%</td><td class="num">${x.registered_share_median.toFixed(3)}%</td><td class="num">${x.bc_residual_median > 0 ? "+" : ""}${x.bc_residual_median.toFixed(3)}</td><td class="num">${x.tvd_median.toFixed(3)}</td></tr>`).join("")}
          </table></div>
          <div class="small">
            <p style="margin:0 0 6px">ContextGap ↔ BC 소비잔차(등록외국인 규모로 설명되지 않는 소비): <b>r = ${CM.r_gap_residual.toFixed(3)}</b>, ρ = ${CM.rho_gap_residual.toFixed(3)}</p>
            <p style="margin:0 0 6px">ContextGap ↔ TVD: <b>r = ${CM.r_gap_tvd.toFixed(3)}</b>, ρ = ${CM.rho_gap_tvd.toFixed(3)} — 방문우세로 갈수록 내·외국인 소비구조가 비슷해진다</p>
            <p style="margin:0 0 6px">외국인 방문비중 단독 ↔ BC 소비잔차: r = ${CM.r_visit_residual.toFixed(3)} — "많이 방문하면 BC 소비가 크다"가 아니라 정주 대비 방문의 <b>상대적</b> 우세가 소비패턴과 연결</p>
            <p style="margin:0">* 민감도 판정: ${CM.sensitivity_regions.map(esc).join(", ")} (KTO 150일 관측 — Context 분류 및 Context 기반 추천 보류)</p>
          </div>
        </div>
        <p class="small mt">핵심 TVD는 원래 11개 업종을 사용하며, 이동통신 방문자는 방문 목적을 식별하지 않습니다.</p>
      </div>
      <h2 style="margin:22px 0 10px">한국관광 데이터랩 연계</h2>
      <div class="grid g2">
        <div class="card"><h3>외부 타당성: BC 외국인 결제 vs 데이터랩 (1월=100)</h3>
          <p class="hint">월별 상관 — 결제건수↔방문자수 r = <b>${V.r_cnt_visitors}</b> · 결제금액↔관광소비 r = <b>${V.r_amt_spend}</b> · 결제금액↔식음료 관광소비 r = <b>${V.r_amt_food}</b> (6개월)</p>
          <div class="legend"><span><i style="background:var(--s1)"></i>BC 외국인 결제건수</span><span><i style="background:var(--s2)"></i>데이터랩 외국인 방문자수</span><span><i style="background:var(--s3)"></i>데이터랩 외국인 관광소비</span></div>
          <div class="chart" id="chValid"></div>
          <p class="small">1~3월→4~6월 증가율: BC 결제건수 ${pct(V.h2h1.bc_cnt)} · 방문자수 ${pct(V.h2h1.visitors)} · 관광소비 ${pct(V.h2h1.spend)}. 방향은 같지만 BC 외국인 결제는 정주 외국인을 포함해 관광 유입보다 완만하다 — 이 비교는 추가 외부 타당성 지표이며 핵심 Momentum의 계산 대상은 전체 거래입니다.</p></div>
        <div class="card"><h3>외국인 관광소비 업종 구성 (%)</h3>
          <p class="hint">데이터랩 · BC 데이터는 이 중 <b>식음료업(${TN.spend_major_pct["식음료업"]}%)</b>과 쇼핑업 일부(대형·슈퍼·편의점)만 포함 — 해석 범위의 한계</p>
          <div class="chart" id="chSpendMix"></div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><h3>국적 비교: 방문 외국인 vs 정주 외국인 (%)</h3>
          <p class="hint">방문(데이터랩)은 중국·일본·미국, 정주(법무부)는 베트남·중국·한국계중국인 중심 — Context에 따라 타깃 국적이 달라진다</p>
          <div class="grid g2"><div><div class="small">방문 (데이터랩)</div><div class="chart" id="chNV"></div></div><div><div class="small">등록 (법무부)</div><div class="chart" id="chNR"></div></div></div></div>
        <div class="card"><h3>시도별 관광 지표 <span class="tag real">데이터랩</span></h3>
          <p class="hint">방문자수·증가율과 BC 외국인 결제금액, 방문우세형 시군구 수</p>
          <div class="tbl-wrap" style="max-height:360px"><table class="tbl"><tr><th>시도</th><th>방문자수</th><th>증가율</th><th>BC 외국인 결제</th><th>방문우세</th></tr>
          ${Object.entries(TN.sido).sort((a, b) => b[1].visitors - a[1].visitors).map(([sd, v]) => {
            const rs = D.regions.filter((x) => x.sido === sd);
            return `<tr><td>${esc(sd)}</td><td class="num">${man(v.visitors)}</td><td class="num">${v.growth == null || isNaN(v.growth) ? "-" : pct(v.growth)}</td><td class="num">${eok(rs.reduce((a, x) => a + x.famt, 0))}억</td><td class="num">${rs.filter((x) => x.context === "방문우세형").length}</td></tr>`;
          }).join("")}</table></div></div>
      </div>`;
    C.scatter($("#chScatter"), {
      points: D.regions.map((r) => ({ id: r.id, x: r.scale_share, y: r.tvd, color: ctxColor(r),
        tip: `<b>${esc(r.id)}</b>${r.structure} · ${ctxLabel(r)} (Gap ${gapFmt(r.ctx.gap)})<br>Scale ${(r.scale_share * 100).toFixed(4)}% · TVD ${r.tvd.toFixed(3)}<br>Confidence ${r.confidence}` })),
      xCut: t.scale_cut, yCut: t.tvd_cut, selected: state.sel, onClick: select });
    C.hbar($("#chNat"), { categories: n.moj_top.map((x) => x.nat), values: n.moj_top.map((x) => x.n) });
    C.line($("#chMoj"), { labels: mojKeys.map((k) => `${k.slice(2, 4)}.${k.slice(4)}`), fmt: (v) => (v / 1e4).toFixed(0), series: [{ name: "등록외국인", values: mojKeys.map((k) => n.moj_series[k]), color: "var(--s1)" }] });
    const bk = Object.keys(n.bc_foreign_cnt);
    C.line($("#chBc"), { labels: bk.map((k) => `${k.slice(2, 4)}.${k.slice(4)}`), fmt: (v) => (v / 1e4).toFixed(0), series: [{ name: "전체 거래건수", values: bk.map((k) => n.bc_all_cnt[k]), color: "var(--s1)" }] });
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
        <div class="card mt"><h3>기본 Action Cell (36개 = 4 Structure × 3 Context × 3 Stakeholder)</h3>
          <div class="kbfilters mt">
            <select id="kSh"><option value="">전체 이해관계자</option>${KB.STAKEHOLDERS.map((s) => `<option value="${s.key}">${s.label}</option>`).join("")}</select>
            <select id="kSt"><option value="">전체 Structure</option>${Object.keys(KB.STRATEGY).map((s) => `<option>${s}</option>`).join("")}</select>
            <select id="kCx"><option value="">전체 Context</option>${CTXS.map((c) => `<option>${c}</option>`).join("")}</select>
          </div>
          <div class="tbl-wrap"><table class="tbl" id="kbTbl"></table></div></div>
        <div class="grid g2 mt">
          <div class="card"><h3>결정 규칙 (Modifier)</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>ID</th><th>입력</th><th>조건</th><th>효과</th></tr>${KB.rules.map((r) => `<tr><td><b>${r.id}</b></td><td>${esc(r.on)}</td><td>${esc(r.when)}</td><td>${esc(r.effect)}</td></tr>`).join("")}</table></div></div>
          <div class="card"><h3>System Guardrail</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>항목</th><th>LLM 출력 제약</th></tr>${KB.guardrails.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v)}</td></tr>`).join("")}</table></div>
            <p class="small mt">근거 등급 — A: BC 공식·정부 통계·본 연구 실증 · B: 논문·보고서 · C: 가설(“파일럿 검증 필요” 표시) · X: 등록 안 함</p></div>
        </div>
        <div class="card mt"><h3>2026 소상공인 지원사업 — 분야별 예산 <span class="tag real">중기부 통합공고</span></h3>
          <p class="hint">공고 제2025-652호(2025.12.29) · 7개 분야 26개 사업 1조 3,410억원 · 규칙 엔진은 진단 조건에 맞는 사업만 검색한다</p>
          <div class="chart" id="chPolicy"></div>
          <div class="tbl-wrap mt" style="max-height:300px"><table class="tbl"><tr><th>사업</th><th>분야</th><th>예산(억)</th><th>지원규모</th><th>신청대상</th><th>개별공고</th><th>태그</th></tr>
          ${KB.evidence.filter((e) => e.type === "정책" && e.field).sort((a, b) => b.budget - a.budget).map((e) => `<tr><td><b><span data-original-title>${esc(e.title)}</span></b><div class="small">${esc(e.desc)}</div></td><td>${esc(e.field)}</td><td class="num">${e.budget.toLocaleString()}</td><td>${esc(e.scale)}</td><td>${esc(e.applicant)}</td><td>${esc(e.notice)}</td><td>${(e.tags || []).map(esc).join(" ")}</td></tr>`).join("")}</table></div></div>
        <div class="card mt"><h3>Evidence 저장소 (${KB.evidence.length}건)</h3><p class="hint">기준일 ${KB.TODAY} · 취소선 = 유효기간 경과로 추천에서 제외</p>
          <div class="tbl-wrap"><table class="tbl"><tr><th>ID</th><th>등급</th><th>유형</th><th>근거</th><th>출처</th><th>유효기간</th></tr>
          ${KB.evidence.map((e) => `<tr class="${e.valid_to && e.valid_to < KB.TODAY ? "drop" : ""}"><td><b>${e.id}</b></td><td>${e.grade}</td><td>${esc(e.type)}</td><td><span data-original-title>${esc(e.title)}</span><div class="small">${esc(e.desc)}</div></td><td>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${esc(e.source)}</a>` : esc(e.source)} ${e.demo ? '<span class="tag demo">데모용</span>' : ""}</td><td>${e.valid_from ? `${e.valid_from} ~ ${e.valid_to}` : "상시"}</td></tr>`).join("")}</table></div></div>`;
      ["#kSh", "#kSt", "#kCx"].forEach((s) => $(s).addEventListener("input", drawKB));
    }
    drawKB();
    const byField = {};
    KB.evidence.filter((e) => e.type === "정책" && e.field).forEach((e) => { byField[e.field] = (byField[e.field] || 0) + e.budget; });
    const fields = Object.entries(byField).sort((a, b) => b[1] - a[1]);
    C.hbar($("#chPolicy"), { categories: fields.map((x) => x[0]), values: fields.map((x) => x[1]),
      color: "var(--s3)", fmt: (v) => v.toLocaleString() + "억" });
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
            <tr><td>Context 적용범위 준수</td><td class="num">${(b.context_eligibility * 100).toFixed(1)}%</td></tr><tr><td>선택 언어 준수</td><td class="num">${(b.language_compliance * 100).toFixed(1)}%</td></tr><tr><td>Low Confidence 금지 표현 미사용</td><td class="num">${(b.confidence_ok * 100).toFixed(1)}%</td></tr>
            <tr><td>본문 수치가 진단 패킷과 일치</td><td class="num">${(b.numbers * 100).toFixed(1)}%</td></tr>
            <tr><td>유효기간 지난 정책 인용</td><td class="num">0건 (${KB.evidence.filter((e) => e.valid_to && e.valid_to < KB.TODAY).map((e) => e.id).join(", ")} 제외)</td></tr>
            <tr><td>KPI 1개 이상 포함</td><td class="num">${(b.kpi * 100).toFixed(1)}%</td></tr>
          </table>
          <p class="small mt">Stakeholder Fit의 최종 판정은 기획서대로 전문가 평가가 필요합니다. 여기서는 권한 범위를 규칙으로 근사한 값입니다.</p></div>
      </div>
      <div class="card mt"><h3>Qwen API 출력 검증 로그 (이번 세션)</h3>
        ${log.length ? `<p class="hint">${log.length}회 생성 · 평균 근거율 ${(avg((e) => e.groundedness) * 100).toFixed(0)}% · 출처 유효 ${(avg((e) => +e.citation_valid) * 100).toFixed(0)}% · 규칙 일치 ${(avg((e) => +e.rule_match) * 100).toFixed(0)}% · 수치 일치 ${(avg((e) => e.numbers) * 100).toFixed(0)}%</p>
        <div class="tbl-wrap"><table class="tbl"><tr><th>지역</th><th>모델</th><th>이해관계자</th><th>근거율</th><th>출처 유효</th><th>수치 일치</th><th>규칙 일치</th><th>Confidence 준수</th></tr>
        ${log.flatMap((l) => l.evals.map((e) => `<tr><td>${esc(l.region)}</td><td>${esc(l.model)}</td><td>${e.stakeholder}</td><td>${(e.groundedness * 100).toFixed(0)}%</td><td>${e.citation_valid ? "✓" : "✗ " + e.badIds.join(",")}</td><td>${(e.numbers * 100).toFixed(0)}%</td><td>${e.rule_match ? "✓" : "✗"}</td><td>${e.confidence_ok ? "✓" : "✗ " + e.forbidden.join(",")}</td></tr>`)).join("")}</table></div>`
        : `<p class="hint">아직 없음 — '지역 진단 · Action' 탭에서 Qwen API 모드로 생성하면 같은 지표로 자동 검증되어 여기에 쌓입니다. 같은 지역을 여러 번 생성하면 Rule Consistency를 직접 확인할 수 있습니다.</p>`}
      </div>`;
    const order = ["적극", "적극/선별", "파일럿→확대", "파일럿→확대/선별", "파일럿·추가 관찰"].filter((k) => b.strengthDist[k]);
    C.hbar($("#chStr"), { categories: order, values: order.map((k) => b.strengthDist[k]), fmt: (v) => v + "개" });
  }

  // ── 데이터·가정 탭 ──
  function renderData() {
    const t = D.meta.thresholds;
    const rows = [
      ["① BC 분석결과", "최종 분석 패키지 ABP_CONTEST_DATA.csv", "실데이터", "외국인(성별코드 3)·내국인 결제의 금액·건수, 업종 구성 → Scale, TVD, Momentum, Confidence"],
      ["② 외국인 정주", "법무부 등록외국인 2026-06 + 행정안전부 주민등록인구 2026-06", "실데이터", "최종 분석 패키지(02_data/external)와 동일 자료. 등록외국인 비율 = 등록외국인 / (주민등록인구 + 등록외국인). 국적 구성은 법무부 국적별 현황"],
      ["③ 관광·방문", "한국관광공사 지역별 방문자수 OpenAPI 2026H1 + 한국관광 데이터랩", "실데이터", "시군구 외지인·외국인 방문자(일별 145,152행, 181일) → 외국인 방문비중 = 외국인/(외지인+외국인). 데이터랩: 체류시간·숙박일수, 검색 Top100 관광지, 시도 관광지표, 전국 관광소비·국적·간편결제"],
      ["④ 상권 공급", "소상공인시장진흥공단 상가(상권)정보 2026.06", "원본 재집계·검증 + 폐업률 합성", "공식 2026-06 상가정보 원본을 시군구·8개 그룹으로 재집계. 업종 매핑·중복·지역 매칭·분모와 기존 배포 수치를 검증. 폐업률은 합성."],
      ["⑤ 정책·지원", "2026년 중기부 소상공인 지원사업 통합 공고(제2025-652호)", "실데이터", "7개 분야 26개 사업 1조 3,410억원을 사업명·예산·지원규모·신청대상·개별공고 시기까지 KB에 등록. 진단 조건에 맞는 사업만 검색. 2025년 공고(23개 사업)는 유효기간 경과로 제외되는 것을 시연"],
      ["⑥ BC 실행수단", "BC IDEA / BC 빅데이터 비즈니스", "공개 서비스 설명", "BC Action은 이 수행역량 범위 안에서만 생성"],
      ["External Context", "BC_Contest_Final_20260921 노트북 10장 · 보고서 7.3", "실데이터", `ContextGap 3분위로 정주우세/혼합/방문우세 판정 — 노트북 산출물과 엄격표본 ${CM.verify.label_match}/${CM.verify.compared} 일치. 화성시 신설 4개 구는 Context 분류보류`],
    ];
    const unused = TN.unused;
    $("#tab-data").innerHTML = `
      <div class="note">데이터가 없는 항목은 <b>임의의 합성값</b>으로 채웠습니다. 합성값은 지역명 해시 기반이라 몇 번을 다시 만들어도 같은 값이 나오며, 화면에 <span class="tag syn">합성</span> 표시가 붙습니다. 실제 구현 시 해당 공공데이터로 교체하면 동일한 규칙이 그대로 적용됩니다.</div>
      <div class="card mt"><h3>데이터군별 출처와 처리</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>데이터군</th><th>출처</th><th>상태</th><th>처리 방법</th></tr>
        ${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2].includes("합성") || r[2].includes("예시") ? `<span class="tag syn">${r[2]}</span>` : `<span class="tag real">${r[2]}</span>`}</td><td>${r[3]}</td></tr>`).join("")}</table></div></div>
      <div class="card mt"><h3>데이터랩 파일 중 반영하지 않은 것</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>파일</th><th>사유</th></tr>
        ${unused.map(([f, why]) => `<tr><td>${esc(f)}</td><td>${esc(why)}</td></tr>`).join("")}
        <tr><td>2026년 지원사업 통합공고 인포그래픽(PDF)</td><td>통합공고 본문과 같은 내용의 요약 이미지 — 본문 PDF에서 26개 사업을 추출해 사용</td></tr></table></div>
        <p class="small mt">지역 외국인 방문값은 KTO 2026H1 실측 집계입니다. 관광지출액 단위 환산 가정과 합성 폐업률은 추가 기능에만 사용합니다.</p></div>
      <div class="card mt"><h3>진단 라벨 정의 (Analytics Engine)</h3><div class="tbl-wrap mt"><table class="tbl"><tr><th>라벨</th><th>정의</th><th>기준값</th></tr>
        <tr><td><b>Scale</b></td><td>전체 CNT의 전국 비중 (법인 포함)</td><td>중앙값 ${(t.scale_cut * 100).toFixed(4)}% 이상 = 대규모</td></tr>
        <tr><td><b>TVD</b></td><td>½ Σ |외국인 업종비중 − 내국인 업종비중| (11개 원래 업종, 법인 제외)</td><td>중앙값 ${t.tvd_cut.toFixed(3)} 이상 = 고괴리</td></tr>
        <tr><td><b>Momentum</b></td><td>전체 CNT·ATV의 100 × [지역 ln(H2/H1) − 전국 ln(H2/H1)]</td><td>0 초과 상승 · 0 미만 하락 · log %p</td></tr>
        <tr><td><b>Confidence</b></td><td>3M·2M의 CNT·ATV 부호 일치와 min(abs(M3),abs(M2)) > 1.4826×MAD(M3−M2)</td><td>두 축 Stable High · 한 축 Medium · 없음 Low</td></tr>
        <tr><td><b>External Context</b></td><td>ContextGap = Pctl(외국인 방문비중) − Pctl(등록외국인 비율), 백분위는 181일 완전관측 ${CM.n_strict}개 기준</td><td>≤ ${CM.q33.toFixed(3)} 정주우세형 · ${CM.q33.toFixed(3)} ~ ${CM.q67.toFixed(3)} 혼합형 · > ${CM.q67.toFixed(3)} 방문우세형 (3분위). 추가 산업 세부 분류는 핵심 Context와 별도</td></tr>
        <tr><td><b>체류특성</b></td><td>데이터랩 평균 숙박일수·체류시간 (일반구는 상위 시 값 사용)</td><td>숙박일수 ≥ ${SQ.nights_q75}일 = 숙박 체류형 · 체류시간 ≤ ${SQ.dwell_q25}분 = 단시간 방문형</td></tr>
        <tr><td><b>Supply Gap(k)</b></td><td>외국인 업종 k 결제 비중 − 8개 그룹 내 업종 k 점포 비중(공식 원본 재집계)</td><td>${E.GAP_MIN}%p 초과 = 타깃 업종, 폐업률 ${E.CLOSURE_MAX}% 이상 = 선별</td></tr>
      </table></div></div>
      <div class="card mt"><h3>11개 업종과 8개 추가 기능 그룹 매핑</h3><p class="hint">핵심 TVD는 원래 11개 업종을 사용합니다. 아래 8개 그룹은 추가 수요·공급 비교용이며 상가정보 소분류 매핑을 별도로 공개합니다.</p><table class="tbl"><tr><th>원래 업종 코드</th><th>추가 기능 그룹</th></tr>${Object.entries(D.meta.industry_mapping).map(([code,group])=>`<tr><td>${code}</td><td>${esc(group)}</td></tr>`).join("")}</table></div><div class="card mt"><h3>상가정보 소분류와 8개 그룹 매핑</h3><p class="hint">공식 업종분류에 적용한 분석용 매핑이며 기관의 공식 BC 대응표는 아닙니다. G20499 기타 종합소매 등 넓은 대리분류를 포함합니다.</p><p class="small">원본 ${D.meta.supply.source.snapshot_date} · ${D.meta.supply.raw_rows.toLocaleString()}개 점포 · 255개 지역 · 중복 ID 0개 · 8개 그룹 ${D.meta.supply.in_scope_stores.toLocaleString()}개 점포</p><table class="tbl"><tr><th>추가 기능 그룹</th><th>상가정보 소분류 코드·업종명</th></tr>${Object.entries(D.meta.supply_industry_mapping).map(([g,codes])=>`<tr><td>${esc(g)}</td><td>${Object.entries(codes).map(([code,nm])=>`<div>${code} · ${esc(nm)}</div>`).join("")}</td></tr>`).join("")}</table></div><div class="card mt"><h3>재생성</h3><p class="hint" style="margin:0">프로젝트 폴더에서 <code>python demo/build_final_data.py --data-root &lt;로컬 02_data 경로&gt;</code> 를 실행하면 로컬 입력과 최종 CSV를 검증한 뒤 집계 <code>demo/data.js</code>를 생성합니다. 원자료는 배포하지 않습니다. (생성 ${esc(D.meta.generated)})</p></div>`;
  }

  document.addEventListener("bc-language-change", () => {
    const previous = state.result;
    state.result = null; batch = null;
    renderList(); renderRegion();
    if(previous?.meta.mode === "template") {
      const r=byId[state.sel], plan=E.runRules(r), cards=E.generateTemplate(r,plan);
      state.result={id:r.id,plan,cards,evals:E.evaluate(r,plan,cards),meta:{mode:"template"}};
      renderResult(state.result);
    } else if(previous?.meta.mode === "qwen") $("#genStatus").textContent="언어가 변경되었습니다. 선택 언어로 다시 생성하세요.";
    setTab(state.tab);
  });
  window.BC_APP = {select, setTab, generate, get state(){return state;}};
  // ── 시작 ──
  renderList();
  renderRegion();
  setPipeline(2, true);
  I18n.start();
})();
