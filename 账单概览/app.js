// ====== 基础数据 ======
// 账单类型：月 / 天 / 小时。
// 月账单筛选「月区间」，最多 6 个月；天账单筛选「天区间」，最多 31 天；
// 小时账单筛选「小时区间」，最多 7 天（168 小时）。
var BILL_TYPES = { '月账单': 'month', '天账单': 'day', '小时账单': 'hour' };
var TYPE_CFG = {
  month: {
    label: '月', maxMonths: 6,
    start: '2026.03', end: '2026.08',
    ph: '2026.08', tip: '最多可选 6 个月',
    err: '所选范围超过 6 个月，请重新选择'
  },
  day: {
    label: '天', maxDays: 31,
    start: '2026.07.16', end: '2026.08.15',
    ph: '2026.08.15', tip: '最多可选 31 天',
    err: '所选范围超过 31 天，请重新选择'
  },
  hour: {
    label: '小时', maxDays: 7,
    start: '2026.08.09 00:00', end: '2026.08.15 23:00',
    ph: '2026.08.15 00:00', tip: '最多可选 7 天（168 小时）',
    err: '所选范围超过 7 天（168 小时），请重新选择'
  }
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

// 月账单的产品波动因子，使各产品曲线走势不同
var WAVE = {
  apimkt: [0.92, 1.05, 1.12, 0.98, 0.90],
  appmkt: [1.08, 0.95, 1.02, 1.10, 0.97],
  tidb:   [0.88, 1.12, 0.96, 1.06, 1.09],
  obs:    [1.04, 0.98, 1.09, 0.93, 1.02],
  ecs:    [0.96, 1.06, 0.94, 1.08, 1.05]
};
var PROD_SEED = { apimkt: 1.1, appmkt: 2.3, tidb: 3.7, obs: 4.9, ecs: 6.1 };

// 确定性伪随机：同一账期序号始终得到同一波动，避免每次渲染数据跳动
function pseudo(i, seed) {
  var x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ====== 账期构造（受账单类型与最大跨度约束）======
// 账期文案统一由此处生成，图表横坐标与表格「账期」列共用同一份 labels：
//   月账单   2026.08
//   天账单   2026.08.15
//   小时账单 2026.08.15 00:00-01:00
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function parseYM(s) {
  var m = /^(\d{4})\D(\d{1,2})/.exec((s || '').trim());
  return m ? { y: +m[1], m: +m[2] } : null;
}
function parseYMD(s) {
  var m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec((s || '').trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
// 小时输入：「2026.08.15 00:00」；省略时分时用 defHour 兜底（起始 0 点 / 结束 23 点）
function parseYMDH(s, defHour) {
  var m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})(?:[\sT]+(\d{1,2})(?::(\d{1,2}))?)?/.exec((s || '').trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] === undefined ? defHour : +m[4]);
}
function fmtYM(d) {
  return d.getFullYear() + '.' + pad2(d.getMonth() + 1);
}
function fmtYMD(d) {
  return fmtYM(d) + '.' + pad2(d.getDate());
}
function fmtYMDH(d) {
  return fmtYMD(d) + ' ' + pad2(d.getHours()) + ':00';
}
// 小时账期展示为区间：2026.08.15 00:00-01:00
function fmtHourPeriod(d) {
  var next = new Date(d.getTime() + 3600000);
  return fmtYMD(d) + ' ' + pad2(d.getHours()) + ':00-' + pad2(next.getHours()) + ':00';
}

// 返回 {labels, start, end, clamped}：labels 即图表横坐标与表格账期
function buildPeriods(type, startStr, endStr) {
  var cfg = TYPE_CFG[type];
  var labels = [], i;

  // 月账单：按「月」取区间，最多 6 个月
  if (type === 'month') {
    var a = parseYM(startStr) || parseYM(cfg.start);
    var b = parseYM(endStr) || parseYM(cfg.end);
    var s = a.y * 12 + a.m - 1, e = b.y * 12 + b.m - 1;
    if (e < s) e = s;
    var cutM = e - s + 1 > cfg.maxMonths;
    if (cutM) e = s + cfg.maxMonths - 1;
    for (i = s; i <= e; i++) labels.push(Math.floor(i / 12) + '.' + pad2(i % 12 + 1));
    return { labels: labels, start: labels[0], end: labels[labels.length - 1], clamped: cutM };
  }

  // 小时账单：按「小时」取区间，最多 7 天（168 小时）
  if (type === 'hour') {
    var hs = parseYMDH(startStr, 0) || parseYMDH(cfg.start, 0);
    var he = parseYMDH(endStr, 23) || parseYMDH(cfg.end, 23);
    if (he < hs) he = new Date(hs.getTime());
    var hours = Math.round((he - hs) / 3600000) + 1;
    var maxHours = cfg.maxDays * 24;
    var cutH = hours > maxHours;
    if (cutH) {
      hours = maxHours;
      he = new Date(hs.getTime() + (hours - 1) * 3600000);
    }
    for (i = 0; i < hours; i++) labels.push(fmtHourPeriod(new Date(hs.getTime() + i * 3600000)));
    return { labels: labels, start: fmtYMDH(hs), end: fmtYMDH(he), clamped: cutH };
  }

  // 天账单：按「天」取区间，最多 31 天
  var ds = parseYMD(startStr) || parseYMD(cfg.start);
  var de = parseYMD(endStr) || parseYMD(cfg.end);
  if (de < ds) de = new Date(ds.getTime());
  var days = Math.round((de - ds) / 86400000) + 1;
  var cutD = days > cfg.maxDays;
  if (cutD) {
    days = cfg.maxDays;
    de = new Date(ds.getTime() + (days - 1) * 86400000);
  }
  for (i = 0; i < days; i++) labels.push(fmtYMD(new Date(ds.getTime() + i * 86400000)));
  return { labels: labels, start: fmtYMD(ds), end: fmtYMD(de), clamped: cutD };
}

// 横坐标与表格账期保持完全一致的文案
function axisLabel(type, label) {
  return label;
}

// scope: {type:'enterprise'} | {type:'bu', id} | {type:'rg', id}
function scopeFactor(scope) {
  if (scope.type === 'bu') return BU_MAP[scope.id].w;
  if (scope.type === 'rg') return BU_MAP[RG_MAP[scope.id].buId].w * RG_MAP[scope.id].w;
  return 1;
}

// 企业在第 i 个账期的应付总额：月取真实样本，天/小时按均值拆分并叠加波动
function entTotalAt(type, i) {
  if (type === 'month') {
    return i < MONTH_TOTALS.length
      ? MONTH_TOTALS[i]
      : MONTH_TOTALS[i % MONTH_TOTALS.length] * (0.9 + 0.2 * pseudo(i, 0.5));
  }
  if (type === 'day') {
    return MONTH_AVG / 30 * (0.85 + 0.3 * pseudo(i, 2.5));
  }
  // 小时账单叠加日内曲线：14 点前后为高峰，凌晨为低谷
  var hour = i % 24;
  return MONTH_AVG / 720 * (0.75 + 0.4 * Math.sin((hour - 8) * Math.PI / 12))
         * (0.92 + 0.16 * pseudo(i, 3.5));
}

function waveAt(prodKey, type, i) {
  if (type === 'month' && i < WAVE[prodKey].length) return WAVE[prodKey][i];
  return 0.86 + 0.28 * pseudo(i, PROD_SEED[prodKey] + (type === 'day' ? 10 : 20));
}

// 单个 scope + 单个产品的账期序列；ctx = {type, n}
function seriesOf(scope, prodKey, ctx) {
  var f = scopeFactor(scope);
  var w = PRODUCTS[prodKey].weight;
  var arr = [];
  for (var i = 0; i < ctx.n; i++) {
    arr.push(entTotalAt(ctx.type, i) * f * w * waveAt(prodKey, ctx.type, i));
  }
  return arr;
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

// ====== 图表渲染 ======
var CH = { left: 110, right: 1400, top: 20, bottom: 255 };

// 曲线最多展示条数：按选中区间「最近账期应付金额」排序取前 N 条
var TOP_LINES = 20;

function niceMax(max) {
  if (max <= 0) return 10;
  var exp = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / exp * 2) / 2 * exp;
}

function renderChart(containerId, legendId, dim, scopes, selectedKeys, ctx) {
  var wrap = document.getElementById(containerId);
  var legend = document.getElementById(legendId);
  if (!wrap || !legend) return;

  if (!scopes.length) {
    wrap.innerHTML = '<div class="chart-empty">暂无可查看的账单数据</div>';
    legend.innerHTML = '';
    return;
  }

  var periods = ctx.labels;
  var typeName = TYPE_CFG[ctx.type].label;

  // 企业账单：单一主体，未选产品展示合计曲线，已选产品每个产品一条曲线
  // 结算单元 / 资源组账单：曲线按「主体 - 产品」拆分，
  //   未选产品时每个主体一条「主体（全部产品）」曲线
  var lines = [];
  if (dim === 'enterprise') {
    lines = selectedKeys.length === 0
      ? [{ name: typeName + '账单总费用（全部产品）', color: '#0066FF', dash: '', data: sumSeries(scopes, PRODUCT_KEYS, ctx) }]
      : selectedKeys.map(function (k) {
          return { name: PRODUCTS[k].name, color: PRODUCTS[k].color, dash: '', data: sumSeries(scopes, [k], ctx) };
        });
  } else if (selectedKeys.length === 0) {
    lines = scopes.map(function (sc, si) {
      return {
        name: scopeName(sc) + '（全部产品）',
        color: shadeColor('#0066FF', si),
        dash: dashOf(si),
        data: sumSeries([sc], PRODUCT_KEYS, ctx)
      };
    });
  } else {
    scopes.forEach(function (sc, si) {
      selectedKeys.forEach(function (k) {
        lines.push({
          name: scopeName(sc) + ' - ' + PRODUCTS[k].name,
          color: shadeColor(PRODUCTS[k].color, si),
          dash: dashOf(si),
          data: sumSeries([sc], [k], ctx)
        });
      });
    });
  }

  // 仅展示「选中区间最近账期应付金额」TOP20 的曲线：
  // 按最近一个账期的应付金额降序排序后截取前 20 条，避免曲线过多难以辨识
  var totalLineCount = lines.length;
  var lastPeriodIdx = ctx.n - 1;
  if (totalLineCount > TOP_LINES) {
    lines = lines.slice().sort(function (a, b) {
      return (b.data[lastPeriodIdx] || 0) - (a.data[lastPeriodIdx] || 0);
    }).slice(0, TOP_LINES);
  }

  var maxVal = 0;
  lines.forEach(function (l) { l.data.forEach(function (v) { if (v > maxVal) maxVal = v; }); });
  var top = niceMax(maxVal);

  // 曲线区左右各留少量内边距，首个点紧贴 Y 轴（不再有大段空白），
  // 末个点也不会溢出网格右边界。
  var PAD_X = 18;
  var x0 = CH.left + PAD_X;
  var span = (CH.right - PAD_X) - x0;
  var step = periods.length > 1 ? span / (periods.length - 1) : 0;
  var xs = periods.map(function (_, i) {
    return periods.length > 1 ? x0 + i * step : x0 + span / 2;
  });
  var yOf = function (v) { return CH.bottom - (v / top) * (CH.bottom - CH.top); };

  // 点位过密时缩小圆点
  var dotR = periods.length > 40 ? 2 : (periods.length > 16 ? 3 : 4.5);

  // 横坐标文案与表格账期完全一致，因此天/小时账单的刻度较长：
  // 横排展示（不倾斜），按实际文字宽度计算刻度密度；
  // 空间不足时自动扩大取值间距（减少刻度数量），避免相互重叠。
  var tickFont = ctx.type === 'hour' ? 15 : (ctx.type === 'day' ? 16 : 18);
  var tickRotate = 0;
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

  lines.forEach(function (l) {
    var pts = l.data.map(function (v, i) { return xs[i].toFixed(1) + ',' + yOf(v).toFixed(1); }).join(' ');
    s.push('<polyline points="' + pts + '" fill="none" stroke="' + l.color +
           '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
           (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + ' />');
    s.push('<g fill="#FFFFFF" stroke="' + l.color + '" stroke-width="1.4">');
    l.data.forEach(function (v, i) {
      s.push('<circle cx="' + xs[i].toFixed(1) + '" cy="' + yOf(v).toFixed(1) + '" r="' + dotR + '"><title>' +
             l.name + ' ' + periods[i] + '：￥' + fmtMoney(v) + '</title></circle>');
    });
    s.push('</g>');
  });

  var lastIdx = periods.length - 1;
  // 首刻度左对齐、末刻度右对齐（避免溢出图表边界），其余居中。
  // 三种对齐方式的实际占位不同，因此按各自左右边界做重叠检测，
  // 而非简单按下标步长取点，保证任意相邻刻度都不压盖。
  function tickAnchor(i) { return i === lastIdx ? 'end' : (i === 0 ? 'start' : 'middle'); }
  function tickBox(i) {
    var w = axisLabel(ctx.type, periods[i]).length * tickFont * 0.62;
    var a = tickAnchor(i);
    var x = xs[i];
    if (a === 'start') return { l: x, r: x + w };
    if (a === 'end') return { l: x - w, r: x };
    return { l: x - w / 2, r: x + w / 2 };
  }

  var GAP = 12; // 相邻刻度文字之间的最小留白
  var tickIdx = [0];
  var lastBox = tickBox(0);
  for (var ti = tickEvery; ti < lastIdx; ti += tickEvery) {
    var box = tickBox(ti);
    // 与已保留的前一刻度、以及必定展示的末尾刻度都不能重叠
    if (box.l - lastBox.r < GAP) continue;
    if (tickBox(lastIdx).l - box.r < GAP) continue;
    tickIdx.push(ti);
    lastBox = box;
  }
  // 末尾账期始终展示；若与前一刻度过近，则丢弃前一刻度
  if (lastIdx > 0) {
    while (tickIdx.length > 1 && tickBox(lastIdx).l - tickBox(tickIdx[tickIdx.length - 1]).r < GAP) {
      tickIdx.pop();
    }
    tickIdx.push(lastIdx);
  }

  s.push('<g fill="#5C6B80" font-size="' + tickFont + '" font-family="Microsoft YaHei, PingFang SC">');
  tickIdx.forEach(function (i) {
    var tx = xs[i].toFixed(1);
    var label = axisLabel(ctx.type, periods[i]);
    s.push('<text x="' + tx + '" y="' + (CH.bottom + 26) + '" text-anchor="' + tickAnchor(i) + '">' + label + '</text>');
  });
  s.push('</g></svg>');

  wrap.innerHTML = s.join('');
  var legendHtml = lines.map(function (l) {
    return '<span class="legend-item" title="' + l.name + '"><span class="legend-line" style="--line-color:' + l.color +
           ';' + legendLineStyle(l.color, l.dash) + '"></span><span class="legend-text">' + l.name + '</span></span>';
  });
  if (totalLineCount > TOP_LINES) {
    legendHtml.push('<span class="legend-note">共 ' + totalLineCount + ' 条，仅展示最近账期（' +
                    periods[lastPeriodIdx] + '）应付金额 TOP' + TOP_LINES + '</span>');
  }
  legend.innerHTML = legendHtml.join('');
  // 右侧栏（分析入口 + 图例）整体高度与曲线区对齐，
  // 图例超出部分在自身内部滚动查看
  var wrapH = wrap.getBoundingClientRect().height;
  var side = legend.closest('.chart-side');
  if (side) side.style.maxHeight = wrapH > 0 ? Math.round(wrapH) + 'px' : '';
}

// ====== 表格渲染 ======
// extraCells(scope) 返回账期之后、产品之前的维度列
function extraCells(dim, scope) {
  if (dim === 'billing-unit') return [BU_MAP[scope.id].name];
  if (dim === 'resource-group') {
    var rg = RG_MAP[scope.id];
    return [BU_MAP[rg.buId].name, rg.name];
  }
  return [];
}

// 表格最多渲染的行数，避免小时账单跨多天时 DOM 过大
var MAX_ROWS = 300;

function renderTable(tbodyId, dim, scopes, selectedKeys, ctx) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  // 选择「全部产品」时不展示产品列（表头与单元格一并隐藏）
  var showProduct = selectedKeys.length > 0;
  var table = tbody.closest('table');
  if (table) table.classList.toggle('hide-product', !showProduct);

  var dimCols = dim === 'enterprise' ? 0 : (dim === 'billing-unit' ? 1 : 2);
  var colSpan = 7 + dimCols + (showProduct ? 1 : 0);
  if (!scopes.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="' + colSpan + '">暂无可查看的账单数据</td></tr>';
    return;
  }

  var rowProducts = showProduct
    ? selectedKeys.map(function (k) { return { key: k, label: PRODUCTS[k].name }; })
    : [{ key: null, label: '' }];

  // 预先按 scope + 产品算出整条序列，便于计算环比
  var series = [];
  scopes.forEach(function (sc) {
    rowProducts.forEach(function (rp) {
      series.push({
        scope: sc,
        product: rp,
        data: rp.key ? seriesOf(sc, rp.key, ctx) : sumSeries([sc], PRODUCT_KEYS, ctx)
      });
    });
  });

  var last = ctx.labels.length - 1;
  var html = [];
  var truncated = false;
  for (var idx = last; idx >= 0 && !truncated; idx--) {
    for (var j = 0; j < series.length; j++) {
      if (html.length >= MAX_ROWS) { truncated = true; break; }
      var row = series[j];
      var payable = row.data[idx];
      var standard = payable * 1.916;
      var discount = standard - payable;
      var owed = payable * (idx === last ? 1.0012 : 1.0016);
      var prev = idx > 0 ? row.data[idx - 1] : 0;
      var trend = idx === last ? null
        : (prev ? (payable >= prev ? '↗ ' : '↘ ') + Math.abs((payable / prev - 1) * 100).toFixed(2) + '%' : '↗ 100.00%');

      var cells = ['<tr>'];
      cells.push('<td>' + ctx.labels[idx] + '</td>');
      extraCells(dim, row.scope).forEach(function (x) { cells.push('<td>' + x + '</td>'); });
      if (showProduct) cells.push('<td class="col-product">' + row.product.label + '</td>');
      cells.push('<td>' + fmtMoney(standard) + '</td>');
      cells.push('<td>' + fmtMoney(discount) + '</td>');
      cells.push('<td><div class="amount-cell"><span>' + fmtMoney(payable) + '</span>' +
                 (trend ? '<span class="trend ' + (trend.charAt(0) === '↗' ? 'up' : 'down') + '">' + trend + '</span>'
                        : '<span class="status-text">-- 出账中</span>') + '</div></td>');
      cells.push('<td>' + fmtMoney(owed) + '</td>');
      cells.push('<td><span class="status-unpaid">未结清</span></td>');
      cells.push('<td><div class="op-links"><a href="#">详情</a><a href="#">明细</a></div></td>');
      cells.push('</tr>');
      html.push(cells.join(''));
    }
  }
  if (truncated) {
    html.push('<tr><td class="empty-cell" colspan="' + colSpan +
              '">仅展示最近 ' + MAX_ROWS + ' 条，缩小账期范围可查看更多</td></tr>');
  }
  tbody.innerHTML = html.join('');
}

// ====== 角色权限模型 ======
// 权限依次递减：企业管理员/主账号/系统管理员 > 结算单元管理员 > 资源组管理员
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
    buIds: [], rgIds: ['rg1', 'rg5'],
    hint: '资源组管理员：仅可查看有权限的资源组账单（无企业账单 / 结算单元账单）'
  }
};

