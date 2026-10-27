# 최종 노트북 기준 demo

기존 Vercel의 화면·차트·36개 Action Cell·정책 검색·Confidence 정렬·테마·관광/국적/공급 기능을 보존했습니다. 정적 HTML/CSS/JS와 의존성 없는 SVG 구조를 유지합니다. 노트북은 수정하지 않았습니다.

## 실행과 언어

`index.html`을 열거나 저장소 루트에서 `python -m http.server 8765 --directory demo`로 실행합니다. 상단 언어 버튼 및 `?lang=ko`, `?lang=en`, `?lang=zh-CN`을 지원합니다. 유효한 URL 언어가 저장 언어(`bc-lang`)보다 우선합니다. 차트·툴팁·규칙 생성 결과는 전환 시 갱신하고 기존 LLM 결과는 재생성 안내로 대체합니다.

번역 사전은 `*locales.js`에, 언어별 규칙 출력 조합은 `action_templates.js`에 있습니다. `i18n.js`는 표시 계층만 번역합니다. 데이터·필터 값·조건·Action ID·근거 ID·강도 ID는 공통입니다. 원문 근거 제목과 관광지 원명은 보존합니다.

## 기준

| 지표 | 최종 기준 |
|---|---|
| Scale | 법인 포함 전체 CNT의 전국 비중, 255개 지역 중앙값 |
| TVD | 개인 내국인(1,2) 대 외국인(3), 원래 11개 업종 AMT 구성, 법인 제외 |
| Momentum | 전체 거래의 `100×[지역 ln(H2/H1)−전국 ln(H2/H1)]`, CNT·ATV 각각 계산, log %p |
| Confidence | 3M·2M 부호 일치 및 작은 절대값이 `1.4826×MAD(M3−M2)` 초과; 두 축 Stable=High, 한 축=Medium, 없음=Low |
| Context | 외국인 방문/(외지인+외국인) 백분위 − 등록외국인/(주민등록인구+등록외국인) 백분위, 181일 완전관측 251개 표본 내 평균순위·삼분위 |

3M은 1~3월 대 4~6월, 2M은 1~2월 대 5~6월입니다. 화성시 동탄·만세·병점·효행구는 Context·백분위를 보류하고, 정책·관광·정주·국적 등 Context 기반 추천 없이 추가 관측 안내만 제공합니다. 관측 부족으로 Confidence 자체를 변경하지 않습니다.

권고 강도와 Action은 demo의 규칙 계층입니다. 노트북 계산으로 주장하지 않습니다. Confidence를 강도에 연결하고 전체 CNT 음(-)이면 한 단계 낮추는 기존 규칙을 유지합니다.

## 재생성

```powershell
python demo/build_final_data.py --data-root "<비공개 02_data 절대경로>"
```

numpy·pandas가 필요합니다. `build_demo_data.py`는 동일 인자를 받는 호환 진입점입니다. 원자료를 저장소에 복사하지 마세요. 로컬 BC 원자료·2026-06 MOJ/MOIS·KTO 2026H1 raw로 노트북 계산을 재현하고 다음 비 legacy CSV와 수치·라벨을 대조합니다.

- `derived/BC_action_matrix_recomputed_255.csv`
- `derived/BC_external_context_final_255.csv`
- `derived/BC_external_context_strict_251.csv`

일치 후 지역 집계 `data.js`와 `verification.json`을 생성합니다. 분류 전 반올림하지 않습니다. 파일 해시가 자산 URL에 반영되어 이전 배포 캐시와의 혼합을 방지합니다.

## 추가 기능의 출처

`supplemental.json`은 기존 Vercel 공개 자산의 관광·국적·군집·합성 폐업률과 공급 비교 기준 스냅샷입니다. 핵심 지표와 현재 공급 수치는 이 스냅샷에서 읽지 않습니다. 현재 공급은 `supply_data.json`의 공식 원본 재집계 값을 사용합니다.

