"""외국인 소비 성격에 따른 시군구 군집화.

EDA에서 제주(관광형)·수도권 산업단지(체류형)·서울 도심(도심형)의 외국인 업종
구성이 완전히 다르다는 점이 확인됐다. 이 스크립트는 그 관찰을 전국 시군구로
확장해, 외국인 결제의 '성격'만으로 지역을 군집화한다.

설계 노트
---------
* 특징은 **외국인 결제의 업종 구성비**(8개 그룹, 합 100%)만 쓴다. 외국인 비중과
  건단가는 군집을 만드는 데 넣지 않고 프로파일 지표로만 본다 — 지역 규모·수준이
  아니라 소비의 형태로 묶기 위해서다.
* 구성비는 합이 고정된 조성 데이터(compositional data)라 유클리드 거리를 그대로
  쓰면 안 된다. 중심 로그비(CLR) 변환 후 표준화한다.
* k는 실루엣 계수로 고르되, 값 자체는 0.19~0.23으로 낮다. 지역 소비 구성은
  연속적으로 변하므로 뚜렷한 경계가 있는 구조가 아니다. 이 군집은 통계적으로
  분리된 집단이 아니라 **해석을 위한 기술적 분류**로 사용해야 한다.

실행: python foreign_clusters.py
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from bc_data import REGION_KEYS, foreign, load

MIN_FOREIGN_AMT = 2e9   # 외국인 결제 20억원 미만 지역은 구성비가 불안정해 제외
MIX_GROUPS = ["한식", "대형·슈퍼", "편의점", "양식·카페", "중식", "일식·회", "분식·치킨", "제과·떡"]
K_RANGE = range(2, 9)
SEED = 42


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """시군구별 외국인 업종 구성비와 프로파일 지표."""
    f = foreign(df)
    total = df.groupby(REGION_KEYS, observed=True).agg(amt_all=("amt", "sum"), cnt_all=("cnt", "sum"))
    fr = f.groupby(REGION_KEYS, observed=True).agg(famt=("amt", "sum"), fcnt=("cnt", "sum"))
    mix = (
        f.pivot_table(index=REGION_KEYS, columns="buz_group", values="amt", aggfunc="sum")
        .reindex(columns=MIX_GROUPS)
        .fillna(0)
    )

    X = total.join(fr).join(mix)
    X = X[X["famt"] >= MIN_FOREIGN_AMT].copy()

    X[MIX_GROUPS] = X[MIX_GROUPS].div(X["famt"], axis=0) * 100
    X["foreign_share"] = X["famt"] / X["amt_all"] * 100
    X["ticket_ratio"] = (X["famt"] / X["fcnt"]) / (X["amt_all"] / X["cnt_all"])
    return X


def clr(pct: pd.DataFrame) -> np.ndarray:
    """중심 로그비 변환. 0 비중은 미세값으로 대체 후 재정규화한다."""
    p = pct.clip(lower=1e-2)
    p = p.div(p.sum(axis=1), axis=0)
    log_p = np.log(p)
    return (log_p.sub(log_p.mean(axis=1), axis=0)).to_numpy()


def choose_k(Z: np.ndarray) -> tuple[int, pd.DataFrame]:
    rows = []
    for k in K_RANGE:
        km = KMeans(n_clusters=k, n_init=25, random_state=SEED).fit(Z)
        rows.append({"k": k, "inertia": km.inertia_, "silhouette": silhouette_score(Z, km.labels_)})
    scores = pd.DataFrame(rows).set_index("k")
    return int(scores["silhouette"].idxmax()), scores


def name_cluster(r: pd.Series) -> str:
    """군집 평균 구성비를 보고 사람이 읽을 이름을 붙인다."""
    if r["중식"] >= 10:
        return "도심 화교상권형"
    if r["대형·슈퍼"] >= 50:
        return "산업단지 군지역형"
    if r["양식·카페"] >= 18:
        return "도심 상권형"
    if r["한식"] >= 30:
        return "외식·관광형"
    return "생활·체류형"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.unicode.east_asian_width", True)
    pd.set_option("display.width", 230)

    df = load()
    X = build_features(df)
    f_total = foreign(df)["amt"].sum()
    print(f"대상 시군구 {len(X)}개 / 전체 {df.groupby(REGION_KEYS).ngroups}개 "
          f"(외국인 결제 {MIN_FOREIGN_AMT/1e8:.0f}억원 이상)")
    print(f"대상 지역이 담는 외국인 금액 {X['famt'].sum()/f_total*100:.1f}%\n")

    Z = StandardScaler().fit_transform(clr(X[MIX_GROUPS]))
    k, scores = choose_k(Z)
    print("=== k 선택 (CLR 형태 공간, 실루엣 최대) ===")
    print(scores.to_string(float_format=lambda v: f"{v:,.3f}"))
    print(f"선택된 k = {k}   ※ 실루엣이 전 구간 0.3 미만 — 경계가 뚜렷한 구조가 아니라 기술적 분류로 볼 것\n")

    X["cluster"] = KMeans(n_clusters=k, n_init=25, random_state=SEED).fit_predict(Z)

    # 프로파일은 지역 평균이 아니라 군집 내 금액 가중 구성비로 낸다
    prof = X.groupby("cluster").apply(
        lambda d: pd.Series(
            {
                **{g: d[g].mul(d["famt"]).sum() / d["famt"].sum() for g in MIX_GROUPS},
                "지역수": len(d),
                "외국인비중": d["famt"].sum() / d["amt_all"].sum() * 100,
                "외국인금액(억)": d["famt"].sum() / 1e8,
                "건단가비": (d["famt"].sum() / d["fcnt"].sum()) / (d["amt_all"].sum() / d["cnt_all"].sum()),
            }
        ),
        include_groups=False,
    )
    prof.insert(0, "유형", [name_cluster(r) for _, r in prof.iterrows()])
    if prof["유형"].duplicated().any():
        raise RuntimeError(f"유형 이름이 중복됐다 — 명명 규칙 조정 필요: {list(prof['유형'])}")

    print("=== 군집 프로파일 (외국인 결제 금액 가중 구성비 %) ===")
    print(prof.sort_values("외국인금액(억)", ascending=False).to_string(float_format=lambda v: f"{v:,.1f}"))

    names = dict(zip(prof.index, prof["유형"]))
    X["유형"] = X["cluster"].map(names)

    print("\n=== 유형별 대표 지역 (외국인 결제금액 상위 7곳) ===")
    for cid in prof.sort_values("외국인금액(억)", ascending=False).index:
        sub = X[X["cluster"] == cid].sort_values("famt", ascending=False)
        print(f"[{names[cid]}] {len(sub)}개 지역 · 외국인 비중 {sub['famt'].sum()/sub['amt_all'].sum()*100:.1f}%")
        print("    " + ", ".join(f"{s} {c}" for s, c in sub.index[:7]))

    out = X.reset_index()[REGION_KEYS + ["유형", "foreign_share", "ticket_ratio", *MIX_GROUPS, "famt", "amt_all"]]
    out = out.sort_values(["유형", "famt"], ascending=[True, False])
    out.to_csv("외국인_시군구_유형.csv", index=False, encoding="utf-8-sig")
    print(f"\n저장: 외국인_시군구_유형.csv ({len(out)}행)")


if __name__ == "__main__":
    main()