var currentRole = 'master';

// 当前角色可见的结算单元 id 列表
function allowedBuIds() {
  var cfg = roleConfig[currentRole];
  return cfg.buIds === null ? ALL_BU_IDS.slice() : cfg.buIds.slice();
}

// 当前角色可见的资源组 id 列表：结算单元管理员自动继承其结算单元下全部资源组
function allowedRgIds() {
  var cfg = roleConfig[currentRole];
  if (cfg.rgIds !== null) return cfg.rgIds.slice();
  var ids = [];
  allowedBuIds().forEach(function (buId) {
    BU_MAP[buId].groups.forEach(function (rg) { ids.push(rg.id); });
  });
  return ids;
}

// 资源组账单里，结算单元筛选项 = 可见资源组所属的结算单元
function rgPanelBuIds() {
  var set = [];
  allowedRgIds().forEach(function (id) {
    var buId = RG_MAP[id].buId;
    if (set.indexOf(buId) === -1) set.push(buId);
  });
  return set;
}

// ====== 面板状态 ======
// draft：筛选框上的当前选择；applied：已点击「搜索」生效的查询条件。
// 两者分离，筛选框的勾选不会立即刷新图表与表格。
function emptyFilters(dim) {
  var base = { products: [], billType: 'month', start: TYPE_CFG.month.start, end: TYPE_CFG.month.end };
  if (dim === 'billing-unit') base.buIds = [];
  if (dim === 'resource-group') { base.buId = ''; base.rgIds = []; }
  return base;
}

