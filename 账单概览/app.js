// ==========================================================
// 账单概览
// 四种视图 × 三个维度：
//   日报表  某一天各产品的账单明细，默认昨天
//   月报表  某一月各产品的账单明细，默认当前月
//   日趋势  选中日期区间内每天的消费趋势，默认最近 1 个月
//   月趋势  选中月份区间内每月的消费趋势，默认最近 6 个月
// 报表视图只出表格，趋势视图只出曲线图。
//
// 金额模型与「账单分析」完全一致（同样的账期归一化占比），
// 保证两个页面看同一账期时金额可以互相对上。
// ==========================================================

// ====== 演示基准时间 ======
// 与账单详情页保持一致：演示「今天」为 2026-08-29 14:00，
// 因此日报表默认昨天 = 2026.08.28，月报表默认当前月 = 2026.08。
// 带时分是因为账单状态要跟出账时刻做比较（见 issuedAt）。
var NOW = new Date(2026, 7, 29, 14, 0);

// ====== 视图定义 ======
// grain: 账期粒度；mode: 单个账期 / 账期区间；max: 区间模式下的最大跨度
var VIEWS = {
  'day-report':   { label: '日报表', grain: 'day',   mode: 'single' },
  'month-report': { label: '月报表', grain: 'month', mode: 'single' },
  'day-trend':    { label: '日趋势', grain: 'day',   mode: 'range', max: 31,
                    tip: '最多可选 31 天', err: '所选范围超过 31 天，请重新选择' },
  'month-trend':  { label: '月趋势', grain: 'month', mode: 'range', max: 12,
                    tip: '最多可选 12 个月', err: '所选范围超过 12 个月，请重新选择' }
};
var VIEW_KEYS = Object.keys(VIEWS);

var GRAIN_CFG = {
  day:   { label: '天', unit: '日' },
  month: { label: '月', unit: '月' }
};

var PRODUCTS = {
  apimkt: { name: 'API市场 APIMKT', color: '#0066FF', weight: 0.10 },
  appmkt: { name: '应用市场 APPMKT', color: '#16A085', weight: 0.13 },
  tidb:   { name: '分布式数据库 TiDB', color: '#E8963C', weight: 0.19 },
  obs:    { name: '对象存储 OBS', color: '#8E5FD9', weight: 0.26 },
  ecs:    { name: '云服务器 ECS', color: '#E0533D', weight: 0.32 }
};
var PRODUCT_KEYS = Object.keys(PRODUCTS);

// 企业月账期应付总额（企业 = 所有结算单元之和）
var MONTH_TOTALS = [117408694.98, 149539598.26, 173922195.29, 174692291.06, 128338399.36];
var MONTH_AVG = 148780235.79;

// 组织结构：企业 > 结算单元 > 资源组
var ORG = [
  { id: 'bu1', name: '结算单元-研发部', w: 0.42, groups: [
    { id: 'rg1', name: '资源组-后端服务', w: 0.38 },
    { id: 'rg2', name: '资源组-前端服务', w: 0.27 },
    { id: 'rg3', name: '资源组-数据中台', w: 0.35 }
  ]},
  { id: 'bu2', name: '结算单元-运营部', w: 0.34, groups: [
    { id: 'rg4', name: '资源组-运营支撑', w: 0.46 },
    { id: 'rg5', name: '资源组-数据分析', w: 0.54 }
  ]},
  { id: 'bu3', name: '结算单元-市场部', w: 0.24, groups: [
    { id: 'rg6', name: '资源组-营销活动', w: 0.58 },
    { id: 'rg7', name: '资源组-测试环境', w: 0.42 }
  ]}
];

var BU_MAP = {}, RG_MAP = {}, ALL_BU_IDS = [], ALL_RG_IDS = [];
ORG.forEach(function (bu) {
  BU_MAP[bu.id] = bu;
  ALL_BU_IDS.push(bu.id);
  bu.groups.forEach(function (rg) {
    rg.buId = bu.id;
    RG_MAP[rg.id] = rg;
    ALL_RG_IDS.push(rg.id);
  });
});

var PROD_SEED = { apimkt: 1.1, appmkt: 2.3, tidb: 3.7, obs: 4.9, ecs: 6.1 };
var SCOPE_SEED = {};
ALL_BU_IDS.concat(ALL_RG_IDS).forEach(function (id, i) { SCOPE_SEED[id] = 7.3 + i * 1.7; });

