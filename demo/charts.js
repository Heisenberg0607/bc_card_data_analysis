/* 의존성 없는 SVG 차트 (오프라인에서도 동작). 색은 CSS 변수로만 지정한다. */
window.Charts = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const tip = () => document.getElementById("tip");

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, attrs = {}) {
    const t = el("text", { x, y, ...attrs }, parent);
    t.textContent = s;
    return t;
  }
  function showTip(evt, html) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("on");
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  const hideTip = () => tip().classList.remove("on");
  function svgRoot(container, W, H) {
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, container);
    return svg;
  }
  // 4px 둥근 끝, 기준선 쪽은 각지게
  function barPath(x0, x1, y, h, r = 4) {
    const neg = x1 < x0, a = Math.min(x0, x1), b = Math.max(x0, x1);
    r = Math.min(r, (b - a) / 2, h / 2);
    if (b - a < 0.5) return "";
    return neg
      ? `M${b},${y} H${a + r} Q${a},${y} ${a},${y + r} V${y + h - r} Q${a},${y + h} ${a + r},${y + h} H${b} Z`
      : `M${a},${y} H${b - r} Q${b},${y} ${b},${y + r} V${y + h - r} Q${b},${y + h} ${b - r},${y + h} H${a} Z`;
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  /* 가로 묶음 막대: categories × series(≤2) */
  function hbarGrouped(container, { categories, series, unit = "%", fmt = (v) => v.toFixed(1) }) {
    const W = 560, rowH = 30, top = 8, left = I18n.lang === "en" ? 160 : 90, right = 44;
    const H = top + categories.length * rowH + 22;
    const svg = svgRoot(container, W, H);
    const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
    const x = (v) => left + (v / max) * (W - left - right);
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      el("line", { x1: x(v), x2: x(v), y1: top, y2: H - 22, class: "gridl" }, svg);
      text(svg, x(v), H - 8, fmt(v) + unit, { "text-anchor": "middle" });
    }
    const bh = (rowH - 8) / series.length - 1;
    categories.forEach((c, i) => {
      const y0 = top + i * rowH + 4;
      text(svg, left - 8, y0 + (rowH - 8) / 2 + 4, c, { "text-anchor": "end", class: "lbl" });
      series.forEach((s, j) => {
        const y = y0 + j * (bh + 2);
        el("path", { d: barPath(x(0), x(s.values[i]), y, bh), fill: s.color }, svg);
      });
      const hit = el("rect", { x: left, y: y0 - 2, width: W - left, height: rowH - 4, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(e, `<b>${c}</b>` + series.map((s) => `<span class="dot" style="background:${s.color}"></span> ${s.name} <b style="display:inline">${fmt(s.values[i])}${unit}</b>`).join("<br>")));
      hit.addEventListener("mouseleave", hideTip);
    });
    el("line", { x1: x(0), x2: x(0), y1: top, y2: H - 22, class: "base" }, svg);
  }

  /* 발산 막대: 0 기준 ± (Supply Gap) */
  function diverging(container, { categories, values, extra = () => "", unit = "%p" }) {
    const W = 560, rowH = 26, top = 8, left = I18n.lang === "en" ? 160 : 90, right = 50;
    const H = top + categories.length * rowH + 22;
    const svg = svgRoot(container, W, H);
    const m = niceMax(Math.max(...values.map(Math.abs), 1));
    const x = (v) => left + ((v + m) / (2 * m)) * (W - left - right);
    [-m, -m / 2, 0, m / 2, m].forEach((v) => {
      el("line", { x1: x(v), x2: x(v), y1: top, y2: H - 22, class: v === 0 ? "base" : "gridl" }, svg);
      text(svg, x(v), H - 8, (v > 0 ? "+" : "") + v + unit, { "text-anchor": "middle" });
    });
    categories.forEach((c, i) => {
      const y = top + i * rowH + 5, v = values[i], h = rowH - 10;
      text(svg, left - 8, y + h / 2 + 4, c, { "text-anchor": "end", class: "lbl" });
      el("path", { d: barPath(x(0), x(v), y, h), fill: v >= 0 ? "var(--pos)" : "var(--neg)" }, svg);
      text(svg, v >= 0 ? x(v) + 5 : x(v) - 5, y + h / 2 + 4, (v > 0 ? "+" : "") + v.toFixed(1), { "text-anchor": v >= 0 ? "start" : "end", class: "val" });
      const hit = el("rect", { x: left, y: y - 3, width: W - left, height: rowH, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(e, `<b>${c}</b>Supply Gap ${(v > 0 ? "+" : "") + v.toFixed(1)}${unit}<br>${extra(i)}`));
      hit.addEventListener("mouseleave", hideTip);
    });
  }

  /* 선 그래프 + 크로스헤어 */
  function line(container, { labels, series, fmt = (v) => v.toLocaleString(), yMin, height = 220 }) {
    const W = 560, H = height, top = 12, left = 52, right = 16, bottom = 26;
    const svg = svgRoot(container, W, H);
    const all = series.flatMap((s) => s.values);
    let lo = yMin ?? Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.12 || 1;
    lo = yMin ?? lo - pad; hi += pad;
    const x = (i) => left + (i / Math.max(labels.length - 1, 1)) * (W - left - right);
    const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) / 4) * i;
      el("line", { x1: left, x2: W - right, y1: y(v), y2: y(v), class: "gridl" }, svg);
      text(svg, left - 6, y(v) + 4, fmt(v), { "text-anchor": "end" });
    }
    const step = Math.ceil(labels.length / 8);
    labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) text(svg, x(i), H - 8, l, { "text-anchor": "middle" }); });
    series.forEach((s) => {
      el("path", { d: s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(""), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": s.dash || "" }, svg);
      if (labels.length <= 12) s.values.forEach((v, i) => el("circle", { cx: x(i), cy: y(v), r: 3.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }, svg));
    });
    const cross = el("line", { y1: top, y2: H - bottom, class: "base", opacity: 0 }, svg);
    const hit = el("rect", { x: left, y: top, width: W - left - right, height: H - top - bottom, fill: "transparent" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - left) / (W - left - right)) * (labels.length - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
      showTip(e, `<b>${labels[i]}</b>` + series.map((s) => `<span class="dot" style="background:${s.color}"></span> ${s.name}: ${fmt(s.values[i])}`).join("<br>"));
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
  }

  /* 산점도: x=로그 외국인 결제액, y=TVD, 4분면 */
  function scatter(container, { points, xCut, yCut, onClick, selected }) {
    const W = 1000, H = 440, top = 26, left = 52, right = 16, bottom = 36;
    const svg = svgRoot(container, W, H);
    const lx = points.map((p) => Math.log10(Math.max(p.x, Number.MIN_VALUE)));
    const x0 = Math.floor(Math.min(...lx) * 2) / 2, x1 = Math.ceil(Math.max(...lx) * 2) / 2;
    const y1 = Math.ceil(Math.max(...points.map((p) => p.y)) * 10) / 10;
    const X = (v) => left + ((Math.log10(Math.max(v, Number.MIN_VALUE)) - x0) / (x1 - x0)) * (W - left - right);
    const Y = (v) => top + (1 - v / y1) * (H - top - bottom);
    for (let e = Math.ceil(x0); e <= x1; e++) {
      const v = Math.pow(10, e);
      el("line", { x1: X(v), x2: X(v), y1: top, y2: H - bottom, class: "gridl" }, svg);
      text(svg, X(v), H - bottom + 16, (v * 100).toPrecision(2) + "%", { "text-anchor": "middle" });
    }
    for (let v = 0; v <= y1 + 1e-9; v += 0.1) {
      el("line", { x1: left, x2: W - right, y1: Y(v), y2: Y(v), class: "gridl" }, svg);
      text(svg, left - 6, Y(v) + 4, v.toFixed(1), { "text-anchor": "end" });
    }
    text(svg, (W + left) / 2, H - 4, "전체 CNT 전국 비중 (로그) → Scale", { "text-anchor": "middle", class: "lbl" });
    text(svg, 8, 12, "TVD ↑ (소비구조 괴리)", { class: "lbl" });
    el("line", { x1: X(xCut), x2: X(xCut), y1: top, y2: H - bottom, stroke: "var(--ink-2)", "stroke-dasharray": "4 4" }, svg);
    el("line", { x1: left, x2: W - right, y1: Y(yCut), y2: Y(yCut), stroke: "var(--ink-2)", "stroke-dasharray": "4 4" }, svg);
    const q = [["소규모·고괴리", left + 8, top + 16, "start"], ["대규모·고괴리", W - right - 8, top + 16, "end"],
      ["소규모·저괴리", left + 6, H - bottom - 8, "start"], ["대규모·저괴리", W - right - 6, H - bottom - 8, "end"]];
    q.forEach(([s, xx, yy, a]) => text(svg, xx, yy, s, { "text-anchor": a, class: "val" }));
    points.forEach((p) => {
      const sel = p.id === selected;
      const c = el("circle", { cx: X(p.x), cy: Y(p.y), r: sel ? 8 : 5, fill: p.color, stroke: sel ? "var(--ink)" : "var(--surface)", "stroke-width": sel ? 2.5 : 1.5, "fill-opacity": 0.85, style: "cursor:pointer" }, svg);
      c.addEventListener("mousemove", (e) => showTip(e, p.tip));
      c.addEventListener("mouseleave", hideTip);
      c.addEventListener("click", () => { hideTip(); onClick && onClick(p.id); });
    });
  }

  /* 단순 가로 막대 (국적 Top10 등) */
  function hbar(container, { categories, values, color = "var(--s1)", fmt = (v) => v.toLocaleString(), compact = false }) {
    const W = compact ? 360 : 700, rowH = compact ? 30 : 28, top = 4, left = I18n.lang === 'en' ? (compact ? 140 : 280) : (compact ? 92 : 130), right = compact ? 48 : 100;
    const H = top + categories.length * rowH + 4;
    const svg = svgRoot(container, W, H);
    const max = Math.max(...values);
    const x = (v) => left + (v / max) * (W - left - right);
    categories.forEach((c, i) => {
      const y = top + i * rowH + 4, h = rowH - 8;
      text(svg, left - 8, y + h / 2 + 4, c, { "text-anchor": "end", class: "lbl" });
      el("path", { d: barPath(x(0), x(values[i]), y, h), fill: color }, svg);
      text(svg, x(values[i]) + 6, y + h / 2 + 4, fmt(values[i]), { class: "val" });
    });
    el("line", { x1: x(0), x2: x(0), y1: top, y2: H - 4, class: "base" }, svg);
  }

  return { hbarGrouped, diverging, line, scatter, hbar, showTip, hideTip };
})();