function cloneFilters(dim, f) {
  var c = emptyFilters(dim);
  c.products = f.products.slice();
  c.billType = f.billType;
  c.start = f.start;
  c.end = f.end;
  if (dim === 'billing-unit') c.buIds = f.buIds.slice();
  if (dim === 'resource-group') {
    c.buId = f.buId;
    c.rgIds = f.rgIds.slice();
  }
  return c;
}

var panelState = {
  'enterprise': {
    draft: emptyFilters('enterprise'), applied: emptyFilters('enterprise'),
    chart: 'chart-ep', legend: 'legend-ep', tbody: 'tbody-ep'
  },
  'billing-unit': {
    draft: emptyFilters('billing-unit'), applied: emptyFilters('billing-unit'),
    chart: 'chart-bp', legend: 'legend-bp', tbody: 'tbody-bp'
  },
  'resource-group': {
    draft: emptyFilters('resource-group'), applied: emptyFilters('resource-group'),
    chart: 'chart-rgp', legend: 'legend-rgp', tbody: 'tbody-rgp'
  }
};

// 计算面板当前生效的数据范围（受角色权限 + 已生效筛选条件共同约束）
function scopesOf(dim) {
  var f = panelState[dim].applied;
  if (dim === 'enterprise') {
    return roleConfig[currentRole].tabs.indexOf('enterprise') === -1
      ? [] : [{ type: 'enterprise' }];
  }
  if (dim === 'billing-unit') {
    var bus = allowedBuIds();
    if (f.buIds.length) {
      bus = bus.filter(function (id) { return f.buIds.indexOf(id) !== -1; });
    }
    return bus.map(function (id) { return { type: 'bu', id: id }; });
  }
  var rgs = allowedRgIds();
  if (f.buId) rgs = rgs.filter(function (id) { return RG_MAP[id].buId === f.buId; });
  if (f.rgIds.length) {
    rgs = rgs.filter(function (id) { return f.rgIds.indexOf(id) !== -1; });
  }
  return rgs.map(function (id) { return { type: 'rg', id: id }; });
}