// 确定性伪随机：同一账期始终得到同一波动，避免每次渲染数据跳动
function pseudo(i, seed) {
  var x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ====== 账期解析与格式化 ======
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function parseYM(s) {
  var m = /^(\d{4})\D(\d{1,2})/.exec((s || '').trim());
  return m ? new Date(+m[1], +m[2] - 1, 1) : null;
}
function parseYMD(s) {
  var m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec((s || '').trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmtYM(d) { return d.getFullYear() + '.' + pad2(d.getMonth() + 1); }
function fmtYMD(d) { return fmtYM(d) + '.' + pad2(d.getDate()); }

function parseByGrain(grain, s) {
  return grain === 'month' ? parseYM(s) : parseYMD(s);
}
function fmtByGrain(grain, d) {
  return grain === 'month' ? fmtYM(d) : fmtYMD(d);
}

// 账期序号：作为金额生成的确定性输入，也用于比较与跨度计算
function periodIndex(grain, d) {
  if (grain === 'month') return d.getFullYear() * 12 + d.getMonth();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

// 按粒度位移：月按月、天按天
function shiftUnits(grain, d, n) {
  if (grain === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(d.getTime() + n * 86400000);
}

// ====== 默认账期 ======
// 昨天 / 当前月 / 最近 1 个月（30 天）/ 最近 6 个月
function yesterday() { return new Date(NOW.getTime() - 86400000); }
function currentMonth() { return new Date(NOW.getFullYear(), NOW.getMonth(), 1); }

function defaultDates(view) {
  var v = VIEWS[view];
  if (view === 'day-report')   return { date: fmtYMD(yesterday()) };
  if (view === 'month-report') return { date: fmtYM(currentMonth()) };
  if (view === 'day-trend') {
    var end = yesterday();
    return { start: fmtYMD(shiftUnits('day', end, -29)), end: fmtYMD(end) };
  }
  var mEnd = currentMonth();
  return { start: fmtYM(shiftUnits('month', mEnd, -5)), end: fmtYM(mEnd) };
}

// 构造渲染上下文：labels（图表横坐标 / 表格账期）与 dates（金额计算输入）
function buildContext(view, d) {
  var v = VIEWS[view];
  var grain = v.grain;
  var dates = [];

  if (v.mode === 'single') {
    var one = parseByGrain(grain, d.date) || parseByGrain(grain, defaultDates(view).date);
    dates = [one];
  } else {
    var def = defaultDates(view);
    var s = parseByGrain(grain, d.start) || parseByGrain(grain, def.start);
    var e = parseByGrain(grain, d.end) || parseByGrain(grain, def.end);
    if (periodIndex(grain, e) < periodIndex(grain, s)) e = new Date(s.getTime());
    var n = periodIndex(grain, e) - periodIndex(grain, s) + 1;
    if (n > v.max) n = v.max;
    for (var i = 0; i < n; i++) dates.push(shiftUnits(grain, s, i));
  }

  return {
    view: view, grain: grain, mode: v.mode,
    dates: dates,
    labels: dates.map(function (x) { return fmtByGrain(grain, x); }),
    n: dates.length
  };
}

// ====== 金额模型 ======
// 与账单分析页完全一致：企业总额 → 归一化的主体占比 → 归一化的产品占比
function entTotalAt(grain, d) {
  var idx = periodIndex(grain, d);
  if (grain === 'month') {
    var len = MONTH_TOTALS.length;
    var base = MONTH_TOTALS[((idx % len) + len) % len];
    return base * (0.92 + 0.16 * pseudo(idx, 0.5));
  }
  return MONTH_AVG / 30 * (0.85 + 0.3 * pseudo(idx, 2.5));
}

function waveAt(seed, grain, d) {
  var idx = periodIndex(grain, d);
  return 0.86 + 0.28 * pseudo(idx, seed + (grain === 'day' ? 10 : 0));
}

// 账期内的占比必须归一化，否则「按结算单元求和」「按资源组求和」
// 与企业总额三者对不上。
var shareCache = {};

function sharesAt(grain, d) {
  var key = grain + '|' + periodIndex(grain, d);
  if (shareCache[key]) return shareCache[key];

  var bu = {}, rg = {}, buSum = 0;
  ORG.forEach(function (b) {
    bu[b.id] = b.w * waveAt(SCOPE_SEED[b.id], grain, d);
    buSum += bu[b.id];
  });
  ORG.forEach(function (b) { bu[b.id] /= buSum; });

  ORG.forEach(function (b) {
    var sum = 0;
    b.groups.forEach(function (g) {
      rg[g.id] = g.w * waveAt(SCOPE_SEED[g.id], grain, d);
      sum += rg[g.id];
    });
    b.groups.forEach(function (g) { rg[g.id] = rg[g.id] / sum * bu[b.id]; });
  });

  shareCache[key] = { bu: bu, rg: rg };
  return shareCache[key];
}

function prodSharesAt(grain, d) {
  var key = 'p|' + grain + '|' + periodIndex(grain, d);
  if (shareCache[key]) return shareCache[key];

  var m = {}, sum = 0;
  PRODUCT_KEYS.forEach(function (k) {
    m[k] = PRODUCTS[k].weight * waveAt(PROD_SEED[k], grain, d);
    sum += m[k];
  });
  PRODUCT_KEYS.forEach(function (k) { m[k] /= sum; });

  shareCache[key] = m;
  return m;
}

// scope: {type:'enterprise'} | {type:'bu', id} | {type:'rg', id}
function scopeFactor(scope, grain, d) {
  if (scope.type === 'enterprise') return 1;
  var s = sharesAt(grain, d);
  return scope.type === 'bu' ? s.bu[scope.id] : s.rg[scope.id];
}

function amountOf(scope, prodKey, grain, d) {
  return entTotalAt(grain, d) * scopeFactor(scope, grain, d) * prodSharesAt(grain, d)[prodKey];
}

// 单个 scope + 单个产品在整个账期序列上的金额
function seriesOf(scope, prodKey, ctx) {
  return ctx.dates.map(function (d) { return amountOf(scope, prodKey, ctx.grain, d); });
}

// 多个 scope + 多个产品聚合
function sumSeries(scopes, keys, ctx) {
  var out = [];
  for (var i = 0; i < ctx.n; i++) out.push(0);
  scopes.forEach(function (sc) {
    keys.forEach(function (k) {
      seriesOf(sc, k, ctx).forEach(function (v, i) { out[i] += v; });
    });
  });
  return out;
}

function fmtMoney(v) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAxis(v) {
  if (!v) return '0';
  return (v / 10000).toFixed(1) + 'w';
}

// 次纵坐标（环比 %）刻度文案：零刻度不带符号，正值补 +，整数不留小数尾巴
function fmtPctTick(v) {
  if (Math.abs(v) < 0.005) return '0%';
  var txt = Math.abs(v % 1) < 0.005 ? v.toFixed(0) : v.toFixed(1);
  return (v > 0 ? '+' : '') + txt + '%';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// ====== 曲线维度（结算单元 / 资源组）======
function scopeName(scope) {
  if (scope.type === 'bu') return BU_MAP[scope.id].name;
  if (scope.type === 'rg') return RG_MAP[scope.id].name;
  return '企业';
}

// 同一产品在不同结算单元/资源组下用同色系的深浅区分
var SHADE_STEPS = [0, -0.32, 0.30, -0.55, 0.50, -0.16, 0.16];
var DASH_STEPS = ['', '7 4', '2 3', '10 4 2 4', '5 3 1 3'];

function shadeColor(hex, i) {
  var ratio = SHADE_STEPS[i % SHADE_STEPS.length];
  if (!ratio) return hex;
  var n = parseInt(hex.slice(1), 16);
  var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
    var v = ratio > 0 ? c + (255 - c) * ratio : c * (1 + ratio);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return '#' + ch.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
}

function dashOf(i) { return DASH_STEPS[i % DASH_STEPS.length]; }

// 图例线条：实线用纯色，虚线用重复渐变，与图表线型保持一致
function legendLineStyle(color, dash) {
  if (!dash) return 'background:' + color;
  return 'background:repeating-linear-gradient(90deg,' + color + ' 0 5px,transparent 5px 9px)';
}

// 单条图例：data-key 供点击时定位曲线，hidden 类控制置灰
function legendItemHtml(l) {
  return '<span class="legend-item' + (l.hidden ? ' hidden' : '') +
    '" data-key="' + escapeHtml(l.key) + '" role="button" tabindex="0"' +
    ' title="' + escapeHtml(l.name) + (l.hidden ? '（已隐藏，点击显示）' : '（点击隐藏）') + '">' +
    '<span class="legend-line" style="--line-color:' + l.color + ';' +
    legendLineStyle(l.color, l.dash) + '"></span>' +
    '<span class="legend-text">' + escapeHtml(l.name) + '</span></span>';
}

// ====== 趋势图渲染 ======
var CH = { left: 110, right: 1400, top: 20, bottom: 255 };

// 曲线默认最多展示条数：按选中区间「消费合计」排序取前 N 条
var TOP_LINES = 5;

// 手动筛选时最多可选中的曲线条数
var MAX_PICK_LINES = 10;

// 各模块提示文案：共 N 条曲线，默认展示选中区间内累计金额TOP的产品/结算单元/资源组曲线，可手动筛选，最多选择 10 个
function trendTipText(totalCount, modKey) {
  var scopeWord = modKey === 'product' ? '产品'
    : (modKey === 'bu' ? '结算单元' : '资源组');
  return '共 ' + totalCount + ' 条曲线，默认展示选中区间内累计金额TOP的' + scopeWord +
    '曲线。可手动筛选，最多选择 ' + MAX_PICK_LINES + ' 个。';
}

// ====== 总账趋势区块 ======
// 需求：趋势视图顶部统一展示「企业总账 / 选中结算单元总账 / 选中资源组总账」的变化趋势。
// 区块内容：总账趋势图（柱状应付金额 + 折线环比右轴），不含统计卡。
// 总账口径 = 当前维度所选主体下的全部产品，与拆分模块求和口径完全一致。

// 区间总账口径对应的标题：企业账单 → 企业总账；结算单元 → 选中结算单元总账；资源组 → 选中资源组总账
function trendTitle(dim) {
  if (dim === 'billing-unit') return '结算单元总账趋势';
  if (dim === 'resource-group') return '资源组总账趋势';
  return '企业总账趋势';
}

function trendTotalSeries(scopes, keys, ctx) {
  return sumSeries(scopes, keys, ctx);
}

// 总账区块整体渲染：柱/线双序列图（无统计卡）。
// 总账口径 = 当前维度所选主体下的全部产品，故 keys 固定为 PRODUCT_KEYS。
function renderTrendBlock(box, dim, scopes, ctx) {
  if (!scopes.length) {
    box.innerHTML = '<div class="trend-block">' +
      '<div class="trend-block-head"><h3 class="trend-block-title">' + trendTitle(dim) + '</h3></div>' +
      '<div class="chart-empty">暂无可查看的账单数据</div></div>';
    return;
  }

  var series = trendTotalSeries(scopes, PRODUCT_KEYS, ctx);

  // 区间内每个账期的环比（与上一账期比），首账期无环比，标 null
  var pcts = series.map(function (v, i) {
    if (i === 0) return null;
    var prev = series[i - 1];
    return prev > 0 ? (v - prev) / prev * 100 : null;
  });

  box.innerHTML =
    '<div class="trend-block">' +
      '<div class="trend-block-head">' +
        '<h3 class="trend-block-title">' + trendTitle(dim) + '</h3>' +
        '<span class="trend-block-sub">' + escapeHtml(ctx.labels[0]) + ' ~ ' +
          escapeHtml(ctx.labels[ctx.n - 1]) + ' 的总账变化</span>' +
        '<button class="btn btn-link btn-export" data-export="trend-' + dim + '">导出数据</button>' +
      '</div>' +
      '<div class="trend-chart-card">' +
        '<div class="trend-chart-head">' +
          '<span class="trend-chart-title">总账金额与环比趋势</span>' +
          '<span class="trend-chart-legend">' +
            '<span class="tcl-item"><span class="tcl-line tcl-amount"></span>应付金额</span>' +
            '<span class="tcl-item"><span class="tcl-line tcl-mom"></span>环比</span>' +
          '</span>' +
        '</div>' +
        '<div class="trend-chart-wrap" id="trend-chart-' + dim + '"></div>' +
      '</div>' +
    '</div>';

  renderTrendChart(box.querySelector('.trend-chart-wrap'), ctx, series, pcts);
}

// 总账趋势图：柱状应付金额（左轴）+ 折线环比%（右轴）
// 右轴百分比跟随柱子的高低走势直观对应「涨 红 / 跌 绿」的环比方向。
function renderTrendChart(wrap, ctx, series, pcts) {
  if (!wrap) return;
  var periods = ctx.labels;
  var n = periods.length;

  var maxAmount = series.reduce(function (m, v) { return Math.max(m, v); }, 0);
  // 环比右轴：零刻度居中，最大取值覆盖正负两侧的最大绝对值
  var maxPct = 0;
  pcts.forEach(function (p) { if (p !== null) maxPct = Math.max(maxPct, Math.abs(p)); });
  var pctBound = niceMax(maxPct * 1.15 + 2);
  if (pctBound < 5) pctBound = 5;

  // right 留出 90px 画右侧次纵坐标（环比 %）的轴线与刻度文字
  var left = 96, right = 1330, top = 20, bottom = 255;
  var PAD_X = 18;
  var x0 = left + PAD_X;
  var span = (right - PAD_X) - x0;
  var step = n > 1 ? span / (n - 1) : 0;
  var xs = periods.map(function (_, i) { return n > 1 ? x0 + i * step : x0 + span / 2; });

  var wy = function (v) { return bottom - (v / maxAmount) * (bottom - top); };
  // 右轴线性：0 在中间，上 +pctBound 下 -pctBound
  var py = function (p) { return (top + bottom) / 2 - (p / pctBound) * ((bottom - top) / 2); };

  var tickFont = ctx.grain === 'day' ? 16 : 18;
  var maxLen = 0;
  periods.forEach(function (p) { if (p.length > maxLen) maxLen = p.length; });
  var textW = maxLen * tickFont * 0.62;
  var slotW = textW + 18;
  var maxTicks = Math.max(2, Math.floor(span / slotW) + 1);
  var tickEvery = Math.max(1, Math.ceil(n / maxTicks));
  var tickH = tickFont + 6;
  var svgH = Math.round(bottom + 20 + tickH);

  var s = ['<svg viewBox="0 0 1420 ' + svgH + '" preserveAspectRatio="none">'];
  // 横向网格 + 左轴刻度（金额）
  s.push('<g stroke="#E9EDF2" stroke-width="1" stroke-dasharray="4 4">');
  for (var g = 1; g <= 6; g++) {
    var gy = (bottom - (bottom - top) * (g / 6)).toFixed(1);
    s.push('<line x1="' + left + '" y1="' + gy + '" x2="' + right + '" y2="' + gy + '" />');
  }
  s.push('</g>');
  s.push('<line x1="' + left + '" y1="255" x2="' + right + '" y2="255" stroke="#D8E0E8" stroke-width="1" />');
  s.push('<g fill="#5C6B80" font-size="18" text-anchor="end" font-family="Microsoft YaHei, PingFang SC">');
  for (var t = 1; t <= 6; t++) {
    var ty = (bottom - (bottom - top) * (t / 6) + 5).toFixed(1);
    s.push('<text x="' + (left - 14) + '" y="' + ty + '">' + fmtAxis(maxAmount * (t / 6)) + '</text>');
  }
  s.push('<text x="' + (left - 14) + '" y="260">0</text></g>');

  // 右侧次纵坐标（环比 %）：零刻度居中，上下各 3 档。
  // 取 3 档是为了让右轴刻度与左轴的 6 等分横向网格线逐条对齐（0% 落在正中那条）。
  var PCT_TICKS = 3;
  s.push('<line x1="' + right + '" y1="' + top + '" x2="' + right + '" y2="' + bottom +
         '" stroke="#8C57C2" stroke-width="1" stroke-opacity="0.35" />');
  s.push('<g fill="#8C57C2" font-size="14" text-anchor="start" font-family="Microsoft YaHei, PingFang SC">');
  for (var pt = PCT_TICKS; pt >= -PCT_TICKS; pt--) {
    var pv = pctBound * (pt / PCT_TICKS);
    var pty = py(pv);
    s.push('<line x1="' + right + '" y1="' + pty.toFixed(1) + '" x2="' + (right + 5) + '" y2="' + pty.toFixed(1) +
           '" stroke="#8C57C2" stroke-width="1" stroke-opacity="0.5" />');
    s.push('<text x="' + (right + 11) + '" y="' + (pty + 5).toFixed(1) + '">' + fmtPctTick(pv) + '</text>');
  }
  s.push('</g>');

  // 柱体：宽度按刻度间距的 0.6，单账期时给固定宽度
  var barW = n > 1 ? Math.max(6, step * 0.6) : 24;
  series.forEach(function (v, i) {
    var y = wy(v);
    var h = bottom - y;
    s.push('<rect x="' + (xs[i] - barW / 2).toFixed(1) + '" y="' + y.toFixed(1) +
           '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) +
           '" rx="2" fill="#0066FF" fill-opacity="0.16" />');
  });

  // 环比折线（右轴）
  var pts = [];
  pcts.forEach(function (p, i) {
    if (p === null) return;
    pts.push(xs[i].toFixed(1) + ',' + py(p).toFixed(1));
  });
  if (pts.length > 1) {
    s.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="#8C57C2"' +
           ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />');
  }
  // 环比数据点：仅在有值的账期绘制
  s.push('<g fill="#FFFFFF" stroke="#8C57C2" stroke-width="1.4">');
  pcts.forEach(function (p, i) {
    if (p === null) return;
    var r = n > 40 ? 2 : 3.5;
    s.push('<circle cx="' + xs[i].toFixed(1) + '" cy="' + py(p).toFixed(1) + '" r="' + r + '" />');
  });
  s.push('</g>');

  // 悬停层：竖向准线 + 金额柱高亮 + 环比点高亮
  s.push('<g class="hover-layer" style="display:none">');
  s.push('<line class="hover-line" y1="' + top + '" y2="' + bottom +
         '" stroke="#9AA7B8" stroke-width="1" stroke-dasharray="3 3" />');
  s.push('</g>');

  // 横轴刻度（对齐各账期）
  var lastIdx = n - 1;
  function tickAnchor(i) { return i === lastIdx ? 'end' : (i === 0 ? 'start' : 'middle'); }
  function tickBox(i) {
    var w = periods[i].length * tickFont * 0.62;
    var a = tickAnchor(i);
    var x = xs[i];
    if (a === 'start') return { l: x, r: x + w };
    if (a === 'end') return { l: x - w, r: x };
    return { l: x - w / 2, r: x + w / 2 };
  }
  var GAP = 12;
  var tickIdx = [0];
  var lastBox = tickBox(0);
  for (var ti = tickEvery; ti < lastIdx; ti += tickEvery) {
    var box = tickBox(ti);
    if (box.l - lastBox.r < GAP) continue;
    if (tickBox(lastIdx).l - box.r < GAP) continue;
    tickIdx.push(ti);
    lastBox = box;
  }
  if (lastIdx > 0) {
    while (tickIdx.length > 1 && tickBox(lastIdx).l - tickBox(tickIdx[tickIdx.length - 1]).r < GAP) tickIdx.pop();
    tickIdx.push(lastIdx);
  }
  s.push('<g fill="#5C6B80" font-size="' + tickFont + '" font-family="Microsoft YaHei, PingFang SC">');
  tickIdx.forEach(function (i) {
    s.push('<text x="' + xs[i].toFixed(1) + '" y="' + (bottom + 26) + '" text-anchor="' + tickAnchor(i) + '">' +
           periods[i] + '</text>');
  });
  s.push('</g>');

  // 透明捕获矩形
  s.push('<rect class="hover-capture" x="' + left + '" y="' + top +
         '" width="' + (right - left) + '" height="' + (bottom - top) +
         '" fill="transparent" />');
  s.push('</svg>');

  wrap.innerHTML = s.join('');
  setupTrendHover(wrap, ctx, xs, wy, series, pcts);
}

// 总账趋势图悬停提示：显示该账期金额 + 环比，竖向准线跟随吸附账期
function setupTrendHover(wrap, ctx, xs, yOf, series, pcts) {
  var svg = wrap.querySelector('svg');
  if (!svg) return;

  var periods = ctx.labels;
  var hoverLayer = svg.querySelector('.hover-layer');
  var hoverLine = svg.querySelector('.hover-line');
  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  wrap.appendChild(tip);

  function scale() {
    var box = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return { x: box.width / vb.width, y: box.height / vb.height, w: box.width, h: box.height };
  }
  function nearestIndex(svgX) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < xs.length; i++) {
      var d = Math.abs(xs[i] - svgX);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function show(idx) {
    var sc = scale();
    tip.classList.add('visible');
    if (hoverLayer) hoverLayer.style.display = '';
    if (hoverLine) hoverLine.setAttribute('x1', xs[idx]), hoverLine.setAttribute('x2', xs[idx]);

    var p = pcts[idx];
    var momRow = '';
    if (p !== null) {
      var dir = p > 0.05 ? 'up' : (p < -0.05 ? 'down' : 'flat');
      momRow = '<div class="chart-tip-row is-mom is-' + dir + '">' +
        '<span class="chart-tip-dot" style="background:#8C57C2"></span>' +
        '<span class="chart-tip-name">环比上一账期</span>' +
        '<span class="chart-tip-val">' + (p > 0 ? '+' : '') + p.toFixed(2) + '%</span>' +
        '</div>';
    }
    tip.innerHTML =
      '<div class="chart-tip-head">' + escapeHtml(periods[idx]) + '</div>' +
      '<div class="chart-tip-row">' +
        '<span class="chart-tip-dot" style="background:#0066FF"></span>' +
        '<span class="chart-tip-name">应付金额</span>' +
        '<span class="chart-tip-val">￥' + fmtMoney(series[idx]) + '</span>' +
      '</div>' + momRow;

    var px = xs[idx] * sc.x;
    var tw = tip.offsetWidth;
    var left = px + 14;
    if (left + tw > sc.w - 4) left = px - tw - 14;
    if (left < 4) left = 4;
    tip.style.left = Math.round(left) + 'px';
    // 浮层纵向跟随该账期柱顶高度，超出容器时夹在上下边界内
    var top = yOf(series[idx]) * sc.y - tip.offsetHeight - 10;
    var th = tip.offsetHeight;
    if (top + th > sc.h - 2) top = sc.h - th - 2;
    if (top < 2) top = 2;
    tip.style.top = Math.round(top) + 'px';
  }
  function hide() {
    if (hoverLayer) hoverLayer.style.display = 'none';
    tip.classList.remove('visible');
  }

  svg.addEventListener('mousemove', function (e) {
    var box = svg.getBoundingClientRect();
    if (!box.width) return;
    var sc = scale();
    var svgX = (e.clientX - box.left) / sc.x;
    show(nearestIndex(svgX));
  });
  svg.addEventListener('mouseleave', hide);
}

// ====== 拆分模块渲染 ======
// 每个模块一张独立图表（曲线 + 图例 + 悬停提示），曲线默认展示 TOP20。
// 模块划分（按需求）：
//   企业账单    产品 / 结算单元 / 资源组
//   结算单元账单 产品 / 资源组
//   资源组账单   产品
// 产品模块的曲线 = 各主体 × 各产品；结算单元 / 资源组模块的曲线 = 各主体总账。
// 模块骨架（图例 / 图表容器）在渲染时由 JS 动态创建，图例事件用委托绑定。

function niceMax(max) {
  if (max <= 0) return 10;
  var exp = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / exp * 2) / 2 * exp;
}

// ====== 趋势图悬停提示 ======
// 鼠标在绘图区任意位置移动即吸附到最近账期，展示该账期下所有曲线的值。
// 浮层是 .chart-wrap 内的绝对定位 div（而非 SVG 内元素）：
// SVG 用 preserveAspectRatio="none" 横向拉伸，文字放在里面会跟着变形。
function setupChartHover(wrap, lines, periods, xs, yOf, ctx) {
  var svg = wrap.querySelector('svg');
  var capture = wrap.querySelector('.hover-capture');
  var layer = wrap.querySelector('.hover-layer');
  var hoverLine = wrap.querySelector('.hover-line');
  var dots = Array.prototype.slice.call(wrap.querySelectorAll('.hover-dot'));
  if (!svg || !capture || !layer) return;

  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  wrap.appendChild(tip);

  // SVG 坐标 → .chart-wrap 内的像素坐标。
  // viewBox 宽固定 1420，横向按容器宽度等比拉伸；纵向按 svg 实际高度换算。
  function scale() {
    var box = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return {
      x: box.width / vb.width,
      y: box.height / vb.height,
      w: box.width,
      h: box.height
    };
  }

  // 鼠标 x（SVG 坐标）→ 最近账期下标
  function nearestIndex(svgX) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < xs.length; i++) {
      var d = Math.abs(xs[i] - svgX);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function show(idx, sc) {
    layer.style.display = '';

    hoverLine.setAttribute('x1', xs[idx]);
    hoverLine.setAttribute('x2', xs[idx]);
    lines.forEach(function (l, li) {
      if (!dots[li]) return;
      dots[li].setAttribute('cx', xs[idx]);
      dots[li].setAttribute('cy', yOf(l.data[idx]));
    });

    // 浮层内容：账期 + 各曲线值，按金额从大到小，读数顺序与视觉堆叠一致
    var rows = lines.map(function (l) {
      return { name: l.name, color: l.color, v: l.data[idx] };
    }).sort(function (a, b) { return b.v - a.v; });

    var total = rows.reduce(function (s, r) { return s + r.v; }, 0);
    var html = ['<div class="chart-tip-head">' + escapeHtml(periods[idx]) + '</div>'];
    rows.forEach(function (r) {
      html.push('<div class="chart-tip-row">' +
        '<span class="chart-tip-dot" style="background:' + r.color + '"></span>' +
        '<span class="chart-tip-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="chart-tip-val">￥' + fmtMoney(r.v) + '</span>' +
        '</div>');
    });
    // 多条曲线时补一行合计，便于快速读出该账期总量
    if (rows.length > 1) {
      html.push('<div class="chart-tip-row is-total">' +
        '<span class="chart-tip-dot" style="background:transparent"></span>' +
        '<span class="chart-tip-name">合计</span>' +
        '<span class="chart-tip-val">￥' + fmtMoney(total) + '</span>' +
        '</div>');
    }
    tip.innerHTML = html.join('');
    tip.classList.add('visible');

    // 定位：默认在准线右侧，靠近右边界时翻到左侧，避免被容器裁掉
    var px = xs[idx] * sc.x;
    var tw = tip.offsetWidth;
    var left = px + 14;
    if (left + tw > sc.w - 4) left = px - tw - 14;
    if (left < 4) left = 4;
    tip.style.left = Math.round(left) + 'px';

    // 纵向：跟随该账期各曲线的中位高度，并夹在容器内
    var ys = lines.map(function (l) { return yOf(l.data[idx]) * sc.y; });
    var mid = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
    var th = tip.offsetHeight;
    var top = mid - th / 2;
    if (top < 2) top = 2;
    if (top + th > sc.h - 2) top = Math.max(2, sc.h - th - 2);
    tip.style.top = Math.round(top) + 'px';
  }

  function hide() {
    layer.style.display = 'none';
    tip.classList.remove('visible');
  }

  function onMove(e) {
    var box = svg.getBoundingClientRect();
    if (!box.width) return;
    var sc = scale();
    var svgX = (e.clientX - box.left) / sc.x;
    show(nearestIndex(svgX), sc);
  }

  // 监听挂在 svg 上而非捕获矩形：离开绘图区（进入刻度/轴标区域）也能继续读数，
  // 移出整个图表才收起。
  svg.addEventListener('mousemove', onMove);
  svg.addEventListener('mouseleave', hide);
}

// ====== 趋势视图 ======
// 趋势视图 = 总账趋势区块 + N 个拆分模块，全部由 JS 渲染进 trend-box：
//   总账区块  企业总账 / 选中结算单元总账 / 选中资源组总账的柱+环比双序列图
//   拆分模块  每个模块一张独立折线图 + 图例 + 悬停浮层
// 各维度模块划分（见 TREND_MODULES）与需求保持一致。

// 拆分模块元信息：title 为区块标题。
// pick 标记该模块自身维度的多选筛选：product 筛产品、bu 筛结算单元、rg 筛资源组。
// 候选范围受当前维度与角色权限约束（见 modulePickOptions / moduleSubjectsOf）：
//   企业账单  bu 候选 = 角色可见结算单元；rg 候选 = 角色可见资源组
//   结算单元账单 rg 候选 = 该结算单元下的可见资源组
// resource-group 维度主体由上方组织筛选锁定，仅产品模块可筛。
var TREND_MODULES = {
  'enterprise': [
    { key: 'product', title: '产品变化趋势', pick: 'product' },
    { key: 'bu', title: '结算单元变化趋势', pick: 'bu' },
    { key: 'rg', title: '资源组变化趋势', pick: 'rg' }
  ],
  'billing-unit': [
    { key: 'product', title: '产品变化趋势', pick: 'product' },
    { key: 'rg', title: '资源组变化趋势', pick: 'rg' }
  ],
  'resource-group': [
    { key: 'product', title: '产品变化趋势', pick: 'product' }
  ]
};

// 结算单元 / 资源组等总账曲线的主题色板
var CAT_COLORS = ['#1F2D3D', '#0066FF', '#16A085', '#E0533D', '#E8963C', '#8E5FD9', '#C97A11', '#4C9E2F', '#0F8A8F'];

// 模块内曲线的完整 key：模块前缀 + 曲线 key，避免不同模块间重名
function fullLineKey(modKey, lineKey) {
  return modKey + '|' + lineKey;
}

// 模块级筛选下拉的候选项（value 供 moduleDraft/moduleApplied 记录）。
// 候选范围 = 该模块实际会出线的 subjects（与图表口径一致）：
//   产品        = 全部产品
//   结算单元    = 角色可见结算单元（企业账单）
//   资源组      = 企业账单：角色可见资源组；结算单元账单：所选结算单元下的可见资源组
function modulePickOptions(dim, mod, scopes) {
  if (mod.pick === 'product') {
    return PRODUCT_KEYS.map(function (k) { return { value: k, name: PRODUCTS[k].name }; });
  }
  return allSubjectsOf(dim, mod.key, scopes).map(function (s) {
    return { value: s.id, name: scopeName(s) };
  });
}

// 模块级筛选下拉的「全部」选项文案
function modulePickAllLabel(pick) {
  if (pick === 'product') return '全部产品';
  return pick === 'bu' ? '全部结算单元' : '全部资源组';
}

// 模块副标题：固定文案格式，不随模块级筛选变化。
//   产品模块     企业 · 各产品 / 选中结算单元名称 · 各产品 / 选中资源组名称 · 各产品
//   结算单元模块  企业 · 各结算单元（仅企业账单下出现）
//   资源组模块   企业 · 各资源组 / 选中结算单元名称 · 各资源组
function moduleSubText(dim, modKey, scopes) {
  var prefix = scopes.map(scopeName).join('、');
  if (!prefix) prefix = '企业';

  if (modKey === 'product') return prefix + ' · 各产品';
  if (modKey === 'bu') return '企业 · 各结算单元';
  if (modKey === 'rg') return prefix + ' · 各资源组';
  return '';
}

// 当前维度 / 模块下全部候选主体（模块下拉选项与默认出线来源）。
// product 模块主体 = 组织筛选选中的主体（企业整体 / 所选结算单元 / 所选资源组）。
function allSubjectsOf(dim, modKey, scopes) {
  if (modKey === 'product') return scopes;
  if (modKey === 'bu') {
    // 结算单元模块：仅企业账单下出现，主体 = 当前角色可见的全部结算单元
    return allowedBuIds().map(function (id) { return { type: 'bu', id: id }; });
  }
  if (dim === 'enterprise') {
    // 资源组模块：企业账单下展开全部可见资源组
    return allowedRgIds().map(function (id) { return { type: 'rg', id: id }; });
  }
  // 结算单元账单 - 资源组模块：展开所选结算单元下的资源组
  var out = [];
  scopes.forEach(function (sc) {
    if (sc.type === 'rg') { out.push(sc); return; }
    BU_MAP[sc.id].groups.forEach(function (rg) { out.push({ type: 'rg', id: rg.id }); });
  });
  return out;
}

// 模块实际出线的 subjects：
//   默认 = 该模块全部候选；模块级已选 id 非空时取其子集（按选中顺序）。
//   产品模块的 subjects 恒为组织筛选选中的主体（scopes），产品维度的收窄走 keys。
function moduleSubjectsOf(dim, modKey, scopes, pickedIds) {
  var all = allSubjectsOf(dim, modKey, scopes);
  if (modKey === 'product') return all;
  var picked = (pickedIds || []).filter(function (id) {
    return all.some(function (s) { return s.id === id; });
  });
  if (!picked.length) return all;
  var map = {};
  all.forEach(function (s) { map[s.id] = s; });
  return picked.map(function (id) { return map[id]; });
}

// 组装模块曲线：
//   产品模块    每条 = 产品一条（按当前主体 × 模块所选产品），用产品品牌色
//   主体模块    每条 = 主体一条总账（主体 × 全部产品之和），用主体色板
function buildModuleLines(dim, modKey, subjects, keys, ctx) {
  var lines = [];
  if (modKey === 'product') {
    subjects.forEach(function (sc, si) {
      keys.forEach(function (k) {
        var multi = subjects.length > 1;
        lines.push({
          key: 'prod|' + (sc.id || 'ent') + '|' + k,
          name: PRODUCTS[k].name,
          color: multi ? shadeColor(PRODUCTS[k].color, si) : PRODUCTS[k].color,
          dash: multi ? dashOf(si) : '',
          width: 2,
          data: sumSeries([sc], [k], ctx)
        });
      });
    });
    return lines;
  }

  subjects.forEach(function (sc, si) {
    lines.push({
      key: (modKey === 'bu' ? 'bu' : 'rg') + '|' + (sc.id || 'ent'),
      name: scopeName(sc),
      color: CAT_COLORS[si % CAT_COLORS.length],
      dash: '',
      width: 2.2,
      data: sumSeries([sc], PRODUCT_KEYS, ctx)
    });
  });
  return lines;
}

// 通用折线图：把 lines 画进 wrap，图例写进 legendEl。
// 显隐状态按「模块前缀 + 曲线 key」记录在 st.hiddenLines，模块内曲线默认全部显示。
function renderModuleChart(wrap, legendEl, dim, modKey, lines, ctx) {
  if (!wrap || !legendEl) return;
  var st = panelState[dim];
  var periods = ctx.labels;

  // 只画显示中的曲线；隐藏后纵轴自动重新贴合
  function isHidden(l) {
    var k = fullLineKey(modKey, l.key);
    return Object.prototype.hasOwnProperty.call(st.hiddenLines, k)
      ? st.hiddenLines[k] : false;
  }
  lines.forEach(function (l) { l.hidden = isHidden(l); });
  var shown = lines.filter(function (l) { return !l.hidden; });

  // 无可见曲线时保留图表框体（用户点击图例可恢复），轴区仅提示
  if (!shown.length) {
    wrap.innerHTML = '<div class="chart-empty chart-empty-sm">全部曲线已隐藏，点击右侧图例可重新显示</div>';
    legendEl.innerHTML = lines.map(function (l) { return legendItemHtml(l); }).join('');
    return;
  }

  var maxVal = 0;
  shown.forEach(function (l) { l.data.forEach(function (v) { if (v > maxVal) maxVal = v; }); });
  var top = niceMax(maxVal);

  var PAD_X = 18;
  var x0 = CH.left + PAD_X;
  var span = (CH.right - PAD_X) - x0;
  var step = periods.length > 1 ? span / (periods.length - 1) : 0;
  var xs = periods.map(function (_, i) {
    return periods.length > 1 ? x0 + i * step : x0 + span / 2;
  });
  var yOf = function (v) { return CH.bottom - (v / top) * (CH.bottom - CH.top); };

  var dotR = periods.length > 40 ? 2 : (periods.length > 16 ? 3 : 4.5);

  var tickFont = ctx.grain === 'day' ? 16 : 18;
  var maxLen = 0;
  periods.forEach(function (p) { if (p.length > maxLen) maxLen = p.length; });
  var textW = maxLen * tickFont * 0.62;
  var slotW = textW + 18;
  var maxTicks = Math.max(2, Math.floor(span / slotW) + 1);
  var tickEvery = Math.max(1, Math.ceil(periods.length / maxTicks));
  var tickH = tickFont + 6;
  var svgH = Math.round(CH.bottom + 20 + tickH);

  var s = ['<svg viewBox="0 0 1420 ' + svgH + '" preserveAspectRatio="none">'];
  s.push('<g stroke="#E9EDF2" stroke-width="1" stroke-dasharray="4 4">');
  for (var g = 1; g <= 6; g++) {
    var gy = (CH.bottom - (CH.bottom - CH.top) * (g / 6)).toFixed(1);
    s.push('<line x1="110" y1="' + gy + '" x2="1400" y2="' + gy + '" />');
  }
  s.push('</g>');
  s.push('<line x1="110" y1="255" x2="1400" y2="255" stroke="#D8E0E8" stroke-width="1" />');

  s.push('<g fill="#5C6B80" font-size="18" text-anchor="end" font-family="Microsoft YaHei, PingFang SC">');
  for (var t = 1; t <= 6; t++) {
    var ty = (CH.bottom - (CH.bottom - CH.top) * (t / 6) + 5).toFixed(1);
    s.push('<text x="98" y="' + ty + '">' + fmtAxis(top * (t / 6)) + '</text>');
  }
  s.push('<text x="98" y="260">0</text></g>');

  shown.forEach(function (l) {
    var pts = l.data.map(function (v, i) { return xs[i].toFixed(1) + ',' + yOf(v).toFixed(1); }).join(' ');
    s.push('<polyline points="' + pts + '" fill="none" stroke="' + l.color +
           '" stroke-width="' + l.width + '" stroke-linecap="round" stroke-linejoin="round"' +
           (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + ' />');
    s.push('<g fill="#FFFFFF" stroke="' + l.color + '" stroke-width="1.4">');
    l.data.forEach(function (v, i) {
      s.push('<circle cx="' + xs[i].toFixed(1) + '" cy="' + yOf(v).toFixed(1) + '" r="' + dotR + '" />');
    });
    s.push('</g>');
  });

  var lastIdx = periods.length - 1;
  function tickAnchor(i) { return i === lastIdx ? 'end' : (i === 0 ? 'start' : 'middle'); }
  function tickBox(i) {
    var w = periods[i].length * tickFont * 0.62;
    var a = tickAnchor(i);
    var x = xs[i];
    if (a === 'start') return { l: x, r: x + w };
    if (a === 'end') return { l: x - w, r: x };
    return { l: x - w / 2, r: x + w / 2 };
  }

  var GAP = 12;
  var tickIdx = [0];
  var lastBox = tickBox(0);
  for (var ti = tickEvery; ti < lastIdx; ti += tickEvery) {
    var box = tickBox(ti);
    if (box.l - lastBox.r < GAP) continue;
    if (tickBox(lastIdx).l - box.r < GAP) continue;
    tickIdx.push(ti);
    lastBox = box;
  }
  if (lastIdx > 0) {
    while (tickIdx.length > 1 && tickBox(lastIdx).l - tickBox(tickIdx[tickIdx.length - 1]).r < GAP) {
      tickIdx.pop();
    }
    tickIdx.push(lastIdx);
  }

  s.push('<g fill="#5C6B80" font-size="' + tickFont + '" font-family="Microsoft YaHei, PingFang SC">');
  tickIdx.forEach(function (i) {
    s.push('<text x="' + xs[i].toFixed(1) + '" y="' + (CH.bottom + 26) + '" text-anchor="' + tickAnchor(i) + '">' +
           periods[i] + '</text>');
  });
  s.push('</g>');

  s.push('<g class="hover-layer" style="display:none">');
  s.push('<line class="hover-line" y1="' + CH.top + '" y2="' + CH.bottom +
         '" stroke="#9AA7B8" stroke-width="1" stroke-dasharray="3 3" />');
  shown.forEach(function (l) {
    s.push('<circle class="hover-dot" r="4.5" fill="#FFFFFF" stroke="' + l.color + '" stroke-width="2" />');
  });
  s.push('</g>');

  s.push('<rect class="hover-capture" x="' + CH.left + '" y="' + CH.top +
         '" width="' + (CH.right - CH.left) + '" height="' + (CH.bottom - CH.top) +
         '" fill="transparent" />');
  s.push('</svg>');

  wrap.innerHTML = s.join('');
  setupChartHover(wrap, shown, periods, xs, yOf, ctx);

  // 图例：只列展示中的曲线；隐藏态置灰可点击恢复
  var legendHtml = [];
  lines.forEach(function (l) {
    l.hidden = isHidden(l);
    legendHtml.push(legendItemHtml(l));
  });
  var legendNote = null;
  if (!shown.length) {
    legendNote = '全部曲线已隐藏，点击上方图例可重新显示';
  }
  if (legendNote) legendHtml.push('<span class="legend-note">' + legendNote + '</span>');
  legendEl.innerHTML = legendHtml.join('');
  // 图例高度与图表区对齐，超高部分在 .chart-legend 内部滚动
  var wrapH = wrap.getBoundingClientRect().height;
  if (wrapH > 0) legendEl.style.maxHeight = Math.round(wrapH) + 'px';
}

// 模块是否只展示 TOP5：模块曲线超过 TOP_LINES 时按区间「消费合计」排序截断；
// 手动筛选已明确选择曲线时不再截断（最多 10 条由筛选组件保证）。
function truncateTop(lines, ctx, skip) {
  if (skip || lines.length <= TOP_LINES) return lines;
  var totalOf = function (l) {
    return l.data.reduce(function (s, v) { return s + v; }, 0);
  };
  return lines.slice().sort(function (a, b) {
    return totalOf(b) - totalOf(a);
  }).slice(0, TOP_LINES);
}

// 构建单个拆分模块 DOM 并渲染图表。
// host  模块挂载点（总账区块之后）
// dim   维度（enterprise / billing-unit / resource-group）
// mod   模块元信息
// scopes 当前维度组织筛选选中的主体（决定 rg 模块下拉候选范围）
// subjects 模块内展开的主体集合
// keys  模块级选中的产品（仅产品模块有效，主体模块恒为全部产品）
// ctx   渲染上下文
// moduleDraft  模块级筛选草稿（下拉 UI 回填用，未点搜索不生效）
// moduleApplied 模块级已生效筛选（图表数据与副标题依据）
function appendModule(host, dim, mod, scopes, subjects, keys, ctx, moduleDraft, moduleApplied, bare) {
  var chartId = 'chart-' + dim + '-' + mod.key;
  var legendId = 'legend-' + dim + '-' + mod.key;
  moduleDraft = moduleDraft || emptyModuleSel();
  moduleApplied = moduleApplied || emptyModuleSel();

  // bare 模式：模块内容直接渲染进 host（用于 Tab 栏与模块合并进同一卡片），不再额外套灰底卡片
  var moduleBox = bare ? host : document.createElement('div');
  if (!bare) moduleBox.className = 'trend-module';
  moduleBox.dataset.module = mod.key;
  moduleBox.dataset.dim = dim;

  // 曲线数据先构建：提示文案需要曲线总条数，且提示与筛选框同行渲染
  var lines = buildModuleLines(dim, mod.key, subjects, keys, ctx);
  var totalCount = lines.length;
  // 手动筛选已明确选择时不再按 TOP 截断（条数上限由筛选组件限制）
  var picked = !!(moduleApplied[mod.pick] && moduleApplied[mod.pick].length);
  lines = truncateTop(lines, ctx, picked);

  // 工具行：左侧提示文案 + 右侧筛选下拉与导出按钮，同行排布以节省纵向空间。
  // 去掉「XX变化趋势」标题头，当前模块已由 Tab 栏标识
  var tools = document.createElement('div');
  tools.className = 'trend-module-tools';

  // 模块提示文案：共 N 条曲线，默认展示选中区间内累计金额TOP的曲线，可手动筛选，最多选择 10 个
  var tip = document.createElement('div');
  tip.className = 'trend-module-tip';
  tip.textContent = trendTipText(totalCount, mod.key);
  tools.appendChild(tip);

  // 模块级筛选下拉：模块自身维度的多选（产品 / 结算单元 / 资源组），勾选仅存草稿。
  // 初始化须在模块挂载进 document 之后（initModulePick 内部依赖 getElementById）。
  var modulePick = null;
  if (mod.pick) {
    modulePick = buildModulePick(dim, mod);
    tools.appendChild(modulePick);
  }

  // 导出数据按钮（趋势模块右上角，位于筛选框之后）
  var exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-link btn-export';
  exportBtn.setAttribute('data-export', 'module-' + dim + '-' + mod.key);
  exportBtn.textContent = '导出数据';
  tools.appendChild(exportBtn);
  moduleBox.appendChild(tools);

  var section = document.createElement('div');
  section.className = 'chart-section';
  var chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';
  chartWrap.id = chartId;
  var side = document.createElement('div');
  side.className = 'chart-side';
  var legendEl = document.createElement('div');
  legendEl.className = 'chart-legend';
  legendEl.id = legendId;
  side.appendChild(legendEl);
  section.appendChild(chartWrap);
  section.appendChild(side);
  moduleBox.appendChild(section);

  if (!bare) host.appendChild(moduleBox);
  renderModuleChart(chartWrap, legendEl, dim, mod.key, lines, ctx);

  // 模块挂载后再初始化下拉，避免 getElementById 取不到尚未入树的节点
  if (modulePick) initModulePick(dim, mod, scopes, modulePick, moduleDraft);
}

// 模块级多选下拉的 DOM 骨架（trigger / dropdown 内容由 initModulePick 填充）
function buildModulePick(dim, mod) {
  var ns = 'msm-' + dim + '-' + mod.key;
  var wrap = document.createElement('div');
  wrap.className = 'module-ms';
  wrap.innerHTML =
    '<div class="multiselect" id="' + ns + '">' +
      '<div class="ms-trigger module-ms-trigger" id="' + ns + '-trigger">' +
        '<span class="ms-placeholder" id="' + ns + '-label"></span>' +
        '<svg class="ms-arrow" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8.5l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="ms-clear" title="清空"><svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.2" fill="currentColor" opacity=".28"/><path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg></span>' +
      '</div>' +
      '<div class="ms-dropdown module-ms-dropdown" id="' + ns + '-dropdown"></div>' +
    '</div>';
  return wrap;
}

// 填充模块级多选下拉的选项并初始化。
// 下拉关闭时自动生效（无需点搜索）：写入 moduleDraft → clone 到 moduleApplied → 刷新面板。
function initModulePick(dim, mod, scopes, wrap, moduleDraft) {
  var ns = 'msm-' + dim + '-' + mod.key;
  var dd = document.getElementById(ns + '-dropdown');
  if (!dd) return;
  var allLabel = modulePickAllLabel(mod.pick);
  var html = '<div class="ms-option ms-all" data-value="__all">' +
    '<span class="ms-check"></span><span>' + allLabel + '</span></div>';
  modulePickOptions(dim, mod, scopes).forEach(function (o) {
    html += '<div class="ms-option" data-value="' + o.value + '">' +
      '<span class="ms-check"></span><span>' + o.name + '</span></div>';
  });
  dd.innerHTML = html;

  var onChange = function (vals) {
    moduleDraft[mod.pick] = vals.slice();
  };

  var onClose = function (vals) {
    // 下拉关闭时立即生效：draft → applied
    var st = panelState[dim];
    if (!st) return;
    st.moduleDraft[mod.pick] = vals.slice();
    st.moduleApplied = cloneModuleSel(st.moduleDraft);
    st.hiddenLines = {};
    refreshPanel(dim);
  };

  initMultiselect(ns + '-trigger', ns + '-dropdown', ns + '-label', onChange,
                  allLabel, moduleDraft[mod.pick] || [], onClose, MAX_PICK_LINES);
}

// 整块趋势视图渲染：总账区块 + 拆分模块 Tab
// box 即面板内的 #chartbox-<dim> 容器
// moduleDraft / moduleApplied 为模块级筛选状态（draft 用于下拉回填，applied 用于图表与副标题）
function renderTrendView(box, dim, scopes, moduleDraft, moduleApplied, ctx) {
  if (!box) return;
  moduleDraft = moduleDraft || emptyModuleSel();
  moduleApplied = moduleApplied || emptyModuleSel();

  if (!scopes.length) {
    box.innerHTML = '<div class="chart-empty">暂无可查看的账单数据</div>';
    return;
  }

  // 模块级已选产品：产品模块 / 报表 / 总账按此过滤；空 = 全部产品
  var appliedKeys = (moduleApplied.product || []).filter(function (k) {
    return PRODUCT_KEYS.indexOf(k) !== -1;
  });
  var keys = appliedKeys.length ? appliedKeys : PRODUCT_KEYS;

  // 1. 总账区块（总账口径 = 该维度所选主体下全部产品，与顶部产品筛选移除的口径一致）
  box.innerHTML = '';
  renderTrendBlock(box, dim, scopes, ctx);

  // 2. 拆分模块 Tab：Tab 切换展示不同变化趋势，仅渲染当前选中模块，避免平铺渲染导致页面加载慢
  var mods = (TREND_MODULES[dim] || []).filter(function (mod) {
    var subjects = moduleSubjectsOf(dim, mod.key, scopes,
      mod.key === 'product' ? null : moduleApplied[mod.key]);
    return subjects.length > 0;
  });
  if (!mods.length) return;

  var st = panelState[dim];
  var activeKey = st.trendTab;
  if (!mods.some(function (m) { return m.key === activeKey; })) {
    activeKey = mods[0].key;
    st.trendTab = activeKey;
  }

  // 单模块无需 Tab 栏，直接平铺渲染该模块
  if (mods.length === 1) {
    var solo = document.createElement('div');
    solo.className = 'trend-module-panel';
    solo.dataset.module = activeKey;
    box.appendChild(solo);
    appendModule(solo, dim, mods[0], scopes,
      moduleSubjectsOf(dim, mods[0].key, scopes,
        mods[0].key === 'product' ? null : moduleApplied[mods[0].key]),
      keys, ctx, moduleDraft, moduleApplied);
    return;
  }

  var tabs = document.createElement('div');
  tabs.className = 'trend-module-tabs';
  tabs.setAttribute('role', 'tablist');
  mods.forEach(function (mod) {
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'trend-module-tab' + (mod.key === activeKey ? ' active' : '');
    tab.dataset.module = mod.key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', mod.key === activeKey ? 'true' : 'false');
    tab.textContent = mod.title;
    tabs.appendChild(tab);
  });

  var panel = document.createElement('div');
  panel.className = 'trend-module-panel';
  panel.dataset.module = activeKey;

  // Tab 栏与拆分模块合并进同一灰底卡片：Tab 栏作为卡片顶部切换条，模块标题头已去除
  var tabbed = document.createElement('div');
  tabbed.className = 'trend-module trend-module-tabbed';
  tabbed.appendChild(tabs);
  tabbed.appendChild(panel);
  box.appendChild(tabbed);

  var activeMod = mods.filter(function (m) { return m.key === activeKey; })[0];
  var subjects = moduleSubjectsOf(dim, activeMod.key, scopes,
    activeMod.key === 'product' ? null : moduleApplied[activeMod.key]);
  appendModule(panel, dim, activeMod, scopes, subjects, keys, ctx, moduleDraft, moduleApplied, true);
}

// 趋势模块 Tab 切换：仅重绘当前选中模块，避免平铺渲染全部模块
function switchTrendTab(dim, modKey) {
  var st = panelState[dim];
  if (!st) return;
  var box = document.getElementById(st.ids.chartBox);
  if (!box) return;
  if (st.trendTab === modKey) return;
  st.trendTab = modKey;
  refreshPanel(dim);
}

// ====== 账单状态 / 账期状态 ======
// 单个账单（主体 × 产品）的状态流转：
//   出账中  账期结束后尚未到出账时刻
//   未结算  已出账，但结算尚未完成（出账后 2~6 小时内完成结算）
//   未结清  已结算，仍存在未结清欠款
//   已结清  已结算且欠款已还清
var BILL_STATUS = {
  billing:   { label: '出账中', cls: 's-billing' },
  unsettled: { label: '未结算', cls: 's-unsettled' },
  unpaid:    { label: '未结清', cls: 's-unpaid' },
  settled:   { label: '已结清', cls: 's-settled' }
};

// 出账时刻：
//   月账单 次月 3 日 8:00 完成出账
//   日账单 次日 14:00（沿用页面提示条「天账单：次日14点后为准确数据」的口径）
function issuedAt(grain, d) {
  if (grain === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 3, 8, 0);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 14, 0);
}

// 结算耗时 2~6 小时，按账期确定性取值，避免每次渲染状态跳动
function settleHours(grain, d) {
  return 2 + 4 * pseudo(periodIndex(grain, d), 9.7);
}

// 单个账单的状态。出账中 / 未结算由账期与当前时间决定（同账期下所有账单一致）；
// 已结算后是否仍有欠款则逐账单确定性判定。
function billStatusOf(scope, prodKey, grain, d) {
  var issued = issuedAt(grain, d);
  if (NOW < issued) return 'billing';
  if (NOW < new Date(issued.getTime() + settleHours(grain, d) * 3600000)) return 'unsettled';
  var seed = periodIndex(grain, d) * 0.37 + PROD_SEED[prodKey] * 13 +
             (scope.id ? SCOPE_SEED[scope.id] : 0);
  return pseudo(seed, 5.3) < 0.35 ? 'unpaid' : 'settled';
}

// 账期状态 = 该账期下所有账单状态的汇总，优先级：
//   出账中 > 未结算 > 未结清 > 已结清
// 即：只要还有账单在出账中，账期就是出账中；全部出账后只要有一个未结算，
// 账期就是未结算；全部结算后只要有一个未结清，账期就是未结清；
// 全部结清才是已结清。
var STATUS_PRIORITY = ['billing', 'unsettled', 'unpaid', 'settled'];

function periodStatusOf(statuses) {
  for (var i = 0; i < STATUS_PRIORITY.length; i++) {
    var s = STATUS_PRIORITY[i];
    if (statuses.indexOf(s) !== -1) return s;
  }
  return 'settled';
}

// 欠费金额：未结清即当期应付，已结清为 0，尚未结算时无法确定
function owedText(status, payable) {
  if (status === 'billing' || status === 'unsettled') return '--';
  return fmtMoney(status === 'unpaid' ? payable : 0);
}

// ====== 报表渲染 ======
// 一行一个「主体 × 产品」，给出该账期各产品的金额与下钻入口。
// extraCells(scope) 返回产品列之前的维度列
// 结算单元账单：结算单元单选，不再展示结算单元/资源组列
// 资源组账单：结算单元和资源组单选，不再展示这两列
function extraCells(dim, scope) {
  // 仅企业账单「按资源组」：资源组列前置，所属结算单元作为主列
  if (dim === 'enterprise' && groupOf(dim) === 'resource-group') {
    var g = RG_MAP[scope.id];
    return [g.name];
  }
  return [];
}

// 企业账单：按产品 / 按结算单元 / 按资源组；
// 结算单元账单：按产品 / 按资源组；
// 资源组账单：固定按产品逐行（行内已带结算单元 / 资源组列）。
function groupOf(dim) {
  if (dim === 'enterprise' || dim === 'billing-unit') return panelState[dim].group;
  return 'product';
}

// 「欠费金额」「账单状态」两列仅在「企业账单 + 按产品」的列表展示；
// 按结算单元 / 按资源组粒度以及结算单元 / 资源组账单均不展示这两列。
function showOwedColumn(dim) {
  return dim === 'enterprise' && groupOf(dim) === 'product';
}

// 各维度下「占比」列的口径说明：占比的分母随维度不同而不同，
// 与账单分析页同文案，直接标注在表头，避免用户误以为三个 Tab 的占比是同一口径。
var SHARE_TIP = {
  'enterprise': '当前行应付金额 / 企业下全部账单的应付金额',
  'billing-unit': '当前行应付金额 / 选中结算单元下全部账单的应付金额',
  'resource-group': '当前行应付金额 / 选中资源组下全部账单的应付金额'
};

// 占比列表头：文案 + 问号图标。
// 提示气泡为自绘元素而非原生 title，hover 即显示、点击可固定（再次点击或点空白处关闭）。
function shareHeadHtml(dim) {
  var tip = SHARE_TIP[dim] || '';
  if (!tip) return '<span style="text-align:right">占比</span>';
  return '<span class="top-share-head" style="text-align:right">占比' +
    '<span class="top-tip" tabindex="0" role="button" aria-label="占比说明">' +
    '<svg class="top-help-ico" viewBox="0 0 14 14" fill="none">' +
    '<circle cx="7" cy="7" r="5.6" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M5.6 5.6a1.4 1.4 0 112.2 1.2c-.5.35-.8.6-.8 1.1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
    '<circle cx="7" cy="10" r=".6" fill="currentColor"/>' +
    '</svg>' +
    '<span class="top-tip-bubble">' + escapeHtml(tip) + '</span>' +
    '</span></span>';
}

// 提示气泡的点击态：点图标固定气泡，点其他位置 / 再次点击关闭
function closeAllTips(except) {
  document.querySelectorAll('.top-tip.open').forEach(function (t) {
    if (t !== except) t.classList.remove('open');
  });
}

document.addEventListener('click', function (e) {
  var tip = e.target.closest && e.target.closest('.top-tip');
  if (tip) {
    e.stopPropagation();
    var willOpen = !tip.classList.contains('open');
    closeAllTips(tip);
    tip.classList.toggle('open', willOpen);
    return;
  }
  closeAllTips(null);
});

// 键盘可达：聚焦图标后按回车 / 空格切换气泡，ESC 关闭
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeAllTips(null); return; }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var tip = document.activeElement;
  if (!tip || !tip.classList || !tip.classList.contains('top-tip')) return;
  e.preventDefault();
  var willOpen = !tip.classList.contains('open');
  closeAllTips(tip);
  tip.classList.toggle('open', willOpen);
});

function reportHeadHtml(dim) {
  var group = groupOf(dim);
  var h = '<tr>';
  // 仅企业账单按资源组时前置资源组列；结算单元/资源组账单不再展示冗余维度列
  if (dim === 'enterprise' && group === 'resource-group') h += '<th>资源组</th>';
  // 主列标签：按产品=产品；按结算单元=结算单元；按资源组时企业账单主列是结算单元，
  // 结算单元账单主列是资源组
  var mainLabel = group === 'product' ? '产品'
    : (group === 'billing-unit' ? '结算单元'
    : (dim === 'enterprise' ? '结算单元' : '资源组'));
  h += '<th>' + mainLabel + '</th>' +
       '<th class="col-num">官网标准价金额</th>' +
       '<th class="col-num">优惠金额</th>' +
       '<th class="col-num">应付金额</th>' +
       '<th class="col-num">' + shareHeadHtml(dim) + '</th>';
  if (showOwedColumn(dim)) h += '<th class="col-num">欠费金额</th><th>账单状态</th>';
  h += '</tr>';
  return h;
}

// 主体名 / 标准价 / 优惠 / 应付 / 占比 五列，加欠费与状态两列（如展示）与维度列
function reportColCount(dim) {
  var group = groupOf(dim);
  var extra = (dim === 'enterprise' && group === 'resource-group') ? 1 : 0;
  return 5 + (showOwedColumn(dim) ? 2 : 0) + extra;
}

// 账单分析入口已移除（需求：去掉账单分析的按钮）

// 环比上一账期：日报表比前一天，月报表比前一月。
// 基数与当前卡片同口径 —— 同一批 scope × 产品，而非企业全量，
// 否则筛选后「应付合计」与「环比」两个数对不上，评审必被追问。
function momOf(scopes, keys, grain, date, sumPayable) {
  var prev = shiftUnits(grain, date, -1);
  var prevSum = 0;
  scopes.forEach(function (sc) {
    keys.forEach(function (k) { prevSum += amountOf(sc, k, grain, prev); });
  });
  return {
    label: fmtByGrain(grain, prev),
    prevSum: prevSum,
    // 上一账期为 0 时百分比无意义（除零），返回 null 由渲染侧显示 --
    pct: prevSum > 0 ? (sumPayable - prevSum) / prevSum * 100 : null
  };
}

// 环比方向：涨 / 跌 / 持平。持平不画箭头，避免 0.00% 旁边还有个方向指示
function momDir(pct) {
  if (pct > 0.005) return 'up';
  if (pct < -0.005) return 'down';
  return 'flat';
}

function momArrow(dir, cls) {
  if (dir === 'flat') return '';
  var d = dir === 'up' ? 'M5 8.5V2M5 2L2 5M5 2l3 3' : 'M5 1.5V8M5 8l3-3M5 8L2 5';
  return '<svg class="' + cls + '" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
    '<path d="' + d + '" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" /></svg>';
}

// 环比百分比文本：涨带 + 号，箭头跟在数字之后
function momText(pct) {
  return (pct > 0.005 ? '+' : '') + pct.toFixed(2) + '%';
}

// 卡片内应付金额下方的环比小字：百分比 + 箭头 + 上一账期。
// 不再单独占一张卡，而是并入「应付金额合计」作为补充说明。
function momHtml(mom) {
  if (mom.pct === null) return '<span class="period-mom-sub is-flat">环比 --</span>';
  var dir = momDir(mom.pct);
  return '<span class="period-mom-sub is-' + dir + '">' +
    '环比 ' + momText(mom.pct) + momArrow(dir, 'period-mom-sub-ico') +
    '<span class="period-mom-base">（上一账期 ' + escapeHtml(mom.label) + '）</span>' +
  '</span>';
}

// 表格内的环比：挂在应付金额下方的小字
function cellMomHtml(pct) {
  if (pct === null) return '<span class="cell-mom is-flat">环比 --</span>';
  var dir = momDir(pct);
  return '<span class="cell-mom is-' + dir + '">环比 ' +
    momText(pct) + momArrow(dir, 'cell-mom-ico') +
  '</span>';
}

// 卡片头部：账期 + 状态 + 账单分析入口。空态也复用，故单独成函数
function periodHeadHtml(label, status) {
  var st = BILL_STATUS[status];
  return '<div class="period-head">' +
    '<span class="period-head-label">当前账期</span>' +
    '<span class="period-head-value">' + escapeHtml(label) + '</span>' +
    (st
      ? '<span class="period-status ' + st.cls + '">' +
          '<span class="period-status-dot"></span>' + st.label +
        '</span>'
      : '') +
  '</div>';
}

// 指标卡图标：钱包 / 折线 / 楼宇 / 账单，统一 20×20 线稿
var METRIC_ICONS = {
  money:
    '<rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />' +
    '<path d="M2.5 8.5h15" stroke="currentColor" stroke-width="1.4" />' +
    '<circle cx="13.5" cy="12.5" r="1.3" fill="currentColor" />',
  trend:
    '<path d="M3 14.5l4.5-4.5 3 3L17 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />' +
    '<path d="M13 6.5h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />',
  org:
    '<rect x="3" y="7" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.4" />' +
    '<rect x="11" y="3" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.4" />' +
    '<path d="M5.2 10h1.6M5.2 13h1.6M13.2 6h1.6M13.2 9h1.6M13.2 12h1.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />',
  owed:
    '<path d="M4.5 3.5h11v13l-2-1.4-1.8 1.4-1.7-1.4-1.8 1.4-1.7-1.4-2 1.4v-13z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />' +
    '<path d="M7.5 7.5h5M7.5 10.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />',
  product:
    '<path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />' +
    '<path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />'
};

// 指标卡：左侧图标底 + 右侧标签与大号数值
function metricCardHtml(icon, label, valueHtml, subHtml) {
  return '<div class="period-item">' +
    '<span class="period-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 20 20" fill="none">' + METRIC_ICONS[icon] + '</svg>' +
    '</span>' +
    '<span class="period-body">' +
      '<span class="period-label">' + escapeHtml(label) + '</span>' +
      valueHtml +
      (subHtml || '') +
    '</span>' +
  '</div>';
}

// 涉及范围数字：生成可点击（或纯文本）的数字链接片段，用于「涉及产品/结算单元」合并卡。
// 需求：涉及的结算单元 / 产品不用罗列具体名称，仅保留个数。
// 数字可点击跳到列表对应粒度；linkable 为 false 时为纯文本。
function coverCountHtml(n, cover_, linkable, title, unit) {
  var t = n + (unit || ' 个');
  return linkable
    ? '<a class="cover-link" href="#" data-cover="' + cover_ + '" title="' + title + '">' + t + '</a>'
    : t;
}

// 涉及范围文字：随维度不同组合「产品 / 结算单元 / 资源组」三个数字。
// 企业账单三个都展示；结算单元账单展示产品与资源组；资源组账单只展示产品。
function coverValueHtml(dim, cover) {
  var parts = [
    '<span class="period-cover-label">产品</span>' +
    coverCountHtml(cover.prodNames.length, 'product', dim !== 'resource-group', '在列表中按产品查看', ' 个')
  ];
  if (dim === 'enterprise') {
    parts.push('<span class="period-cover-sep"> / </span>' +
      '<span class="period-cover-label">结算单元</span>' +
      coverCountHtml(cover.buNames.length, 'billing-unit', true, '在列表中按结算单元查看', ' 个'));
  }
  if (dim !== 'resource-group') {
    parts.push('<span class="period-cover-sep"> / </span>' +
      '<span class="period-cover-label">资源组</span>' +
      coverCountHtml(cover.rgNames.length, 'resource-group', true, '在列表中按资源组查看', ' 个'));
  }
  return parts.join('');
}

// 账期概览卡片：应付金额合计（含环比）/ 涉及范围 / 欠费金额合计。
// 欠费金额合计仅在「企业账单」维度展示；结算单元 / 资源组账单不展示。
function renderPeriodCard(card, label, status, sumPayable, owedSum, mom, cover, dim) {
  if (!card) return;
  var owedCard = dim === 'enterprise'
    ? metricCardHtml('owed', '欠费金额合计',
        '<span class="period-value period-amount' + (owedSum ? ' is-owed' : '') + '">' +
          (owedSum === null ? '--' : '￥' + fmtMoney(owedSum)) +
        '</span>',
        // 未结算完成时说明为何没有确切欠费，避免读者以为是缺数
        owedSum === null ? '<span class="period-sub">该账期尚未结算完成</span>' : '')
    : '';
  var coverTitle = dim === 'enterprise' ? '涉及产品/结算单元/资源组'
    : (dim === 'billing-unit' ? '涉及产品/资源组' : '涉及产品');
  card.innerHTML =
    periodHeadHtml(label, status) +
    '<div class="period-metrics' + (dim === 'enterprise' ? '' : ' has-2') + '">' +
      metricCardHtml('money', '应付金额合计',
        '<span class="period-value period-amount">￥' + fmtMoney(sumPayable) + '</span>',
        momHtml(mom)) +
      metricCardHtml('product', coverTitle,
        '<span class="period-value period-cover">' + coverValueHtml(dim, cover) + '</span>') +
      owedCard +
    '</div>';
}

// 本次查询覆盖的结算单元 / 资源组 / 产品。
// 企业维度只有一个 scope（企业整体），其涉及的结算单元与资源组取当前角色可见的全部；
// 结算单元 / 资源组维度则由所选 scope 反查所属结算单元及其下资源组。
function coverOf(dim, scopes, keys) {
  var buIds = [], rgIds = [];
  function pushBu(id) { if (id && buIds.indexOf(id) === -1) buIds.push(id); }
  function pushRg(id) { if (id && rgIds.indexOf(id) === -1) rgIds.push(id); }

  if (dim === 'enterprise') {
    allowedBuIds().forEach(pushBu);
    allowedRgIds().forEach(pushRg);
  } else {
    scopes.forEach(function (sc) {
      if (sc.type === 'bu') {
        pushBu(sc.id);
        BU_MAP[sc.id].groups.forEach(function (rg) { pushRg(rg.id); });
      } else {
        var rg = RG_MAP[sc.id];
        pushBu(rg.buId);
        pushRg(sc.id);
      }
    });
  }

  return {
    buNames: buIds.map(function (id) { return BU_MAP[id].name; }),
    rgNames: rgIds.map(function (id) { return RG_MAP[id].name; }),
    prodNames: keys.map(function (k) { return PRODUCTS[k].name; })
  };
}

// 跳转账单详情时携带的主体参数：结算单元 / 资源组取该行自身所属主体
function scopeParams(dim, scope) {
  if (dim === 'billing-unit') {
    // 按产品：scope 为结算单元；按资源组：scope 为资源组
    if (scope.type === 'rg') {
      var rg1 = RG_MAP[scope.id];
      return { bu: BU_MAP[rg1.buId].name, rg: rg1.name };
    }
    return { bu: BU_MAP[scope.id].name, rg: '' };
  }
  if (dim === 'resource-group') {
    var rg = RG_MAP[scope.id];
    return { bu: BU_MAP[rg.buId].name, rg: rg.name };
  }
  // 企业账单「按资源组」：scope 为资源组，需要带出所属结算单元与资源组
  if (dim === 'enterprise' && scope.type === 'rg') {
    var g = RG_MAP[scope.id];
    return { bu: BU_MAP[g.buId].name, rg: g.name };
  }
  return { bu: '', rg: '' };
}

// 占比分母：当前账期下「企业 / 选中结算单元 / 选中资源组」账单的应付总额。
// 与账单分析页同口径：占比 = 当前行账单金额 ÷ 该口径总额。
// 采用全部产品口径（不受产品筛选影响），因为占比衡量的是「该账单在所属主体账单中的分量」。
function scopeTotalOf(scopes, grain, date) {
  var total = 0;
  scopes.forEach(function (sc) {
    PRODUCT_KEYS.forEach(function (k) { total += amountOf(sc, k, grain, date); });
  });
  return total;
}

// 报表视图：账期为单个，取上下文的第一个（也是唯一一个）账期
function renderReport(ids, dim, scopes, selectedKeys, ctx) {
  var thead = document.getElementById(ids.thead);
  var tbody = document.getElementById(ids.tbody);
  var card = document.getElementById(ids.card);
  if (!thead || !tbody) return;

  thead.innerHTML = reportHeadHtml(dim);
  var colSpan = reportColCount(dim);
  var keys = selectedKeys.length ? selectedKeys : PRODUCT_KEYS;
  var label = ctx.labels[0];
  var date = ctx.dates[0];

  if (!scopes.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="' + colSpan + '">暂无可查看的账单数据</td></tr>';
    // 无数据时仍保留账期与分析入口，避免入口随空态一起消失；
    // 无账单则无状态可言，指标区整块省略
    if (card) card.innerHTML = periodHeadHtml(label, null);
    return;
  }

  var billTypeParam = ctx.grain === 'month' ? 'month' : 'day';
  var group = groupOf(dim);
  var rows = buildReportRows(dim, group, scopes, keys, ctx.grain, date);

  // 报表列表（日报表 / 月报表）无论按产品 / 按结算单元 / 按资源组，
  // 统一按应付金额从大到小排序，便于快速识别费用主体。
  rows.sort(function (a, b) { return b.payable - a.payable; });

  // 应用报表实体筛选（产品 / 结算单元 / 资源组多选过滤）。
  // 列表行按 filterKey 过滤；卡片口径（应付合计/环比/涉及范围）需与列表一致。
  var cardScopes = scopes;
  var cardKeys = keys;
  var filterVals = panelState[dim].reportFilter[group];
  if (filterVals && filterVals.length) {
    var filterSet = {};
    filterVals.forEach(function (v) { filterSet[v] = true; });
    var prefix = group === 'product' ? 'prod:' : (group === 'billing-unit' ? 'bu:' : 'rg:');
    rows = rows.filter(function (r) {
      var key = r.filterKey;
      if (key && key.indexOf(prefix) === 0) return filterSet[key.slice(prefix.length)];
      return true;
    });
    // 卡片口径同步：按产品筛选缩小产品范围；按结算单元/资源组筛选缩小主体范围
    if (group === 'product') {
      cardKeys = filterVals.slice();
    } else if (group === 'billing-unit') {
      cardScopes = filterVals.map(function (id) { return { type: 'bu', id: id }; });
    } else {
      cardScopes = filterVals.map(function (id) { return { type: 'rg', id: id }; });
    }
  }

  var sumPayable = rows.reduce(function (s, r) { return s + r.payable; }, 0);
  var periodStatus = periodStatusOf(rows.map(function (r) { return r.status; }));
  // 尚未结算完成的账期无法给出确切欠费，合计与单行一样留空
  var owedSum = (periodStatus === 'billing' || periodStatus === 'unsettled')
    ? null
    : rows.reduce(function (s, r) { return s + (r.status === 'unpaid' ? r.payable : 0); }, 0);

  renderPeriodCard(card, label, periodStatus, sumPayable, owedSum,
                   momOf(cardScopes, cardKeys, ctx.grain, date, sumPayable),
                   coverOf(dim, cardScopes, cardKeys), dim);

  // 占比分母为当前账期下所属主体的账单应付总额（全部产品口径），与账单分析页同口径。
  // 占比衡量的是「该行在所属主体账单中的分量」，故分母始终用面板级主体 scopes，
  // 不随产品/结算单元/资源组列表筛选缩小。
  var scopeTotal = scopeTotalOf(scopes, ctx.grain, date);
  // 条形长度与账单分析页一致：以本次列表内的最大金额为满格基准做归一化，
  // 否则占比数值普遍偏小（如 9%、13%），按绝对百分比绘制时各行几乎无差别
  var maxPayable = rows.reduce(function (m, r) { return Math.max(m, r.payable); }, 0);

  tbody.innerHTML = rows.map(function (r) {
    // 账单详情传参：账单类型（天账单/月账单）+ 选中账期 + 该行所属产品 / 结算单元 / 资源组。
    // 按结算单元分行时该行覆盖全部产品，故不带 product 参数。
    var sp = scopeParams(dim, r.scope);
    var bu = r.buName || sp.bu;
    var href = '../账单详情/index.html?billType=' + billTypeParam +
               '&period=' + encodeURIComponent(label) +
               (r.prodName ? '&product=' + encodeURIComponent(r.prodName) : '') +
               (bu ? '&billingUnit=' + encodeURIComponent(bu) : '') +
               (sp.rg ? '&resourceGroup=' + encodeURIComponent(sp.rg) : '');
    var st = BILL_STATUS[r.status];
    // 合计为 0 时不显示占比
    var share = scopeTotal > 0 ? r.payable / scopeTotal * 100 : null;
    var bar = maxPayable > 0 ? Math.max(r.payable, 0) / maxPayable * 100 : 0;

    var cells = ['<tr>'];
    extraCells(dim, r.scope).forEach(function (x) { cells.push('<td>' + escapeHtml(x) + '</td>'); });
    // 仅企业账单「按资源组」时资源组列已前置，主列展示所属结算单元；
    // 其余情况主列直接展示行自身名称
    var mainName = (dim === 'enterprise' && group === 'resource-group') ? r.buName : r.name;
    cells.push('<td>' + escapeHtml(mainName) + '</td>');
    cells.push('<td class="col-num">' + fmtMoney(r.standard) + '</td>');
    cells.push('<td class="col-num">' + fmtMoney(r.discount) + '</td>');
    // 应付金额即下钻入口，点击进入该行在本账期下的账单详情；环比挂在金额下方
    cells.push('<td class="col-num"><span class="cell-pay">' +
               '<a class="pay-link" href="' + escapeHtml(href) +
               '" target="_blank" rel="noopener" title="查看账单详情">' + fmtMoney(r.payable) + '</a>' +
               cellMomHtml(r.momPct) +
               '</span></td>');
    cells.push('<td class="col-num">' + shareCellHtml(share, bar) + '</td>');
    if (showOwedColumn(dim)) {
      cells.push('<td class="col-num">' + owedText(r.status, r.payable) + '</td>');
      cells.push('<td><span class="bill-status ' + st.cls + '">' + st.label + '</span></td>');
    }
    cells.push('</tr>');
    return cells.join('');
  }).join('');
}

// 占比：百分比 + 细条形图。
// bar 为归一化后的条形长度（列表内最大金额为 100），使各行长度可横向比较；
// 有金额但比例极小时给 2% 保底，避免条形完全不可见。
function shareCellHtml(share, bar) {
  if (share === null) return '--';
  var w = bar > 0 ? Math.max(bar, 2) : 0;
  return '<span class="cell-share">' +
    '<span>' + share.toFixed(2) + '%</span>' +
    '<span class="share-bar"><span class="share-bar-fill" style="width:' +
      w.toFixed(2) + '%"></span></span>' +
  '</span>';
}

// 单行环比：与该行同一主体 / 同一产品口径下的上一账期比
function rowMomPct(payable, prevPayable) {
  return prevPayable > 0 ? (payable - prevPayable) / prevPayable * 100 : null;
}

// 构造报表行。
// group='product'        逐产品一行（各维度通用）
// group='billing-unit'   逐结算单元一行，金额为该单元下所选产品之和（仅企业账单）
// group='resource-group' 逐资源组一行，金额为该资源组下所选产品之和（仅企业账单）
function buildReportRows(dim, group, scopes, keys, grain, date) {
  var prev = shiftUnits(grain, date, -1);
  var rows = [];

  if (group === 'billing-unit') {
    // 企业维度下 scopes 恒为「企业整体」一项，结算单元需另行展开
    allowedBuIds().forEach(function (buId) {
      var sc = { type: 'bu', id: buId };
      var payable = 0, prevPayable = 0, statuses = [];
      keys.forEach(function (k) {
        payable += amountOf(sc, k, grain, date);
        prevPayable += amountOf(sc, k, grain, prev);
        statuses.push(billStatusOf(sc, k, grain, date));
      });
      rows.push({
        scope: sc,
        name: BU_MAP[buId].name,
        buName: BU_MAP[buId].name,
        prodName: '',
        filterKey: 'bu:' + buId,
        payable: payable,
        standard: payable * 1.916,
        discount: payable * 1.916 - payable,
        momPct: rowMomPct(payable, prevPayable),
        // 该单元下多个产品状态汇总，口径与账期状态一致
        status: periodStatusOf(statuses)
      });
    });
    return rows;
  }

  if (group === 'resource-group') {
    // 企业维度按全部可见资源组展开；结算单元维度按所选结算单元下的资源组展开。
    // 金额为该资源组下所选产品之和。
    var rgIds = dim === 'enterprise' ? allowedRgIds() : [];
    if (dim !== 'enterprise') {
      scopes.forEach(function (sc) {
        BU_MAP[sc.id].groups.forEach(function (rg) { rgIds.push(rg.id); });
      });
    }
    rgIds.forEach(function (rgId) {
      var sc = { type: 'rg', id: rgId };
      var payable = 0, prevPayable = 0, statuses = [];
      keys.forEach(function (k) {
        payable += amountOf(sc, k, grain, date);
        prevPayable += amountOf(sc, k, grain, prev);
        statuses.push(billStatusOf(sc, k, grain, date));
      });
      rows.push({
        scope: sc,
        name: RG_MAP[rgId].name,
        buName: BU_MAP[RG_MAP[rgId].buId].name,
        prodName: '',
        filterKey: 'rg:' + rgId,
        payable: payable,
        standard: payable * 1.916,
        discount: payable * 1.916 - payable,
        momPct: rowMomPct(payable, prevPayable),
        status: periodStatusOf(statuses)
      });
    });
    return rows;
  }

  scopes.forEach(function (sc) {
    keys.forEach(function (k) {
      var payable = amountOf(sc, k, grain, date);
      rows.push({
        scope: sc,
        name: PRODUCTS[k].name,
        prodName: PRODUCTS[k].name,
        filterKey: 'prod:' + k,
        payable: payable,
        standard: payable * 1.916,
        discount: payable * 1.916 - payable,
        momPct: rowMomPct(payable, amountOf(sc, k, grain, prev)),
        status: billStatusOf(sc, k, grain, date)
      });
    });
  });
  return rows;
}

// ====== 角色权限模型 ======
var SAME_HINT = '主账号 / 企业管理员 / 系统管理员：可查看企业下全部账单（企业账单 / 结算单元账单 / 资源组账单）';
var roleConfig = {
  'master': {
    label: '主账号', tab: 'enterprise',
    tabs: ['enterprise', 'billing-unit', 'resource-group'],
    buIds: null, rgIds: null, hint: SAME_HINT
  },
  'enterprise-admin': {
    label: '企业管理员', tab: 'enterprise',
    tabs: ['enterprise', 'billing-unit', 'resource-group'],
    buIds: null, rgIds: null, hint: SAME_HINT
  },
  'sys-admin': {
    label: '系统管理员', tab: 'enterprise',
    tabs: ['enterprise', 'billing-unit', 'resource-group'],
    buIds: null, rgIds: null, hint: SAME_HINT
  },
  'billing-admin': {
    label: '结算单元管理员', tab: 'billing-unit',
    tabs: ['billing-unit', 'resource-group'],
    buIds: ['bu1', 'bu2'], rgIds: null,
    hint: '结算单元管理员：可查看有权限的结算单元账单，以及该结算单元下所有资源组的账单（无企业账单）'
  },
  'rg-admin': {
    label: '资源组管理员', tab: 'resource-group',
    tabs: ['resource-group'],
    // 与账单详情 / 账单分析保持同一套可见资源组（rg1、rg2 属 bu1，rg5 属 bu2）
    buIds: [], rgIds: ['rg1', 'rg2', 'rg5'],
    hint: '资源组管理员：仅可查看有权限的资源组账单（无企业账单 / 结算单元账单）'
  }
};

var currentRole = 'master';

function allowedBuIds() {
  var cfg = roleConfig[currentRole];
  return cfg.buIds === null ? ALL_BU_IDS.slice() : cfg.buIds.slice();
}

// 结算单元管理员自动继承其结算单元下全部资源组
function allowedRgIds() {
  var cfg = roleConfig[currentRole];
  if (cfg.rgIds !== null) return cfg.rgIds.slice();
  var ids = [];
  allowedBuIds().forEach(function (buId) {
    BU_MAP[buId].groups.forEach(function (rg) { ids.push(rg.id); });
  });
  return ids;
}

function rgPanelBuIds() {
  var set = [];
  allowedRgIds().forEach(function (id) {
    var buId = RG_MAP[id].buId;
    if (set.indexOf(buId) === -1) set.push(buId);
  });
  return set;
}

// 结算单元账单：默认第一个有权限的结算单元
function defaultBuId() {
  var ids = allowedBuIds();
  return ids.length ? ids[0] : '';
}

// 资源组账单：默认第一个有权限结算单元（按可见资源组归属推导）
function defaultRgPanelBuId() {
  var ids = rgPanelBuIds();
  return ids.length ? ids[0] : '';
}

// 资源组账单：给定结算单元下第一个有权限的资源组
function defaultRgId(buId) {
  var ids = allowedRgIds().filter(function (id) { return !buId || RG_MAP[id].buId === buId; });
  return ids.length ? ids[0] : '';
}

// ====== 面板状态 ======
// 每个维度：
//   view        当前视图
//   dates       各视图各自的账期草稿（切视图不丢已选账期）
//   appliedDates各视图已生效的账期
//   draft/applied 组织与产品筛选（维度内四个视图共用）
// 结算单元 / 资源组为必填单选，默认值取第一个有权限项，不存在「全部」态。
// 产品筛选已从顶部移除：企业 / 结算单元 / 资源组账单均按「全部产品」展示。
function emptyOrgFilters(dim) {
  var base = {};
  if (dim === 'billing-unit') base.buId = defaultBuId();
  if (dim === 'resource-group') {
    base.buId = defaultRgPanelBuId();
    base.rgId = defaultRgId(base.buId);
  }
  return base;
}

function cloneOrgFilters(dim, f) {
  var c = emptyOrgFilters(dim);
  if (dim === 'billing-unit') c.buId = f.buId;
  if (dim === 'resource-group') {
    c.buId = f.buId;
    c.rgId = f.rgId;
  }
  return c;
}

// 趋势模块级筛选（日趋势 / 月趋势）：
//   product  产品趋势模块   —— 多选产品（空 = 全部）
//   bu       结算单元趋势模块 —— 多选结算单元（空 = 全部，仅企业账单）
//   rg       资源组趋势模块   —— 多选资源组（空 = 全部，仅企业账单）
// 结算单元 / 资源组账单下主体由上方筛选栏决定，不参与模块级筛选。
function emptyModuleSel() {
  return { product: [], bu: [], rg: [] };
}

function cloneModuleSel(s) {
  return { product: (s.product || []).slice(), bu: (s.bu || []).slice(), rg: (s.rg || []).slice() };
}

// 报表列表实体筛选状态：按列表粒度（product / billing-unit / resource-group）各自记录已选项。
// 空数组表示「全选」。
function emptyReportFilter() {
  return { 'product': [], 'billing-unit': [], 'resource-group': [] };
}

function cloneReportFilter(f) {
  return {
    'product': (f && f.product || []).slice(),
    'billing-unit': (f && f['billing-unit'] || []).slice(),
    'resource-group': (f && f['resource-group'] || []).slice()
  };
}

function emptyDates() {
  var d = {};
  VIEW_KEYS.forEach(function (v) { d[v] = defaultDates(v); });
  return d;
}

function cloneDates(d) {
  var c = {};
  VIEW_KEYS.forEach(function (v) {
    c[v] = {};
    Object.keys(d[v]).forEach(function (k) { c[v][k] = d[v][k]; });
  });
  return c;
}

function makePanel(ids) {
  return {
    view: 'day-report',
    dates: emptyDates(),
    appliedDates: emptyDates(),
    draft: emptyOrgFilters(ids.dim),
    applied: emptyOrgFilters(ids.dim),
    // 趋势模块级筛选（draft/applied 语义与组织筛选一致：
    // 模块头下拉勾选存 draft，点「搜索」写入 applied 生效）
    moduleDraft: emptyModuleSel(),
    moduleApplied: emptyModuleSel(),
    // 报表列表粒度：
    //   企业账单 product / billing-unit / resource-group 可切；
    //   结算单元账单 product / resource-group 可切；
    //   资源组账单恒为 product。
    group: 'product',
    // 报表列表实体筛选（产品 / 结算单元 / 资源组），按当前列表粒度取值：
    //   空数组 = 全选；否则仅展示选中的实体。切换粒度时各自保留筛选状态。
    reportFilter: emptyReportFilter(),
    // 趋势图中被手动切换过显隐的曲线：key -> true(隐藏) / false(显示)。
    // 未记录的曲线走默认：总账隐藏、产品显示。
    hiddenLines: {},
    // 当前选中的趋势模块 Tab key（product / bu / rg），首次渲染时自动取第一个可用模块
    trendTab: '',
    ids: ids
  };
}

var panelState = {
  'enterprise': makePanel({
    dim: 'enterprise', chart: 'chart-ep', legend: 'legend-ep',
    thead: 'thead-ep', tbody: 'tbody-ep', card: 'periodcard-enterprise', chartBox: 'chartbox-enterprise', reportBox: 'reportbox-enterprise',
    dateCtl: 'date-enterprise'
  }),
  'billing-unit': makePanel({
    dim: 'billing-unit', chart: 'chart-bp', legend: 'legend-bp',
    thead: 'thead-bp', tbody: 'tbody-bp', card: 'periodcard-billing-unit', chartBox: 'chartbox-billing-unit', reportBox: 'reportbox-billing-unit',
    dateCtl: 'date-billing-unit'
  }),
  'resource-group': makePanel({
    dim: 'resource-group', chart: 'chart-rgp', legend: 'legend-rgp',
    thead: 'thead-rgp', tbody: 'tbody-rgp', card: 'periodcard-resource-group', chartBox: 'chartbox-resource-group', reportBox: 'reportbox-resource-group',
    dateCtl: 'date-resource-group'
  })
};

// 计算面板当前生效的数据范围（受角色权限 + 已生效筛选条件共同约束）。
// 结算单元 / 资源组均为必填单选：未选中或越权时返回空，页面走空态。
function scopesOf(dim) {
  var f = panelState[dim].applied;
  if (dim === 'enterprise') {
    return roleConfig[currentRole].tabs.indexOf('enterprise') === -1
      ? [] : [{ type: 'enterprise' }];
  }
  if (dim === 'billing-unit') {
    if (!f.buId || allowedBuIds().indexOf(f.buId) === -1) return [];
    return [{ type: 'bu', id: f.buId }];
  }
  if (!f.rgId || allowedRgIds().indexOf(f.rgId) === -1) return [];
  if (f.buId && RG_MAP[f.rgId].buId !== f.buId) return [];
  return [{ type: 'rg', id: f.rgId }];
}

function refreshPanel(dim) {
  var st = panelState[dim];
  if (!st) return;
  var view = st.view;
  var isReport = VIEWS[view].mode === 'single';
  var scopes = scopesOf(dim);
  var ctx = buildContext(view, st.appliedDates[view]);

  // 报表视图只出表格，趋势视图只出曲线图
  var chartBox = document.getElementById(st.ids.chartBox);
  var reportBox = document.getElementById(st.ids.reportBox);
  if (chartBox) chartBox.style.display = isReport ? 'none' : '';
  if (reportBox) reportBox.style.display = isReport ? '' : 'none';

  if (isReport) {
    // 报表视图：先构建实体筛选下拉（随粒度 / 角色 / 主体联动重建），再渲染表格
    buildReportFilters(dim);
    renderReport(st.ids, dim, scopes, [], ctx);
  } else {
    var box = document.getElementById(st.ids.chartBox);
    renderTrendView(box, dim, scopes, st.moduleDraft, st.moduleApplied, ctx);
  }
}

// 点击「搜索」：先校验必填的结算单元 / 资源组，再校验账期，
// 账期非法或超上限直接报错，不自动截断
function applyFilters(dim) {
  var st = panelState[dim];
  if (!st) return;
  if (!validateOrgFilters(dim)) return;
  var view = st.view;
  var v = VIEWS[view];
  var d = st.dates[view];

  if (v.mode === 'single') {
    if (!parseByGrain(v.grain, d.date)) {
      showRangeTip(dim, '请选择账期', true);
      return;
    }
  } else {
    var a = parseByGrain(v.grain, d.start);
    var b = parseByGrain(v.grain, d.end);
    if (!a || !b) {
      showRangeTip(dim, '请填写完整的开始与结束账期', true);
      return;
    }
    if (periodIndex(v.grain, b) < periodIndex(v.grain, a)) {
      showRangeTip(dim, '开始账期不能晚于结束账期，请重新选择', true);
      return;
    }
    if (periodIndex(v.grain, b) - periodIndex(v.grain, a) + 1 > v.max) {
      showRangeTip(dim, v.err, true);
      return;
    }
  }

  showRangeTip(dim, '');
  st.appliedDates[view] = {};
  Object.keys(d).forEach(function (k) { st.appliedDates[view][k] = d[k]; });
  // 组织 / 模块级筛选变化会改变曲线集合，旧的显隐记录不再适用
  st.applied = cloneOrgFilters(dim, st.draft);
  st.moduleApplied = cloneModuleSel(st.moduleDraft);
  st.hiddenLines = {};
  refreshPanel(dim);
}

// 在筛选栏内提示；isError 为真时用错误色展示
function showRangeTip(dim, text, isError) {
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  if (!bar) return;
  var tip = bar.querySelector('.range-tip');
  if (!tip) return;
  tip.textContent = text || '';
  tip.classList.toggle('visible', !!text);
  tip.classList.toggle('is-error', !!(text && isError));
  if (text) {
    clearTimeout(tip._timer);
    tip._timer = setTimeout(function () { tip.classList.remove('visible'); }, isError ? 4000 : 3000);
  }
}

// ====== 账期选择器 ======
// 一个组件覆盖四种形态：单选 / 区间 × 日 / 月。
//   单选：点一下即选定并关闭
//   区间：左右两栏分别选开始与结束，点「确定」提交
var MONTH_NAMES = ['01月', '02月', '03月', '04月', '05月', '06月', '07月', '08月', '09月', '10月', '11月', '12月'];
var WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

// 快捷区间：以「结束点」为基准往前推 n 个单位
function presetsOf(grain) {
  if (grain === 'month') {
    return [{ n: 3, label: '近3个月' }, { n: 6, label: '近6个月' }, { n: 12, label: '近12个月' }];
  }
  return [{ n: 7, label: '近7天' }, { n: 15, label: '近15天' }, { n: 30, label: '近30天' }];
}

var dateCtls = {};

// 按当前视图重建该维度的账期控件
function buildDateCtl(dim) {
  var st = panelState[dim];
  var host = document.getElementById(st.ids.dateCtl);
  if (!host) return;

  var view = st.view;
  var v = VIEWS[view];
  var d = st.dates[view];

  if (v.mode === 'single') {
    host.innerHTML =
      '<div class="date-single picker-' + v.grain + '">' +
        '<input type="text" readonly value="' + escapeHtml(d.date) + '">' +
        '<svg class="cal" viewBox="0 0 16 16" fill="none">' +
          '<rect x="2" y="3" width="12" height="11" rx="1.2" stroke="currentColor" stroke-width="1.2" />' +
          '<path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />' +
        '</svg>' +
        '<div class="dp-pop"></div>' +
      '</div>';
  } else {
    host.innerHTML =
      '<div class="date-range picker-' + v.grain + '">' +
        '<input type="text" class="dp-input dp-input-start" readonly value="' + escapeHtml(d.start) + '">' +
        '<span class="tilde">~</span>' +
        '<input type="text" class="dp-input dp-input-end" readonly value="' + escapeHtml(d.end) + '">' +
        '<svg class="cal" viewBox="0 0 16 16" fill="none">' +
          '<rect x="2" y="3" width="12" height="11" rx="1.2" stroke="currentColor" stroke-width="1.2" />' +
          '<path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />' +
        '</svg>' +
        '<div class="dp-pop dp-pop-range"></div>' +
      '</div>';
  }

  dateCtls[dim] = v.mode === 'single' ? initSinglePicker(dim, host) : initRangePicker(dim, host);
}

// ---- 公共：月份网格 / 日历网格 ----
function paneHead(text, showMonthNav, sideAttr) {
  var sa = sideAttr || '';
  return '<div class="dp-head">' +
    '<span class="dp-nav"' + sa + ' data-nav="py" title="上一年">&laquo;</span>' +
    (showMonthNav
      ? '<span class="dp-nav"' + sa + ' data-nav="pm" title="上个月">&lsaquo;</span>'
      : '<span class="dp-nav-ph"></span>') +
    '<span class="dp-title">' + text + '</span>' +
    (showMonthNav
      ? '<span class="dp-nav"' + sa + ' data-nav="nm" title="下个月">&rsaquo;</span>'
      : '<span class="dp-nav-ph"></span>') +
    '<span class="dp-nav"' + sa + ' data-nav="ny" title="下一年">&raquo;</span>' +
    '</div>';
}

function monthGridHtml(year, cellClassOf, sideAttr) {
  var html = ['<div class="dp-grid dp-grid-month">'];
  for (var m = 0; m < 12; m++) {
    var d = new Date(year, m, 1);
    html.push('<span class="dp-cell ' + cellClassOf(d) + '"' + (sideAttr || '') +
              ' data-y="' + year + '" data-m="' + m + '">' + MONTH_NAMES[m] + '</span>');
  }
  html.push('</div>');
  return html.join('');
}

function dayGridHtml(view, cellClassOf, sideAttr) {
  var y = view.getFullYear(), m = view.getMonth();
  var lead = (new Date(y, m, 1).getDay() + 6) % 7;  // 周一为一周起点
  var days = new Date(y, m + 1, 0).getDate();
  var html = ['<div class="dp-week">'];
  WEEK_NAMES.forEach(function (w) { html.push('<span>' + w + '</span>'); });
  html.push('</div><div class="dp-grid dp-grid-day">');
  for (var i = 0; i < lead; i++) html.push('<span class="dp-cell dp-blank"></span>');
  for (var dnum = 1; dnum <= days; dnum++) {
    var d = new Date(y, m, dnum);
    html.push('<span class="dp-cell ' + cellClassOf(d) + '"' + (sideAttr || '') +
              ' data-y="' + y + '" data-m="' + m + '" data-d="' + dnum + '">' + dnum + '</span>');
  }
  html.push('</div>');
  return html.join('');
}

// ---- 单个账期选择器（日报表 / 月报表）----
function initSinglePicker(dim, host) {
  var box = host.querySelector('.date-single');
  var input = box.querySelector('input');
  var pop = box.querySelector('.dp-pop');
  var st = panelState[dim];

  function view() { return st.view; }
  function grain() { return VIEWS[view()].grain; }
  function current() {
    return parseByGrain(grain(), st.dates[view()].date) ||
           parseByGrain(grain(), defaultDates(view()).date);
  }

  var navView = null;

  function close() { pop.classList.remove('open'); }

  function open() {
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { if (p !== pop) p.classList.remove('open'); });
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    var cur = current();
    navView = new Date(cur.getFullYear(), cur.getMonth(), 1);
    render();
    pop.classList.add('open');
  }

  function render() {
    var g = grain();
    var cur = current();
    var cellClassOf = function (d) {
      return periodIndex(g, d) === periodIndex(g, cur) ? 'edge' : '';
    };
    var html;
    if (g === 'month') {
      html = paneHead(navView.getFullYear() + '年', false) +
             monthGridHtml(navView.getFullYear(), cellClassOf) +
             '<div class="dp-foot"><span class="dp-foot-tip">选择单个月账期</span></div>';
    } else {
      html = paneHead(navView.getFullYear() + '年' + pad2(navView.getMonth() + 1) + '月', true) +
             dayGridHtml(navView, cellClassOf) +
             '<div class="dp-foot"><span class="dp-foot-tip">选择单个日账期</span></div>';
    }
    pop.innerHTML = html;
  }

  function commit(d) {
    st.dates[view()].date = fmtByGrain(grain(), d);
    input.value = st.dates[view()].date;
    close();
  }

  box.addEventListener('click', function (e) {
    if (pop.contains(e.target)) return;
    e.stopPropagation();
    if (pop.classList.contains('open')) close();
    else open();
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
    var el = e.target.closest('.dp-nav, .dp-cell');
    if (!el) return;

    if (el.classList.contains('dp-nav')) {
      var nav = el.dataset.nav;
      var dy = nav === 'py' ? -1 : (nav === 'ny' ? 1 : 0);
      var dm = nav === 'pm' ? -1 : (nav === 'nm' ? 1 : 0);
      navView = new Date(navView.getFullYear() + dy, navView.getMonth() + dm, 1);
      render();
      return;
    }
    if (el.classList.contains('dp-blank')) return;
    commit(grain() === 'month'
      ? new Date(+el.dataset.y, +el.dataset.m, 1)
      : new Date(+el.dataset.y, +el.dataset.m, +el.dataset.d));
  });

  return { close: close };
}

// ---- 账期区间选择器（日趋势 / 月趋势）----
function initRangePicker(dim, host) {
  var range = host.querySelector('.date-range');
  var inputs = range.querySelectorAll('input');
  var pop = range.querySelector('.dp-pop');
  var st = panelState[dim];

  function view() { return st.view; }
  function grain() { return VIEWS[view()].grain; }

  // side：当前正在编辑的段；views：左右两栏各自展示的年月；draftS/draftE：面板内临时值
  var state = { side: 'start', views: { start: null, end: null }, draftS: null, draftE: null, error: '' };

  function close() {
    pop.classList.remove('open');
    range.classList.remove('active');
  }

  function open(side) {
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { if (p !== pop) p.classList.remove('open'); });
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });

    var g = grain();
    var d = st.dates[view()];
    state.side = side || 'start';
    state.error = '';
    state.draftS = parseByGrain(g, d.start);
    state.draftE = parseByGrain(g, d.end);

    var vs = state.draftS || new Date();
    var ve = state.draftE || vs;
    state.views.start = new Date(vs.getFullYear(), vs.getMonth(), 1);
    state.views.end = new Date(ve.getFullYear(), ve.getMonth(), 1);
    if (g === 'day' && !state.draftE && state.views.end.getTime() === state.views.start.getTime()) {
      state.views.end = new Date(vs.getFullYear(), vs.getMonth() + 1, 1);
    }

    render();
    pop.classList.add('open');
    range.classList.add('active');
  }

  function pickDate(d) {
    var g = grain();
    state.error = '';
    var picked = g === 'month'
      ? new Date(d.getFullYear(), d.getMonth(), 1)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (state.side === 'start') {
      state.draftS = picked;
      state.side = 'end';
      // 结束栏视图跟到已选月份，避免用户还要手动翻月
      state.views.end = new Date(picked.getFullYear(), picked.getMonth(), 1);
      if (!state.draftE && g === 'day' && state.views.end <= state.views.start) {
        state.views.end = new Date(picked.getFullYear(), picked.getMonth() + 1, 1);
      }
    } else {
      state.draftE = picked;
    }
    render();
  }

  function applyPreset(n) {
    var g = grain();
    var end = state.draftE || parseByGrain(g, st.dates[view()].end) || new Date();
    state.draftS = shiftUnits(g, end, -(n - 1));
    state.draftE = end;
    state.views.start = new Date(state.draftS.getFullYear(), state.draftS.getMonth(), 1);
    state.views.end = new Date(end.getFullYear(), end.getMonth(), 1);
    state.side = 'end';
    state.error = '';
    render();
  }

  // 「确定」只做校验，不自动修正所选区间
  function confirm() {
    if (!state.draftS || !state.draftE) {
      state.error = '请选择完整的开始与结束账期';
      render();
      return;
    }
    var g = grain();
    var v = VIEWS[view()];
    if (periodIndex(g, state.draftE) < periodIndex(g, state.draftS)) {
      state.error = '开始账期不能晚于结束账期，请重新选择';
      render();
      return;
    }
    if (periodIndex(g, state.draftE) - periodIndex(g, state.draftS) + 1 > v.max) {
      state.error = v.err;
      render();
      showRangeTip(dim, v.err, true);
      return;
    }

    state.error = '';
    st.dates[view()].start = fmtByGrain(g, state.draftS);
    st.dates[view()].end = fmtByGrain(g, state.draftE);
    inputs[0].value = st.dates[view()].start;
    inputs[1].value = st.dates[view()].end;
    close();
  }

  function resetRange() {
    var g = grain();
    var def = defaultDates(view());
    state.draftS = parseByGrain(g, def.start);
    state.draftE = parseByGrain(g, def.end);
    state.side = 'start';
    state.error = '';
    render();
  }

  // 单元格状态：两个端点高亮，区间内浅色底
  function cellClass(d, side) {
    var g = grain();
    var cls = [];
    var k = periodIndex(g, d);
    var ks = state.draftS ? periodIndex(g, state.draftS) : null;
    var ke = state.draftE ? periodIndex(g, state.draftE) : null;
    if (ks !== null && k === ks) cls.push('edge');
    if (ke !== null && k === ke) cls.push('edge');
    if (ks !== null && ke !== null && k > ks && k < ke) cls.push('in');
    if (side === state.side) {
      var cur = side === 'start' ? ks : ke;
      if (cur !== null && k === cur) cls.push('focus');
    }
    return cls.join(' ');
  }

  function pane(side) {
    var g = grain();
    var title = side === 'start' ? '开始' : '结束';
    var target = side === 'start' ? state.draftS : state.draftE;
    var sideAttr = ' data-side="' + side + '"';
    var v = state.views[side];
    var cellClassOf = function (d) { return cellClass(d, side); };

    var body = g === 'month'
      ? paneHead(v.getFullYear() + '年', false, sideAttr) +
        monthGridHtml(v.getFullYear(), cellClassOf, sideAttr)
      : paneHead(v.getFullYear() + '年' + pad2(v.getMonth() + 1) + '月', true, sideAttr) +
        dayGridHtml(v, cellClassOf, sideAttr);

    return '<div class="dp-pane' + (side === state.side ? ' active' : '') + '" data-pane="' + side + '">' +
      '<div class="dp-pane-label">' + title +
      '<b>' + (target ? fmtByGrain(g, target) : '请选择') + '</b></div>' +
      body + '</div>';
  }

  function render() {
    var g = grain();
    var v = VIEWS[view()];
    var html = ['<div class="dp-panes">', pane('start'),
                '<div class="dp-panes-sep"></div>', pane('end'), '</div>'];

    html.push('<div class="dp-foot">');
    html.push('<span class="dp-presets">');
    presetsOf(g).forEach(function (p) {
      html.push('<button type="button" class="dp-preset" data-preset="' + p.n + '">' + p.label + '</button>');
    });
    html.push('</span>');
    html.push(state.error
      ? '<span class="dp-foot-tip is-error">' + escapeHtml(state.error) + '</span>'
      : '<span class="dp-foot-tip">' + v.tip + '</span>');
    html.push('<span class="dp-actions">' +
      '<button type="button" class="dp-reset" data-act="reset">重 置</button>' +
      '<button type="button" class="dp-ok" data-act="ok">确 定</button>' +
      '</span>');
    html.push('</div>');

    pop.innerHTML = html.join('');
  }

  range.addEventListener('click', function (e) {
    if (pop.contains(e.target)) return;
    e.stopPropagation();
    var side = e.target === inputs[1] ? 'end' : 'start';
    if (pop.classList.contains('open')) {
      if (side !== state.side) { state.side = side; render(); }
      else close();
      return;
    }
    open(side);
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
    var el = e.target.closest('.dp-nav, .dp-cell, .dp-preset, .dp-ok, .dp-reset, .dp-pane');
    if (!el) return;

    if (el.classList.contains('dp-nav')) {
      var nav = el.dataset.nav;
      var side = el.dataset.side;
      var vv = state.views[side];
      var dy = nav === 'py' ? -1 : (nav === 'ny' ? 1 : 0);
      var dm = nav === 'pm' ? -1 : (nav === 'nm' ? 1 : 0);
      state.views[side] = new Date(vv.getFullYear() + dy, vv.getMonth() + dm, 1);
      state.error = '';
      render();
      return;
    }
    if (el.classList.contains('dp-preset')) { applyPreset(+el.dataset.preset); return; }
    if (el.classList.contains('dp-ok')) { confirm(); return; }
    if (el.classList.contains('dp-reset')) { resetRange(); return; }
    if (el.classList.contains('dp-cell')) {
      if (el.classList.contains('dp-blank')) return;
      state.side = el.dataset.side;
      state.error = '';
      pickDate(grain() === 'month'
        ? new Date(+el.dataset.y, +el.dataset.m, 1)
        : new Date(+el.dataset.y, +el.dataset.m, +el.dataset.d));
      return;
    }
    if (el.classList.contains('dp-pane') && el.dataset.pane !== state.side) {
      state.side = el.dataset.pane;
      state.error = '';
      render();
    }
  });

  return { close: close };
}

