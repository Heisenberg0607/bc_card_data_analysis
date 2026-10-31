# 基于外国消费者消费结构的 BC Card 商圈诊断

本项目是一个分析与多语言 Action 仪表盘，连接 255 个地区的消费结构、交易变化及常住/到访需求背景。

[English](README.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

[打开已部署的仪表盘](https://bccarddataanalysis.vercel.app/) — 无需安装，即可通过浏览器查看本项目。

## 项目概述

- 问题定义：仅按外国消费者的消费金额或占比对地区排名，可能将消费结构和需求背景不同的商圈归为同一类型。因此，需要分别诊断商圈规模、消费结构、近期变化及外部背景。
- 解决方法：基于 2026 年 1~6 月 BC Card 汇总数据，将本国与外国消费者在各行业消费金额构成上的差异定义为 TVD，并结合各地区占全国交易笔数的比重，将商圈分为 4 类。将交易笔数（CNT）和单笔平均支付金额（ATV）的近期变化，减去同期全国变化后的数值定义为 Momentum，以观察地区的相对变化趋势。通过 Confidence 评估将比较窗口调整为 3 个月、2 个月时，变化方向与幅度是否仍然稳定。结合登记外国人、居民登记人口和到访者数据，区分常住与到访需求的相对优势，并将诊断结果连接至预先设定的行动规则和依据资料。作为可选功能，通过 API 调用外部语言模型 Qwen，使其基于诊断和依据生成行动方案说明。
- 成果使用：仪表盘支持对 255 个地区进行搜索、筛选和比较，并查看行业构成、交易变化、常住/到访背景及辅助供给指标。用户可查看面向银行卡机构、小微商户及地方政府的规则型 Action Card 和相关依据。完成服务器配置后，还可使用通过 Qwen API 调用生成行动方案说明的功能。

本项目是团队竞赛项目的分析成果与网页原型。定量分析以 [BC_analysis.ipynb](BC_analysis.ipynb) 为准，网页实现中增加的规则与辅助资料在[实现记录](demo/IMPLEMENTATION.md)中另行区分。

## 主要结果与代表图表

| 结果 | 数值与解释 |
|---|---|
| 分析范围 | 242,574 条汇总记录 · 255 个地区 · 11 个行业 · 2026 年 1~6 月 |
| 4 类商圈的跨期稳定性 | 1~3 月与 4~6 月的分类一致率为 92.2%，Cohen’s κ=0.893 |
| Momentum 的跨窗口相关性 | 3 个月与 2 个月：CNT Pearson r=0.983，ATV r=0.980 |
| TVD 的外部比较 | 与登记外国人占比的 Spearman ρ=0.714，n=255 |
| External Context | 251 个地区具备完整的 181 天观测；4 个地区暂缓分类 |
| 规则输出验证 | 3 种语言 × 255 个地区 × 3 类利益相关方 = 2,295 项输出检查 |

统计数值来自笔记本中保存的输出，本次文档编写未使用非公开原始数据重新估计。规则输出验证已在当前代码上重新执行，但这些结果并不衡量建议的实际效果或 LLM 回答质量。

### 1. 月度交易变化

![2026 年 1~6 月总交易笔数](docs/images/BC_figures_EN/figure_EN_01.png)

展示包括法人交易在内的全部交易笔数的月度变化。原始数据是汇总面板，而非单笔支付记录。

### 2. 基于 Scale × TVD 的 4 类商圈

![地区规模与消费结构差异](docs/images/BC_figures_EN/figure_EN_02.png)

将全国交易笔数占比与本国、外国消费者之间的消费结构差异分别处理。即使同为外国消费者消费的重要地区，济州市与灵岩郡的结构也有所不同。

### 3. 外国消费者消费规模的外部比较

![登记外国人数与 BC 外国消费者消费金额](docs/images/BC_figures_EN/figure_EN_03.png)

登记外国人数与外国消费者银行卡消费金额的 log1p 关系：Pearson r=0.875，OLS R²=0.766，n=255。不将其解释为因果关系或预测性能。

### 4. TVD 与登记外国人占比

![TVD 与登记外国人占比](docs/images/BC_figures_EN/figure_EN_04.png)

Spearman ρ=0.714。按 TVD 三分位分组，登记外国人占比的中位数依次为 1.58% → 2.83% → 4.81%。

### 5. 到访·常住背景与消费残差

![ContextGap 与 BC 外国消费者消费残差](docs/images/BC_figures_EN/figure_EN_05.png)

ContextGap 与无法由登记外国人规模解释的 log1p 消费金额残差之间的 Spearman ρ=0.369，n=251。该分析无法识别到访目的或因果关系。

这 5 张图在保留既有分析数值的基础上更新了样式并重新渲染。本 README 使用英文标注的图表。

## 个人贡献

本人在团队项目中负责以下工作。

- 问题定义
- 数据预处理
- 外部数据收集与整合
- 数据可视化与分析
- 为 MVP 网页增加多语言功能：支持韩语、英语和简体中文

## 数据与预处理

| 数据 | 范围与作用 |
|---|---|
| BC Card 竞赛数据 | 2026 年 1~6 月，242,574 行·9 列。按月 × 市/郡/区 × 性别/外国人 × 年龄 × 行业汇总 |
| 韩国法务部登记外国人、行政安全部居民登记人口 | 将 2026 年 6 月的地区指标整合至 255 个地区 |
| 韩国旅游发展局到访者数据 | 2026-01-01~2026-06-30，笔记本记录为 145,152 行；Context 严格样本 n=251 |
| 韩国小商工人市场振兴公团商铺信息 | 对截至 2026-06-30 的 2,772,484 家原始商铺重新汇总，作为辅助供给资料；将 37 个细分类别映射至 8 个分析组 |
| 辅助快照 | 旅游、国籍、聚类、政策参考资料及合成停业率，与核心分析和实测指标分开处理 |

清理地区名与行业名中的空格，并使用 `SIDO_NM + CCG_NM` 构建地区键。`GENDER_CD=1,2` 表示本国个人，`3` 表示外国人，`x` 表示法人。TVD 排除法人交易，Scale·Momentum 则包含法人交易。笔记本的基础质量检查中，缺失单元格为 0 个。

外国到访者占比的分母为 `外地本国到访者 + 外国人`，不包含本地居民。登记外国人占比为 `登记外国人数 /（居民登记人口 + 登记外国人数）`。华城市东滩、万岁、饼店、孝行区仅有 150 天观测，因此暂缓 Context 分类及基于 Context 的建议。

## 方法与设计理由

| 层次 | 定义与作用 |
|---|---|
| Structure | Scale=地区占全国总 CNT 的比重。TVD=本国与外国消费者在 11 个行业的 AMT 构成差异。分别以两项指标的中位数为界，划分为 4 类 |
| Momentum | 对 CNT·ATV 分别应用 `100 × [ln(地区后期/前期) − ln(全国后期/前期)]`。单位为 log %p |
| Confidence | 逐轴检查 3M·2M 符号是否一致，以及 `min(abs(M3), abs(M2)) > 1.4826 × MAD(M3−M2)`。两轴均 Stable=High，仅一轴=Medium，均不稳定=Low |
| External Context | `到访占比百分位 − 登记外国人占比百分位`。在 251 个完整观测地区内，依据平均秩与三分位分为常住主导型、混合型和到访主导型 |
| Action | 4 类 Structure × 3 类 Context × 3 类利益相关方，共 36 个基础单元，使用规则追踪与 Evidence ID。Context 暂缓分类地区单独作为观察对象处理 |
| 通过 Qwen API 生成说明 | 服务器根据地区 ID 和语言组织诊断与依据，再通过 API 调用 Qwen 语言模型，生成面向各类利益相关方的行动方案说明。数值计算与类型判定由分析逻辑完成，模型仅能解释提供的候选行动方案和依据。 |

$$TVD_r=\frac{1}{2}\sum_{k=1}^{11}|p_{D,rk}-p_{F,rk}|$$

中位数阈值为 Scale=0.003508129、TVD=0.169768457。规模与构成差异分别处理，短期变化通过独立指标衡量。3M 为 1~3 月对比 4~6 月，2M 为 1~2 月对比 5~6 月；笔记本中的 H1/H2 指这些前期、后期区间。

使用 Python/pandas·NumPy 进行汇总，使用 SciPy·statsmodels·scikit-learn 进行统计及一致性分析。网页采用 HTML/CSS/JavaScript、SVG 图表、通用规则引擎和三种语言的词典。Qwen API 调用由 Node.js 和 Vercel 服务器函数处理，将诊断与依据传递给模型，并在界面显示生成的行动方案说明。本项目不以实现嵌入检索、模型训练或微调为项目内容。

## 评估方法与结果

- 结构稳定性：比较了 255 个地区前期与后期的类型，并确认交易笔数 TVD 与金额 TVD 之间的 Spearman ρ=0.909。
- 外部比较：笔记本包含 Pearson·Spearman、5,000 次 bootstrap、Mann–Whitney 及 Kruskal–Wallis 检验。TVD 与登记外国人占比之间的 Spearman 95% bootstrap CI 为 [0.644, 0.772]。
- Context 比较：常住主导型、混合型、到访主导型的 TVD 中位数依次为 0.215 → 0.164 → 0.144。ContextGap 与消费残差的 Pearson r=0.363，而仅使用到访占比时为 r=0.011。
- 汇总核对：[verification.json](demo/verification.json) 记录了与基准 CSV 的核心标签一致性及浮点精度层面的差异。由于缺少非公开输入，本次工作未重新生成该文件。
- 实现检查：重新执行 `npm test`，通过了不同语言间 ID、依据、强度、时点的一致性检查，2,295 项规则输出检查，错误引用、数值、格式检查，服务器密钥不暴露检查以及模拟 API 响应检查。实际付费 API 调用次数为 0。

[规则验证记录](demo/engine-verification.json) · [供给验证摘要](demo/supply_integration_verification.json) · [测试代码](demo/tests/)

Confidence 是反映时间窗口稳定性的规则指标，并非统计置信概率。自动引用检查仅检查依据 ID 的使用，不保证外部资料的真实性或时效性。

## 安装与运行

### 使用已部署的网站

访问 [https://bccarddataanalysis.vercel.app/](https://bccarddataanalysis.vercel.app/)，无需安装或本地运行即可查看仪表盘。可在网站顶部选择韩语、英语或中文。以下本地运行说明是用于开发与复现的可选步骤。

### 运行仪表盘

以 Node.js 22.x 为基准，无需额外安装 npm 包。可使用已保存的汇总资料运行规则型功能。

```bash
git clone https://github.com/Heisenberg0607/bc_card_data_analysis.git
cd bc_card_data_analysis/demo
npm start
```


请访问 [http://localhost:3000](http://localhost:3000)。可使用 `?lang=ko`、`?lang=en` 或 `?lang=zh-CN` 选择初始语言。

### 配置 Qwen API 说明生成功能（可选）

将 `demo/.env.example` 复制为 `demo/.env.local`，设置 `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL` 和 `QWEN_MODEL` 后重启服务器。请在您使用的 DashScope 环境中确认要调用的 Qwen 模型及 API 地址。配置文件中的默认模型名称本身并不保证可用性。密钥从服务器环境变量读取，不提交至版本库。

Python 静态服务器仅支持规则型界面，无法运行调用 Qwen API 的说明生成功能。Vercel 配置为 Root Directory=`demo`、Framework=`Other`、Output Directory=`.`、Node.js=`22.x`。详细设置请参阅 [demo README](demo/README.md)。

### 复现分析与重新生成汇总数据

```bash
python -m pip install numpy pandas matplotlib scipy scikit-learn statsmodels jupyter
python demo/build_final_data.py --data-root "<PRIVATE_02_DATA_PATH>"
```


需要非公开 `02_data` 中的原始数据、外部数据及用于比较的 derived CSV。准确输入路径及供给数据重新汇总顺序请参阅[实现记录](demo/IMPLEMENTATION.md)。请根据您的环境修改笔记本的 `BASE` 和路径后再运行。上述包列表依据代码中的 import 编写，未提供固定版本环境。仅凭公开仓库无法从原始数据开始重新运行完整分析。

### 实现检查

```bash
cd demo
npm test
```


## 主要目录结构

| 路径 | 内容 |
|---|---|
| `BC_analysis.ipynb` | 最终分析定义、统计结果与图表 |
| `demo/index.html`、`app.js`、`charts.js`、`style.css` | 仪表盘与 SVG 可视化 |
| `demo/data.js`、`build_final_data.py` | 汇总资源及非公开输入的验证与生成 |
| `demo/kb.js`、`engine.js`、`action_templates.js` | 依据、36 个基础单元、规则及模板输出 |
| `demo/*locales.js`、`i18n.js` | 韩语、英语、中文展示层 |
| `demo/server/`、`api/qwen.mjs` | 本地服务器及通过 Qwen API 调用生成说明 |
| `demo/build_supply.py`、`supply_mapping.json` | 商铺数据重新汇总及分析用行业映射表 |
| `demo/tests/`、`*verification.json` | 实现检查与汇总验证记录 |
| `bc_data.py`、`foreign_clusters.py` | 独立的数据工具及聚类代码；最终指标以笔记本为准 |
| `docs/images/` | README 使用的 5 张笔记本图表的韩语及英语图片 |

`demo/` 下使用简写文件名列出的文件同样位于该目录内。

## 局限与改进方向

- 分析仅限于 BC Card、11 个行业和 6 个月的汇总数据，不保证代表整个市场、个人行为或因果效应。中位数与三分位属于样本内的相对分类。
- 到访者数据不识别访问目的。不将到访主导型直接视为旅游型，对观测不足的 4 个地区暂缓分类。
- 辅助停业率为合成数据，国籍为全国参考分布，并非地区实测数据。旅游支出单位采用千韩元假设。政策依据包含演示用虚构条目和历史快照，作为现行扶持项目使用前需核对原文。
- 8 个供给组是分析用映射，与核心的 11 个 TVD 行业有所区别。支付金额占比减去商铺数量占比，不能直接衡量未满足需求或经营收益率。
- 调用 Qwen API 的说明生成功能仅使用模拟响应验证。尚未验证实际模型的认证、可用性、回答质量、成本、延迟以及建议的商业效果。当前公开 API 路径缺少用户认证和持久调用次数限制，因此还需要由部署方实施成本控制。
- 后续任务：长期及外部时段验证、对实际 LLM 回答进行人工评估、替换合成指标、更新依据、验证试点效果，以及增加认证和调用限制。

## 仓库、参考资料与使用条件

- [作品集仓库](https://github.com/Heisenberg0607/bc_card_data_analysis)
- [最终分析笔记本](BC_analysis.ipynb) · [运行说明](demo/README.md) · [实现与数据定义](demo/IMPLEMENTATION.md)
- [商铺信息官方来源](https://www.data.go.kr/data/15083033/fileData.do) · [来源与哈希记录](demo/supply-source.json)