// 根据已生效的账单类型与起止账期构造渲染上下文
function contextOf(dim) {
  var f = panelState[dim].applied;
  var p = buildPeriods(f.billType, f.start, f.end);
  return { type: f.billType, labels: p.labels, n: p.labels.length };
}

function refreshPanel(dim) {
  var st = panelState[dim];
  if (!st) return;
  var scopes = scopesOf(dim);
  var ctx = contextOf(dim);
  renderChart(st.chart, st.legend, dim, scopes, st.applied.products, ctx);
  renderTable(st.tbody, dim, scopes, st.applied.products, ctx);
}

// 点击「搜索」：先校验账期范围，非法或超上限直接报错，不自动截断
function applyFilters(dim) {
  var st = panelState[dim];
  if (!st) return;
  var t = st.draft.billType;
  var input = parseByType(t, st.draft.start, 0);
  var outEnd = parseByType(t, st.draft.end, 23);
  if (!input || !outEnd) {
    showRangeTip(dim, '请填写完整的开始与结束账期', true);
    return;
  }
  if (pickerKey(t, outEnd) < pickerKey(t, input)) {
    showRangeTip(dim, '开始账期不能晚于结束账期，请重新选择', true);
    return;
  }
  var p = buildPeriods(t, st.draft.start, st.draft.end);
  if (p.clamped) {
    showRangeTip(dim, TYPE_CFG[t].err, true);
    return;
  }
  showRangeTip(dim, '');

  st.applied = cloneFilters(dim, st.draft);
  refreshPanel(dim);
}

// ====== 账单类型 / 日期筛选 ======
function dateInputsOf(dim) {
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  return bar ? bar.querySelectorAll('.date-range input') : [];
}

// 同步筛选框：值与控件宽度都随账单类型（月 / 天 / 小时）变化
function syncDateInputs(dim) {
  var f = panelState[dim].draft;
  var inputs = dateInputsOf(dim);
  if (inputs.length === 2) {
    inputs[0].value = f.start;
    inputs[1].value = f.end;
  }
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  var range = bar && bar.querySelector('.date-range');
  if (range) {
    range.classList.remove('picker-month', 'picker-day', 'picker-hour');
    range.classList.add('picker-' + f.billType);
  }
}

// 在筛选栏内提示最大可选跨度；isError 为真时用错误色展示
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

// 切换账单类型：重置为该类型的默认账期与输入占位
function changeBillType(dim, type) {
  var f = panelState[dim].draft;
  var cfg = TYPE_CFG[type];
  f.billType = type;
  f.start = cfg.start;
  f.end = cfg.end;
  syncDateInputs(dim);
  showRangeTip(dim, cfg.tip);
  // 粒度变了，已打开的日期面板需要关闭，下次打开时按新粒度重建
  if (datePickers[dim]) datePickers[dim].close();
}

// 每个面板的日期选择器实例
var datePickers = {};

document.querySelectorAll('.filter-bar[data-dim]').forEach(function (bar) {
  var dim = bar.dataset.dim;
  var sel = bar.querySelector('.bill-type');
  if (sel) {
    sel.addEventListener('change', function () {
      changeBillType(dim, BILL_TYPES[sel.value] || 'month');
    });
  }
  bar.querySelectorAll('.date-range input').forEach(function (input, i) {
    input.addEventListener('change', function () {
      var f = panelState[dim].draft;
      if (i === 0) f.start = input.value.trim();
      else f.end = input.value.trim();
    });
  });
  initDatePicker(dim, bar);
});