// 点击空白处关闭日期面板
document.addEventListener('click', function () {
  document.querySelectorAll('.dp-pop.open').forEach(function (p) {
    p.classList.remove('open');
    if (p.parentNode) p.parentNode.classList.remove('active');
  });
});

// ====== 图例点击：切换曲线显隐 ======
// 图例随模块动态渲染，事件委托挂在趋势视图容器 #chartbox-<dim> 上。
// 显隐状态 key = 模块前缀 + 曲线 key（fullLineKey），避免跨模块重名串扰。
function toggleLegendItem(dim, item) {
  if (!item || !item.dataset || !item.dataset.key) return;
  var st = panelState[dim];
  if (!st) return;
  var moduleEl = item.closest('.trend-module');
  var modKey = moduleEl ? moduleEl.dataset.module : '';
  var fullKey = fullLineKey(modKey, item.dataset.key);
  var wasHidden = item.classList.contains('hidden');
  st.hiddenLines[fullKey] = !wasHidden;
  refreshPanel(dim);
}

// 键盘可达：聚焦图例项后回车 / 空格切换
function legendKeyHandler(dim, e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var item = e.target.closest('.legend-item');
  if (!item) return;
  e.preventDefault();
  toggleLegendItem(dim, item);
}

Object.keys(panelState).forEach(function (dim) {
  var box = document.getElementById(panelState[dim].ids.chartBox);
  if (!box) return;
  box.addEventListener('click', function (e) {
    var item = e.target.closest('.legend-item');
    if (item) { toggleLegendItem(dim, item); return; }
    var tab = e.target.closest('.trend-module-tab');
    if (tab) switchTrendTab(dim, tab.dataset.module);
  });
  box.addEventListener('keydown', function (e) {
    legendKeyHandler(dim, e);
  });
});

