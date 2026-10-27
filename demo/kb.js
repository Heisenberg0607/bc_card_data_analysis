/* Action Knowledge Base — 기획서 3장(필드 정의)·6장(결정 규칙)·12장(24개 기본 Action Cell) 구현.
 *
 * demo: true 표시 항목은 실제 출처를 확인하지 않은 데모용 가상 근거/정책이다.
 * 실제 구현 시 공고문·사례 원문으로 교체해야 한다.
 */
window.ACTION_KB = (function () {
  const TODAY = "2026-10-27";

  const TN = window.BC_DATA.meta.national.tourism;
  const CM = window.BC_DATA.meta.thresholds.context;
  const SQ = window.BC_DATA.meta.thresholds.stay;
  const fvVals = Object.values(TN.foreign_visitors);
  const fmtMan = (v) => (v / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "만";
  const visitTop = TN.visit_nat.filter((x) => x.nat !== "기타").slice(0, 4);

  const POLICY_URL = "https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1064353&parentSeq=1064353";
  const POLICIES = [
    { id: "POL-01", grade: "A", type: "정책", title: "혁신 소상공인 창업지원", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "창업자", budget: 225.5, scale: "560명", applicant: "예비창업자", notice: "1월", tags: ["창업"], desc: "신사업 등 유망 아이디어 기반 예비창업자에게 창업교육·1:1 멘토링·사업화 자금 지원" },
    { id: "POL-02", grade: "A", type: "정책", title: "로컬 크리에이터 육성", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 86.3, scale: "280개사", applicant: "소상공인", notice: "1월", tags: ["상권", "창업"], desc: "지역 자원·특성에 혁신 아이디어를 접목한 로컬크리에이터 육성" },
    { id: "POL-03", grade: "A", type: "정책", title: "로컬브랜드 창출", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 24, scale: "10개팀", applicant: "소상공인", notice: "1월", tags: ["상권"], desc: "골목상권 내 로컬크리에이터·소상공인이 사업 아이템과 지역 자산을 연결하는 로컬 브랜드 구축" },
    { id: "POL-04", grade: "A", type: "정책", title: "강한 소상공인 성장지원", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 231.4, scale: "240개팀", applicant: "소상공인", notice: "1월", tags: ["성장"], desc: "우수 소상공인과 창작자·스타트업의 융합으로 차별화된 제품·서비스 창출" },
    { id: "POL-05", grade: "A", type: "정책", title: "우리동네 크라우드 펀딩", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 40, scale: "1,300개사", applicant: "소상공인", notice: "1월", tags: ["성장"], desc: "펀딩 리워드 다양화와 기획·홍보·수수료 등 펀딩 비용 지원" },
    { id: "POL-06", grade: "A", type: "정책", title: "혁신 소상공인 투자연계", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 300, scale: "300개사", applicant: "소상공인", notice: "1월", tags: ["성장"], desc: "소기업 성장이 가능한 소상공인의 브랜딩·마케팅·제품 고도화 집중 지원" },
    { id: "POL-07", grade: "A", type: "정책", title: "글로벌 소상공인(K-소상공인) 육성", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 95.2, scale: "100개사", applicant: "소상공인", notice: "2월", tags: ["해외", "외국인"], desc: "제품을 수출형으로 전환하고 맞춤형 해외판로 연결 (신규)" },
    { id: "POL-08", grade: "A", type: "정책", title: "혁신 소상공인 AI활용 지원", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 143.6, scale: "2,000명", applicant: "소상공인", notice: "2월", tags: ["디지털"], desc: "AI를 활용한 제품개발·서비스 도입 지원 (신규)" },
    { id: "POL-09", grade: "A", type: "정책", title: "백년소상공인 육성", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 14.7, scale: "300개 내외", applicant: "소상공인", notice: "1월", tags: ["성장"], desc: "오랜 노하우를 가진 우수 소상공인의 존속·성장 지원과 성공모델 확산" },
    { id: "POL-10", grade: "A", type: "정책", title: "소상공인 온·오프라인 교육", field: "기업가형 소상공인 육성", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 150, scale: "현장 22,000명 / 온라인 50,000명", applicant: "소상공인·예비창업자", notice: "1월·연중", tags: ["교육", "디지털"], desc: "창업·운영에 필요한 기술·경영·마케팅 교육과 온라인 강의 제공" },
    { id: "POL-11", grade: "A", type: "정책", title: "소상공인 유통물류 지원", field: "소상공인 성장지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 2, scale: "1개", applicant: "중소유통기업자단체", notice: "1월", tags: ["유통"], desc: "디지털 통합물류시스템 기반 중소 유통단체 공동사업 활성화" },
    { id: "POL-12", grade: "A", type: "정책", title: "소상공인 협업활성화", field: "소상공인 성장지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 68.2, scale: "80개 내외", applicant: "5인 이상 협동조합", notice: "1월", tags: ["상권", "협업"], desc: "5인 이상 소상공인 간 협업화를 통한 공동사업 지원" },
    { id: "POL-13", grade: "A", type: "정책", title: "브랜드 소상공인 육성", field: "소상공인 성장지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 210, scale: "3,500개사 내외", applicant: "소상공인", notice: "1월·3월", tags: ["디지털", "판로"], desc: "온라인 플랫폼사와 협업해 유망 소상공인을 발굴하고 소기업 성장 지원" },
    { id: "POL-14", grade: "A", type: "정책", title: "소공인 스마트제조 지원", field: "소공인 특화지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 980, scale: "2,000개사", applicant: "소공인", notice: "1월", tags: ["소공인", "제조"], desc: "노동집약 생산공정에 스마트장비·기술 지원" },
    { id: "POL-15", grade: "A", type: "정책", title: "소공인 클린제조 환경조성", field: "소공인 특화지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 126, scale: "1,800개사 내외", applicant: "소공인", notice: "1월", tags: ["소공인", "환경"], desc: "작업장 현장진단을 통한 산업재해 예방·에너지효율화 비용 지원" },
    { id: "POL-16", grade: "A", type: "정책", title: "소공인 판로개척 지원", field: "소공인 특화지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 66.9, scale: "290개사", applicant: "소공인", notice: "1월", tags: ["소공인", "판로"], desc: "품질력·성장잠재력을 보유한 소공인의 국내외 판로개척 지원" },
    { id: "POL-17", grade: "A", type: "정책", title: "소공인 복합지원센터 구축·운영", field: "소공인 특화지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "지자체", budget: 10, scale: "1개소", applicant: "지방자치단체", notice: "2025.12월", tags: ["상권"], desc: "소공인 집적지 활성화를 위한 복합지원센터 구축·운영" },
    { id: "POL-18", grade: "A", type: "정책", title: "소공인 특화지원센터 설치운영", field: "소공인 특화지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "지자체", budget: 4, scale: "2곳 내외", applicant: "법인 또는 단체", notice: "3월", tags: ["상권"], desc: "소공인 집적지 내 특화지원센터에서 교육·상담·특화프로그램 운영" },
    { id: "POL-19", grade: "A", type: "정책", title: "글로컬 상권", field: "지역상권 활성화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "지자체", budget: 150, scale: "6곳 내외", applicant: "상권 컨소시엄", notice: "2월", tags: ["상권", "관광", "외국인"], desc: "국내외 방문객이 이동·숙박·식음·체험 등 K-컬처를 소비하는 글로컬 상권 조성 (정규사업 신설)" },
    { id: "POL-20", grade: "A", type: "정책", title: "로컬거점 상권", field: "지역상권 활성화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "지자체", budget: 100, scale: "10곳 내외", applicant: "상권 컨소시엄", notice: "2월", tags: ["상권"], desc: "지역 특화산업 등과 접목한 로컬거점 상권 조성 (신규)" },
    { id: "POL-21", grade: "A", type: "정책", title: "유망 골목상권", field: "지역상권 활성화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "지자체", budget: 125, scale: "50곳 내외", applicant: "상권 컨소시엄", notice: "2월", tags: ["상권", "생활"], desc: "소규모 골목상권의 조직화·역량강화·마케팅 종합지원 (신규)" },
    { id: "POL-22", grade: "A", type: "정책", title: "소상공인 온라인판로 지원", field: "소상공인 디지털 역량강화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 787, scale: "60,000개사 내외", applicant: "소상공인", notice: "1월·2월", tags: ["디지털", "판로"], desc: "준비→실전→도약 단계별 온라인 판로 지원, 소담스퀘어·소담상회 운영" },
    { id: "POL-23", grade: "A", type: "정책", title: "소상공인 스마트상점 기술보급", field: "소상공인 디지털 역량강화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 349, scale: "16,000개사 내외", applicant: "소상공인", notice: "2025.12월·2026.3월", tags: ["디지털", "외국인"], desc: "키오스크·조리로봇·서빙로봇·매출분석 AI 등 스마트기술 도입 지원 (다국어 키오스크 포함 가능)" },
    { id: "POL-24", grade: "A", type: "정책", title: "소상공인 고용보험료 지원", field: "소상공인 경영부담 완화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 153, scale: "약 4만명", applicant: "자영업자 고용보험 가입 소상공인", notice: "12.30일", tags: ["경영안정"], desc: "자영업자 고용보험료의 50~80% 환급" },
    { id: "POL-25", grade: "A", type: "정책", title: "소상공인 경영안정 바우처", field: "소상공인 경영부담 완화", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 5790, scale: "약 230만개사", applicant: "영업 중인 소상공인", notice: "1월", tags: ["경영안정"], desc: "고정비용 부담 완화를 위한 지정 사용처 바우처 지급" },
    { id: "POL-26", grade: "A", type: "정책", title: "희망리턴패키지", field: "소상공인 재기지원", source: "중기부 2026 통합공고(제2025-652호)", url: POLICY_URL, valid_from: "2026-01-01", valid_to: "2026-12-31", target: "소상공인", budget: 3056, scale: "10만건 내외", applicant: "폐업(예정) 소상공인", notice: "1월", tags: ["재기"], desc: "폐업(예정) 소상공인의 신속한 폐업 지원과 재기(취업·사업화) 프로그램" },
  ];

  // ── Evidence (근거 등급 A/B/C, X는 등록하지 않음) ──
  const evidence = [
    { id: "EV-RES-01", grade: "A", type: "본 연구 실증", title: "BC 거래데이터 Structure(Scale×TVD) 진단", source: "공모전 BC 거래데이터 2026.01~06", desc: "외국인·내국인 업종 구성 괴리(TVD)와 전체 거래 규모로 255개 시군구를 4개 유형으로 분류" },
    { id: "EV-RES-02", grade: "A", type: "본 연구 실증", title: "Momentum·Confidence 기간창 검증", source: "공모전 BC 거래데이터 2026.01~06", desc: "전체 거래 CNT·ATV의 전국 대비 로그 초과변화. 3M·2M 부호 일치와 robust scale(1.4826×MAD) 조건으로 축별 Stable을 판정하고 두 축의 안정성으로 Confidence 부여" },
    { id: "EV-RES-04", grade: "A", type: "본 연구 실증", title: "External Context 검증 (ContextGap)", source: "BC_foreign_commercial_analysis_report 7.3", desc: `ContextGap = Pctl(외국인 방문비중) − Pctl(등록외국인 비율). 엄격표본 ${CM.n_strict}개 3분위 판정. BC 소비잔차와 r=${CM.r_gap_residual}, TVD와 r=${CM.r_gap_tvd}; 방문비중 단독은 r=${CM.r_visit_residual}` },
    { id: "EV-KTO-01", grade: "A", type: "정부 통계", title: "한국관광공사 지역별 방문자수 (2026H1 일별)", source: "한국관광공사 OpenAPI", url: "https://www.data.go.kr/data/15101972/openapi.do", desc: "시군구별 외지인·외국인 방문자(이동통신 기반). 외국인 방문비중 = 외국인/(외지인+외국인). 방문 목적은 식별하지 않음" },
    { id: "EV-MOIS-01", grade: "A", type: "정부 통계", title: "행정안전부 주민등록 인구통계 (2026-06)", source: "공공데이터포털 15097972", url: "https://www.data.go.kr/data/15097972/fileData.do", desc: "시군구 주민등록인구 — 등록외국인 비율의 분모" },
    { id: "EV-RES-03", grade: "A", type: "본 연구 실증", title: "외국인 소비 성격 군집(CLR+KMeans)", source: "외국인_시군구_유형.csv", desc: "외국인 업종 구성비로 도심 상권형·산업단지 군지역형·외식관광형 등 유형화 (실루엣 0.2 수준 — 기술적 분류)" },
    { id: "EV-MOJ-01", grade: "A", type: "정부 통계", title: "법무부 월별 등록외국인 국적(지역)별 현황", source: "공공데이터포털 15100020", url: "https://www.data.go.kr/data/15100020/fileData.do", desc: `장기체류 등록외국인 국적 구성 (${(window.BC_DATA.meta.national.moj_total / 1e4).toFixed(1)}만명 기준)` },
    { id: "EV-MOJ-02", grade: "A", type: "정부 통계", title: "법무부 월별 등록외국인 시군구별 거주 현황", source: "공공데이터포털 15100022", url: "https://www.data.go.kr/data/15100022/fileData.do", desc: `255개 시군구 월별 등록외국인 (2026.01~06 평균 합계 ${(window.BC_DATA.meta.national.moj_region_total / 1e4).toFixed(1)}만명)` },
    // 한국관광 데이터랩 (실데이터) — 설명 수치는 data.js에서 채운다
    { id: "EV-TOUR-01", grade: "A", type: "정부 통계", title: "데이터랩 외국인 방문자수 (전국 월별)", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `2026.01~06 전국 방문 추이. 지역별 외국인 방문은 KTO 2026H1 일별 실측 집계로 제공` },
    { id: "EV-TOUR-02", grade: "A", type: "정부 통계", title: "데이터랩 외국인 관광소비 업종 구성", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: Object.entries(TN.spend_major_pct).slice(0, 4).map(([k, v]) => `${k} ${v}%`).join(" · ") },
    { id: "EV-TOUR-03", grade: "A", type: "정부 통계", title: "데이터랩 국가별 외국인 방문 비율", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: visitTop.map((x) => `${x.nat} ${x.pct}%`).join(" · ") },
    { id: "EV-TOUR-04", grade: "A", type: "정부 통계", title: "데이터랩 시군구 방문자 체류특성", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `229개 시군구 평균 체류시간(분)·숙박일수. 중앙값 ${SQ.dwell_med}분 · ${SQ.nights_med}일` },
    { id: "EV-TOUR-05", grade: "A", type: "정부 통계", title: "데이터랩 관광지 검색순위 Top100", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: "목적지 검색 상위 100개 관광지와 주소 (쇼핑 69곳 · 문화관광 14곳 등)" },
    { id: "EV-TOUR-06", grade: "A", type: "정부 통계", title: "데이터랩 시도별 방문자수 증가율", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: "시도 방문자수·관광지출액·목적지 검색건수·방문자 증가율" },
    { id: "EV-TOUR-07", grade: "A", type: "정부 통계", title: "데이터랩 외국인 간편결제 관광소비", source: "한국관광 데이터랩", url: "https://datalab.visitkorea.or.kr/", desc: `국적: ${TN.easy_nat.slice(0, 2).map((x) => `${x.nat} ${x.pct}%`).join(" · ")} / 업종: ${Object.entries(TN.easy_ind_pct).slice(0, 2).map(([k, v]) => `${k} ${v}%`).join(" · ")}` },
    { id: "EV-SUPPLY-01", grade: "A", type: "정부 통계", title: "소상공인시장진흥공단 상가(상권)정보", source: "공공데이터포털 15083033", url: "https://www.data.go.kr/data/15083033/fileData.do", desc: "2026-06-30 공식 상가정보 16개 파일(전남·광주 통합) 원본에서 중복 ID와 지역 매칭을 검사하고 8개 분석용 그룹으로 재집계. 공급 분모는 지역 내 8개 그룹 점포 합계. BC 공식 업종 대응표나 미충족 수요의 직접 측정이 아님" },
    { id: "EV-LOCAL-01", grade: "A", type: "정부 통계", title: "LOCALDATA 지방행정 인허가 데이터", source: "행정안전부", url: "https://www.localdata.go.kr/", desc: "업종별 업소·영업상태·폐업 이력 (데모에서는 폐업률만 합성 — 상가정보에는 영업 중 점포만 있음)" },
    { id: "EV-BC-01", grade: "A", type: "BC 실행수단", title: "BC IDEA 상권·시장·채널 분석", source: "BC카드", url: "https://www.bccard.com/app/card/html/company/kr/bigdata/bcidea/index.jsp", desc: "BC 소비데이터 기반 시장·채널·상권 분석과 전략 수립 지원" },
    { id: "EV-BC-02", grade: "A", type: "BC 실행수단", title: "BC 빅데이터 비즈니스 컨설팅", source: "BC카드", url: "https://www.bccard.com/app/card/html/company/kr/bigdata/business/index.jsp", desc: "상권·마케팅·트렌드 컨설팅, 지역 소비 분석, 활용모델 구축" },
    { id: "EV-BC-03", grade: "B", type: "BC 사례", demo: true, title: "가맹점 공동 프로모션·반복결제 CRM 운영 사례", source: "데모용 가상 사례", desc: "지역 가맹점 묶음 프로모션 시 참여 가맹점 재방문 결제 증가 사례(가상)" },
    { id: "EV-LIT-01", grade: "B", type: "연구보고서", demo: true, title: "외국인 근로자 밀집지역 생활소비 특성", source: "데모용 가상 보고서", desc: "근로자 정주지역은 식료품·생활편의 반복 소비 비중이 높고 주말·야간 집중(가상)" },
    { id: "EV-LIT-02", grade: "B", type: "연구보고서", demo: true, title: "방한 관광객 동선 기반 소비 확산", source: "데모용 가상 보고서", desc: "핵심 관광지 인근 1km 내 상권으로 소비가 확산될 때 체류시간·객단가 증가(가상)" },
    { id: "EV-HYP-01", grade: "C", type: "가설", title: "다국어 메뉴·결제안내 도입 효과", source: "내부 가설", desc: "다국어 안내가 외국인 신규 결제 전환을 높일 것이라는 가설 — 파일럿 검증 필요" },
    { id: "EV-HYP-02", grade: "C", type: "가설", title: "Supply Gap 업종 진입 시 초기 매출 우위", source: "내부 가설", desc: "외국인 수요 대비 공급이 부족한 업종의 신규 점포가 초기 매출에서 유리할 것이라는 가설 — 파일럿 검증 필요" },
    // 정책: 2026년 중소벤처기업부 소상공인 지원사업 통합 공고(공고 제2025-652호, 2025.12.29)
    //   7개 분야 26개 사업 1조 3,410억원. budget=억원, scale=지원규모, notice=개별공고 시기.
    //   valid_from/valid_to는 사업연도 기준 — 개별 공고문에서 실제 접수기간으로 갱신해야 한다.
    ...POLICIES,
    // 전년도 공고 — 유효기간 경과로 추천에서 제외된다(가드레일 시연)
    { id: "POL-2025", grade: "A", type: "정책", title: "2025년 소상공인 지원사업 통합 공고", source: "중소벤처기업부", valid_from: "2025-01-01", valid_to: "2025-12-31", target: "소상공인", tags: ["경영안정"], desc: "7개 분야 23개 사업 8,170억원 — 2026년 공고로 대체됨" },
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

  // ── 36개 기본 Action Cell (4 Structure × 3 Context × 3 Stakeholder) ──
  //    Context는 보고서 7.3의 정주우세형 / 혼합형 / 방문우세형
  // {GAP}: 최대 Supply Gap 업종, {GAP2}: 차순위 업종 — 규칙 엔진이 채운다.
  // ev에는 정책을 넣지 않는다 — 현행 지원사업은 규칙 엔진이 진단 조건에 맞춰 검색한다.
  const C = (structure, context, sh, action, why, kpi, ev, avoid, effect) => ({
    id: `AC-${["대규모·고괴리", "대규모·저괴리", "소규모·고괴리", "소규모·저괴리"].indexOf(structure) + 1}${{ 정주우세형: "R", 혼합형: "M", 방문우세형: "V" }[context]}-${sh}`,
    stakeholder: sh, structure, context, strategy: STRATEGY[structure],
    momentum: "any", min_confidence: "Low", action, why, kpi, evidence: ev, avoid_when: avoid, expected_effect: effect,
  });

  const cells = [
    // 대규모·고괴리
    C("대규모·고괴리", "정주우세형", "BC", "외국인 생활밀착 업종({GAP}·{GAP2}) 가맹점을 묶은 공동 프로모션과 반복결제 CRM을 운영하고, 지자체 대상 BC IDEA 상권분석 리포트를 제안한다.", "전체 거래 규모가 크고 내국인과 소비구조가 뚜렷이 달라 전용 타깃팅의 효율이 높다.", ["외국인 CNT", "재방문 결제율", "캠페인 반응률"], ["EV-RES-01", "EV-BC-01", "EV-BC-03"], "방문우세형 지역, Confidence Low", "외국인 반복결제 증가, 가맹점 매출 안정화"),
    C("대규모·고괴리", "정주우세형", "MER", "{GAP} 등 Supply Gap 상위 업종에서 외국인 고객용 메뉴·상품 구성(소포장·모국 식재료·다국어 안내)을 강화하고, 신규 진입은 Gap·폐업률을 함께 보고 결정한다.", "외국인 수요가 크고 업종 구성이 달라 기존 공급만으로 충족되지 않는 영역이 존재한다.", ["외국인 고객비중", "월 매출", "재방문율"], ["EV-LOCAL-01", "EV-HYP-02"], "폐업률 15% 이상 업종의 대규모 신규 투자", "외국인 고객 매출 비중 확대"),
    C("대규모·고괴리", "정주우세형", "GOV", "외국인 정주 생활권을 '특화 생활상권'으로 지정해 다국어 안내·결제환경을 정비하고 상권 활성화 지원사업과 연계한다.", "정주 상대 우세와 소비구조 차이가 관측돼 정책 대상이 명확하다.", ["지역 소비확산(외국인 결제액)", "참여 점포 수", "상권 공실률"], ["EV-MOJ-01", "EV-RES-01"], "방문우세형 지역, 정주 외국인 비중 하락 추세", "정주 외국인 생활 편의·지역 내 소비 유지"),
    C("대규모·고괴리", "방문우세형", "BC", "관광객 특화 업종({GAP}) 가맹점과 숙박·쇼핑 가맹점을 연결한 해외카드 결제 프로모션을 설계하고 BC 빅데이터 컨설팅으로 동선별 성과를 측정한다.", "방문객 소비가 크고 내국인과 다른 업종에 집중돼 관광형 타깃 마케팅의 모수가 충분하다.", ["외국인 ATV", "교차결제율", "캠페인 반응률"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "정주우세형 지역, Confidence Low", "관광객 객단가·교차소비 증가"),
    C("대규모·고괴리", "방문우세형", "MER", "관광객 선호 업종({GAP})에서 체류시간·객단가를 높이는 세트·체험형 상품을 구성하고, 다국어 주문·결제 환경을 갖춘다.", "방문 수요가 크고 업종 특화가 뚜렷하나 방문객은 반복구매보다 1회 객단가가 핵심이다.", ["객단가", "외국인 고객비중", "리뷰·재추천"], ["EV-TOUR-01", "EV-HYP-01"], "정주 생활업종 확대 목적", "1회 방문당 매출 증가"),
    C("대규모·고괴리", "방문우세형", "GOV", "핵심 관광지 소비를 인근 특화 상권으로 잇는 다국어 동선 안내와 상권 연계 프로그램을 운영한다.", "관광 유입이 크고 외국인 소비가 특정 업종에 몰려 있어 인근 상권으로의 확산 여지가 있다.", ["인근 상권 외국인 결제액", "방문객 체류시간", "참여 점포 수"], ["EV-TOUR-01", "EV-LIT-02"], "정주우세형 지역", "관광 소비의 지역 상권 확산"),
    // 대규모·저괴리
    C("대규모·저괴리", "정주우세형", "BC", "외국인 전용 상품보다 기존 주력 가맹점의 외국인 결제 편의(간편결제·안내)를 개선하고, 내·외국인 공통 지역 프로모션에 외국인 세그먼트를 추가한다.", "전체 거래 규모는 크지만 소비구조가 내국인과 유사해 별도 업종보다 기존 상권 통합이 효율적이다.", ["외국인 CNT", "외국인 결제 전환율", "프로모션 참여율"], ["EV-RES-01", "EV-BC-01"], "고괴리 지역에 동일 적용", "기존 가맹점의 외국인 매출 확대"),
    C("대규모·저괴리", "정주우세형", "MER", "신규 업종 진입보다 기존 점포의 다국어 안내·결제 편의 개선으로 외국인 고객 전환을 높인다.", "외국인 소비가 지역 평균과 유사해 특화 업종의 공급 부족 신호가 약하다.", ["외국인 고객비중", "월 매출"], ["EV-RES-01", "EV-HYP-01"], "Supply Gap이 큰 업종이 없는데 신규 창업을 권고", "기존 매출 기반 위 외국인 고객 추가"),
    C("대규모·저괴리", "정주우세형", "GOV", "외국인 주민을 기존 지역화폐·상권 행사 대상에 포함하고 다국어 생활정보를 제공한다.", "정주 외국인이 지역 소비 패턴에 이미 통합돼 있어 별도 특화구역보다 포용형 정책이 적합하다.", ["외국인 결제액", "행사 참여 외국인 수"], ["EV-MOJ-01"], "방문우세형 지역", "지역 소비 기반 유지"),
    C("대규모·저괴리", "방문우세형", "BC", "외국인 전용 업종 신설보다 숙박·음식·쇼핑 등 기존 주요 가맹점 간 교차소비 프로모션을 우선 검토한다.", "방문 외국인 소비가 크지만 내국인과 구조가 유사해 기존 인기 업종 간 연결이 효과적이다.", ["교차결제율", "외국인 ATV", "캠페인 반응률"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "정주우세형 지역", "업종 간 교차소비 확대"),
    C("대규모·저괴리", "방문우세형", "MER", "관광객 동선과 기존 인기 업종의 연결성을 활용하되, 특화업종 확대보다 체류시간·객단가를 높이는 상품 구성을 검토한다.", "관광 수요는 크지만 소비구조가 일반 상권과 유사해 업종 신설의 차별 이점이 작다.", ["객단가", "외국인 고객비중"], ["EV-TOUR-01", "EV-LIT-02"], "정주 특화업종 확대", "방문당 매출 증가"),
    C("대규모·저괴리", "방문우세형", "GOV", "핵심 관광지의 소비를 인근 상권으로 확산시키는 다국어 동선·정보 제공과 지역상권 연계 프로그램을 검토한다.", "방문 수요가 크지만 특정 업종 쏠림이 약해 동선·정보 확산이 우선 과제다.", ["인근 상권 외국인 결제액", "체류시간"], ["EV-TOUR-01", "EV-LIT-02"], "정주우세형 지역", "관광 소비의 공간적 확산"),
    // 소규모·고괴리
    C("소규모·고괴리", "정주우세형", "BC", "외국인 생활밀착 업종({GAP}) 가맹점 중심으로 소규모 공동 프로모션과 반복결제 CRM 파일럿을 설계한다. Supply Gap이 큰 업종부터 시작한다.", "전체 거래 규모는 작지만 소비구조가 뚜렷이 달라 특화 수요가 존재한다.", ["외국인 CNT", "재방문 결제율"], ["EV-RES-01", "EV-BC-03", "EV-LIT-01"], "방문우세형 지역, Confidence Low에서의 즉시 확대", "특화 수요 가맹점 반복결제 증가"),
    C("소규모·고괴리", "정주우세형", "MER", "외국인 수요가 높고 지역 공급이 부족한 생활업종({GAP}·{GAP2})을 우선 후보로 검토한다. 폐업률이 높은 업종은 소규모 테스트 후 확대한다.", "작지만 뚜렷한 외국인 생활수요가 있고 지역 공급이 이를 따라가지 못한다.", ["매출", "외국인 고객비중", "1년 생존율"], ["EV-LOCAL-01", "EV-HYP-02"], "폐업률 15% 이상 업종의 즉시 대규모 창업", "틈새 업종 진입 성공률 제고"),
    C("소규모·고괴리", "정주우세형", "GOV", "외국인 근로자·정주민의 생활권 접근성을 높이는 상권 지원과 다국어 정보 제공을 우선하고, 현행 소상공인 지원사업과 연계한다.", "정주 외국인의 특화 수요가 있으나 규모가 작아 민간만으로 공급이 형성되기 어렵다.", ["참여사업자 매출", "외국인 결제액", "지원사업 연계 건수"], ["EV-MOJ-01", "EV-RES-03"], "방문우세형 지역", "생활권 내 소비 충족"),
    C("소규모·고괴리", "방문우세형", "BC", "방문객이 몰리는 소수 특화 업종({GAP}) 가맹점과 시즌 한정 프로모션을 파일럿으로 운영하고 반응을 측정한다.", "방문 규모는 작지만 특정 업종에 뚜렷이 몰리는 니치 관광 수요가 있다.", ["캠페인 반응률", "외국인 ATV"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-01"], "정주우세형 지역", "니치 관광 수요 검증"),
    C("소규모·고괴리", "방문우세형", "MER", "방문객 선호 업종({GAP})에서 체험·기념품형 상품을 소규모로 시험하고, 성과를 확인한 뒤 확대한다.", "방문 수요가 작지만 특화돼 있어 소규모 실험의 성공 가능성이 있다.", ["객단가", "외국인 고객비중"], ["EV-TOUR-01", "EV-HYP-01"], "대규모 설비 투자", "특화 상품 수요 검증"),
    C("소규모·고괴리", "방문우세형", "GOV", "지역 특화 관광 콘텐츠와 연계한 소규모 상권 홍보·다국어 안내를 시범 운영한다.", "특화된 방문 수요가 있으나 규모가 작아 시범 단위 접근이 적합하다.", ["방문객 결제액", "참여 점포 수"], ["EV-TOUR-01"], "정주우세형 지역", "특화 관광 수요의 상권 연결"),
    // 소규모·저괴리
    C("소규모·저괴리", "정주우세형", "BC", "별도 캠페인보다 분기별 외국인 결제 모니터링을 유지하고, 변화 신호가 나타나면 BC IDEA 분석을 제안한다.", "전체 거래 규모가 작고 소비구조도 지역 평균과 비슷해 즉시 개입의 효과가 불확실하다.", ["외국인 CNT 추세", "모니터링 리포트 발행"], ["EV-RES-01", "EV-RES-02", "EV-BC-01"], "근거 없이 대규모 프로모션 집행", "변화 신호 조기 포착"),
    C("소규모·저괴리", "정주우세형", "MER", "외국인 특화 업종 전환보다 기존 영업에 간편결제·다국어 안내 같은 저비용 개선을 우선한다.", "외국인 수요가 작고 차별성이 약해 업종 전환의 기대수익이 낮다.", ["외국인 고객비중", "도입 비용 대비 매출"], ["EV-RES-01", "EV-HYP-01"], "외국인 특화 창업 권고", "저비용 외국인 고객 확보"),
    C("소규모·저괴리", "정주우세형", "GOV", "외국인 주민 생활정보 제공 등 기초 포용 정책을 유지하고 등록외국인 추세를 정기 점검한다.", "정주 외국인 소비가 작고 지역 평균과 비슷해 특화 상권 정책의 필요성이 낮다.", ["등록외국인 추세", "생활정보 이용 건수"], ["EV-MOJ-01", "EV-RES-02"], "특화구역 지정", "정책 수요 변화 조기 포착"),
    C("소규모·저괴리", "방문우세형", "BC", "인근 대형 관광권역 캠페인에 지역 가맹점을 포함하는 방식으로 저비용 노출을 확보한다.", "방문 수요가 작고 구조가 평이해 단독 캠페인의 효율이 낮다.", ["노출 대비 외국인 결제 전환", "외국인 CNT"], ["EV-RES-01", "EV-TOUR-01", "EV-BC-02"], "단독 대형 캠페인", "주변 관광권 수요 흡수"),
    C("소규모·저괴리", "방문우세형", "MER", "관광객 대상 신규 투자보다 기존 상품의 다국어 안내·결제 편의 개선으로 대응한다.", "방문 수요가 작아 투자 회수 불확실성이 크다.", ["외국인 고객비중"], ["EV-TOUR-01", "EV-HYP-01"], "관광 특화 창업", "저비용 방문객 대응"),
    C("소규모·저괴리", "방문우세형", "GOV", "광역 관광 동선에 지역을 연결하는 정보 제공을 검토하고 방문 추세를 관찰한다.", "방문 규모가 작아 독자 상권 정책보다 광역 연계가 적합하다.", ["방문객 추세", "광역 연계 프로그램 참여"], ["EV-TOUR-01", "EV-LIT-02"], "단독 대규모 관광 인프라 투자", "광역 관광 수요 연결"),

    // 혼합형: 정주 생활수요와 외부 방문수요가 비슷한 무게 — 두 수요를 한 상권에서 함께 받는 전략
    C("대규모·고괴리", "혼합형", "BC", "외국인 특화 업종({GAP}) 가맹점에서 정주 고객 반복결제 CRM과 방문 고객 교차소비 프로모션을 함께 운영하고, 고객군별 반응을 BC IDEA로 분리 측정한다.", "전체 거래 규모가 크고 소비구조가 뚜렷이 다르며, 정주·방문 수요가 한쪽으로 쏠리지 않는다.", ["외국인 CNT", "재방문 결제율", "교차결제율"], ["EV-RES-01", "EV-RES-04", "EV-BC-01", "EV-BC-03"], "정주·방문 한쪽 전용 캠페인만 설계", "정주·방문 고객 모두의 결제 확대"),
    C("대규모·고괴리", "혼합형", "MER", "{GAP} 등 Supply Gap 상위 업종에서 생활형 기본 메뉴와 방문객용 세트·다국어 메뉴를 함께 갖추고, 시간대별(평일 생활·주말 방문) 운영을 나눈다.", "외국인 수요가 크고 특화돼 있으며 반복 고객과 방문 고객이 공존한다.", ["외국인 고객비중", "재방문율", "객단가"], ["EV-SUPPLY-01", "EV-RES-04", "EV-HYP-02"], "폐업률 15% 이상 업종의 대규모 신규 투자", "고객군 다변화로 매출 안정"),
    C("대규모·고괴리", "혼합형", "GOV", "외국인 생활권 정비와 방문객 동선 안내를 한 상권 사업으로 묶어 다국어 안내·결제환경을 개선한다.", "정주 외국인과 방문 외국인이 같은 상권을 쓰고 소비가 특정 업종에 모여 있다.", ["지역 소비확산(외국인 결제액)", "참여 점포 수", "방문객 체류시간"], ["EV-MOJ-02", "EV-RES-04", "EV-KTO-01"], "관광 전용 인프라만 추진", "생활·방문 수요의 동시 흡수"),
    C("대규모·저괴리", "혼합형", "BC", "기존 주력 가맹점을 대상으로 내·외국인 공통 프로모션에 정주·방문 외국인 세그먼트를 모두 추가하고 결제 편의(간편결제·안내)를 개선한다.", "전체 거래 규모는 크지만 소비구조가 내국인과 비슷하고 정주·방문 수요가 섞여 있다.", ["외국인 CNT", "외국인 결제 전환율", "교차결제율"], ["EV-RES-01", "EV-RES-04", "EV-BC-02"], "외국인 전용 업종 신설", "기존 상권의 외국인 매출 확대"),
    C("대규모·저괴리", "혼합형", "MER", "신규 업종 진입보다 기존 점포의 다국어 안내·결제 편의를 개선하고, 방문객이 많은 주말에는 세트 상품을 추가한다.", "외국인 소비가 지역 평균과 비슷해 업종 차별화 이점이 작고, 방문 수요는 객단가로 대응하는 편이 낫다.", ["외국인 고객비중", "객단가"], ["EV-RES-04", "EV-HYP-01"], "Supply Gap이 큰 업종이 없는데 신규 창업을 권고", "기존 매출 위 외국인 고객 추가"),
    C("대규모·저괴리", "혼합형", "GOV", "외국인 주민 대상 생활정보와 방문객 대상 상권 안내를 통합 채널로 제공하고 기존 상권 행사에 두 집단을 모두 포함한다.", "외국인 수요가 크지만 지역 소비 패턴에 통합돼 있어 포용형 통합 정책이 적합하다.", ["외국인 결제액", "행사 참여 외국인 수"], ["EV-MOJ-02", "EV-KTO-01"], "별도 특화구역 지정", "지역 소비 기반 유지·확대"),
    C("소규모·고괴리", "혼합형", "BC", "특화 업종({GAP}) 가맹점 몇 곳에서 정주 고객 반복결제 혜택과 방문 고객 첫 결제 혜택을 나란히 파일럿하고 어느 쪽 반응이 큰지 비교한다.", "규모는 작지만 소비구조가 뚜렷이 다르고, 수요의 주체가 정주·방문 중 어느 쪽인지 아직 갈리지 않는다.", ["외국인 CNT", "캠페인 반응률"], ["EV-RES-01", "EV-RES-04", "EV-BC-01"], "근거 없이 한쪽 고객군 전용 대규모 캠페인", "주 수요층 식별"),
    C("소규모·고괴리", "혼합형", "MER", "외국인 수요가 높고 공급이 부족한 업종({GAP})을 후보로 하되, 생활 필수품과 방문객용 소량 상품을 함께 시험해 반응을 본다.", "작지만 뚜렷한 외국인 수요가 있고 정주·방문 수요가 섞여 있다.", ["매출", "외국인 고객비중", "1년 생존율"], ["EV-SUPPLY-01", "EV-HYP-02"], "폐업률 15% 이상 업종의 즉시 대규모 창업", "틈새 수요 검증"),
    C("소규모·고괴리", "혼합형", "GOV", "외국인 생활 접근성 개선과 소규모 방문객 안내를 함께 시범 운영하고, 현행 상권 지원사업과 연계한다.", "특화 수요가 있으나 규모가 작아 정주·방문 양쪽을 시범 단위로 지원하는 것이 적합하다.", ["참여사업자 매출", "외국인 결제액"], ["EV-MOJ-02", "EV-RES-03", "EV-KTO-01"], "대규모 관광 인프라 투자", "생활·방문 수요 동시 충족"),
    C("소규모·저괴리", "혼합형", "BC", "별도 캠페인보다 분기별 외국인 결제 모니터링을 유지하며, 정주·방문 비중 중 어느 쪽으로 기우는지 추적한다.", "전체 거래 규모가 작고 구조도 평이하며 Context가 중간이라 개입 방향이 아직 불분명하다.", ["외국인 CNT 추세", "ContextGap 변화"], ["EV-RES-02", "EV-RES-04", "EV-BC-01"], "근거 없이 대규모 프로모션 집행", "방향 신호 조기 포착"),
    C("소규모·저괴리", "혼합형", "MER", "특화 업종 전환보다 간편결제·다국어 안내 같은 저비용 개선으로 두 고객군을 모두 받는다.", "외국인 수요가 작고 차별성이 약해 업종 전환의 기대수익이 낮다.", ["외국인 고객비중", "도입 비용 대비 매출"], ["EV-RES-04", "EV-HYP-01"], "외국인 특화 창업 권고", "저비용 외국인 고객 확보"),
    C("소규모·저괴리", "혼합형", "GOV", "기초 생활정보 제공과 광역 방문 동선 연계를 유지하고 등록외국인·방문 추세를 정기 점검한다.", "정주·방문 모두 규모가 작아 기초 지원과 추세 관찰이 적합하다.", ["등록외국인 추세", "방문객 추세"], ["EV-MOJ-02", "EV-KTO-01"], "특화구역 지정", "정책 수요 변화 조기 포착"),
  ];

  // Explanations must use the same overall Scale population as the final notebook.
  const coreWhy = {
    "대규모·고괴리": "전체 거래 규모가 중앙값 이상이고 내·외국인 11개 업종 소비구조 차이가 크다.",
    "대규모·저괴리": "전체 거래 규모가 중앙값 이상이고 내·외국인 11개 업종 소비구조가 비교적 유사하다.",
    "소규모·고괴리": "전체 거래 규모가 중앙값 미만이고 내·외국인 11개 업종 소비구조 차이가 크다.",
    "소규모·저괴리": "전체 거래 규모가 중앙값 미만이고 내·외국인 11개 업종 소비구조가 비교적 유사하다.",
  };
  cells.forEach(c => {c.why=coreWhy[c.structure]; c.action=c.action.replaceAll("관광객","방문객");});
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
    { id: "R-CTX-R", on: "context", when: "정주우세형 (ContextGap 하위 1/3)", effect: "생활밀착·반복결제 Action, 법무부 등록 국적 타깃, 관광 전용 사업 제외" },
    { id: "R-CTX-M", on: "context", when: "혼합형 (ContextGap 중위 1/3)", effect: "정주·방문 수요 병행 Action, 두 국적 분포 모두 고려" },
    { id: "R-CTX-V", on: "context", when: "방문우세형 (ContextGap 상위 1/3)", effect: "교차소비·체류·객단가 Action, 데이터랩 방문 국적 타깃" },
    { id: "R-CTX-SENS", on: "ctx.strict", when: "KTO 181일 미만 관측", effect: "관측기간 부족 — Context 분류와 Context 기반 추천 보류" },
    { id: "R-STAY-LONG", on: "tour.stay_type", when: "숙박 체류형 (숙박일수 상위 25%)", effect: "숙박 가맹점 연계 교차소비·체류 상품" },
    { id: "R-STAY-SHORT", on: "tour.stay_type", when: "단시간 방문형 (체류시간 하위 25%)", effect: "야간·연계 코스로 체류시간 연장" },
    { id: "R-ATTR", on: "tour.attractions", when: "검색 Top100 관광지 ≥ 1", effect: "해당 관광지와 인근 상권 동선 연계" },
    { id: "R-TOUR-UP", on: "tour.sido.growth", when: "≥ +2%", effect: "시도 방문 증가 — 방문 수요 Action 시점 앞당김" },
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