// ====== 日期区间选择器（起止双面板）======
// 组件形态：一个输入框内含「开始 ~ 结束」两个可点击的分段，
// 面板分为左右两栏：左栏选开始、右栏选结束，两栏各带独立的年 / 月导航。
// 顶部有当前编辑段落的高亮指示，底部提供快捷区间与「确定 / 清空」。
// 粒度随账单类型变化：
//   月账单   选「年-月」
//   天账单   选「年-月-日」
//   小时账单 选「年-月-日 + 整点」（每栏日历下方带整点条）
var MONTH_NAMES = ['01月', '02月', '03月', '04月', '05月', '06月', '07月', '08月', '09月', '10月', '11月', '12月'];
var WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

// 把账期文案解析成可比较的数值键：月 -> y*12+m，天 -> 天序号，小时 -> 小时序号
function pickerKey(type, d) {
  if (type === 'month') return d.getFullYear() * 12 + d.getMonth();
  if (type === 'day') return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime() / 3600000);
}

function parseByType(type, s, defHour) {
  if (type === 'month') {
    var ym = parseYM(s);
    return ym ? new Date(ym.y, ym.m - 1, 1) : null;
  }
  if (type === 'day') return parseYMD(s);
  return parseYMDH(s, defHour);
}

function fmtByType(type, d) {
  if (type === 'month') return fmtYM(d);
  if (type === 'day') return fmtYMD(d);
  return fmtYMDH(d);
}

// 该账单类型下的区间上限（以对应粒度的单位数量计）
function maxUnitsOf(type) {
  if (type === 'month') return TYPE_CFG.month.maxMonths;
  if (type === 'day') return TYPE_CFG.day.maxDays;
  return TYPE_CFG.hour.maxDays * 24;
}

// 按粒度对日期做位移：月按月、天按天、小时按小时
function shiftUnits(type, d, n) {
  if (type === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1);
  if (type === 'day') return new Date(d.getTime() + n * 86400000);
  return new Date(d.getTime() + n * 3600000);
}

// 快捷区间：以「结束点」为基准往前推 n 个单位
function presetsOf(type) {
  if (type === 'month') return [{ n: 3, label: '近3个月' }, { n: 6, label: '近6个月' }];
  if (type === 'day') return [{ n: 7, label: '近7天' }, { n: 15, label: '近15天' }, { n: 31, label: '近31天' }];
  return [{ n: 24, label: '近24小时' }, { n: 72, label: '近3天' }, { n: 168, label: '近7天' }];
}

