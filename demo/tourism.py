"""한국관광 데이터랩 다운로드 파일 로더.

폴더 3개(지역별 관광현황 / 외국인 관광소비 / 외국인 방문자 현황)의 CSV를 읽어
BC 시군구 키(sido, ccg)에 맞춰 정리한다. 파일명 앞의 다운로드 시각(20260919120455_ 등)은
바뀔 수 있으므로 뒷부분 이름으로 찾는다.

데이터 수준 (다운로드 기준)
  * 시군구: 방문자 체류특성(평균 체류시간·숙박일수), 관광지 검색순위 Top100(주소)
  * 시도  : 방문자수, 관광지출액, 목적지 검색건수, 방문자수 증가율
  * 전국  : 외국인 방문자수(월), 국가별 방문 비율, 외국인 관광소비(월·업종), 국가별 소비 비율,
            관광소비 유형, 외국인 간편결제(국적·업종)
  * 미사용: '지역 방문자수_관광지출액 추세', '국내관광 관심도 추이' (지역명 미표기),
            '성·연령별방문자' (10대 인기지역 5곳만 포함)
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DIR_REGION = ROOT / "지역별 관광현황"
DIR_SPEND = ROOT / "외국인 관광소비"
DIR_VISIT = ROOT / "외국인 방문자 현황"

MERGED = "전남광주통합특별시"   # 데이터랩 표기: 전라남도 + 광주광역시 통합
SIDO_SHORT = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}
UNUSED = [
    ("지역 방문자수_관광지출액 추세", "파일에 지역명이 없어 어느 지역 값인지 확정할 수 없음"),
    ("국내관광 관심도 추이", "파일에 지역명이 없음"),
    ("성·연령별방문자_연령별", "10대 인기 방문지 5곳만 포함 — 외국인 상권 진단과 무관"),
]


def _find(folder: Path, name: str) -> Path:
    """'<다운로드시각>_<name>' 파일 중 최신. 이름이 다른 파일의 접미사여도 섞이지 않게 정확히 비교."""
    hits = sorted(p for p in folder.glob("*.csv") if p.name.split("_", 1)[-1] == name)
    if not hits:
        raise FileNotFoundError(f"{folder.name}/*_{name} 파일이 없습니다")
    return hits[-1]


def _read(folder: Path, suffix: str) -> pd.DataFrame:
    return pd.read_csv(_find(folder, suffix), encoding="utf-8-sig")


def datalab_sido(sido: str) -> str:
    """BC 시도명 → 데이터랩 통합 시도명 (전남·광주 통합 파일용)."""
    return MERGED if sido in ("전라남도", "광주광역시") else sido


def datalab_ccg(ccg: str) -> str:
    """BC 시군구 → 데이터랩 시군구. 일반구(고양시 덕양구)는 상위 시(고양시)로 집계되어 있다."""
    return ccg.split()[0] if " " in ccg else ccg


def load(bc_keys: list[tuple[str, str]]) -> dict:
    keys = set(bc_keys)

    # ── 시군구: 체류특성 ──
    stay = _read(DIR_REGION, "방문자 체류특성.csv")
    stay["시군구명"] = stay["시군구명"].fillna(stay["시도명"])      # 세종은 시군구명이 비어 있음
    stay["dwell_pct"] = stay["평균 체류시간"].rank(pct=True) * 100   # 229개 시군구 내 백분위
    stay["nights_pct"] = stay["평균 숙박일수"].rank(pct=True) * 100
    stay_map = {(r.시도명, r.시군구명): (float(r["평균 체류시간"]), float(r["평균 숙박일수"]),
                                    round(float(r["dwell_pct"])), round(float(r["nights_pct"]))) for _, r in stay.iterrows()}

    def stay_of(k):
        s, c = k
        return stay_map.get((datalab_sido(s), datalab_ccg(c))) or stay_map.get((datalab_sido(s), c))

    # ── 시군구: 관광지 검색순위 Top100 → 주소로 BC 시군구 매칭 ──
    top = _read(DIR_REGION, "표_관광지검색순위.csv")
    attractions: dict[tuple[str, str], list[dict]] = {}
    unmatched = []
    for _, r in top.iterrows():
        tok = str(r["주소"]).split()
        sido = SIDO_SHORT.get(tok[0])
        cand = ([(sido, f"{tok[1]} {tok[2]}")] if len(tok) > 2 else []) + ([(sido, tok[1])] if sido and len(tok) > 1 else [])
        if tok[0] == "세종":
            cand = [("세종특별자치시", "세종특별자치시")]
        k = next((c for c in cand if c in keys), None)
        if k is None:
            unmatched.append(r["관광지명"])
            continue
        attractions.setdefault(k, []).append(
            {"rank": int(r["순위"]), "name": r["관광지명"], "cat": r["중분류"], "sub": r["소분류"]})

    # ── 시도 ──
    visitors = _read(DIR_REGION, "방문자수.csv").set_index("시도명")["방문자수"]
    spend = _read(DIR_REGION, "관광지출액.csv").set_index("시도명")["관광지출액"]
    search = _read(DIR_REGION, "목적지검색건수.csv").set_index("시도명")["검색건수"]
    growth = _read(DIR_REGION, "표_방문자수최다지역.csv").set_index("시도명")["증가율(%)"]

    def sido_of(s):
        m = datalab_sido(s)
        return {
            "visitors": float(visitors.get(s, float("nan"))),
            "spend": float(spend.get(s, spend.get(m, float("nan")))),
            "search": float(search.get(s, search.get(m, float("nan")))),
            "growth": float(growth.get(s, float("nan"))),
            "merged": s not in spend.index and m in spend.index,
        }

    # ── 전국: 외국인 ──
    fv = _read(DIR_VISIT, "외국인 방문자수 CSV 다운로드.csv")
    fv_nat = {str(int(r["기준년월일"])): float(r["방문자 수"]) for _, r in fv.iterrows()}
    visit_nat = _read(DIR_VISIT, "국가별 외국인 방문 현황 CSV 다운로드.csv")
    spend_trend = _read(DIR_SPEND, "업종별 관광소비 추이 CSV 다운로드.csv")
    spend_trend["ym"] = spend_trend["기준년월일"].astype(int).astype(str)
    fs_total = spend_trend[spend_trend["업종별 구분"] == "전체"].set_index("ym")["소비액(천원)"]
    fs_ind = (spend_trend[spend_trend["업종별 구분"] != "전체"]
              .pivot_table(index="ym", columns="업종별 구분", values="소비액(천원)", aggfunc="sum"))
    spend_type = _read(DIR_SPEND, "관광소비 유형 CSV 다운로드.csv")
    spend_major = (spend_type.drop_duplicates("카테고리 대분류")
                   .set_index("카테고리 대분류")["카테고리 대분류 소비 비율"].sort_values(ascending=False))
    spend_nat = _read(DIR_SPEND, "국가별 관광소비 유형 CSV 다운로드.csv").sort_values("소비 비율", ascending=False)
    easy_nat = _read(DIR_SPEND, "외국인 간편결제 국적별 관광소비 CSV 다운로드.csv")
    easy = _read(DIR_SPEND, "외국인 간편결제 업종별 관광소비 추이 CSV 다운로드.csv")
    easy_tot = easy[easy["업종"] != "전체"].groupby("업종")["소비금액(천원)"].sum().sort_values(ascending=False)

    national = {
        "foreign_visitors": fv_nat,                                   # 월별 (시군구 방문 합계 기준)
        "foreign_spend": {k: float(v) * 1000 for k, v in fs_total.items()},   # 원
        "foreign_spend_by_ind": {ind: {k: float(v) * 1000 for k, v in fs_ind[ind].items()} for ind in fs_ind.columns},
        "spend_major_pct": {k: float(v) for k, v in spend_major.items()},
        "spend_minor": [{"major": r["카테고리 대분류"], "minor": r["카테고리 중분류"], "pct": float(r["카테고리 중분류 소비 비율"])}
                        for _, r in spend_type.iterrows()],
        "visit_nat": [{"nat": r["국가"], "pct": float(r["방문자 비율"])} for _, r in visit_nat.iterrows()],
        "spend_nat": [{"nat": r["국가"], "pct": float(r["소비 비율"])} for _, r in spend_nat.iterrows()],
        "easy_nat": [{"nat": r["국적"], "pct": float(r["비율"])} for _, r in easy_nat.iterrows()],
        "easy_ind_pct": {k: round(float(v) / float(easy_tot.sum()) * 100, 1) for k, v in easy_tot.items()},
        "sido": {s: {"visitors": float(visitors[s]), "growth": float(growth.get(s, float("nan")))} for s in visitors.index},
        "unused": UNUSED,
        "attractions_unmatched": unmatched,
    }
    dwell = stay["평균 체류시간"]
    nights = stay["평균 숙박일수"]
    national["stay_quantiles"] = {
        "dwell_q25": float(dwell.quantile(.25)), "dwell_med": float(dwell.median()), "dwell_q75": float(dwell.quantile(.75)),
        "nights_q25": float(nights.quantile(.25)), "nights_med": float(nights.median()), "nights_q75": float(nights.quantile(.75)),
    }
    return {"stay_of": stay_of, "attractions": attractions, "sido_of": sido_of, "national": national}
