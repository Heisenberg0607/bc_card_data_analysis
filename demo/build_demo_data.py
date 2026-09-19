"""웹 데모용 지역 진단 패킷(data.js) 생성기.

BC 거래데이터   → Structure·Momentum·Confidence (실데이터)
법무부 등록외국인 → 전국 총량·국적 구성 (실데이터. 시군구 분포는 원자료에 없음)
한국관광 데이터랩 → 시군구 체류특성·관광지 Top100·시도 관광지표·전국 외국인 방문/소비 (실데이터)
등록외국인 시군구 분포·주민등록인구·상권공급·폐업률 → 합성값 (데모용, 화면에 '합성' 표시)
시군구 외국인 방문자 → 추정값 (데이터랩 전국 실측 총량을 시군구 관광지표로 배분)

실행: python demo/build_demo_data.py   → demo/data.js
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from bc_data import REGION_KEYS, load  # noqa: E402
import tourism  # noqa: E402  한국관광 데이터랩

GROUPS = ["한식", "대형·슈퍼", "편의점", "양식·카페", "중식", "일식·회", "분식·치킨", "제과·떡"]
MOJ_PATH = ROOT / "법무부_28(장기체류외국인_등록) 월별 등록외국인 국적(지역)별 현황_20260731.csv"
CLUSTER_PATH = ROOT / "외국인_시군구_유형.csv"

SCALE_Q = 0.70       # 외국인 결제금액 상위 30% = 대규모
MOM_BAND = 0.05      # ±5% 이내는 '안정'
MIN_CONF_AMT = 2e9   # 외국인 결제 20억 미만은 Confidence 1단계 하향 (foreign_clusters.py와 동일 기준)
VISITOR_CUT = 2.0    # Visitor Intensity(전국 평균=1) ≥ 2 → 방문형
POP_TOTAL = 51_200_000  # 주민등록인구 총량(가정) — 시군구 배분은 합성

# ── 합성 Context 보정용 사전 가정 (데모 전용, 실제 구현 시 관광데이터랩·법무부 시군구 통계로 대체) ──
TOURIST = {
    ("제주특별자치도", "제주시"): 9, ("제주특별자치도", "서귀포시"): 9, ("서울특별시", "중구"): 8,
    ("서울특별시", "종로구"): 7, ("서울특별시", "마포구"): 6, ("서울특별시", "용산구"): 5,
    ("서울특별시", "강남구"): 4, ("서울특별시", "송파구"): 3, ("서울특별시", "서초구"): 2.5,
    ("부산광역시", "해운대구"): 6, ("부산광역시", "중구"): 6, ("부산광역시", "부산진구"): 3,
    ("부산광역시", "수영구"): 3, ("강원특별자치도", "강릉시"): 4, ("강원특별자치도", "속초시"): 5,
    ("강원특별자치도", "평창군"): 4, ("경상북도", "경주시"): 5, ("전북특별자치도", "전주시 완산구"): 3,
    ("인천광역시", "중구"): 5, ("경기도", "수원시 팔달구"): 2.5, ("전라남도", "여수시"): 3.5,
    ("대구광역시", "중구"): 3,
}
RESIDENT_HEAVY = {
    ("경기도", "안산시 단원구"): 3.0, ("경기도", "화성시"): 2.2, ("경기도", "시흥시"): 2.2,
    ("경기도", "김포시"): 1.8, ("경기도", "평택시"): 1.8, ("경기도", "포천시"): 2.4,
    ("전라남도", "영암군"): 1.4, ("경상남도", "김해시"): 2.0, ("충청북도", "음성군"): 1.8,
    ("충청북도", "진천군"): 2.6, ("충청남도", "아산시"): 1.8, ("서울특별시", "영등포구"): 2.0,
    ("서울특별시", "구로구"): 2.0, ("서울특별시", "금천구"): 2.2, ("경상북도", "경산시"): 1.6,
    ("경기도", "안산시 상록구"): 1.8, ("충청남도", "천안시 서북구"): 1.6, ("경상남도", "거제시"): 2.0,
    ("울산광역시", "동구"): 1.8, ("전북특별자치도", "군산시"): 1.5, ("경기도", "이천시"): 1.8,
    ("경기도", "안성시"): 2.0, ("경기도", "양주시"): 1.8, ("경상북도", "구미시"): 1.5,
}
CLOSURE_BASE = {"한식": .11, "대형·슈퍼": .06, "편의점": .08, "양식·카페": .14,
                "중식": .10, "일식·회": .12, "분식·치킨": .16, "제과·떡": .13}


def noise(key: str, lo: float, hi: float) -> float:
    """지역명 해시 기반 결정적 난수 — 몇 번을 실행해도 같은 합성값이 나온다."""
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h


def trend(a: float, b: float) -> float:
    return b / a - 1 if a else 0.0


def direction(x: float) -> str:
    return "상승" if x > MOM_BAND else ("하락" if x < -MOM_BAND else "안정")


def confidence(d3: str, d2: str, d1: str) -> str:
    """기간창(3개월·2개월·1개월 블록)을 바꿔도 CNT 방향이 유지되는지."""
    if {"상승", "하락"} <= {d3, d2, d1}:
        return "Low"          # 반대 방향 신호가 섞임
    if d3 == d2 == d1:
        return "High"
    if d3 == d2:
        return "Medium"
    return "Low"


def validation(bc_cnt: pd.Series, bc_amt: pd.Series, TN: dict) -> dict:
    """BC 외국인 결제 월별 추세와 데이터랩 외국인 방문·관광소비 추세의 일치도 (외부 타당성)."""
    ym = [str(k) for k in bc_cnt.index]
    fv = pd.Series([TN["foreign_visitors"].get(k) for k in ym], dtype=float)
    fs = pd.Series([TN["foreign_spend"].get(k) for k in ym], dtype=float)
    fb = pd.Series([TN["foreign_spend_by_ind"].get("식음료업", {}).get(k) for k in ym], dtype=float)
    c, a = pd.Series(bc_cnt.to_numpy(), dtype=float), pd.Series(bc_amt.to_numpy(), dtype=float)
    h = lambda x: float(x[3:].sum() / x[:3].sum() - 1)  # noqa: E731
    return {
        "r_cnt_visitors": round(float(c.corr(fv)), 3),
        "r_amt_spend": round(float(a.corr(fs)), 3),
        "r_amt_food": round(float(a.corr(fb)), 3),
        "h2h1": {"bc_cnt": round(h(c) * 100, 1), "bc_amt": round(h(a) * 100, 1),
                 "visitors": round(h(fv) * 100, 1), "spend": round(h(fs) * 100, 1), "food": round(h(fb) * 100, 1)},
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    df = load()
    df["month"] = df["ym"] % 100
    months = sorted(df["month"].unique())

    f = df[df["gender_cd"] == "3"]
    d = df[df["gender_cd"].isin(["1", "2"])]

    def piv(frame, cols, val):
        return frame.pivot_table(index=REGION_KEYS, columns=cols, values=val, aggfunc="sum")

    tot = df.groupby(REGION_KEYS).agg(amt_all=("amt", "sum"), cnt_all=("cnt", "sum"))
    fr = f.groupby(REGION_KEYS).agg(famt=("amt", "sum"), fcnt=("cnt", "sum"))
    X = tot.join(fr).fillna(0)
    idx = X.index

    fmix = piv(f, "buz_group", "amt").reindex(index=idx, columns=GROUPS).fillna(0)
    dmix = piv(d, "buz_group", "amt").reindex(index=idx, columns=GROUPS).fillna(0)
    dcnt = piv(d, "buz_group", "cnt").reindex(index=idx, columns=GROUPS).fillna(0)
    fm_amt = piv(f, "month", "amt").reindex(index=idx, columns=months).fillna(0)
    fm_cnt = piv(f, "month", "cnt").reindex(index=idx, columns=months).fillna(0)
    am_amt = piv(df, "month", "amt").reindex(index=idx, columns=months).fillna(0)

    fp = fmix.div(fmix.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)
    dp = dmix.div(dmix.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)
    X["tvd"] = 0.5 * (fp - dp).abs().sum(axis=1)   # 외국인 vs 내국인 업종구성 괴리

    scale_cut = X["famt"].quantile(SCALE_Q)
    tvd_cut = X["tvd"].median()
    clusters = pd.read_csv(CLUSTER_PATH).set_index(REGION_KEYS)["유형"]

    # ── 법무부 실데이터: 전국 총량·국적 ──
    moj = pd.read_csv(MOJ_PATH, encoding="cp949")
    moj["ym"] = moj["년"] * 100 + moj["월"]
    nat_series = moj.groupby("ym")["등록외국인수"].sum()
    latest = int(nat_series.index.max())
    nat_total = float(nat_series.loc[latest])
    top_nat = moj[moj["ym"] == latest].sort_values("등록외국인수", ascending=False).head(10)
    bc_ym = sorted(int(v) for v in df["ym"].unique())
    bc_f_cnt = f.groupby("ym")["cnt"].sum()
    bc_f_amt = f.groupby("ym")["amt"].sum()
    T = tourism.load(list(X.index))
    TN = T["national"]
    SQ = TN["stay_quantiles"]

    # ── 합성 등록외국인 시군구 분포: 외국인 결제건수 × 정주가중치를 전국 총량에 맞춰 배분 ──
    w = {}
    for k, r in X.iterrows():
        mult = RESIDENT_HEAVY.get(k, 1.0) / (1 + 0.25 * TOURIST.get(k, 0))
        if clusters.get(k) == "산업단지 군지역형":
            mult *= 1.8
        w[k] = (r["fcnt"] + 2000) * mult * noise(f"res{k}", 0.75, 1.25)
    wsum = sum(w.values())
    amt_total = X["amt_all"].sum()

    # ── 시군구 외국인 방문자 추정: 데이터랩 전국 외국인 방문자(월평균, 실측)를 관광 가중치로 배분 ──
    #    가중치 = BC 외국인 결제건수 × (관광지 사전가정) × (데이터랩 Top100 관광지 수) × (데이터랩 숙박일수/중앙값)^3
    fv_month = sum(TN["foreign_visitors"].values()) / len(TN["foreign_visitors"])
    vw = {}
    for k, r in X.iterrows():
        st = T["stay_of"](k)
        nights_f = (st[1] / SQ["nights_med"]) ** 3 if st else 1.0
        n_attr = len(T["attractions"].get(k, []))
        vw[k] = (r["fcnt"] + 2000) * (1 + TOURIST.get(k, 0)) * (1 + 0.4 * n_attr) * nights_f
    vwsum = sum(vw.values())
    vi_base = fv_month / nat_total          # 전국 평균: 등록외국인 1명당 월 외국인 방문

    # 1~6월은 계절성(2월 저점·봄 성수기)이 커서 절대 증감률은 거의 모든 지역이 '상승'으로 나온다.
    # 전국 외국인 추세 대비 초과 증감률(relative momentum)로 방향을 판정한다.
    nat_c = fm_cnt.sum().to_numpy()
    nat_a = fm_amt.sum().to_numpy()
    nat_atv = lambda i, j: nat_a[i:j].sum() / nat_c[i:j].sum()  # noqa: E731
    nat_cnt3 = trend(nat_c[:3].sum(), nat_c[3:].sum())
    nat_cnt2 = trend(nat_c[:2].sum(), nat_c[4:].sum())
    nat_cnt1 = trend(nat_c[0], nat_c[5])
    nat_atv3 = trend(nat_atv(0, 3), nat_atv(3, 6))
    rel = lambda g, base: (1 + g) / (1 + base) - 1  # noqa: E731

    regions = []
    for k, r in X.iterrows():
        s, c = k
        key = f"{s} {c}"
        reg_foreigners = round(nat_total * w[k] / wsum)
        population = round(POP_TOTAL * r["amt_all"] / amt_total * noise(f"pop{key}", 0.8, 1.2) + 20000)
        visitors = round(fv_month * vw[k] / vwsum)
        visitor_int = visitors / max(reg_foreigners, 1) / vi_base   # 전국 평균 = 1
        st = T["stay_of"](k)
        if st is None:
            stay_type = None
        elif st[1] >= SQ["nights_q75"]:
            stay_type = "숙박 체류형"
        elif st[0] <= SQ["dwell_q25"]:
            stay_type = "단시간 방문형"
        else:
            stay_type = "일반"
        sd = T["sido_of"](s)

        # 합성 공급(LOCALDATA 대체): 내국인 결제건수 구성 기반 점포 비중 + 노이즈
        raw = {g: max(dcnt.loc[k, g], 1) ** 0.85 * noise(f"sup{key}{g}", 0.8, 1.25) for g in GROUPS}
        rs = sum(raw.values())
        supply = {g: raw[g] / rs for g in GROUPS}
        stores_total = round(population / 95 * noise(f"st{key}", 0.85, 1.15))
        demand = {g: float(fp.loc[k, g]) for g in GROUPS}

        # Momentum: H1(1~3월) vs H2(4~6월), Confidence용 2개월·1개월 블록
        ma, mc = fm_amt.loc[k].to_numpy(), fm_cnt.loc[k].to_numpy()
        atv = lambda a, b: a.sum() / max(b.sum(), 1)  # noqa: E731
        cnt3 = rel(trend(mc[:3].sum(), mc[3:].sum()), nat_cnt3)
        atv3 = rel(trend(atv(ma[:3], mc[:3]), atv(ma[3:], mc[3:])), nat_atv3)
        cnt2 = rel(trend(mc[:2].sum(), mc[4:].sum()), nat_cnt2)
        cnt1 = rel(trend(mc[0], mc[5]), nat_cnt1)
        d3, d2, d1 = direction(cnt3), direction(cnt2), direction(cnt1)
        conf = confidence(d3, d2, d1)
        notes = []
        if r["famt"] < MIN_CONF_AMT:
            conf = {"High": "Medium", "Medium": "Low", "Low": "Low"}[conf]
            notes.append("외국인 결제 20억 미만 → 1단계 하향")

        structure = ("대규모" if r["famt"] >= scale_cut else "소규모") + "·" + \
                    ("고괴리" if r["tvd"] >= tvd_cut else "저괴리")
        cl = clusters.get(k)
        industrial = cl == "산업단지 군지역형" or demand["대형·슈퍼"] + demand["편의점"] >= 0.55
        context = "방문형" if visitor_int >= VISITOR_CUT else "정주형"
        sub = "관광" if context == "방문형" else ("산업" if industrial else "생활")

        regions.append({
            "id": key, "sido": s, "ccg": c,
            "famt": int(r["famt"]), "fcnt": int(r["fcnt"]), "amt_all": int(r["amt_all"]),
            "foreign_share": round(r["famt"] / r["amt_all"] * 100, 2),
            "tvd": round(float(r["tvd"]), 4),
            "structure": structure,
            "momentum": {"cnt": d3, "atv": direction(atv3),
                         "cnt_pct": round(float(cnt3) * 100, 1), "atv_pct": round(atv3 * 100, 1),
                         "cnt2_pct": round(cnt2 * 100, 1), "cnt1_pct": round(cnt1 * 100, 1)},
            "confidence": conf,
            "conf_detail": {"block3": d3, "block2": d2, "block1": d1, "notes": notes},
            "context": context, "context_sub": sub, "cluster": cl if isinstance(cl, str) else None,
            "monthly": {"famt": [int(v) for v in ma], "fcnt": [int(v) for v in mc],
                        "amt_all": [int(v) for v in am_amt.loc[k].to_numpy()]},
            "mix_foreign": {g: round(demand[g] * 100, 2) for g in GROUPS},
            "mix_domestic": {g: round(float(dp.loc[k, g]) * 100, 2) for g in GROUPS},
            "tour": {  # 한국관광 데이터랩 실데이터
                "dwell_min": st[0] if st else None, "nights": st[1] if st else None, "stay_type": stay_type,
                "dwell_pct": st[2] if st else None, "nights_pct": st[3] if st else None,
                "stay_matched_to": tourism.datalab_ccg(c) if st and " " in c else None,
                "attractions": sorted(T["attractions"].get(k, []), key=lambda a: a["rank"]),
                "sido": {kk: (None if isinstance(v, float) and v != v else v) for kk, v in sd.items()},
            },
            "ext": {  # ↓ 합성·추정값
                "reg_foreigners": reg_foreigners, "population": population,
                "resident_intensity": round(reg_foreigners / (population + reg_foreigners) * 100, 2),
                "visitors": visitors, "visitor_intensity": round(visitor_int, 2),   # 방문자: 데이터랩 전국 총량 배분 추정
                "stores_total": stores_total,
                "stores": {g: round(stores_total * supply[g]) for g in GROUPS},
                "supply_share": {g: round(supply[g] * 100, 2) for g in GROUPS},
                "supply_gap": {g: round((demand[g] - supply[g]) * 100, 2) for g in GROUPS},
                "closure_risk": {g: round(CLOSURE_BASE[g] * noise(f"cl{key}{g}", 0.7, 1.4) * 100, 1) for g in GROUPS},
            },
        })

    meta = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
        "bc_period": f"{bc_ym[0]}~{bc_ym[-1]}", "months": bc_ym,
        "n_regions": len(regions), "groups": GROUPS,
        "thresholds": {"scale_cut": int(scale_cut), "tvd_cut": round(float(tvd_cut), 4),
                       "mom_band_pct": MOM_BAND * 100, "min_conf_amt": MIN_CONF_AMT,
                       "visitor_cut": VISITOR_CUT, "stay": SQ},
        "national_momentum": {"cnt_pct": round(nat_cnt3 * 100, 1), "atv_pct": round(nat_atv3 * 100, 1),
                              "cnt2_pct": round(nat_cnt2 * 100, 1), "cnt1_pct": round(nat_cnt1 * 100, 1)},
        "national": {
            "total_famt": int(X["famt"].sum()), "total_amt": int(X["amt_all"].sum()),
            "bc_foreign_cnt": {str(k): int(v) for k, v in bc_f_cnt.items()},
            "moj_latest": latest, "moj_total": int(nat_total),
            "moj_series": {str(k): int(v) for k, v in nat_series.items()},
            "moj_top": [{"nat": n, "n": int(v)} for n, v in zip(top_nat["국적지역"], top_nat["등록외국인수"])],
            "bc_foreign_amt": {str(k): int(v) for k, v in bc_f_amt.items()},
            "tourism": TN,
            "validation": validation(bc_f_cnt, bc_f_amt, TN),
        },
    }
    out = Path(__file__).with_name("data.js")
    out.write_text("window.BC_DATA = " + json.dumps({"meta": meta, "regions": regions}, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    print(f"저장: {out} ({out.stat().st_size / 1024:.0f} KB, {len(regions)}개 지역)")

    R = pd.DataFrame(regions)
    for col in ["structure", "confidence", "context", "context_sub"]:
        print(R[col].value_counts().to_dict())
    for name in ["전라남도 영암군", "제주특별자치도 제주시", "경기도 안산시 단원구", "서울특별시 중구", "경기도 화성시"]:
        x = next((q for q in regions if q["id"] == name), None)
        if x:
            print(name, x["structure"], x["momentum"], x["confidence"], x["context"], x["context_sub"],
                  x["ext"]["resident_intensity"], x["ext"]["visitor_intensity"], x["tour"]["stay_type"],
                  [a["name"] for a in x["tour"]["attractions"]])
    print("방문형:", [q["id"] for q in regions if q["context"] == "방문형"])
    print("관광지 미매칭:", TN["attractions_unmatched"])
    print("검증:", meta["national"]["validation"])


if __name__ == "__main__":
    main()