function initDatePicker(dim, bar) {
  var range = bar.querySelector('.date-range');
  if (!range) return;
  var inputs = range.querySelectorAll('input');
  if (inputs.length !== 2) return;

  var pop = document.createElement('div');
  pop.className = 'dp-pop dp-pop-range';
  range.appendChild(pop);

  // side：当前正在编辑的段（'start' | 'end'）
  // views：左右两栏各自展示的年月；draftS / draftE：面板内的临时起止值
  var state = {
    side: 'start',
    views: { start: null, end: null },
    draftS: null,
    draftE: null,
    error: ''
  };

  function type() { return panelState[dim].draft.billType; }

  function currentRange() {
    var t = type();
    var f = panelState[dim].draft;
    return { s: parseByType(t, f.start, 0), e: parseByType(t, f.end, 23) };
  }

  function close() {
    pop.classList.remove('open');
    range.classList.remove('active');
  }

  function open(side) {
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { if (p !== pop) p.classList.remove('open'); });
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });

    var t = type();
    var r = currentRange();
    state.side = side || 'start';
    state.error = '';
    state.draftS = r.s ? new Date(r.s.getTime()) : null;
    state.draftE = r.e ? new Date(r.e.getTime()) : null;

    var vs = state.draftS || new Date();
    var ve = state.draftE || vs;
    state.views.start = new Date(vs.getFullYear(), vs.getMonth(), 1);
    // 两栏各自展示对应端点所在月；未选结束值时才顺延到下个月
    state.views.end = new Date(ve.getFullYear(), ve.getMonth(), 1);
    if (t !== 'month' && !state.draftE && state.views.end.getTime() === state.views.start.getTime()) {
      state.views.end = new Date(vs.getFullYear(), vs.getMonth() + 1, 1);
    }

    render();
    pop.classList.add('open');
    range.classList.add('active');
  }

  // 选中某一侧的日期：只更新面板内的临时值，「确定」后才写回筛选框
  function pickDate(d) {
    var t = type();
    state.error = '';
    var target = state.side === 'start' ? state.draftS : state.draftE;
    // 小时账单保留当前段已选的整点；未选过时起点取 0 点、终点取 23 点
    var hour = t === 'hour'
      ? (target ? target.getHours() : (state.side === 'start' ? 0 : 23))
      : 0;
    var picked = t === 'month'
      ? new Date(d.getFullYear(), d.getMonth(), 1)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour);

    if (state.side === 'start') {
      state.draftS = picked;
      // 小时账单：选完起点日仍停留在起点侧，继续选该日的整点，再由用户切到结束侧
      if (t !== 'hour') state.side = 'end';
      // 结束栏视图跟到已选月份，避免用户还要手动翻月（仅导航，不调整起止值）
      state.views.end = new Date(picked.getFullYear(), picked.getMonth(), 1);
      if (!state.draftE && state.views.end <= state.views.start) {
        state.views.end = new Date(picked.getFullYear(), picked.getMonth() + 1, 1);
      }
    } else {
      state.draftE = picked;
    }
    render();
  }

  // 小时账单：整点条只改当前段的小时
  // 小时账单：先选日期再选整点。未选日期时点整点不生效，避免出现「无日期的小时」
  function pickHour(h) {
    var t = type();
    if (t !== 'hour') return;
    var target = state.side === 'start' ? state.draftS : state.draftE;
    if (!target) {
      state.error = '请先选择' + (state.side === 'start' ? '开始' : '结束') + '日期，再选小时';
      render();
      return;
    }
    state.error = '';
    var next = new Date(target.getFullYear(), target.getMonth(), target.getDate(), h);
    if (state.side === 'start') {
      state.draftS = next;
      // 起点的日 + 小时都选好了，自动进入结束侧
      state.side = 'end';
      if (!state.draftE) {
        state.views.end = new Date(next.getFullYear(), next.getMonth(), 1);
      }
    } else {
      state.draftE = next;
    }
    render();
  }

  function applyPreset(n) {
    var t = type();
    var end = state.draftE || currentRange().e || new Date();
    var start = shiftUnits(t, end, -(n - 1));
    state.draftS = start;
    state.draftE = end;
    state.views.start = new Date(start.getFullYear(), start.getMonth(), 1);
    state.views.end = new Date(end.getFullYear(), end.getMonth(), 1);
    state.side = 'end';
    state.error = '';
    render();
  }

  // 「确定」：只做校验，不自动修正所选区间。
  // 起点晚于终点、或跨度超上限时都停留在面板内报错，由用户自行改选。
  function confirm() {
    if (!state.draftS || !state.draftE) {
      state.error = '请选择完整的开始与结束账期';
      render();
      return;
    }
    var t = type();
    var f = panelState[dim].draft;
    var a = state.draftS, b = state.draftE;

    if (pickerKey(t, b) < pickerKey(t, a)) {
      state.error = '开始账期不能晚于结束账期，请重新选择';
      render();
      return;
    }

    var span = pickerKey(t, b) - pickerKey(t, a) + 1;
    if (span > maxUnitsOf(t)) {
      state.error = TYPE_CFG[t].err;
      render();
      showRangeTip(dim, TYPE_CFG[t].err, true);
      return;
    }

    state.error = '';
    f.start = fmtByType(t, a);
    f.end = fmtByType(t, b);
    syncDateInputs(dim);
    close();
  }

  function clearRange() {
    var t = type();
    var cfg = TYPE_CFG[t];
    state.draftS = parseByType(t, cfg.start, 0);
    state.draftE = parseByType(t, cfg.end, 23);
    state.side = 'start';
    state.error = '';
    render();
  }

  function shiftView(side, deltaMonth, deltaYear) {
    var v = state.views[side];
    state.views[side] = new Date(v.getFullYear() + (deltaYear || 0), v.getMonth() + (deltaMonth || 0), 1);
    render();
  }

  // 单元格状态：两个端点高亮，区间内浅色底
  function cellClass(t, d, side) {
    var cls = [];
    var k = pickerKey(t, d);
    var ks = state.draftS ? pickerKey(t, state.draftS) : null;
    var ke = state.draftE ? pickerKey(t, state.draftE) : null;
    if (ks !== null && k === ks) cls.push('edge');
    if (ke !== null && k === ke) cls.push('edge');
    if (ks !== null && ke !== null && k > ks && k < ke) cls.push('in');
    // 当前正在编辑的一侧，其端点加描边以示焦点
    if (side === state.side) {
      var cur = side === 'start' ? ks : ke;
      if (cur !== null && k === cur) cls.push('focus');
    }
    return cls.join(' ');
  }

  function paneHead(side, text, showMonthNav) {
    return '<div class="dp-head">' +
      '<span class="dp-nav" data-side="' + side + '" data-nav="py" title="上一年">&laquo;</span>' +
      (showMonthNav
        ? '<span class="dp-nav" data-side="' + side + '" data-nav="pm" title="上个月">&lsaquo;</span>'
        : '<span class="dp-nav-ph"></span>') +
      '<span class="dp-title">' + text + '</span>' +
      (showMonthNav
        ? '<span class="dp-nav" data-side="' + side + '" data-nav="nm" title="下个月">&rsaquo;</span>'
        : '<span class="dp-nav-ph"></span>') +
      '<span class="dp-nav" data-side="' + side + '" data-nav="ny" title="下一年">&raquo;</span>' +
      '</div>';
  }

  function monthPane(side) {
    var t = 'month';
    var y = state.views[side].getFullYear();
    var html = [paneHead(side, y + '年', false), '<div class="dp-grid dp-grid-month">'];
    for (var m = 0; m < 12; m++) {
      var d = new Date(y, m, 1);
      html.push('<span class="dp-cell ' + cellClass(t, d, side) +
                '" data-side="' + side + '" data-y="' + y + '" data-m="' + m + '">' + MONTH_NAMES[m] + '</span>');
    }
    html.push('</div>');
    return html.join('');
  }

  // 日历本体（月历网格）
  function calendarHtml(side, t) {
    var v = state.views[side];
    var y = v.getFullYear(), m = v.getMonth();
    // 周一为一周起点
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var html = ['<div class="dp-week">'];
    WEEK_NAMES.forEach(function (w) { html.push('<span>' + w + '</span>'); });
    html.push('</div><div class="dp-grid dp-grid-day">');
    for (var i = 0; i < lead; i++) html.push('<span class="dp-cell dp-blank"></span>');
    for (var dnum = 1; dnum <= days; dnum++) {
      var d = new Date(y, m, dnum);
      html.push('<span class="dp-cell ' + cellClass(t, d, side) +
                '" data-side="' + side + '" data-y="' + y + '" data-m="' + m + '" data-d="' + dnum + '">' +
                dnum + '</span>');
    }
    html.push('</div>');
    return html.join('');
  }

  function dayPane(side, t) {
    var v = state.views[side];
    var head = paneHead(side, v.getFullYear() + '年' + pad2(v.getMonth() + 1) + '月', true);

    // 天账单：仅日历
    if (t !== 'hour') return head + calendarHtml(side, t);

    // 小时账单：左侧选「该月的某一天」，右侧整点列选「该天的某个小时」
    var target = side === 'start' ? state.draftS : state.draftE;
    var cur = target ? target.getHours() : -1;
    var html = [head, '<div class="dp-body">',
                '<div class="dp-cal">', calendarHtml(side, t), '</div>',
                '<div class="dp-hours"><div class="dp-hours-title">时</div>',
                '<div class="dp-hours-list">'];
    for (var h = 0; h < 24; h++) {
      html.push('<span class="dp-hour' + (h === cur ? ' edge' : '') +
                '" data-side="' + side + '" data-h="' + h + '">' + pad2(h) + ':00</span>');
    }
    html.push('</div></div></div>');
    return html.join('');
  }

  function pane(side) {
    var t = type();
    var title = side === 'start' ? '开始' : '结束';
    var target = side === 'start' ? state.draftS : state.draftE;
    // 小时账单未选小时时，提示还需要选整点
    var ph = t === 'hour'
      ? (side === 'start' ? '选择开始日期与小时' : '选择结束日期与小时')
      : '请选择';
    return '<div class="dp-pane' + (side === state.side ? ' active' : '') + '" data-pane="' + side + '">' +
      '<div class="dp-pane-label">' + title +
      '<b>' + (target ? fmtByType(t, target) : ph) + '</b></div>' +
      (t === 'month' ? monthPane(side) : dayPane(side, t)) +
      '</div>';
  }

  function render() {
    var t = type();
    var ready = !!(state.draftS && state.draftE);
    var html = ['<div class="dp-panes">', pane('start'),
                '<div class="dp-panes-sep"></div>', pane('end'), '</div>'];

    html.push('<div class="dp-foot">');
    html.push('<span class="dp-presets">');
    presetsOf(t).forEach(function (p) {
      html.push('<button type="button" class="dp-preset" data-preset="' + p.n + '">' + p.label + '</button>');
    });
    html.push('</span>');
    // 有错误时footer提示位替换为错误文案
    html.push(state.error
      ? '<span class="dp-foot-tip is-error">' + state.error + '</span>'
      : '<span class="dp-foot-tip">' + TYPE_CFG[t].tip + '</span>');
    // 「确定」始终可点：校验交给 confirm()，超范围时给出报错而非自动截断
    html.push('<span class="dp-actions">' +
      '<button type="button" class="dp-reset" data-act="reset">重 置</button>' +
      '<button type="button" class="dp-ok" data-act="ok">确 定</button>' +
      '</span>');
    html.push('</div>');

    pop.innerHTML = html.join('');
    if (t === 'hour') scrollHourIntoView();
  }

  // 渲染后把每一侧已选的整点滚动到可视区域
  function scrollHourIntoView() {
    pop.querySelectorAll('.dp-hours-list').forEach(function (list) {
      var active = list.querySelector('.dp-hour.edge');
      if (!active) return;
      list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
    });
  }

  // 点击输入框的某一段：打开面板并定位到对应侧
  range.addEventListener('click', function (e) {
    if (pop.contains(e.target)) return;
    e.stopPropagation();
    var side = e.target === inputs[1] ? 'end' : 'start';
    if (pop.classList.contains('open')) {
      // 已打开时，点另一段只切换编辑侧
      if (side !== state.side) { state.side = side; render(); }
      else close();
      return;
    }
    open(side);
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
    var el = e.target.closest('.dp-nav, .dp-cell, .dp-hour, .dp-preset, .dp-ok, .dp-reset, .dp-pane');
    if (!el) return;

    if (el.classList.contains('dp-nav')) {
      var nav = el.dataset.nav;
      var side = el.dataset.side;
      state.error = '';
      if (nav === 'py') shiftView(side, 0, -1);
      else if (nav === 'ny') shiftView(side, 0, 1);
      else if (nav === 'pm') shiftView(side, -1, 0);
      else if (nav === 'nm') shiftView(side, 1, 0);
      return;
    }
    if (el.classList.contains('dp-hour')) {
      state.side = el.dataset.side;
      pickHour(+el.dataset.h);
      return;
    }
    if (el.classList.contains('dp-preset')) {
      applyPreset(+el.dataset.preset);
      return;
    }
    if (el.classList.contains('dp-ok')) {
      confirm();
      return;
    }
    if (el.classList.contains('dp-reset')) {
      clearRange();
      return;
    }
    if (el.classList.contains('dp-cell')) {
      if (el.classList.contains('dp-blank')) return;
      // 点哪一栏就编辑哪一段
      state.side = el.dataset.side;
      state.error = '';
      if (type() === 'month') pickDate(new Date(+el.dataset.y, +el.dataset.m, 1));
      else pickDate(new Date(+el.dataset.y, +el.dataset.m, +el.dataset.d));
      return;
    }
    // 点空白栏位切换编辑侧
    if (el.classList.contains('dp-pane') && el.dataset.pane !== state.side) {
      state.side = el.dataset.pane;
      state.error = '';
      render();
    }
  });

  // 输入框手动输入后同步面板
  inputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (!pop.classList.contains('open')) return;
      var r = currentRange();
      state.draftS = r.s;
      state.draftE = r.e;
      state.error = '';
      render();
    });
  });

  datePickers[dim] = { close: close };
}

