# 对账工具 —— 代码库认知报告

> 标注体例：【事实】= 代码可直接验证；【推断】= 基于代码合理推测，未经确认；【待确认】= 需产品/开发确认的模糊点。
> 治理裁决链：constitution > AGENTS > CLAUDE.md > 代码。本报告为「认知快照」，非规范来源。
> 最后同步：以当前 `index.html`（约 3176 行）为准。

---

## 1. 项目概述

【事实】纯前端、零构建、单文件（`index.html`）的浏览器端 Excel/CSV 分析工具。通过顶部三个 Tab 提供三类相互独立的能力：

| Tab | 名称 | 定位 | 核心入口 |
|-----|------|------|----------|
| Tab1 | 经营分析 | 单表数据质量校验 + 仪表盘 | `handleFile`（:1209） |
| Tab2 | 资源包抵扣 | 多文件趋势「透视图」分析（按列名跨文件自适应） | `handleResourceFiles`（:1505） |
| Tab3 | 资源包测算 | 资源包列表查询 / 测算（含推荐预留位） | `handleCalcFiles`（:837） |

【事实】技术栈：原生 ES6 内联脚本（非 TypeScript）、Tailwind CSS(CDN)、SheetJS(xlsx 0.18.5)、Chart.js + chartjs-plugin-datalabels。
【事实】三个 Tab 各自维护独立状态（`tabState`，:592），共用文件解析、日期规整（`normalizeDateCells`）、单元格格式化（`formatCellValue`）与 localStorage 工具。
【事实】数据处理默认在浏览器本地完成、不上传服务器——**唯一例外**是 Tab3 的资源包列表查询会 `fetch` 外部接口（见第 8 节风险）。

---

## 2. 目录结构

```
对账工具/
├── index.html                       # 唯一源文件（HTML + 内联 CSS + 内联 JS），约 3176 行
├── _pack_sample.json                # Tab3 资源包列表查询的跨域降级样例数据
├── CLAUDE.md                        # 面向 AI 的项目导航与边界说明
├── ECS云服务器_6月按日汇总.xlsx      # 示例数据
├── 云硬盘CDS_6月按日汇总.xlsx        # 示例数据
├── 对账工具-AI对话.docx              # 需求/对话记录
└── docs/
    ├── harness-repo-analysis.md      # 本报告
    └── governance/
        ├── AGENTS.md
        └── constitution.md
```

---

## 3. 模块地图（真实行号，以 `index.html` 为准）

### 3.1 全局工具与状态
| 模块 | 行号 | 职责 |
|------|------|------|
| `tabState` | :592 | 三 Tab 独立状态：`business` / `resource` / `calc` |
| `STORAGE_KEYS` | :598 | localStorage 键名映射 |
| 防卡死常量 | :592 附近 | `MAX_FILE_SIZE`≈25MB、`STORAGE_MAX_ROWS`≈50000、`PREVIEW_MAX_ROWS`≈200、`NORMALIZE_MAX_CELLS`≈200000 |
| `normalizeDateCells` | :640 | 修复东八区日期跨日：不用 cellDates，保留序列号交 dateNF 格式化；超阈值单元格跳过 |
| `formatCellValue` | :673 | 单元格值格式化（Date / ISO 字符串 / 日期文本） |
| `nextFrame` | :733 附近 | requestAnimationFrame 让出主线程，避免大文件卡死 UI |
| `escapeHtml` | :1202 / :3062 | **重复定义**：前者转义 `&<>"'`，后者仅转义 `&<>` 并覆盖前者（见第 8 节） |
| `DOMContentLoaded` 入口 | :3136 附近 | 页面初始化、事件绑定、恢复本地缓存 |

### 3.2 Tab1 经营分析（数据质量校验）
| 模块 | 行号 | 职责 |
|------|------|------|
| `handleFile` | :1209 | 校验后缀 → 解析工作簿 |
| `processWorkbook` | :1242 | 处理工作簿、渲染 Sheet 切换 |
| `switchSheet` | :1261 | 切换 Sheet 页 |
| `validateData` | :1274 | 数据质量校验主逻辑 |
| `inferColumnTypes` | :1314 | 列类型推断（抽样 20 行 / 70% 阈值） |
| `renderDashboard` | :1340 | 渲染仪表盘（饼图 + 柱图 + 表格） |
| `renderPieChart` | :1357 | 校验结果饼图 |
| `renderBarChart` | :1374 | 列维度柱图 |
| `renderTable` | :1391 | 数据表格（裸拼接，见第 8 节） |
| `saveToStorage` / `restoreFromStorage` | :1433 / :1443 | 本地缓存读写 |