// ====== 视图切换 ======
function switchView(dim, view) {
  var st = panelState[dim];
  if (!st || !VIEWS[view]) return;
  st.view = view;

  document.querySelectorAll('.view-seg[data-dim="' + dim + '"] .seg-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view);
  });

  showRangeTip(dim, '');
  buildDateCtl(dim);
  refreshPanel(dim);
}

document.querySelectorAll('.view-seg[data-dim]').forEach(function (seg) {
  var dim = seg.dataset.dim;
  seg.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (btn) switchView(dim, btn.dataset.view);
  });
});

// ====== 必填校验 ======
// 结算单元 / 资源组为必填单选，未选中时给出错误态并阻止查询
function markInvalid(selectorId, invalid) {
  var box = document.getElementById(selectorId);
  if (box) box.classList.toggle('is-invalid', !!invalid);
}

// 返回校验是否通过
function validateOrgFilters(dim) {
  var f = panelState[dim].draft;
  if (dim === 'billing-unit') {
    markInvalid('ss-bu-unit', !f.buId);
    return !!f.buId;
  }
  if (dim === 'resource-group') {
    markInvalid('ss-rg-bu', !f.buId);
    markInvalid('ss-rg-group', !f.rgId);
    return !!f.buId && !!f.rgId;
  }
  return true;
}