- 공급 생성기는 `build_supply.py`, 명시적 소분류/행정구역 대응표는 `supply_mapping.json`, 공식 출처와 고정 SHA-256은 `supply-source.json`에 있습니다. 원래 배포 생성 스크립트는 복구하지 못했지만, 공식 2026-06-30 원본 2,772,484개 점포로 재현 가능한 과정을 구현·검증했습니다.
- 253개 지역의 8개 그룹 점포 수는 기존 배포와 일치합니다. 인천 중구·동구는 인천시 공식 개편표의 18개 행정동 기준으로 수정했습니다. 제물포구 7,082개 점포의 행정동/법정동 교차 확인도 통과했습니다. 비교 필드의 `all_*_match_existing=false`는 이 두 지역의 의도된 정정을 나타냅니다.
- 공급의 37개 소분류→8개 그룹은 분석용 대응표이며 기관의 공식 BC 매핑은 아닙니다. 미관측 대형마트 코드를 임의 포함하지 않으며, `대형·슈퍼`에는 슈퍼마켓과 기타 종합소매의 대리분류를 씁니다. 결제금액 비중−점포 수 비중은 미충족 수요의 직접 측정이 아닙니다.
- 폐업률은 합성, 관광지출액 단위는 천원 가정을 유지합니다.
- 추가 수요 기능의 8개 그룹 매핑은 `industry_mapping`과 데이터·가정 화면에 명시합니다. 핵심 TVD에는 병합하지 않습니다.
- 국적 분포는 전국 참고치이며 지역 국적 실측이 아닙니다.
- 정책·외부 근거는 기존 배포 스냅샷입니다. 온라인 원문/현행 공고 재검증은 하지 않았으며, 기존 가상 근거의 demo 표시를 유지합니다.

## 공급 재생성

```powershell
python demo/fetch_supply.py --output-dir "<demo 밖의 로컬 원본 저장 폴더>"
python demo/build_supply.py --source-zip "<원본 저장 폴더>/stores_20260630.zip"
python demo/build_final_data.py --data-root "<비공개 02_data 폴더>"
python demo/tests/test_supply.py
```

이미 원본 ZIP이 있으면 첫 명령은 생략합니다. 다운로드는 공식 포털 절차를 사용하며 인증문자가 필요하면 중단합니다. 원본 SHA-256, 16개 파일(전남·광주 통합), 업종 코드·명칭, ID 중복, 255개 지역 매칭, 8개 그룹 분모, 기존 집계 차이를 검사합니다. 미매칭 지역이나 제물포구 미등록 행정동을 비율로 임의 배분하지 않습니다. ZIP/CSV 원본은 demo나 공개 배포에 포함하지 않습니다.

공급 상세 검증은 `supply_verification.json`, 기존 핵심 지표 불변 및 인천 정정 요약은 `supply_integration_verification.json`에 있습니다. 원본 247개 업종의 포함·제외 내역도 공급 검증 파일에 기록합니다.

## 검증

`node demo/tests/verify_engine.cjs`로 3개 언어×255개 지역×3개 이해관계자(2,295개 출력)를 검사합니다. 언어 간 ID·근거·강도·시점 불변, Context 제한, 잘못된 근거·수치·강도·금지 표현 탐지, 모의 LLM 언어 프롬프트·응답 형식을 검사합니다.

`index.html?qa=1`은 실제 브라우저에서 전체 탭·언어·검색·필터·정렬·생성 결과 전환·차트 좌표/클릭/툴팁·390px 반응형 검사를 실행하고 상단 JSON에 표시합니다. 기본 화면에서는 실행하지 않습니다.

실제 유료 LLM 호출은 하지 않았습니다. 키는 탭 메모리에만 보관하며 사용자가 실행한 API 요청에만 전송합니다. 실키를 사용하는 모델 가용성·인증·CORS·실제 출력 품질은 별도 확인이 필요합니다.