### 3.3 Tab2 资源包抵扣（多文件趋势透视）
| 模块 | 行号 | 职责 |
|------|------|------|
| `handleResourceFiles` | :1505 | 多文件上传、后缀过滤 |
| `processParsedFiles` | :1542 | 多文件/多 Sheet 解析与并入状态 |
| `mergeFilterDefs` | :2296 | 合并多组筛选：同名列取交集，不同名列各自保留 |
| `applyConfigToSelectors` | :2518 | 将配置回填到当前文件的选择器 |
| `drawTrendChart` | :2639 | 采集 UI 图表配置（一次配置供所有文件共用），缓存后渲染当前文件 |
| `renderActiveChart` | :2705 | 依据缓存配置渲染「当前选中文件」的图表 |
| `buildChartForFile` | :2732 | 针对单文件按共用配置构建趋势图（列按列名自适应） |
| `buildPieChart` | :2997 | 将 dataset 汇总为扇区的饼图渲染 |
| `addCompareItem` | :542 | 新增一条对比曲线配置 |

【事实】Tab2 的核心设计是「透视图」：图表配置按**列名**而非列索引作用，`buildChartForFile` 对每个文件按列名自适应解析索引，从而让不同结构的文件共用同一套配置。

### 3.4 Tab3 资源包测算
| 模块 | 行号 | 职责 |
|------|------|------|
| `handleCalcFiles` | :837 | 解析上传的 1 或多个文件 |
| `recommendResourcePackage` | :989 | **预留位**：当前仅 alert「即将上线」 |
| `queryResourcePackList` | :1040 | 调外部接口 `RESOURCE_PACK_API`（account.zyun.qihoo.net），跨域失败降级读 `_pack_sample.json` |
| `renderResourcePackTable` | :1155 | 以表格渲染资源包数据 |

---

## 4. 主执行链路

- **Tab1**：`handleFile`(:1209) → `processWorkbook`(:1242) → `switchSheet`(:1261) → `validateData`(:1274) →（`inferColumnTypes`:1314 + `validateType`）→ `renderDashboard`(:1340) →（`renderPieChart`:1357 / `renderBarChart`:1374 / `renderTable`:1391）→ `saveToStorage`(:1433)
- **Tab2**：`handleResourceFiles`(:1505) → `processParsedFiles`(:1542) →（UI 配置）→ `drawTrendChart`(:2639) → `renderActiveChart`(:2705) → `buildChartForFile`(:2732) / `buildPieChart`(:2997)
- **Tab3**：`handleCalcFiles`(:837) 本地测算路径；或 `queryResourcePackList`(:1040) → `renderResourcePackTable`(:1155) 远程/降级路径

---

## 5. 关键机制说明

【事实】**日期跨日修复**（`normalizeDateCells` :640）：SheetJS 使用 UTC 解析日期序列号，在东八区会导致日期整体前移一天。此处不启用 cellDates，转而保留 Excel 原始序列号并交由 dateNF 格式化，规避跨日；对超 `NORMALIZE_MAX_CELLS` 的超大表跳过以防卡死。

【事实】**跨文件列聚合**（Tab2）：图表配置以列名为键；渲染时对每个文件用 `_resolveColIdx` 将列名解析为该文件内的实际索引，`_collectColumnValues` 按列名跨文件聚合可选值，使多份异构文件复用同一配置。

【事实】**大文件防卡死**：文件大小上限、缓存行数上限、预览行数上限、`nextFrame` 让出主线程等多重保护。

---

## 6. 风险与技术债

| 编号 | 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|------|
| R1 | 高 | 文档—代码历史脱节 | CLAUDE.md / 本报告 | 早期文档描述为 534 行单表校验工具，与当前三 Tab（约 3176 行）严重不符；本次已同步 |
| R2 | 中 | `escapeHtml` 重复定义 | :1202 / :3062 | 后定义仅转义 `&<>`，覆盖了前者对 `"'` 的转义，削弱注入防护 |
| R3 | 中 | 表格裸拼接 | `renderTable`:1391 / `renderResourcePackTable`:1155 | 直接拼接单元格内容进 HTML，依赖 `escapeHtml`，受 R2 影响 |
| R4 | 中 | 隐私前提被打破 | `queryResourcePackList`:1040 | Tab3 会 `fetch` 外部接口，可能携带 cookie/token，与「数据不出浏览器」前提冲突 |
| R5 | 中 | token 明文存储 | localStorage | 若查询接口凭证落 localStorage，为明文存储，存在泄露面 |
| R6 | 低 | `recommendResourcePackage` 仅占位 | :989 | 功能未实现，仅 alert 提示 |

---

## 7. 待确认问题

- 【待确认】Q-A：三个 Tab 是否会持续独立演进？是否需要抽出共享层（当前共用逻辑靠散落的全局函数）？
- 【待确认】Q-B：Tab3 远程查询是否为长期设计？「数据不出浏览器」的隐私承诺是否需要针对 Tab3 单独说明？
- 【待确认】Q-C：项目名为「对账工具」，但当前三 Tab 均为**单侧**分析（质量校验 / 趋势 / 测算），未见双表勾兑对账逻辑。「对账」的确切业务语义待澄清。
- 【待确认】Q-D：`escapeHtml` 的两处定义应保留哪一版本？（建议保留 :1202 的完整转义版）