// ====== 筛选项按权限重建 ======
// 结算单元 / 资源组均为必填单选：不提供「全部」选项，默认选中第一个有权限项。
function rebuildFilters() {
  // 结算单元账单 - 结算单元单选（必填），默认第一个有权限的结算单元
  var buDropdown = document.getElementById('ss-bu-dropdown');
  var bus = allowedBuIds();
  buDropdown.innerHTML = bus.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + BU_MAP[id].name + '</div>';
  }).join('');
  var defaultBu = defaultBuId();
  panelState['billing-unit'].draft.buId = defaultBu;
  markInvalid('ss-bu-unit', false);
  initSingleselect('ss-bu-trigger', 'ss-bu-dropdown', 'ss-bu-label', function (val) {
    panelState['billing-unit'].draft.buId = val;
    markInvalid('ss-bu-unit', !val);
  }, '请选择结算单元', defaultBu);

  // 资源组账单 - 结算单元单选（必填），联动下方资源组选项
  var rgBuDropdown = document.getElementById('ss-rg-bu-dropdown');
  var rgBus = rgPanelBuIds();
  rgBuDropdown.innerHTML = rgBus.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + BU_MAP[id].name + '</div>';
  }).join('');
  var defaultRgBu = defaultRgPanelBuId();
  panelState['resource-group'].draft.buId = defaultRgBu;
  markInvalid('ss-rg-bu', false);
  initSingleselect('ss-rg-bu-trigger', 'ss-rg-bu-dropdown', 'ss-rg-bu-label', function (val) {
    panelState['resource-group'].draft.buId = val;
    markInvalid('ss-rg-bu', !val);
    rebuildRgOptions();
  }, '请选择结算单元', defaultRgBu);

  // 资源组单选（必填）：默认选中该结算单元下的第一个资源组
  rebuildRgOptions();

  // 默认选中项同时作为初始查询条件生效
  panelState['billing-unit'].applied = cloneOrgFilters('billing-unit', panelState['billing-unit'].draft);
  panelState['resource-group'].applied = cloneOrgFilters('resource-group', panelState['resource-group'].draft);
}