// 点击空白处关闭日期面板
document.addEventListener('click', function () {
  document.querySelectorAll('.dp-pop.open').forEach(function (p) {
    p.classList.remove('open');
    if (p.parentNode) p.parentNode.classList.remove('active');
  });
});

// ====== 筛选项按权限重建 ======
function rebuildFilters() {
  // 结算单元账单 - 结算单元多选（交互与产品筛选一致）
  // 默认选中第一个有权限的结算单元
  var buDropdown = document.getElementById('ms-bu-dropdown');
  var bus = allowedBuIds();
  buDropdown.innerHTML = ['<div class="ms-option ms-all" data-value="all"><span class="ms-check"></span>全选</div>']
    .concat(bus.map(function (id) {
      return '<div class="ms-option" data-value="' + id + '"><span class="ms-check"></span>' + BU_MAP[id].name + '</div>';
    })).join('');
  panelState['billing-unit'].draft.buIds = [];
  initMultiselect('ms-bu-trigger', 'ms-bu-dropdown', 'ms-bu-label', function (vals) {
    panelState['billing-unit'].draft.buIds = vals;
  }, '全部结算单元', bus.length ? [bus[0]] : []);

  // 资源组账单 - 结算单元单选，默认选中第一个有权限的结算单元
  var rgBuDropdown = document.getElementById('ss-rg-bu-dropdown');
  var rgBus = rgPanelBuIds();
  var defaultRgBu = rgBus.length ? rgBus[0] : '';
  rgBuDropdown.innerHTML = ['<div class="ms-option ss-option" data-value="">全部结算单元</div>']
    .concat(rgBus.map(function (id) {
      return '<div class="ms-option ss-option" data-value="' + id + '">' + BU_MAP[id].name + '</div>';
    })).join('');
  panelState['resource-group'].draft.buId = defaultRgBu;
  initSingleselect('ss-rg-bu-trigger', 'ss-rg-bu-dropdown', 'ss-rg-bu-label', function (val) {
    panelState['resource-group'].draft.buId = val;
    rebuildRgOptions();
  }, '全部结算单元', defaultRgBu);

  // 默认选中该结算单元下的所有资源组
  rebuildRgOptions(true);

  // 默认选中项同时作为初始查询条件生效
  panelState['billing-unit'].applied = cloneFilters('billing-unit', panelState['billing-unit'].draft);
  panelState['resource-group'].applied = cloneFilters('resource-group', panelState['resource-group'].draft);
}

// 资源组多选项：受角色权限 + 筛选框中已选结算单元过滤
// selectAll=true 时默认全选当前结算单元下的资源组
function rebuildRgOptions(selectAll) {
  var dropdown = document.getElementById('ms-rg-dropdown');
  var buId = panelState['resource-group'].draft.buId;
  var ids = allowedRgIds().filter(function (id) { return !buId || RG_MAP[id].buId === buId; });

  dropdown.innerHTML = ['<div class="ms-option ms-all" data-value="all"><span class="ms-check"></span>全选</div>']
    .concat(ids.map(function (id) {
      return '<div class="ms-option" data-value="' + id + '"><span class="ms-check"></span>' + RG_MAP[id].name + '</div>';
    })).join('');

  panelState['resource-group'].draft.rgIds = [];
  initMultiselect('ms-rg-trigger', 'ms-rg-dropdown', 'ms-rg-label', function (vals) {
    panelState['resource-group'].draft.rgIds = vals;
  }, '全部资源组', selectAll ? ids : []);
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

  // 重置全部筛选条件，避免跨角色残留
  Object.keys(panelState).forEach(function (k) {
    panelState[k].draft = emptyFilters(k);
    panelState[k].applied = emptyFilters(k);
    var bar = document.querySelector('.filter-bar[data-dim="' + k + '"]');
    var sel = bar && bar.querySelector('.bill-type');
    if (sel) sel.selectedIndex = 0;
    syncDateInputs(k);
    showRangeTip(k, '');
  });
  resetProductSelects();

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

// 角色按钮点击
document.querySelectorAll('.role-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    switchRole(btn.dataset.role);
  });
});

