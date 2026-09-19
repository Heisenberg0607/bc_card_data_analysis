"""BC카드 소비 데이터 로더.

원자료(bc카드 데이터.csv)를 읽어 컬럼명을 표준화하고, 코드북 기준 라벨과
업종 재그룹핑을 붙여 반환한다. 분석 스크립트는 항상 이 모듈을 거쳐 데이터를 읽는다.

    from bc_data import load, domestic, foreign, known_demo
    df = load()
    df_dom = domestic(df)   # 성·연령 분석용 (남·여)

주의사항 (EDA에서 확인된 사항):
  * 원본 인코딩은 CP949. UTF-8로 읽으면 깨진다.
  * 코드북 표기(TPBUZ_NO / AMT / CNT)와 실제 헤더(TP_BUZ_NO / amt / cnt)가
    다르므로 COLUMN_MAP으로 통일한다.
  * CCG_NM은 단독 키가 아니다. 중구·동구 등이 여러 시도에 존재하므로
    지역 키는 반드시 (sido, ccg) 또는 region_key를 쓴다.
  * cnt 최솟값이 11이다. 10건 이하 셀은 비식별 절사로 제거되어 있으므로
    빈 격자를 0으로 채우면 안 된다.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATA_PATH = Path(__file__).resolve().parent / "bc카드 데이터.csv"
ENCODING = "cp949"

# 코드북 표기 및 원본 헤더 → 표준 컬럼명
COLUMN_MAP = {
    "STRD_YYMM": "ym",
    "SIDO_NM": "sido",
    "CCG_NM": "ccg",
    "GENDER_CD": "gender_cd",
    "AGE_CD": "age_cd",
    "TP_BUZ_NO": "buz_cd",
    "TPBUZ_NO": "buz_cd",
    "TP_BUZ_NM": "buz_nm",
    "TPBUZ_NM": "buz_nm",
    "amt": "amt",
    "AMT": "amt",
    "cnt": "cnt",
    "CNT": "cnt",
}

# GENDER_CD: 3은 외국인이다. 외국인은 성별이 제공되지 않아 남/여와 별도 코드를 받는다.
GENDER_LABEL = {"1": "남성", "2": "여성", "3": "외국인", "x": "성별 NULL"}

AGE_LABEL = {
    "1": "20대 이하",
    "2": "20대",
    "3": "30대",
    "4": "40대",
    "5": "50대",
    "6": "60대 이상",
    "x": "연령 누락",
}
AGE_ORDER = ["20대 이하", "20대", "30대", "40대", "50대", "60대 이상", "연령 누락"]

# 업종 상세분류(TPBUZ_DT_NM)를 반영한 재그룹핑.
#   * 8001·8002·8003은 상세분류 목록이 완전히 동일하다. 8001이 한식 계열 금액의
#     99.8%를 가져가고, 8002·8003은 건단가가 2배 이상인 고단가 가맹점만 별도
#     코드를 받은 구조이므로 buz_group에서는 '한식'으로 합치고 is_premium으로 구분한다.
#   * 4004(대형할인점)와 4020(슈퍼마켓)은 상세분류에 마트·할인마트가 겹쳐 경계가
#     흐리므로 '대형·슈퍼'로 합친다.
#   * 8006(서양음식)에는 카페·커피전문점·베이커리·디저트·패스트푸드가 포함된다.
#     양식당으로 읽으면 안 되므로 그룹명에 카페를 병기한다.
#   * 8301(제과점)에는 떡·한과·아이스크림이 포함된다. 8006의 '베이커리'와
#     겹치므로, 빵 상권을 볼 때는 BAKERY_OVERLAP 두 코드를 합산해서 본다.
BUZ_GROUP = {
    8001: "한식",
    8002: "한식",
    8003: "한식",
    8004: "일식·회",
    8005: "중식",
    8006: "양식·카페",
    8021: "분식·치킨",
    8301: "제과·떡",
    4004: "대형·슈퍼",
    4020: "대형·슈퍼",
    4010: "편의점",
}
BUZ_SECTOR = {c: ("유통" if c in (4004, 4010, 4020) else "요식") for c in BUZ_GROUP}
PREMIUM_HANSIK = {8002, 8003}   # 갈비전문점 · 한정식 (건단가 75,000원대)
BAKERY_OVERLAP = {8006, 8301}   # 베이커리가 양쪽 상세분류에 존재

# 모집단 상수. 세 갈래를 섞으면 지역·인구 비교가 왜곡된다.
GENDER_DOMESTIC = ("1", "2")    # 내국인 남·여   금액의 86.4%
GENDER_FOREIGN = ("3",)         # 외국인         금액의  7.4%
GENDER_NULL = ("x",)            # 성별·연령 동시 결측  금액의 6.1%

REGION_KEYS = ["sido", "ccg"]
CELL_KEYS = ["ym", "sido", "ccg", "buz_cd"]
FULL_KEYS = ["ym", "sido", "ccg", "gender_cd", "age_cd", "buz_cd"]


def load(path: str | Path = DATA_PATH, *, labels: bool = True) -> pd.DataFrame:
    """원자료를 표준 스키마로 읽어들인다.

    labels=True면 성별·연령 한글 라벨, 업종 그룹, 건단가(ticket)를 함께 붙인다.
    """
    df = pd.read_csv(path, encoding=ENCODING, dtype={"GENDER_CD": str, "AGE_CD": str})
    df = df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns})

    missing = {"ym", "sido", "ccg", "gender_cd", "age_cd", "buz_cd", "amt", "cnt"} - set(df.columns)
    if missing:
        raise ValueError(f"표준화 후에도 없는 컬럼: {sorted(missing)}")

    df["gender_cd"] = df["gender_cd"].str.lower()
    df["age_cd"] = df["age_cd"].str.lower()
    df["region_key"] = df["sido"] + " " + df["ccg"]

    if labels:
        df["gender"] = df["gender_cd"].map(GENDER_LABEL)
        df["age"] = pd.Categorical(df["age_cd"].map(AGE_LABEL), categories=AGE_ORDER, ordered=True)
        df["buz_group"] = df["buz_cd"].map(BUZ_GROUP)
        df["sector"] = df["buz_cd"].map(BUZ_SECTOR)
        df["is_premium_hansik"] = df["buz_cd"].isin(PREMIUM_HANSIK)
        df["ticket"] = df["amt"] / df["cnt"]

    return df


def domestic(df: pd.DataFrame) -> pd.DataFrame:
    """내국인 남·여. 성·연령 분석은 반드시 이 모집단으로."""
    return df[df["gender_cd"].isin(GENDER_DOMESTIC)]


def foreign(df: pd.DataFrame) -> pd.DataFrame:
    """외국인 결제. 성별·연령대는 제공되지 않는다(성별만 미제공, 연령은 있음)."""
    return df[df["gender_cd"].isin(GENDER_FOREIGN)]


def known_demo(df: pd.DataFrame) -> pd.DataFrame:
    """인구정보가 확인된 결제(내국인 + 외국인). 결측 X만 제외."""
    return df[~df["gender_cd"].isin(GENDER_NULL)]


def share_table(df: pd.DataFrame, by, value: str = "amt") -> pd.DataFrame:
    """by 기준 합계와 구성비를 함께 낸다."""
    g = df.groupby(by, observed=True).agg(amt=("amt", "sum"), cnt=("cnt", "sum"))
    g["share"] = g["amt"] / g["amt"].sum() * 100
    g["ticket"] = g["amt"] / g["cnt"]
    return g.sort_values("amt", ascending=False)


def region_profile(df: pd.DataFrame) -> pd.DataFrame:
    """시군구별 총액·건단가·외국인 비중·결측 비중을 한 표로."""
    g = df.groupby(REGION_KEYS, observed=True).apply(
        lambda d: pd.Series(
            {
                "amt": d["amt"].sum(),
                "cnt": d["cnt"].sum(),
                "ticket": d["amt"].sum() / d["cnt"].sum(),
                "foreign_share": d.loc[d["gender_cd"] == "3", "amt"].sum() / d["amt"].sum() * 100,
                "null_share": d.loc[d["gender_cd"] == "x", "amt"].sum() / d["amt"].sum() * 100,
            }
        ),
        include_groups=False,
    )
    return g.sort_values("amt", ascending=False)


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    d = load()
    print(f"{len(d):,}행 × {d.shape[1]}열   {d['ym'].min()} ~ {d['ym'].max()}")
    print(f"총 {d['amt'].sum()/1e12:.2f}조원 · {d['cnt'].sum()/1e8:.2f}억건 · 건단가 {d['amt'].sum()/d['cnt'].sum():,.0f}원")
    print(f"시군구 {d.groupby(REGION_KEYS).ngroups}개 · 업종 {d['buz_cd'].nunique()}개")
    print()
    print(share_table(d, "buz_group").to_string(float_format=lambda v: f"{v:,.1f}"))