// 资源组单选项（必填）：受角色权限 + 筛选框中已选结算单元过滤，
// 结算单元变更后自动落到该结算单元下的第一个资源组。
function rebuildRgOptions() {
  var dropdown = document.getElementById('ss-rg-dropdown');
  var buId = panelState['resource-group'].draft.buId;
  var ids = allowedRgIds().filter(function (id) { return !buId || RG_MAP[id].buId === buId; });

  dropdown.innerHTML = ids.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + RG_MAP[id].name + '</div>';
  }).join('');

  var defaultRg = defaultRgId(buId);
  panelState['resource-group'].draft.rgId = defaultRg;
  markInvalid('ss-rg-group', false);
  initSingleselect('ss-rg-trigger', 'ss-rg-dropdown', 'ss-rg-label', function (val) {
    panelState['resource-group'].draft.rgId = val;
    markInvalid('ss-rg-group', !val);
  }, '请选择资源组', defaultRg);
}

// ====== 角色切换 ======
function switchRole(roleKey) {
  var cfg = roleConfig[roleKey];
  if (!cfg) return;
  currentRole = roleKey;

  document.getElementById('role-hint').textContent = cfg.hint;

  document.querySelectorAll('.role-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.role === roleKey);
  });

  // 控制 tab 可见性
  document.querySelectorAll('#bill-tabs .tab').forEach(function (tab) {
    tab.style.display = cfg.tabs.indexOf(tab.dataset.panel) !== -1 ? '' : 'none';
  });

  // 重置全部筛选条件与账期，避免跨角色残留
  Object.keys(panelState).forEach(function (k) {
    var st = panelState[k];
    st.view = 'day-report';
    st.dates = emptyDates();
    st.appliedDates = emptyDates();
    st.draft = emptyOrgFilters(k);
    st.applied = emptyOrgFilters(k);
    st.moduleDraft = emptyModuleSel();
    st.moduleApplied = emptyModuleSel();
    st.group = 'product';
    st.reportFilter = emptyReportFilter();
    st.hiddenLines = {};
    document.querySelectorAll('.view-seg[data-dim="' + k + '"] .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === 'day-report');
    });
    syncGroupSeg(k);
    buildDateCtl(k);
    showRangeTip(k, '');
  });

  rebuildFilters();
  cfg.tabs.forEach(refreshPanel);
  switchTab(cfg.tab);
}

