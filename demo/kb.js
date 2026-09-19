/* Action Knowledge Base — 기획서 3장(필드 정의)·6장(결정 규칙)·12장(24개 기본 Action Cell) 구현.
 *
 * demo: true 표시 항목은 실제 출처를 확인하지 않은 데모용 가상 근거/정책이다.
 * 실제 구현 시 공고문·사례 원문으로 교체해야 한다.
 */
window.ACTION_KB = (function () {
  const TODAY = "2026-09-19";

  const TN = window.BC_DATA.meta.national.tourism;
  const SQ = window.BC_DATA.meta.thresholds.stay;
  const fvVals = Object.values(TN.foreign_visitors);
  const fmtMan = (v) => (v / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "만";
  const visitTop = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 4);

  // ── Evidence (근거 등급 A/B/C, X는 등록하지 않음) ──
  const evidence = [
    { id: "EV-RES-01", grade: "A", type: "본 연구 실증", title: "BC 거래데이터 Structure(Scale×TVD) 진단", source: "공모전 BC 거래데이터 2026.01~06", desc: "외국인·내국인 업종 구성 괴리(TVD)와 외국인 결제 규모로 255개 시군구를 4개 유형으로 분류" },
    { id: "EV-RES-02", grade: "A", type: "본 연구 실증", title: "Momentum·Confidence 기간창 검증", source: "공모전 BC 거래데이터 2026.01~06", desc: "H1/H2 CNT·ATV 변화를 전국 외국인 추세 대비로 보정하고, 3·2·1개월 블록에서 방향 유지 여부로 신뢰도 부여" },
    { id: "EV-RES-03", grade: "A", type: "본 연구 실증", title: "외국인 소비 성격 군집(CLR+KMeans)", source: "외국인_시군구_유형.csv", desc: "외국인 업종 구성비로 도심 상권형·산업단지 군지역형·외식관광형 등 유형화 (실루엣 0.2 수준 — 기술적 분류)" },
    { id: "EV-MOJ-01", grade: "A", type: "정부 통계", title: "법무부 월별 등록외국인 국적(지역)별 현황", source: "공공데이터포털 15100020", url: "https://www.data.go.kr/data/15100020/fileData.do", desc: "장기체류 등록외국인 전국 총량·국적 구성 (데모: 시군구 분포는 합성)" },
    // 한국관광 데이터랩 (실데이터) — 설명 수치는 data.js에서 채운다
    { id: "EV-TOUR-01", grade: "A", type: "정부 통계", title: "데이터랩 외국인 방문자수 (전국 월별)", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `2026.01~06 월 ${fmtMan(Math.min(...fvVals))}~${fmtMan(Math.max(...fvVals))}명 (시군구 방문 합계). 시군구 배분은 추정` },
    { id: "EV-TOUR-02", grade: "A", type: "정부 통계", title: "데이터랩 외국인 관광소비 업종 구성", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: Object.entries(TN.spend_major_pct).slice(0, 4).map(([k, v]) => `${k} ${v}%`).join(" · ") },
    { id: "EV-TOUR-03", grade: "A", type: "정부 통계", title: "데이터랩 국가별 외국인 방문 비율", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: visitTop.map((x) => `${x.nat} ${x.pct}%`).join(" · ") },
    { id: "EV-TOUR-04", grade: "A", type: "정부 통계", title: "데이터랩 시군구 방문자 체류특성", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `229개 시군구 평균 체류시간(분)·숙박일수. 중앙값 ${SQ.dwell_med}분 · ${SQ.nights_med}일` },
    { id: "EV-TOUR-05", grade: "A", type: "정부 통계", title: "데이터랩 관광지 검색순위 Top100", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: "목적지 검색 상위 100개 관광지와 주소 (쇼핑 69곳 · 문화관광 14곳 등)" },
    { id: "EV-TOUR-06", grade: "A", type: "정부 통계", title: "데이터랩 시도별 방문자수 증가율", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: "시도 방문자수·관광지출액·목적지 검색건수·방문자 증가율" },
    { id: "EV-TOUR-07", grade: "A", type: "정부 통계", title: "데이터랩 외국인 간편결제 관광소비", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `국적: ${TN.easy_nat.slice(0, 2).map((x) => `${x.nat} ${x.pct}%`).join(" · ")} / 업종: ${Object.entries(TN.easy_ind_pct).slice(0, 2).map(([k, v]) => `${k} ${v}%`).join(" · ")}` },
    { id: "EV-LOCAL-01", grade: "A", type: "정부 통계", title: "LOCALDATA 지방행정 인허가 데이터", source: "행정안전부", url: "https://www.localdata.go.kr/", desc: "업종별 업소·영업상태·폐업 (데모: 점포 수·폐업률은 합성)" },
    { id: "EV-BC-01", grade: "A", type: "BC 실행수단", title: "BC IDEA 상권·시장·채널 분석", source: "BC카드", url: "https://www.bccard.com/app/card/html/company/kr/bigdata/bcidea/index.jsp", desc: "BC 소비데이터 기반 시장·채널·상권 분석과 전략 수립 지원" },
    { id: "EV-BC-02", grade: "A", type: "BC 실행수단", title: "BC 빅데이터 비즈니스 컨설팅", source: "BC카드", url: "https://www.bccard.com/app/card/html/company/kr/bigdata/business/index.jsp", desc: "상권·마케팅·트렌드 컨설팅, 지역 소비 분석, 활용모델 구축" },
    { id: "EV-BC-03", grade: "B", type: "BC 사례", demo: true, title: "가맹점 공동 프로모션·반복결제 CRM 운영 사례", source: "데모용 가상 사례", desc: "지역 가맹점 묶음 프로모션 시 참여 가맹점 재방문 결제 증가 사례(가상)" },
    { id: "EV-LIT-01", grade: "B", type: "연구보고서", demo: true, title: "외국인 근로자 밀집지역 생활소비 특성", source: "데모용 가상 보고서", desc: "근로자 정주지역은 식료품·생활편의 반복 소비 비중이 높고 주말·야간 집중(가상)" },
    { id: "EV-LIT-02", grade: "B", type: "연구보고서", demo: true, title: "방한 관광객 동선 기반 소비 확산", source: "데모용 가상 보고서", desc: "핵심 관광지 인근 1km 내 상권으로 소비가 확산될 때 체류시간·객단가 증가(가상)" },
    { id: "EV-HYP-01", grade: "C", type: "가설", title: "다국어 메뉴·결제안내 도입 효과", source: "내부 가설", desc: "다국어 안내가 외국인 신규 결제 전환을 높일 것이라는 가설 — 파일럿 검증 필요" },
    { id: "EV-HYP-02", grade: "C", type: "가설", title: "Supply Gap 업종 진입 시 초기 매출 우위", source: "내부 가설", desc: "외국인 수요 대비 공급이 부족한 업종의 신규 점포가 초기 매출에서 유리할 것이라는 가설 — 파일럿 검증 필요" },
    // 정책: valid_from / valid_to 필수. 명칭은 2026 중기부 통합공고(7개 분야 26개 사업)의 분야를 가정한 데모용 예시.
    { id: "POL-01", grade: "A", type: "정책", demo: true, title: "소상공인 디지털 전환 지원(예시)", source: "중기부 2026 통합공고 가정", valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", desc: "키오스크·다국어 주문·간편결제 등 디지털 도입 비용 지원" },
    { id: "POL-02", grade: "A", type: "정책", demo: true, title: "상권 활성화 지원(예시)", source: "중기부 2026 통합공고 가정", valid_from: "2026-02-01", valid_to: "2026-12-31", target: "지자체", desc: "골목상권·특화거리 환경개선, 공동마케팅 지원" },
    { id: "POL-03", grade: "A", type: "정책", demo: true, title: "신사업 창업 지원(예시)", source: "중기부 2026 통합공고 가정", valid_from: "2026-03-01", valid_to: "2026-11-30", target: "창업자", desc: "유망 업종 예비창업자 교육·점포 경험·사업화 자금" },
    { id: "POL-04", grade: "A", type: "정책", demo: true, title: "경영개선·재기 지원(예시)", source: "중기부 2026 통합공고 가정", valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", desc: "경영 컨설팅, 업종전환·재창업 지원" },
    { id: "POL-05", grade: "A", type: "정책", demo: true, title: "온라인 판로 지원(예시)", source: "중기부 2026 통합공고 가정", valid_from: "2026-04-01", valid_to: "2026-08-31", target: "소상공인", desc: "온라인·라이브커머스 입점 지원 — 접수 마감(가드레일 시연용)" },
    { id: "POL-06", grade: "A", type: "정책", demo: true, title: "상권 르네상스(2025 공고, 예시)", source: "중기부 2025 공고 가정", valid_from: "2025-01-01", valid_to: "2025-12-31", target: "지자체", desc: "전년도 사업 — 유효기간 경과(가드레일 시연용)" },
  ];

  // ── 전략 축: Structure가 '무슨 종류의 전략인가'를 결정 ──
  const STRATEGY = {
    "대규모·고괴리": "핵심 특화상권 고도화",
    "대규모·저괴리": "기존 상권 교차소비 확산",
    "소규모·고괴리": "니치·특화 수요 탐색",
    "소규모·저괴리": "기초 모니터링·저비용 실험",
  };
  const STAKEHOLDERS = [
    { key: "BC", label: "BC카드", goal: "가맹점 활성화·타깃 마케팅·데이터 사업" },
    { key: "MER", label: "소상공인/창업자", goal: "입지·업종·상품 의사결정" },
    { key: "GOV", label: "지자체", goal: "상권정책·정주/관광 지원" },
  ];

  // ── 24개 기본 Action Cell (4 Structure × 2 Context × 3 Stakeholder) ──
  // {GAP}: 최대 Supply Gap 업종, {GAP2}: 차순위 업종 — 규칙 엔진이 채운다.
  const C = (structure, context, sh, action, why, kpi, ev, avoid, effect) => ({
    id: `AC-${["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"].indexOf(structure) + 1}${context === "정주형" ? "R" : "V"}-${sh}`,
    stakeholder: sh, structure, context, strategy: STRATEGY[structure],
    momentum: "any", min_confidence: "Low", action, why, kpi, evidence: ev, avoid_when: avoid, expected_effect: effect,
  });

  const cells = [
    // 대규모·고괴리
    C("대규모·고괴리", "정주형", "BC", "외국인 생활밀착 업종({GAP}·{GAP2}) 가맹점을 묶은 공동 프로모션과 반복결제 CRM을 운영하고, 지자체 대상 BC IDEA 상권분석 리포트를 제안한다.", "외국인 결제 규모가 크고 내국인과 소비구조가 뚜렷이 달라 전용 타깃팅의 효율이 높다.", ["외국인 CNT", "재방문 결제율", "캠페인 반응률"], ["EV-RES-01", "EV-BC-01", "EV-BC-03"], "방문형 지역, Confidence Low", "외국인 반복결제 증가, 가맹점 매출 안정화"),
    C("대규모·고괴리", "정주형", "MER", "{GAP} 등 Supply Gap 상위 업종에서 외국인 고객용 메뉴·상품 구성(소포장·모국 식재료·다국어 안내)을 강화하고, 신규 진입은 Gap·폐업률을 함께 보고 결정한다.", "외국인 수요가 크고 업종 구성이 달라 기존 공급만으로 충족되지 않는 영역이 존재한다.", ["외국인 고객비중", "월 매출", "재방문율"], ["EV-LOCAL-01", "EV-HYP-02", "POL-01"], "폐업률 15% 이상 업종의 대규모 신규 투자", "외국인 고객 매출 비중 확대"),
    C("대규모·고괴리", "정주형", "GOV", "외국인 정주 생활권을 '특화 생활상권'으로 지정해 다국어 안내·결제환경을 정비하고 상권 활성화 지원사업과 연계한다.", "정주 외국인이 많고 소비가 특정 업종에 집중돼 정책 대상이 명확하다.", ["지역 소비확산(외국인 결제액)", "참여 점포 수", "상권 공실률"], ["EV-MOJ-01", "EV-RES-01", "POL-02"], "관광형 지역, 정주 외국인 비중 하락 추세", "정주 외국인 생활 편의·지역 내 소비 유지"),
    C("대규모·고괴리", "방문형", "BC", "관광객 특화 업종({GAP}) 가맹점과 숙박·쇼핑 가맹점을 연결한 해외카드 결제 프로모션을 설계하고 BC 빅데이터 컨설팅으로 동선별 성과를 측정한다.", "방문객 소비가 크고 내국인과 다른 업종에 집중돼 관광형 타깃 마케팅의 모수가 충분하다.", ["외국인 ATV", "교차결제율", "캠페인 반응률"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "정주형 지역, Confidence Low", "관광객 객단가·교차소비 증가"),
    C("대규모·고괴리", "방문형", "MER", "관광객 선호 업종({GAP})에서 체류시간·객단가를 높이는 세트·체험형 상품을 구성하고, 다국어 주문·결제 환경을 갖춘다.", "방문 수요가 크고 업종 특화가 뚜렷하나 방문객은 반복구매보다 1회 객단가가 핵심이다.", ["객단가", "외국인 고객비중", "리뷰·재추천"], ["EV-TOUR-01", "EV-HYP-01", "POL-01"], "정주형 생활업종 확대 목적", "1회 방문당 매출 증가"),
    C("대규모·고괴리", "방문형", "GOV", "핵심 관광지 소비를 인근 특화 상권으로 잇는 다국어 동선 안내와 상권 연계 프로그램을 운영한다.", "관광 유입이 크고 외국인 소비가 특정 업종에 몰려 있어 인근 상권으로의 확산 여지가 있다.", ["인근 상권 외국인 결제액", "방문객 체류시간", "참여 점포 수"], ["EV-TOUR-01", "EV-LIT-02", "POL-02"], "정주형 지역", "관광 소비의 지역 상권 확산"),
    // 대규모·저괴리
    C("대규모·저괴리", "정주형", "BC", "외국인 전용 상품보다 기존 주력 가맹점의 외국인 결제 편의(간편결제·안내)를 개선하고, 내·외국인 공통 지역 프로모션에 외국인 세그먼트를 추가한다.", "외국인 결제 규모는 크지만 소비구조가 내국인과 유사해 별도 업종보다 기존 상권 통합이 효율적이다.", ["외국인 CNT", "외국인 결제 전환율", "프로모션 참여율"], ["EV-RES-01", "EV-BC-01"], "고괴리 지역에 동일 적용", "기존 가맹점의 외국인 매출 확대"),
    C("대규모·저괴리", "정주형", "MER", "신규 업종 진입보다 기존 점포의 다국어 안내·결제 편의 개선으로 외국인 고객 전환을 높인다.", "외국인 소비가 지역 평균과 유사해 특화 업종의 공급 부족 신호가 약하다.", ["외국인 고객비중", "월 매출"], ["EV-RES-01", "EV-HYP-01", "POL-01"], "Supply Gap이 큰 업종이 없는데 신규 창업을 권고", "기존 매출 기반 위 외국인 고객 추가"),
    C("대규모·저괴리", "정주형", "GOV", "외국인 주민을 기존 지역화폐·상권 행사 대상에 포함하고 다국어 생활정보를 제공한다.", "정주 외국인이 지역 소비 패턴에 이미 통합돼 있어 별도 특화구역보다 포용형 정책이 적합하다.", ["외국인 결제액", "행사 참여 외국인 수"], ["EV-MOJ-01", "POL-02"], "관광형 지역", "지역 소비 기반 유지"),
    C("대규모·저괴리", "방문형", "BC", "외국인 전용 업종 신설보다 숙박·음식·쇼핑 등 기존 주요 가맹점 간 교차소비 프로모션을 우선 검토한다.", "방문 외국인 소비가 크지만 내국인과 구조가 유사해 기존 인기 업종 간 연결이 효과적이다.", ["교차결제율", "외국인 ATV", "캠페인 반응률"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "정주형 지역", "업종 간 교차소비 확대"),
    C("대규모·저괴리", "방문형", "MER", "관광객 동선과 기존 인기 업종의 연결성을 활용하되, 특화업종 확대보다 체류시간·객단가를 높이는 상품 구성을 검토한다.", "관광 수요는 크지만 소비구조가 일반 상권과 유사해 업종 신설의 차별 이점이 작다.", ["객단가", "외국인 고객비중"], ["EV-TOUR-01", "EV-LIT-02"], "정주형 특화업종 확대", "방문당 매출 증가"),
    C("대규모·저괴리", "방문형", "GOV", "핵심 관광지의 소비를 인근 상권으로 확산시키는 다국어 동선·정보 제공과 지역상권 연계 프로그램을 검토한다.", "방문 수요가 크지만 특정 업종 쏠림이 약해 동선·정보 확산이 우선 과제다.", ["인근 상권 외국인 결제액", "체류시간"], ["EV-TOUR-01", "EV-LIT-02", "POL-02"], "정주형 지역", "관광 소비의 공간적 확산"),
    // 소규모·고괴리
    C("소규모·고괴리", "정주형", "BC", "외국인 생활밀착 업종({GAP}) 가맹점 중심으로 소규모 공동 프로모션과 반복결제 CRM 파일럿을 설계한다. Supply Gap이 큰 업종부터 시작한다.", "외국인 결제 규모는 작지만 소비구조가 뚜렷이 달라 특화 수요가 존재한다.", ["외국인 CNT", "재방문 결제율"], ["EV-RES-01", "EV-BC-03", "EV-LIT-01"], "방문형 지역, Confidence Low에서의 즉시 확대", "특화 수요 가맹점 반복결제 증가"),
    C("소규모·고괴리", "정주형", "MER", "외국인 수요가 높고 지역 공급이 부족한 생활업종({GAP}·{GAP2})을 우선 후보로 검토한다. 폐업률이 높은 업종은 소규모 테스트 후 확대한다.", "작지만 뚜렷한 외국인 생활수요가 있고 지역 공급이 이를 따라가지 못한다.", ["매출", "외국인 고객비중", "1년 생존율"], ["EV-LOCAL-01", "EV-HYP-02", "POL-03"], "폐업률 15% 이상 업종의 즉시 대규모 창업", "틈새 업종 진입 성공률 제고"),
    C("소규모·고괴리", "정주형", "GOV", "외국인 근로자·정주민의 생활권 접근성을 높이는 상권 지원과 다국어 정보 제공을 우선하고, 현행 소상공인 지원사업과 연계한다.", "정주 외국인의 특화 수요가 있으나 규모가 작아 민간만으로 공급이 형성되기 어렵다.", ["참여사업자 매출", "외국인 결제액", "지원사업 연계 건수"], ["EV-MOJ-01", "EV-RES-03", "POL-02", "POL-03"], "관광형 지역", "생활권 내 소비 충족"),
    C("소규모·고괴리", "방문형", "BC", "방문객이 몰리는 소수 특화 업종({GAP}) 가맹점과 시즌 한정 프로모션을 파일럿으로 운영하고 반응을 측정한다.", "방문 규모는 작지만 특정 업종에 뚜렷이 몰리는 니치 관광 수요가 있다.", ["캠페인 반응률", "외국인 ATV"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-01"], "정주형 지역", "니치 관광 수요 검증"),
    C("소규모·고괴리", "방문형", "MER", "방문객 선호 업종({GAP})에서 체험·기념품형 상품을 소규모로 시험하고, 성과를 확인한 뒤 확대한다.", "방문 수요가 작지만 특화돼 있어 소규모 실험의 성공 가능성이 있다.", ["객단가", "외국인 고객비중"], ["EV-TOUR-01", "EV-HYP-01"], "대규모 설비 투자", "특화 상품 수요 검증"),
    C("소규모·고괴리", "방문형", "GOV", "지역 특화 관광 콘텐츠와 연계한 소규모 상권 홍보·다국어 안내를 시범 운영한다.", "특화된 방문 수요가 있으나 규모가 작아 시범 단위 접근이 적합하다.", ["방문객 결제액", "참여 점포 수"], ["EV-TOUR-01", "POL-02"], "정주형 지역", "특화 관광 수요의 상권 연결"),
    // 소규모·저괴리
    C("소규모·저괴리", "정주형", "BC", "별도 캠페인보다 분기별 외국인 결제 모니터링을 유지하고, 변화 신호가 나타나면 BC IDEA 분석을 제안한다.", "외국인 결제 규모가 작고 소비구조도 지역 평균과 비슷해 즉시 개입의 효과가 불확실하다.", ["외국인 CNT 추세", "모니터링 리포트 발행"], ["EV-RES-01", "EV-RES-02", "EV-BC-01"], "근거 없이 대규모 프로모션 집행", "변화 신호 조기 포착"),
    C("소규모·저괴리", "정주형", "MER", "외국인 특화 업종 전환보다 기존 영업에 간편결제·다국어 안내 같은 저비용 개선을 우선한다.", "외국인 수요가 작고 차별성이 약해 업종 전환의 기대수익이 낮다.", ["외국인 고객비중", "도입 비용 대비 매출"], ["EV-RES-01", "EV-HYP-01", "POL-01"], "외국인 특화 창업 권고", "저비용 외국인 고객 확보"),
    C("소규모·저괴리", "정주형", "GOV", "외국인 주민 생활정보 제공 등 기초 포용 정책을 유지하고 등록외국인 추세를 정기 점검한다.", "정주 외국인 소비가 작고 지역 평균과 비슷해 특화 상권 정책의 필요성이 낮다.", ["등록외국인 추세", "생활정보 이용 건수"], ["EV-MOJ-01", "EV-RES-02"], "특화구역 지정", "정책 수요 변화 조기 포착"),
    C("소규모·저괴리", "방문형", "BC", "인근 대형 관광권역 캠페인에 지역 가맹점을 포함하는 방식으로 저비용 노출을 확보한다.", "방문 수요가 작고 구조가 평이해 단독 캠페인의 효율이 낮다.", ["노출 대비 외국인 결제 전환", "외국인 CNT"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "단독 대형 캠페인", "주변 관광권 수요 흡수"),
    C("소규모·저괴리", "방문형", "MER", "관광객 대상 신규 투자보다 기존 상품의 다국어 안내·결제 편의 개선으로 대응한다.", "방문 수요가 작아 투자 회수 불확실성이 크다.", ["외국인 고객비중"], ["EV-TOUR-01", "EV-HYP-01"], "관광 특화 창업", "저비용 방문객 대응"),
    C("소규모·저괴리", "방문형", "GOV", "광역 관광 동선에 지역을 연결하는 정보 제공을 검토하고 방문 추세를 관찰한다.", "방문 규모가 작아 독자 상권 정책보다 광역 연계가 적합하다.", ["방문객 추세", "광역 연계 프로그램 참여"], ["EV-TOUR-01", "EV-LIT-02"], "단독 대규모 관광 인프라 투자", "광역 관광 수요 연결"),
  ];

  // ── 수식어 규칙: Momentum = 실행 시점, Confidence = 권고 강도 (기획서 6장) ──
  const rules = [
    { id: "R-CONF-H", on: "confidence", when: "High", effect: "강도 '적극' — 즉시 실행 권고 허용" },
    { id: "R-CONF-M", on: "confidence", when: "Medium", effect: "강도 '파일럿→확대' — 파일럿 성과 확인 후 확대" },
    { id: "R-CONF-L", on: "confidence", when: "Low", effect: "강도 '파일럿·추가 관찰' — 투자·확대 표현 금지" },
    { id: "R-MOM-UP", on: "momentum.cnt", when: "상승", effect: "시점 '이번 분기 선점' — 우선순위 상승" },
    { id: "R-MOM-FLAT", on: "momentum.cnt", when: "안정", effect: "시점 '정기 계획 반영'" },
    { id: "R-MOM-DOWN", on: "momentum.cnt", when: "하락", effect: "시점 '원인 진단 후 재정비' — 강도 1단계 하향" },
    { id: "R-ATV-UP", on: "momentum.atv", when: "상승", effect: "객단가 상승 → 프리미엄·세트 상품 여지" },
    { id: "R-ATV-DOWN", on: "momentum.atv", when: "하락", effect: "객단가 하락 → 소액·다빈도 결제 혜택 설계" },
    { id: "R-GAP", on: "supply_gap", when: "> 5%p", effect: "Supply Gap 상위 업종을 타깃 업종으로 지정" },
    { id: "R-GAP-NONE", on: "supply_gap", when: "≤ 5%p", effect: "공급 부족 업종 없음 — 신규 진입 권고 억제" },
    { id: "R-CLOSURE", on: "closure_risk", when: "≥ 15%", effect: "폐업률 높은 타깃 업종 — 소규모 테스트 후 확대(선별)" },
    { id: "R-SUB-IND", on: "context_sub", when: "산업", effect: "근로자 생활권 — 대형·슈퍼/편의점, 주말·야간 수요 반영" },
    { id: "R-NAT-V", on: "context", when: "방문형", effect: "데이터랩 방문 상위 국적을 타깃 국적으로" },
    { id: "R-NAT-R", on: "context", when: "정주형", effect: "법무부 등록외국인 상위 국적을 타깃 국적으로" },
    { id: "R-STAY-LONG", on: "tour.stay_type", when: "숙박 체류형 (숙박일수 상위 25%)", effect: "숙박 가맹점 연계 교차소비·체류 상품" },
    { id: "R-STAY-SHORT", on: "tour.stay_type", when: "단시간 방문형 (체류시간 하위 25%)", effect: "야간·연계 코스로 체류시간 연장" },
    { id: "R-ATTR", on: "tour.attractions", when: "검색 Top100 관광지 ≥ 1", effect: "해당 관광지와 인근 상권 동선 연계" },
    { id: "R-TOUR-UP", on: "tour.sido.growth", when: "≥ +2%", effect: "시도 방문 증가 — 방문형 Action 시점 앞당김" },
    { id: "R-TOUR-DOWN", on: "tour.sido.growth", when: "< 0%", effect: "시도 방문 감소 — 관광형 신규 투자 신중" },
    { id: "R-POLICY", on: "policy.valid_to", when: `< ${TODAY}`, effect: "유효기간 지난 정책은 근거에서 제외" },
  ];

  const guardrails = [
    ["근거 제한", "Retrieved Action KB와 제공된 지역 진단값에 없는 사실을 생성하지 않는다."],
    ["정책 유효성", "valid_to가 지난 정책은 추천하지 않는다."],
    ["Confidence 반영", "Low Confidence에서는 적극적 투자·확대 표현을 금지하고 파일럿/관찰을 우선한다."],
    ["출처 표시", "각 핵심 추천에 Evidence ID 또는 출처명을 함께 표시한다."],
    ["KPI 의무", "모든 Action에 최소 1개의 측정 가능한 KPI를 붙인다."],
  ];

  return { TODAY, evidence, cells, rules, guardrails, STRATEGY, STAKEHOLDERS };
})();