// Tab 点击（只切换可见 tab 内的内容）
document.querySelectorAll('#bill-tabs .tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    switchTab(tab.dataset.panel);
  });
});

// ====== 搜索 / 重置 ======
// 重置：筛选框恢复默认状态（账单类型、日期、产品清空，
// 结算单元 / 资源组恢复为默认选中项），并按默认条件刷新结果
function resetPanel(dim) {
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  if (!bar) return;

  var billType = bar.querySelector('.bill-type');
  if (billType) billType.selectedIndex = 0;

  panelState[dim].draft = emptyFilters(dim);
  syncDateInputs(dim);
  showRangeTip(dim, '');
  bar.querySelectorAll('.ms-dropdown').forEach(function (d) {
    if (msInstances[d.id]) msInstances[d.id].clear();
  });

  // 恢复默认选中：结算单元账单选第一个有权限结算单元；
  // 资源组账单选第一个有权限结算单元 + 其下全部资源组
  if (dim === 'billing-unit') {
    var bus = allowedBuIds();
    if (bus.length && msInstances['ms-bu-dropdown']) {
      msInstances['ms-bu-dropdown'].set([bus[0]]);
    }
  } else if (dim === 'resource-group') {
    var rgBus = rgPanelBuIds();
    var defaultRgBu = rgBus.length ? rgBus[0] : '';
    panelState[dim].draft.buId = defaultRgBu;
    if (msInstances['ss-rg-bu-dropdown']) {
      msInstances['ss-rg-bu-dropdown'].set(defaultRgBu, true);
    }
    rebuildRgOptions(true);
  }

  panelState[dim].applied = cloneFilters(dim, panelState[dim].draft);
  refreshPanel(dim);
}

document.querySelectorAll('.filter-bar[data-dim]').forEach(function (bar) {
  var dim = bar.dataset.dim;
  var searchBtn = bar.querySelector('[data-action="search"]');
  var resetBtn = bar.querySelector('[data-action="reset"]');
  if (searchBtn) searchBtn.addEventListener('click', function () { applyFilters(dim); });
  if (resetBtn) resetBtn.addEventListener('click', function () { resetPanel(dim); });
});

// ====== 多选下拉组件 ======
var msInstances = {};

function initMultiselect(triggerId, dropdownId, labelId, onChange, placeholder, initial) {
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
    if (selected.size === 0) {
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
    var allChecked = options.length > 0 && options.every(function(o) { return selected.has(o.dataset.value); });
    allOption.classList.toggle('checked', allChecked);
  }

  // 打开/关闭
  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var willOpen = !dropdown.classList.contains('open');
    document.querySelectorAll('.ms-dropdown.open').forEach(function(d) {
      d.classList.remove('open');
    });
    dropdown.classList.toggle('open', willOpen);
  });

  // 清空按钮：仅在已有选中项时显示（由 .has-selection 控制）
  var clearBtn = trigger.querySelector('.ms-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      selected.clear();
      options.forEach(function(o) { o.classList.remove('checked'); });
      updateLabel();
    });
  }

  // 全选
  allOption.addEventListener('click', function(e) {
    e.stopPropagation();
    if (allOption.classList.contains('checked')) {
      selected.clear();
      options.forEach(function(o) { o.classList.remove('checked'); });
      allOption.classList.remove('checked');
    } else {
      options.forEach(function(o) {
        selected.add(o.dataset.value);
        o.classList.add('checked');
      });
      allOption.classList.add('checked');
    }
    updateLabel();
  });

  // 单选项
  options.forEach(function(opt) {
    opt.addEventListener('click', function(e) {
      e.stopPropagation();
      if (selected.has(opt.dataset.value)) {
        selected.delete(opt.dataset.value);
        opt.classList.remove('checked');
      } else {
        selected.add(opt.dataset.value);
        opt.classList.add('checked');
      }
      updateLabel();
    });
  });

  msInstances[dropdownId] = {
    clear: function () {
      selected.clear();
      options.forEach(function(o) { o.classList.remove('checked'); });
      allOption.classList.remove('checked');
      label.textContent = ph;
      trigger.classList.remove('has-selection');
    },
    // 设置选中项（用于默认选中），会触发 onChange 同步筛选框状态
    set: function (vals) {
      selected.clear();
      (vals || []).forEach(function (v) { selected.add(v); });
      options.forEach(function (o) {
        o.classList.toggle('checked', selected.has(o.dataset.value));
      });
      updateLabel();
    }
  };

  if (initial && initial.length) msInstances[dropdownId].set(initial);
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
    // 设置选中值；silent=true 时不触发 onChange（用于默认选中的初始化）
    set: function (val, silent) { setValue(val, silent); }
  };

  if (initial) setValue(initial, true);
}

// 切换角色时清空产品多选的 UI 勾选状态
function resetProductSelects() {
  ['ms-ep-dropdown', 'ms-bp-dropdown', 'ms-rgp-dropdown'].forEach(function (id) {
    if (msInstances[id]) msInstances[id].clear();
  });
}

// 关闭所有下拉
document.addEventListener('click', function() {
  document.querySelectorAll('.ms-dropdown.open').forEach(function(d) {
    d.classList.remove('open');
  });
});

// 初始化产品多选（仅记录筛选框选择，点击「搜索」后才生效）
initMultiselect('ms-ep-trigger', 'ms-ep-dropdown', 'ms-ep-label', function (vals) {
  panelState['enterprise'].draft.products = vals;
}, '全部产品');
initMultiselect('ms-bp-trigger', 'ms-bp-dropdown', 'ms-bp-label', function (vals) {
  panelState['billing-unit'].draft.products = vals;
}, '全部产品');
initMultiselect('ms-rgp-trigger', 'ms-rgp-dropdown', 'ms-rgp-label', function (vals) {
  panelState['resource-group'].draft.products = vals;
}, '全部产品');

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

  // 接受外壳页广播的角色，保持两个视图一致
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

  // 图表右侧的账单分析入口：请求外壳页打开右侧抽屉
  // 三个面板各有一个按钮，统一用事件委托绑定
  if (window.parent && window.parent !== window) {
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.analysis-entry')) return;
      window.parent.postMessage({ type: 'open-analysis-drawer' }, '*');
    });
  }
})();