function switchTab(panelKey) {
  document.querySelectorAll('#bill-tabs .tab').forEach(function (tab) {
    tab.classList.toggle('active', tab.dataset.panel === panelKey);
  });
  document.querySelectorAll('.tab-panel').forEach(function (panel) {
    panel.classList.toggle('active', panel.id === 'panel-' + panelKey);
  });
  refreshPanel(panelKey);
}

// ====== 列表粒度切换（企业账单：按产品 / 按结算单元）======
function syncGroupSeg(dim) {
  var seg = document.getElementById('group-seg-' + dim);
  if (!seg) return;
  var group = panelState[dim].group;
  seg.querySelectorAll('.seg-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.group === group);
  });
}

function switchGroup(dim, group) {
  var st = panelState[dim];
  if (!st || st.group === group) return;
  st.group = group;
  syncGroupSeg(dim);
  refreshPanel(dim);
}

// ====== 报表实体筛选下拉（产品 / 结算单元 / 资源组多选）======
function reportFilterOptions(dim, group) {
  if (group === 'product') {
    return PRODUCT_KEYS.map(function (k) {
      return { value: k, name: PRODUCTS[k].name };
    });
  }
  if (group === 'billing-unit') {
    return allowedBuIds().map(function (id) {
      return { value: id, name: BU_MAP[id].name };
    });
  }
  // resource-group
  var rgIds = dim === 'enterprise' ? allowedRgIds() : [];
  if (dim === 'billing-unit') {
    var buId = panelState[dim].applied.buId;
    if (buId) {
      rgIds = [];
      BU_MAP[buId].groups.forEach(function (rg) { rgIds.push(rg.id); });
    }
  }
  return rgIds.map(function (id) {
    return { value: id, name: RG_MAP[id].name };
  });
}

function reportFilterLabel(group) {
  if (group === 'product') return '产品';
  if (group === 'billing-unit') return '结算单元';
  return '资源组';
}

function buildReportFilters(dim) {
  var host = document.getElementById('report-filter-' + dim);
  if (!host) return;
  var group = groupOf(dim);
  var options = reportFilterOptions(dim, group);
  if (!options.length) { host.innerHTML = ''; return; }

  var ns = 'rf-' + dim + '-' + group;
  var labelText = reportFilterLabel(group);

  // 仅保留当前仍有效的已选项（例如结算单元切换后，原资源组可能已不可见）
  var validValues = {};
  options.forEach(function (o) { validValues[o.value] = true; });
  var curVals = (panelState[dim].reportFilter[group] || []).filter(function (v) {
    return validValues[v];
  });
  panelState[dim].reportFilter[group] = curVals;

  host.innerHTML =
    '<div class="multiselect report-filter-ms" id="' + ns + '">' +
      '<span class="report-filter-label">' + labelText + '：</span>' +
      '<div class="ms-trigger" id="' + ns + '-trigger">' +
        '<span class="ms-placeholder" id="' + ns + '-label"></span>' +
        '<svg class="ms-arrow" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8.5l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="ms-clear" title="清空"><svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.2" fill="currentColor" opacity=".28"/><path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg></span>' +
      '</div>' +
      '<div class="ms-dropdown report-filter-dropdown" id="' + ns + '-dropdown"></div>' +
    '</div>';

  var dd = document.getElementById(ns + '-dropdown');
  var placeholder = labelText + '全部';

  dd.innerHTML = '<div class="ms-option ms-all" data-value="__all">' +
    '<span class="ms-check"></span><span>' + labelText + '全部</span></div>';
  options.forEach(function (o) {
    dd.innerHTML += '<div class="ms-option" data-value="' + o.value + '">' +
      '<span class="ms-check"></span><span>' + o.name + '</span></div>';
  });

  var onChange = function (vals) {
    panelState[dim].reportFilter[group] = vals.slice();
  };

  var onClose = function (vals) {
    panelState[dim].reportFilter[group] = vals.slice();
    refreshPanel(dim);
  };

  initMultiselect(ns + '-trigger', ns + '-dropdown', ns + '-label',
                  onChange, placeholder, curVals, onClose);
}

document.querySelectorAll('.group-seg').forEach(function (seg) {
  // id 形如 group-seg-enterprise
  var dim = seg.id.replace('group-seg-', '');
  seg.querySelectorAll('.seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchGroup(dim, btn.dataset.group); });
  });
});

// 账期卡片「涉及结算单元 / 产品」的数字：点击切到列表对应粒度。
// 卡片每次渲染都会重建，故绑在面板上做事件委托。
document.querySelectorAll('.tab-panel').forEach(function (panel) {
  panel.addEventListener('click', function (e) {
    var link = e.target.closest('.cover-link');
    if (!link) return;
    e.preventDefault();
    var dim = panel.id.replace('panel-', '');
    var target = link.dataset.cover === 'billing-unit' ? 'billing-unit'
      : (link.dataset.cover === 'resource-group' ? 'resource-group' : 'product');
    switchGroup(dim, target);
    var seg = document.getElementById('group-seg-' + dim);
    if (seg) seg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});

// 角色按钮点击
document.querySelectorAll('.role-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    switchRole(btn.dataset.role);
  });
});

// Tab 点击
document.querySelectorAll('#bill-tabs .tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    switchTab(tab.dataset.panel);
  });
});

// ====== 搜索 / 重置 ======
// 重置：账期恢复该视图默认值，组织筛选回到默认选中项，模块级筛选清空（=全部）
function resetPanel(dim) {
  var st = panelState[dim];
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  if (!bar) return;

  st.dates[st.view] = defaultDates(st.view);
  buildDateCtl(dim);
  showRangeTip(dim, '');

  // 结算单元 / 资源组为必填单选，需回到默认选中项而非清空
  st.draft = emptyOrgFilters(dim);
  st.moduleDraft = emptyModuleSel();
  resetModuleSelUi(dim);

  // 恢复必填单选的默认选中
  if (dim === 'billing-unit') {
    st.draft.buId = defaultBuId();
    markInvalid('ss-bu-unit', false);
    if (msInstances['ss-bu-dropdown']) {
      msInstances['ss-bu-dropdown'].set(st.draft.buId, true);
    }
  } else if (dim === 'resource-group') {
    st.draft.buId = defaultRgPanelBuId();
    markInvalid('ss-rg-bu', false);
    if (msInstances['ss-rg-bu-dropdown']) {
      msInstances['ss-rg-bu-dropdown'].set(st.draft.buId, true);
    }
    // 内部会按当前结算单元重建资源组选项并落到第一个资源组
    rebuildRgOptions();
  }

  st.appliedDates[st.view] = defaultDates(st.view);
  st.applied = cloneOrgFilters(dim, st.draft);
  st.moduleApplied = cloneModuleSel(st.moduleDraft);
  st.reportFilter = emptyReportFilter();
  st.hiddenLines = {};
  refreshPanel(dim);
}

document.querySelectorAll('.filter-bar[data-dim]').forEach(function (bar) {
  var dim = bar.dataset.dim;
  var searchBtn = bar.querySelector('[data-action="search"]');
  var resetBtn = bar.querySelector('[data-action="reset"]');
  if (searchBtn) searchBtn.addEventListener('click', function () { applyFilters(dim); });
  if (resetBtn) resetBtn.addEventListener('click', function () { resetPanel(dim); });
});

// 重置模块级筛选下拉 UI：当前维度趋势模块头部的多选清空（回到「全部」）
function resetModuleSelUi(dim) {
  var chartBox = document.getElementById(panelState[dim] && panelState[dim].ids.chartBox);
  if (!chartBox) return;
  // 仅重置当前维度内可见（已渲染）的模块下拉实例
  chartBox.querySelectorAll('.module-ms .ms-trigger').forEach(function (trigger) {
    var ns = trigger.id.replace(/-trigger$/, '');
    var inst = msInstances[ns + '-dropdown'];
    if (inst && inst.clear) inst.clear();
  });
}

// ====== 多选下拉组件 ======
var msInstances = {};

function initMultiselect(triggerId, dropdownId, labelId, onChange, placeholder, initial, onClose, max) {
  var oldTrigger = document.getElementById(triggerId);
  var dropdown = document.getElementById(dropdownId);
  if (!oldTrigger || !dropdown) return;

  // 重新初始化时克隆节点，清除旧监听
  var trigger = oldTrigger.cloneNode(true);
  oldTrigger.parentNode.replaceChild(trigger, oldTrigger);
  var label = document.getElementById(labelId);
  if (!label) return;

  var selected = new Set();
  var allOption = dropdown.querySelector('.ms-all');
  var options = Array.from(dropdown.querySelectorAll('.ms-option:not(.ms-all)'));
  var ph = placeholder || label.dataset.placeholder || label.textContent;
  label.dataset.placeholder = ph;
  label.textContent = ph;
  trigger.classList.remove('has-selection');
  dropdown.classList.remove('open');

  function orderedSelection() {
    return options
      .filter(function(o) { return selected.has(o.dataset.value); })
      .map(function(o) { return o.dataset.value; });
  }

  function updateLabel() {
    // selected.size === 0 表示「全部」
    if (selected.size === 0 || selected.size === options.length) {
      label.textContent = ph;
      trigger.classList.remove('has-selection');
    } else if (selected.size <= 2) {
      var names = options
        .filter(function(o) { return selected.has(o.dataset.value); })
        .map(function(o) { return o.textContent.trim(); });
      label.textContent = names.join('、');
      trigger.classList.add('has-selection');
    } else {
      var firstName = options.find(function(o) { return selected.has(o.dataset.value); });
      label.textContent = (firstName ? firstName.textContent.trim() : '') + ' +' + (selected.size - 1);
      trigger.classList.add('has-selection');
    }
    updateAllCheck();
    if (onChange) onChange(orderedSelection());
  }

  function updateAllCheck() {
    // selected.size === 0 或全选都表示「全部」高亮
    var allChecked = selected.size === 0 || selected.size === options.length;
    allOption.classList.toggle('checked', allChecked);
  }

  function closeDropdown() {
    if (!dropdown.classList.contains('open')) return;
    dropdown.classList.remove('open');
    if (onClose) onClose(orderedSelection());
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var wasOpen = dropdown.classList.contains('open');
    // 关闭其他下拉
    document.querySelectorAll('.ms-dropdown.open').forEach(function(d) {
      if (d !== dropdown) {
        d.classList.remove('open');
        var inst = msInstances[d.id];
        if (inst && inst._onClose) inst._onClose();
      }
    });
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { p.classList.remove('open'); });
    if (wasOpen) {
      closeDropdown();
    } else {
      dropdown.classList.add('open');
    }
  });

  // 清空按钮：点清空回到「全部」态（selected 为空即全部）
  var clearBtn = trigger.querySelector('.ms-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      selected.clear();
      options.forEach(function(o) { o.classList.remove('checked'); });
      updateLabel();
    });
  }

  allOption.addEventListener('click', function(e) {
    e.stopPropagation();
    // 点击「全部」：清空选中集即回到全部态
    selected.clear();
    options.forEach(function(o) { o.classList.remove('checked'); });
    updateLabel();
  });

  options.forEach(function(opt) {
    opt.addEventListener('click', function(e) {
      e.stopPropagation();
      if (selected.has(opt.dataset.value)) {
        selected.delete(opt.dataset.value);
        opt.classList.remove('checked');
      } else {
        // 手动筛选最多选中 max 个，超出时提示并忽略本次勾选
        if (max && selected.size >= max) {
          var limitTip = document.createElement('div');
          limitTip.className = 'ms-limit-tip';
          limitTip.textContent = '最多选中 ' + max + ' 个';
          dropdown.appendChild(limitTip);
          setTimeout(function () {
            if (limitTip.parentNode) limitTip.parentNode.removeChild(limitTip);
          }, 1600);
          return;
        }
        selected.add(opt.dataset.value);
        opt.classList.add('checked');
      }
      // 全部单项被选中时清空，归一化为「全部」态
      if (selected.size === options.length) {
        selected.clear();
        options.forEach(function(o) { o.classList.remove('checked'); });
      }
      updateLabel();
    });
  });

  msInstances[dropdownId] = {
    clear: function () {
      selected.clear();
      options.forEach(function(o) { o.classList.remove('checked'); });
      allOption.classList.add('checked');
      label.textContent = ph;
      trigger.classList.remove('has-selection');
    },
    set: function (vals) {
      selected.clear();
      (vals || []).forEach(function (v) { selected.add(v); });
      // 全选归一化为空
      if (selected.size === options.length) {
        selected.clear();
        options.forEach(function(o) { o.classList.remove('checked'); });
      } else {
        options.forEach(function (o) {
          o.classList.toggle('checked', selected.has(o.dataset.value));
        });
      }
      updateLabel();
    },
    _onClose: function () {
      if (onClose) onClose(orderedSelection());
    }
  };

  // 初始状态：默认全部选中，高亮「全部」选项
  if (!initial || !initial.length) {
    allOption.classList.add('checked');
  } else {
    msInstances[dropdownId].set(initial);
  }
}

// ====== 单选下拉组件（外观与多选一致，仅单选 + 可清空）======
function initSingleselect(triggerId, dropdownId, labelId, onChange, placeholder, initial) {
  var oldTrigger = document.getElementById(triggerId);
  var dropdown = document.getElementById(dropdownId);
  if (!oldTrigger || !dropdown) return;

  var trigger = oldTrigger.cloneNode(true);
  oldTrigger.parentNode.replaceChild(trigger, oldTrigger);
  var label = document.getElementById(labelId);
  if (!label) return;

  var options = Array.from(dropdown.querySelectorAll('.ss-option'));
  var ph = placeholder || label.textContent;
  var value = '';
  label.dataset.placeholder = ph;
  label.textContent = ph;
  trigger.classList.remove('has-selection');
  dropdown.classList.remove('open');

  function setValue(val, silent) {
    value = val || '';
    var picked = options.find(function (o) { return o.dataset.value === value; });
    options.forEach(function (o) { o.classList.toggle('selected', !!value && o === picked); });
    if (value && picked) {
      label.textContent = picked.textContent.trim();
      trigger.classList.add('has-selection');
    } else {
      label.textContent = ph;
      trigger.classList.remove('has-selection');
    }
    if (!silent && onChange) onChange(value);
  }

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    var willOpen = !dropdown.classList.contains('open');
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) {
      d.classList.remove('open');
    });
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { p.classList.remove('open'); });
    dropdown.classList.toggle('open', willOpen);
  });

  var clearBtn = trigger.querySelector('.ms-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setValue('');
    });
  }

  options.forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      setValue(opt.dataset.value);
      dropdown.classList.remove('open');
    });
  });

  msInstances[dropdownId] = {
    clear: function () { setValue('', true); },
    set: function (val, silent) { setValue(val, silent); }
  };

  if (initial) setValue(initial, true);
}

// 关闭所有下拉：关闭时触发各自的 onClose 回调（模块级筛选即时生效）
document.addEventListener('click', function() {
  document.querySelectorAll('.ms-dropdown.open').forEach(function(d) {
    d.classList.remove('open');
    var inst = msInstances[d.id];
    if (inst && inst._onClose) inst._onClose();
  });
});

// 初始化：默认主账号角色
switchRole('master');

// ====== 与外壳页（../index.html）通信 ======
(function () {
  // 通知外壳页同步顶部角色显示
  function reportRole() {
    var cfg = roleConfig[currentRole];
    if (!cfg || !window.parent || window.parent === window) return;
    window.parent.postMessage({ type: 'role-change', role: currentRole, label: cfg.label }, '*');
  }
  document.querySelectorAll('.role-btn').forEach(function (btn) {
    btn.addEventListener('click', reportRole);
  });
  reportRole();

  // 接受外壳页广播的角色，保持各视图一致
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'set-role') return;
    if (!roleConfig[e.data.role] || e.data.role === currentRole) return;
    switchRole(e.data.role);
  });

  // 图表依赖真实宽高，iframe 由隐藏切为显示时重绘当前面板
  window.addEventListener('resize', function () {
    var active = document.querySelector('.tab-panel.active');
    if (!active) return;
    var key = active.id.replace(/^panel-/, '');
    if (panelState[key]) refreshPanel(key);
  });

  // 账单分析入口已移除（需求：去掉账单分析的按钮）
})();
