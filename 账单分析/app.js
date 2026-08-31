// ==========================================================
// 账单分析
// 与「账单概览」的区别：概览看的是一段账期区间的趋势，
// 分析看的是「单个账期」的构成——因此账期为单选（一个月 / 一天 / 一个小时）。
// 数据模型（组织结构、产品权重、金额生成规则）与账单概览保持一致，
// 保证两个页面同一账期的金额可以互相对上。
// ==========================================================

// ====== 基础数据 ======
var BILL_TYPES = { '月账单': 'month', '天账单': 'day', '小时账单': 'hour' };
var TYPE_CFG = {
  month: { label: '月', unit: '月', def: '2026.08', ph: '2026.08', prevLabel: '上月' },
  day:   { label: '天', unit: '天', def: '2026.08.15', ph: '2026.08.15', prevLabel: '前一天' },
  hour:  { label: '小时', unit: '小时', def: '2026.08.15 14:00', ph: '2026.08.15 14:00', prevLabel: '上一小时' }
};

var PRODUCTS = {
  apimkt: { name: 'API市场 APIMKT', weight: 0.10 },
  appmkt: { name: '应用市场 APPMKT', weight: 0.13 },
  tidb:   { name: '分布式数据库 TiDB', weight: 0.19 },
  obs:    { name: '对象存储 OBS', weight: 0.26 },
  ecs:    { name: '云服务器 ECS', weight: 0.32 }
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

// 产品账单组成：
//   应付金额 = 按量计费应付金额 + 资源包购买金额（pay + buy = 1，保证与消费 TOP 的金额口径一致）
//   资源包抵扣金额 = 当期被资源包抵扣掉的用量价值，不计入应付，单独列示（ded 为相对应付的比例）
var PROD_COMP = {
  apimkt: { pay: 0.78, buy: 0.22, ded: 0.16 },
  appmkt: { pay: 0.71, buy: 0.29, ded: 0.21 },
  tidb:   { pay: 0.63, buy: 0.37, ded: 0.28 },
  obs:    { pay: 0.55, buy: 0.45, ded: 0.34 },
  ecs:    { pay: 0.60, buy: 0.40, ded: 0.30 }
};

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
function parseYMDH(s) {
  var m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})(?:[\sT]+(\d{1,2}))?/.exec((s || '').trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] === undefined ? 0 : +m[4]) : null;
}

function fmtYM(d) { return d.getFullYear() + '.' + pad2(d.getMonth() + 1); }
function fmtYMD(d) { return fmtYM(d) + '.' + pad2(d.getDate()); }
function fmtYMDH(d) { return fmtYMD(d) + ' ' + pad2(d.getHours()) + ':00'; }

function parseByType(type, s) {
  if (type === 'month') return parseYM(s);
  if (type === 'day') return parseYMD(s);
  return parseYMDH(s);
}
function fmtByType(type, d) {
  if (type === 'month') return fmtYM(d);
  if (type === 'day') return fmtYMD(d);
  return fmtYMDH(d);
}

// 账期展示文案：小时账期展示为区间「2026.08.15 14:00-15:00」
function periodText(type, d) {
  if (type !== 'hour') return fmtByType(type, d);
  var next = new Date(d.getTime() + 3600000);
  return fmtYMD(d) + ' ' + pad2(d.getHours()) + ':00-' + pad2(next.getHours()) + ':00';
}

// 上一账期：上月 / 前一天 / 上一小时
function prevPeriod(type, d) {
  if (type === 'month') return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  if (type === 'day') return new Date(d.getTime() - 86400000);
  return new Date(d.getTime() - 3600000);
}

// 账期序号：作为金额生成的确定性输入
function periodIndex(type, d) {
  if (type === 'month') return d.getFullYear() * 12 + d.getMonth();
  if (type === 'day') return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime() / 3600000);
}

// ====== 金额模型 ======
// 企业在某个账期的应付总额
function entTotalAt(type, d) {
  var idx = periodIndex(type, d);
  if (type === 'month') {
    var base = MONTH_TOTALS[((idx % MONTH_TOTALS.length) + MONTH_TOTALS.length) % MONTH_TOTALS.length];
    return base * (0.92 + 0.16 * pseudo(idx, 0.5));
  }
  if (type === 'day') {
    return MONTH_AVG / 30 * (0.85 + 0.3 * pseudo(idx, 2.5));
  }
  // 小时账单叠加日内曲线：14 点前后为高峰，凌晨为低谷
  return MONTH_AVG / 720 * (0.75 + 0.4 * Math.sin((d.getHours() - 8) * Math.PI / 12))
         * (0.92 + 0.16 * pseudo(idx, 3.5));
}

// 各主体 / 各产品在不同账期的独立波动，避免所有维度同涨同跌
function waveAt(seed, type, d) {
  var idx = periodIndex(type, d);
  return 0.86 + 0.28 * pseudo(idx, seed + (type === 'day' ? 10 : (type === 'hour' ? 20 : 0)));
}

// 账期内的占比必须归一化，否则「按结算单元求和」「按资源组求和」
// 与企业总额三者对不上。这里把「静态权重 × 当期波动」在同级内做归一化，
// 保证：Σ结算单元 = 企业总额，Σ(某结算单元下资源组) = 该结算单元金额。
var shareCache = {};

function sharesAt(type, d) {
  var key = type + '|' + periodIndex(type, d);
  if (shareCache[key]) return shareCache[key];

  var bu = {}, rg = {}, buSum = 0;

  ORG.forEach(function (b) {
    bu[b.id] = b.w * waveAt(SCOPE_SEED[b.id], type, d);
    buSum += bu[b.id];
  });
  ORG.forEach(function (b) { bu[b.id] /= buSum; });

  // 资源组占比先在所属结算单元内归一化，再乘以结算单元占比
  ORG.forEach(function (b) {
    var sum = 0;
    b.groups.forEach(function (g) {
      rg[g.id] = g.w * waveAt(SCOPE_SEED[g.id], type, d);
      sum += rg[g.id];
    });
    b.groups.forEach(function (g) { rg[g.id] = rg[g.id] / sum * bu[b.id]; });
  });

  shareCache[key] = { bu: bu, rg: rg };
  return shareCache[key];
}

// scope: {type:'enterprise'} | {type:'bu', id} | {type:'rg', id}
// 返回该主体在当期占企业总额的比例（企业为 1）
function scopeFactor(scope, type, d) {
  if (scope.type === 'enterprise') return 1;
  var s = sharesAt(type, d);
  return scope.type === 'bu' ? s.bu[scope.id] : s.rg[scope.id];
}

// 产品占比同样归一化，保证 Σ产品 = 该主体金额
function prodSharesAt(type, d) {
  var key = 'p|' + type + '|' + periodIndex(type, d);
  if (shareCache[key]) return shareCache[key];

  var m = {}, sum = 0;
  PRODUCT_KEYS.forEach(function (k) {
    m[k] = PRODUCTS[k].weight * waveAt(PROD_SEED[k], type, d);
    sum += m[k];
  });
  PRODUCT_KEYS.forEach(function (k) { m[k] /= sum; });

  shareCache[key] = m;
  return m;
}

// 某主体 + 某产品在某账期的应付金额
function amountOf(scope, prodKey, type, d) {
  return entTotalAt(type, d) * scopeFactor(scope, type, d) * prodSharesAt(type, d)[prodKey];
}

// 某主体 + 某产品在某账期的账单组成
// 按量计费应付 + 资源包购买 = 应付金额（与消费 TOP 口径一致）；资源包抵扣单独列示。
// 组成比例随账期做小幅确定性波动，避免各账期结构完全一致。
function compositionOf(scopes, prodKey, type, d) {
  var amount = 0;
  scopes.forEach(function (sc) { amount += amountOf(sc, prodKey, type, d); });

  var c = PROD_COMP[prodKey] || { pay: 0.7, buy: 0.3, ded: 0.2 };
  // 波动范围约 ±8%，并将按量计费占比夹在 [0.15, 0.95] 内，避免出现负值或极端结构
  var swing = (waveAt(PROD_SEED[prodKey] + 41.7, type, d) - 1) * 0.6;
  var pay = Math.min(0.95, Math.max(0.15, c.pay + swing));

  var payAmount = amount * pay;
  var buyAmount = amount - payAmount;
  var dedAmount = amount * c.ded * waveAt(PROD_SEED[prodKey] + 83.9, type, d);

  return { amount: amount, pay: payAmount, buy: buyAmount, ded: dedAmount };
}

// 多主体 + 多产品聚合
function sumAmount(scopes, keys, type, d) {
  var total = 0;
  scopes.forEach(function (sc) {
    keys.forEach(function (k) { total += amountOf(sc, k, type, d); });
  });
  return total;
}

function fmtMoney(v) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v) { return v.toFixed(2) + '%'; }

// ====== 角色权限模型 ======
// 与账单概览一致：企业管理员/主账号/系统管理员 > 结算单元管理员 > 资源组管理员
var SAME_HINT = '主账号 / 企业管理员 / 系统管理员：可查看企业分析 / 结算单元分析 / 资源组分析';
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
    hint: '结算单元管理员：可查看有权限的结算单元分析，以及其下所有资源组分析（无企业分析）'
  },
  'rg-admin': {
    label: '资源组管理员', tab: 'resource-group',
    tabs: ['resource-group'],
    buIds: [], rgIds: ['rg1', 'rg5'],
    hint: '资源组管理员：仅可查看有权限的资源组分析（无企业分析 / 结算单元分析）'
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

// 资源组分析里，结算单元筛选项 = 可见资源组所属的结算单元
function rgPanelBuIds() {
  var set = [];
  allowedRgIds().forEach(function (id) {
    var buId = RG_MAP[id].buId;
    if (set.indexOf(buId) === -1) set.push(buId);
  });
  return set;
}

// ====== 必填单选的默认值 ======
// 结算单元分析：默认第一个有权限的结算单元
function defaultBuId() {
  var ids = allowedBuIds();
  return ids.length ? ids[0] : '';
}

// 资源组分析：默认第一个有权限结算单元（按可见资源组归属推导）
function defaultRgPanelBuId() {
  var ids = rgPanelBuIds();
  return ids.length ? ids[0] : '';
}

// 资源组分析：给定结算单元下第一个有权限的资源组
function defaultRgId(buId) {
  var ids = allowedRgIds().filter(function (id) { return !buId || RG_MAP[id].buId === buId; });
  return ids.length ? ids[0] : '';
}

// ====== 面板状态 ======
// draft：筛选框上的当前选择；applied：已点击「搜索」生效的查询条件
// 结算单元 / 资源组为必填单选，默认值取第一个有权限项，不存在「全部」态。
function emptyFilters(dim) {
  var f = { billType: 'month', period: TYPE_CFG.month.def };
  if (dim === 'billing-unit') f.buId = defaultBuId();
  if (dim === 'resource-group') {
    f.buId = defaultRgPanelBuId();
    f.rgId = defaultRgId(f.buId);
  }
  return f;
}

function cloneFilters(dim, f) {
  var c = emptyFilters(dim);
  c.billType = f.billType;
  c.period = f.period;
  if (dim === 'billing-unit') c.buId = f.buId;
  if (dim === 'resource-group') { c.buId = f.buId; c.rgId = f.rgId; }
  return c;
}

var panelState = {
  'enterprise': { draft: emptyFilters('enterprise'), applied: emptyFilters('enterprise') },
  'billing-unit': { draft: emptyFilters('billing-unit'), applied: emptyFilters('billing-unit') },
  'resource-group': { draft: emptyFilters('resource-group'), applied: emptyFilters('resource-group') }
};

// 当前面板生效的数据范围（受角色权限 + 已生效筛选条件共同约束）
// 结算单元 / 资源组为必填单选：未选中（即无任何有权限项）时范围为空。
function scopesOf(dim) {
  var f = panelState[dim].applied;
  if (dim === 'enterprise') {
    return roleConfig[currentRole].tabs.indexOf('enterprise') === -1 ? [] : [{ type: 'enterprise' }];
  }
  if (dim === 'billing-unit') {
    if (!f.buId || allowedBuIds().indexOf(f.buId) === -1) return [];
    return [{ type: 'bu', id: f.buId }];
  }
  if (!f.rgId || allowedRgIds().indexOf(f.rgId) === -1) return [];
  if (f.buId && RG_MAP[f.rgId].buId !== f.buId) return [];
  return [{ type: 'rg', id: f.rgId }];
}

// ====== 消费 TOP 渲染 ======
// 从产品 / 结算单元 / 资源组 3 个维度，按选中账期的消费金额从大到小排序，
// 每行展示：金额、与上一账期的环比、在该维度整体消费中的占比。
function buildRows(entries, type, date) {
  var prev = prevPeriod(type, date);
  var rows = entries.map(function (e) {
    var cur = sumAmount(e.scopes, e.keys, type, date);
    var old = sumAmount(e.scopes, e.keys, type, prev);
    return { name: e.name, amount: cur, prev: old };
  });
  rows.sort(function (a, b) { return b.amount - a.amount; });

  var total = rows.reduce(function (s, r) { return s + r.amount; }, 0);
  var max = rows.length ? rows[0].amount : 0;
  rows.forEach(function (r) {
    r.share = total ? r.amount / total * 100 : 0;
    r.bar = max ? r.amount / max * 100 : 0;
    r.mom = r.prev ? (r.amount / r.prev - 1) * 100 : null;
  });
  return { rows: rows, total: total };
}

function momCell(mom) {
  if (mom === null) return '<span class="top-mom flat">--</span>';
  if (Math.abs(mom) < 0.005) return '<span class="top-mom flat">0.00%</span>';
  var up = mom > 0;
  return '<span class="top-mom ' + (up ? 'up' : 'down') + '">' +
         (up ? '↗ ' : '↘ ') + fmtPct(Math.abs(mom)) + '</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 各分析维度下「占比」列的口径说明：占比的分母随维度不同而不同，
// 直接标注在表头，避免用户误以为三个 Tab 的占比是同一口径。
var SHARE_TIP = {
  'enterprise': '企业全部账单金额占比',
  'billing-unit': '选中结算单元的账单金额占比',
  'resource-group': '选中资源组账单金额占比'
};

// 占比列表头：文案 + 问号图标。
// 提示气泡为自绘元素而非原生 title：原生 title 只在悬停数百毫秒后弹出且点击无反应，
// 这里改为 hover 即显示、点击可固定（再次点击或点空白处关闭），触摸设备下同样可用。
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

// 提示气泡的点击态：点图标固定气泡，点其他位置 / 再次点击关闭。
// 用捕获阶段之外的普通监听即可，但需要 stopPropagation 避免被下方
// 「点击空白处关闭下拉」的全局监听立即收起。
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

// 卡片内名称搜索关键词：key 形如 dim|cardKey，切换角色 / 重置时清空
var topSearch = {};

function searchKey(dim, cardKey) { return dim + '|' + cardKey; }

// 卡片内直接展示的最大行数：卡片高度固定，超出的行改由「查看全部」弹框承载
var TOP_VISIBLE_ROWS = 8;

function topRowHtml(o) {
  var r = o.r;
  return '<div class="top-row item rank-' + (o.rank <= 3 ? o.rank : 'n') + '">' +
    '<span class="top-rank">' + o.rank + '</span>' +
    '<span class="top-name" title="' + escapeHtml(r.name) + '">' + escapeHtml(r.name) + '</span>' +
    '<span class="top-amount">￥' + fmtMoney(r.amount) + '</span>' +
    momCell(r.mom) +
    '<span class="top-share">' + fmtPct(r.share) + '</span>' +
    '<span class="top-bar"><span class="top-bar-fill" style="width:' + r.bar.toFixed(1) + '%"></span></span>' +
    '</div>';
}

// 卡片体：列表头 + 命中关键词的行（排名保持原始名次，便于识别真实 TOP 位置）
// opts.limit  为 0 时输出全部行（弹框使用），大于 0 时截断并追加「查看全部」入口（卡片内使用）
// opts.dim / opts.cardKey 供「查看全部」按钮回查数据
function topCardBody(rows, prevLabel, keyword, opts) {
  opts = opts || {};
  var limit = opts.limit || 0;
  var kw = (keyword || '').trim().toLowerCase();
  var list = rows.map(function (r, i) { return { r: r, rank: i + 1 }; });
  if (kw) {
    list = list.filter(function (o) { return o.r.name.toLowerCase().indexOf(kw) !== -1; });
  }

  var headRow = '<div class="top-row head">' +
    '<span></span><span>名称</span>' +
    '<span style="text-align:right">消费金额</span>' +
    '<span style="text-align:right">环比' + prevLabel + '</span>' +
    shareHeadHtml(opts.dim) + '</div>';

  if (!list.length) {
    var emptyMsg = kw
      ? '未匹配到名称包含「' + escapeHtml(keyword) + '」的数据'
      : '暂无可查看的数据';
    return headRow + '<div class="top-empty">' + emptyMsg + '</div>';
  }

  var shown = limit ? list.slice(0, limit) : list;
  var body = [headRow];

  body.push('<div class="top-scroll">');
  shown.forEach(function (o) { body.push(topRowHtml(o)); });
  body.push('</div>');

  if (limit && list.length > limit) {
    body.push('<div class="top-card-foot">' +
      '<button type="button" class="top-more-btn" ' +
      'data-dim="' + opts.dim + '" data-card="' + opts.cardKey + '">' +
      '查看全部 ' + list.length + ' 条' +
      '<svg class="top-more-ico" viewBox="0 0 12 12" fill="none">' +
      '<path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '</button></div>');
  }

  return body.join('');
}

// 卡片内部结构（不含最外层 .top-card），整块渲染与单卡片重绘共用
function renderTopCardInner(dim, cardKey, title, result, prevLabel) {
  var kw = topSearch[searchKey(dim, cardKey)] || '';

  // 名称搜索：紧跟表名排布，仅过滤当前卡片，不影响合计与其他卡片
  var search = '<span class="top-head-search">' +
    '<svg class="top-search-icon" viewBox="0 0 16 16" fill="none">' +
    '<circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '</svg>' +
    '<input type="text" class="top-search-input" placeholder="搜索名称" ' +
    'data-dim="' + dim + '" data-card="' + cardKey + '" value="' + escapeHtml(kw) + '">' +
    (kw ? '<span class="top-search-clear" data-dim="' + dim + '" data-card="' + cardKey + '">×</span>' : '') +
    '</span>';

  var head = '<div class="top-card-head">' +
    '<span class="top-card-title">' + title + '</span>' +
    search +
    '<span class="top-card-total">合计 ￥' + fmtMoney(result.total) + '</span>' +
    '</div>';

  return head + topCardBody(result.rows, prevLabel, kw, {
    limit: TOP_VISIBLE_ROWS,
    dim: dim,
    cardKey: cardKey
  });
}

function renderTopCard(dim, cardKey, title, result, prevLabel) {
  return '<div class="top-card">' +
    renderTopCardInner(dim, cardKey, title, result, prevLabel) +
    '</div>';
}

// 各维度的 TOP 卡片组合：
//   企业分析     产品 / 结算单元 / 资源组
//   结算单元分析 产品 / 资源组（结算单元已被必填单选固定为一个，排名无意义故不展示）
//   资源组分析   产品（结算单元与资源组均已被必填单选固定，只剩产品可排名）
function cardsOf(dim, scopes, type, date) {
  var cards = [];
  var applied = panelState[dim].applied;

  // 产品维度：当前范围内按产品拆分
  cards.push({
    key: 'product',
    title: '产品 TOP',
    result: buildRows(PRODUCT_KEYS.map(function (k) {
      return { name: PRODUCTS[k].name, scopes: scopes, keys: [k] };
    }), type, date)
  });

  // 资源组分析：筛选条件已定位到唯一资源组，除产品外无可排名维度
  if (dim === 'resource-group') return cards;

  // 结算单元维度：仅企业分析展示（结算单元分析已固定为单个结算单元）
  if (dim === 'enterprise') {
    cards.push({
      key: 'bu',
      title: '结算单元 TOP',
      result: buildRows(allowedBuIds().map(function (id) {
        return { name: BU_MAP[id].name, scopes: [{ type: 'bu', id: id }], keys: PRODUCT_KEYS };
      }), type, date)
    });
  }

  // 资源组维度：结算单元分析下限定在已选结算单元内
  var rgIds = allowedRgIds();
  if (dim === 'billing-unit' && applied.buId) {
    rgIds = rgIds.filter(function (id) { return RG_MAP[id].buId === applied.buId; });
  }
  cards.push({
    key: 'rg',
    title: '资源组 TOP',
    result: buildRows(rgIds.map(function (id) {
      return { name: RG_MAP[id].name, scopes: [{ type: 'rg', id: id }], keys: PRODUCT_KEYS };
    }), type, date)
  });

  return cards;
}

// ====== 产品分析渲染 ======
// 逐产品列出选中账期的账单组成：按量计费应付 / 资源包购买 / 资源包抵扣，
// 并给出应付金额合计（= 按量计费应付 + 资源包购买）与合计行。
function buildProdComposition(scopes, type, date) {
  var rows = PRODUCT_KEYS.map(function (k) {
    var c = compositionOf(scopes, k, type, date);
    return { name: PRODUCTS[k].name, amount: c.amount, pay: c.pay, buy: c.buy, ded: c.ded };
  });
  rows.sort(function (a, b) { return b.amount - a.amount; });

  var sum = { amount: 0, pay: 0, buy: 0, ded: 0 };
  rows.forEach(function (r) {
    sum.amount += r.amount;
    sum.pay += r.pay;
    sum.buy += r.buy;
    sum.ded += r.ded;
  });
  return { rows: rows, sum: sum };
}

// 产品分析的统计范围文案：企业为全部，结算单元 / 资源组则标出选中的主体，
// 便于用户确认表内金额是「选中主体下」的口径。
function prodScopeLabel(dim) {
  var f = panelState[dim].applied;
  if (dim === 'billing-unit') return f.buId && BU_MAP[f.buId] ? BU_MAP[f.buId].name : '';
  if (dim === 'resource-group') return f.rgId && RG_MAP[f.rgId] ? RG_MAP[f.rgId].name : '';
  return '企业全部';
}

function renderProdAnalysis(dim, scopes, type, date) {
  var box = document.getElementById('prodtable-' + dim);
  var sub = document.getElementById('prodsub-' + dim);
  if (!box) return;

  if (!scopes.length) {
    box.innerHTML = '<div class="top-empty">暂无可查看的数据</div>';
    if (sub) sub.textContent = '';
    return;
  }

  var data = buildProdComposition(scopes, type, date);
  var scopeLabel = prodScopeLabel(dim);

  if (sub) {
    sub.textContent = (scopeLabel ? '范围 ' + scopeLabel + '　' : '') +
      '账期 ' + periodText(type, date) +
      '　共 ' + data.rows.length + ' 个产品　应付合计 ￥' + fmtMoney(data.sum.amount) +
      '　资源包抵扣合计 ￥' + fmtMoney(data.sum.ded);
  }

  var html = ['<table class="prod-table"><thead><tr>' +
    '<th class="col-name">产品</th>' +
    '<th class="col-num">按量计费应付金额</th>' +
    '<th class="col-num">资源包购买金额</th>' +
    '<th class="col-num">资源包抵扣金额</th>' +
    '<th class="col-num">应付金额合计</th>' +
    '<th class="col-op">操作</th>' +
    '</tr></thead><tbody>'];

  // 「计费明细」新开页：带上产品、账期与统计范围，便于目标页定位到同一口径的数据
  var periodParam = encodeURIComponent(fmtByType(type, date));
  var scopeParam = scopeLabel ? '&scope=' + encodeURIComponent(scopeLabel) : '';
  data.rows.forEach(function (r) {
    var href = '../计费明细/index.html?product=' + encodeURIComponent(r.name) +
               '&billType=' + type + '&period=' + periodParam + scopeParam;
    html.push('<tr>' +
      '<td class="col-name" title="' + escapeHtml(r.name) + '">' + escapeHtml(r.name) + '</td>' +
      '<td class="col-num">￥' + fmtMoney(r.pay) + '</td>' +
      '<td class="col-num">￥' + fmtMoney(r.buy) + '</td>' +
      '<td class="col-num deduct">-￥' + fmtMoney(r.ded) + '</td>' +
      '<td class="col-num total">￥' + fmtMoney(r.amount) + '</td>' +
      '<td class="col-op"><a class="prod-op-link" href="' + escapeHtml(href) +
        '" target="_blank" rel="noopener">计费明细</a></td>' +
      '</tr>');
  });

  html.push('</tbody><tfoot><tr>' +
    '<td class="col-name">合计</td>' +
    '<td class="col-num">￥' + fmtMoney(data.sum.pay) + '</td>' +
    '<td class="col-num">￥' + fmtMoney(data.sum.buy) + '</td>' +
    '<td class="col-num deduct">-￥' + fmtMoney(data.sum.ded) + '</td>' +
    '<td class="col-num total">￥' + fmtMoney(data.sum.amount) + '</td>' +
    '<td class="col-op"></td>' +
    '</tr></tfoot></table>');

  box.innerHTML = html.join('');
}

// 卡片数量随维度变化（企业 3 张 / 结算单元 2 张 / 资源组 1 张），
// 用类名驱动栅格列数，避免单卡片被拉满整行。
function syncGridColumns(grid, count) {
  grid.classList.remove('cards-1', 'cards-2', 'cards-3');
  grid.classList.add('cards-' + Math.min(count, 3));
}

function refreshPanel(dim) {
  var st = panelState[dim];
  if (!st) return;
  var f = st.applied;
  var type = f.billType;
  var date = parseByType(type, f.period) || parseByType(type, TYPE_CFG[type].def);
  var scopes = scopesOf(dim);

  var grid = document.getElementById('topgrid-' + dim);
  var sub = document.getElementById('topsub-' + dim);
  if (!grid) return;

  if (!scopes.length) {
    syncGridColumns(grid, 1);
    grid.innerHTML = '<div class="top-card"><div class="top-empty">暂无可查看的数据</div></div>';
    if (sub) sub.textContent = '';
    renderProdAnalysis(dim, scopes, type, date);
    return;
  }

  // 概要：当前账期总消费 + 与上一账期的环比
  var total = sumAmount(scopes, PRODUCT_KEYS, type, date);
  var prevTotal = sumAmount(scopes, PRODUCT_KEYS, type, prevPeriod(type, date));
  var mom = prevTotal ? (total / prevTotal - 1) * 100 : null;

  if (sub) {
    sub.innerHTML = '账期 ' + periodText(type, date) +
      '　总消费 ￥' + fmtMoney(total) +
      '　环比' + TYPE_CFG[type].prevLabel + ' ' + momCell(mom);
  }

  var cards = cardsOf(dim, scopes, type, date);
  syncGridColumns(grid, cards.length);
  grid.innerHTML = cards.map(function (c) {
    return renderTopCard(dim, c.key, c.title, c.result, TYPE_CFG[type].prevLabel);
  }).join('');

  // 三个维度均展示产品分析，各自按当前生效范围拆解
  renderProdAnalysis(dim, scopes, type, date);
}

// ====== 必填校验 ======
// 结算单元 / 资源组为必填单选，未选中时给出错误态并阻止查询
function markInvalid(selectorId, invalid) {
  var box = document.getElementById(selectorId);
  if (box) box.classList.toggle('is-invalid', !!invalid);
}

// 返回校验是否通过
function validateFilters(dim) {
  var f = panelState[dim].draft;
  if (dim === 'billing-unit') {
    markInvalid('ss-bu', !f.buId);
    return !!f.buId;
  }
  if (dim === 'resource-group') {
    markInvalid('ss-rg-bu', !f.buId);
    markInvalid('ss-rg', !f.rgId);
    return !!f.buId && !!f.rgId;
  }
  return true;
}

// 点击「搜索」：校验必填项后，把筛选框上的选择应用为查询条件再刷新结果
function applyFilters(dim) {
  var st = panelState[dim];
  if (!st) return;
  if (!validateFilters(dim)) return;
  st.applied = cloneFilters(dim, st.draft);
  refreshPanel(dim);
}

// ====== 账单类型 / 账期筛选 ======
function dateInputOf(dim) {
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  return bar ? bar.querySelector('.date-single input') : null;
}

// 同步筛选框：值、占位符与控件宽度都随账单类型（月 / 天 / 小时）变化
function syncDateInput(dim) {
  var f = panelState[dim].draft;
  var cfg = TYPE_CFG[f.billType];
  var input = dateInputOf(dim);
  if (input) {
    input.value = f.period;
    input.placeholder = cfg.ph;
  }
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  var box = bar && bar.querySelector('.date-single');
  if (box) {
    box.classList.remove('picker-month', 'picker-day', 'picker-hour');
    box.classList.add('picker-' + f.billType);
  }
}

// 切换账单类型：重置为该类型的默认账期
function changeBillType(dim, type) {
  var f = panelState[dim].draft;
  f.billType = type;
  f.period = TYPE_CFG[type].def;
  syncDateInput(dim);
  if (datePickers[dim]) datePickers[dim].close();
}

// ====== 账期单选选择器 ======
// 月账单选「年-月」；天账单选「年-月-日」；
// 小时账单左侧日历选日期 + 右侧整点列选小时，点「确定」提交。
var MONTH_NAMES = ['01月', '02月', '03月', '04月', '05月', '06月', '07月', '08月', '09月', '10月', '11月', '12月'];
var WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

var datePickers = {};

function initDatePicker(dim, bar) {
  var box = bar.querySelector('.date-single');
  if (!box) return;

  var pop = document.createElement('div');
  pop.className = 'dp-pop';
  box.appendChild(pop);

  // view：面板当前展示的年月；hourDate：小时账单下已点选但未确认的日期+小时
  var state = { view: null, hourDate: null };

  function type() { return panelState[dim].draft.billType; }

  function current() {
    var t = type();
    return parseByType(t, panelState[dim].draft.period) || parseByType(t, TYPE_CFG[t].def);
  }

  function close() {
    pop.classList.remove('open');
    state.hourDate = null;
  }

  function open() {
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { if (p !== pop) p.classList.remove('open'); });
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    var cur = current();
    state.view = new Date(cur.getFullYear(), cur.getMonth(), 1);
    state.hourDate = type() === 'hour' ? new Date(cur.getTime()) : null;
    render();
    pop.classList.add('open');
  }

  // 月 / 天：点一下即选定并关闭
  function commit(d) {
    var t = type();
    panelState[dim].draft.period = fmtByType(t, d);
    syncDateInput(dim);
    close();
  }

  // 小时账单：点日期只更新待选值，点「确定」才提交
  function pickHourDate(d) {
    var base = state.hourDate;
    state.hourDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), base ? base.getHours() : 0);
    render();
  }

  function pickHourValue(h) {
    var base = state.hourDate || current();
    state.hourDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h);
    render();
  }

  function confirmHour() {
    if (!state.hourDate) return;
    panelState[dim].draft.period = fmtYMDH(state.hourDate);
    syncDateInput(dim);
    close();
  }

  function shiftView(deltaMonth, deltaYear) {
    state.view = new Date(
      state.view.getFullYear() + (deltaYear || 0),
      state.view.getMonth() + (deltaMonth || 0),
      1
    );
    render();
  }

  function header(text, showMonthNav) {
    return '<div class="dp-head">' +
      '<span class="dp-nav" data-nav="py">&laquo;</span>' +
      (showMonthNav ? '<span class="dp-nav" data-nav="pm">&lsaquo;</span>' : '<span class="dp-nav-ph"></span>') +
      '<span class="dp-title">' + text + '</span>' +
      (showMonthNav ? '<span class="dp-nav" data-nav="nm">&rsaquo;</span>' : '<span class="dp-nav-ph"></span>') +
      '<span class="dp-nav" data-nav="ny">&raquo;</span>' +
      '</div>';
  }

  function sameUnit(t, a, b) {
    if (!a || !b) return false;
    return periodIndex(t, a) === periodIndex(t, b);
  }

  function renderMonth() {
    var y = state.view.getFullYear();
    var cur = current();
    var html = [header(y + '年', false), '<div class="dp-grid dp-grid-month">'];
    for (var m = 0; m < 12; m++) {
      var d = new Date(y, m, 1);
      html.push('<span class="dp-cell' + (sameUnit('month', d, cur) ? ' edge' : '') +
                '" data-y="' + y + '" data-m="' + m + '">' + MONTH_NAMES[m] + '</span>');
    }
    html.push('</div>');
    html.push('<div class="dp-foot">选择单个月账期</div>');
    pop.innerHTML = html.join('');
  }

  function renderDayGrid(t) {
    var y = state.view.getFullYear(), m = state.view.getMonth();
    var first = new Date(y, m, 1);
    var lead = (first.getDay() + 6) % 7;  // 周一为一周起点
    var days = new Date(y, m + 1, 0).getDate();
    var cur = current();
    var html = [header(y + '年' + pad2(m + 1) + '月', true)];

    if (t === 'hour') html.push('<div class="dp-body">');
    html.push('<div class="dp-cal"><div class="dp-week">');
    WEEK_NAMES.forEach(function (w) { html.push('<span>' + w + '</span>'); });
    html.push('</div><div class="dp-grid dp-grid-day">');
    for (var i = 0; i < lead; i++) html.push('<span class="dp-cell dp-blank"></span>');
    for (var dnum = 1; dnum <= days; dnum++) {
      var d = new Date(y, m, dnum);
      var on = t === 'day'
        ? sameUnit('day', d, cur)
        : (state.hourDate && sameUnit('day', d, state.hourDate));
      html.push('<span class="dp-cell' + (on ? ' edge' : '') +
                '" data-y="' + y + '" data-m="' + m + '" data-d="' + dnum + '">' + dnum + '</span>');
    }
    html.push('</div></div>');

    if (t === 'hour') {
      html.push(hourColumn());
      html.push('</div>');
    }

    var foot = t === 'hour'
      ? (state.hourDate ? '已选：' + fmtYMDH(state.hourDate) : '请选择日期与小时')
      : '选择单个天账期';
    html.push('<div class="dp-foot">' + foot +
              (t === 'hour'
                ? '<button type="button" class="dp-ok" data-nav="ok"' +
                  (state.hourDate ? '' : ' disabled') + '>确 定</button>'
                : '') +
              '</div>');
    pop.innerHTML = html.join('');
    if (t === 'hour') scrollHourIntoView();
  }

  // 小时列：仅整点，不含分钟与秒
  function hourColumn() {
    var html = ['<div class="dp-hours"><div class="dp-hours-title">时</div><div class="dp-hours-list">'];
    var cur = state.hourDate ? state.hourDate.getHours() : -1;
    for (var h = 0; h < 24; h++) {
      html.push('<span class="dp-hour' + (h === cur ? ' edge' : '') + '" data-h="' + h + '">' + pad2(h) + ':00</span>');
    }
    html.push('</div></div>');
    return html.join('');
  }

  // 打开面板时把已选小时滚动到可视区域
  function scrollHourIntoView() {
    var active = pop.querySelector('.dp-hour.edge');
    if (!active) return;
    var list = active.parentNode;
    list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
  }

  function render() {
    var t = type();
    if (t === 'month') renderMonth();
    else renderDayGrid(t === 'day' ? 'day' : 'hour');
  }

  box.addEventListener('click', function (e) {
    if (pop.contains(e.target)) return;
    e.stopPropagation();
    if (pop.classList.contains('open')) close();
    else open();
  });

  pop.addEventListener('click', function (e) {
    e.stopPropagation();
    var el = e.target.closest('.dp-nav, .dp-cell, .dp-hour, .dp-ok');
    if (!el) return;

    if (el.classList.contains('dp-hour')) { pickHourValue(+el.dataset.h); return; }
    if (el.classList.contains('dp-ok')) { if (!el.disabled) confirmHour(); return; }

    if (el.classList.contains('dp-nav')) {
      var nav = el.dataset.nav;
      if (nav === 'py') shiftView(0, -1);
      else if (nav === 'ny') shiftView(0, 1);
      else if (nav === 'pm') shiftView(-1, 0);
      else if (nav === 'nm') shiftView(1, 0);
      return;
    }
    if (el.classList.contains('dp-blank')) return;

    var t = type();
    if (t === 'month') commit(new Date(+el.dataset.y, +el.dataset.m, 1));
    else if (t === 'day') commit(new Date(+el.dataset.y, +el.dataset.m, +el.dataset.d));
    else pickHourDate(new Date(+el.dataset.y, +el.dataset.m, +el.dataset.d));
  });

  datePickers[dim] = { close: close };
}

// ====== TOP 卡片内名称搜索 ======
// 仅过滤当前卡片行，合计与其他卡片不受影响。角色切换 / 重置时清空。
function clearTopSearch(dim) {
  Object.keys(topSearch).forEach(function (k) {
    if (!dim || k.indexOf(dim + '|') === 0) delete topSearch[k];
  });
}

// 只重绘目标卡片的内容，保留输入焦点，避免整块刷新
function rerenderTopCard(dim, cardKey, focusInput) {
  var grid = document.getElementById('topgrid-' + dim);
  if (!grid) return;
  var st = panelState[dim].applied;
  var type = st.billType;
  var date = parseByType(type, st.period) || parseByType(type, TYPE_CFG[type].def);
  var allCards = cardsOf(dim, scopesOf(dim), type, date);
  var topCards = grid.querySelectorAll('.top-card');
  allCards.forEach(function (c, idx) {
    if (c.key !== cardKey || !topCards[idx]) return;
    topCards[idx].innerHTML = renderTopCardInner(dim, c.key, c.title, c.result, TYPE_CFG[type].prevLabel);
    if (focusInput) {
      var inp = topCards[idx].querySelector('.top-search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  });
}

// ====== TOP 卡片「查看全部」弹框 ======
// 取出某卡片（按维度 + 卡片 key）当前生效的完整数据；该卡片可能已被搜索过滤，
// 弹框展示与卡片一致的过滤结果（仅名称搜索），保证「查看全部」与卡片所见一致。
function topCardFullData(dim, cardKey) {
  var st = panelState[dim].applied;
  var type = st.billType;
  var date = parseByType(type, st.period) || parseByType(type, TYPE_CFG[type].def);
  var allCards = cardsOf(dim, scopesOf(dim), type, date);
  var found = allCards.filter(function (c) { return c.key === cardKey; })[0];
  if (!found) return null;
  var kw = topSearch[searchKey(dim, cardKey)] || '';
  var list = found.result.rows.map(function (r, i) { return { r: r, rank: i + 1 }; });
  if (kw) {
    list = list.filter(function (o) { return o.r.name.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
  }
  return { title: found.title, prevLabel: TYPE_CFG[type].prevLabel, rows: list };
}

function openTopModal(dim, cardKey) {
  var data = topCardFullData(dim, cardKey);
  if (!data) return;

  var modal = document.getElementById('top-modal');
  var titleEl = document.getElementById('top-modal-title');
  var bodyEl = document.getElementById('top-modal-body');
  modal.classList.add('open');
  document.body.classList.add('modal-open');
  titleEl.textContent = data.title;

  var headRow = '<div class="top-row head">' +
    '<span></span><span>名称</span>' +
    '<span style="text-align:right">消费金额</span>' +
    '<span style="text-align:right">环比' + data.prevLabel + '</span>' +
    shareHeadHtml(dim) + '</div>';

  bodyEl.innerHTML = headRow +
    '<div class="top-scroll">' +
    (data.rows.length
      ? data.rows.map(topRowHtml).join('')
      : '<div class="top-empty">暂无可查看的数据</div>') +
    '</div>';
}

function closeTopModal() {
  var modal = document.getElementById('top-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

// 事件委托：卡片内「查看全部」按钮 / 弹框关闭按钮 / 弹框遮罩
document.addEventListener('click', function (e) {
  var more = e.target.closest && e.target.closest('.top-more-btn');
  if (more) {
    var dim = more.dataset.dim, card = more.dataset.card;
    if (dim && card) openTopModal(dim, card);
    return;
  }

  if (e.target.closest && e.target.closest('#top-modal-close')) {
    closeTopModal();
    return;
  }

  if (e.target.classList && e.target.classList.contains('top-modal-mask')) {
    closeTopModal();
    return;
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeTopModal();
});

document.addEventListener('input', function (e) {
  var inp = e.target;
  if (!inp.classList || !inp.classList.contains('top-search-input')) return;
  var dim = inp.dataset.dim, card = inp.dataset.card;
  if (!dim || !card) return;
  topSearch[searchKey(dim, card)] = inp.value;
  rerenderTopCard(dim, card, true);
});

document.addEventListener('click', function (e) {
  var btn = e.target;
  if (!btn.classList || !btn.classList.contains('top-search-clear')) return;
  var dim = btn.dataset.dim, card = btn.dataset.card;
  if (!dim || !card) return;
  topSearch[searchKey(dim, card)] = '';
  rerenderTopCard(dim, card, false);
});

document.querySelectorAll('.filter-bar[data-dim]').forEach(function (bar) {
  var dim = bar.dataset.dim;
  var sel = bar.querySelector('.bill-type');
  if (sel) {
    sel.addEventListener('change', function () {
      changeBillType(dim, BILL_TYPES[sel.value] || 'month');
    });
  }
  initDatePicker(dim, bar);

  var searchBtn = bar.querySelector('[data-action="search"]');
  var resetBtn = bar.querySelector('[data-action="reset"]');
  if (searchBtn) searchBtn.addEventListener('click', function () { applyFilters(dim); });
  if (resetBtn) resetBtn.addEventListener('click', function () { resetPanel(dim); });
});

// 点击空白处关闭日期面板与下拉
document.addEventListener('click', function () {
  document.querySelectorAll('.dp-pop.open').forEach(function (p) { p.classList.remove('open'); });
  document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
});

// ====== 单选下拉组件 ======
var ssInstances = {};

function initSingleselect(triggerId, dropdownId, labelId, onChange, placeholder, initial) {
  var oldTrigger = document.getElementById(triggerId);
  var dropdown = document.getElementById(dropdownId);
  if (!oldTrigger || !dropdown) return;

  // 重新初始化时克隆节点，清除旧监听
  var trigger = oldTrigger.cloneNode(true);
  oldTrigger.parentNode.replaceChild(trigger, oldTrigger);
  var label = document.getElementById(labelId);
  if (!label) return;

  var options = Array.from(dropdown.querySelectorAll('.ss-option'));
  var ph = placeholder || label.textContent;
  label.dataset.placeholder = ph;
  label.textContent = ph;
  trigger.classList.remove('has-selection');
  dropdown.classList.remove('open');

  function setValue(val, silent) {
    var value = val || '';
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
    document.querySelectorAll('.ms-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    document.querySelectorAll('.dp-pop.open').forEach(function (p) { p.classList.remove('open'); });
    dropdown.classList.toggle('open', willOpen);
  });

  options.forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      setValue(opt.dataset.value);
      dropdown.classList.remove('open');
    });
  });

  ssInstances[dropdownId] = { set: function (val, silent) { setValue(val, silent); } };

  if (initial) setValue(initial, true);
}

// ====== 筛选项按权限重建 ======
// 结算单元 / 资源组均为必填单选：不提供「全部」选项，默认选中第一个有权限项。
function rebuildFilters() {
  // 结算单元分析 - 结算单元单选（必填），默认第一个有权限的结算单元
  var buDropdown = document.getElementById('ss-bu-dropdown');
  var bus = allowedBuIds();
  buDropdown.innerHTML = bus.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + BU_MAP[id].name + '</div>';
  }).join('');
  var buDefault = defaultBuId();
  panelState['billing-unit'].draft.buId = buDefault;
  markInvalid('ss-bu', false);
  initSingleselect('ss-bu-trigger', 'ss-bu-dropdown', 'ss-bu-label', function (val) {
    panelState['billing-unit'].draft.buId = val;
    markInvalid('ss-bu', !val);
  }, '请选择结算单元', buDefault);

  // 资源组分析 - 结算单元单选（必填），联动下方资源组选项
  var rgBuDropdown = document.getElementById('ss-rg-bu-dropdown');
  var rgBus = rgPanelBuIds();
  rgBuDropdown.innerHTML = rgBus.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + BU_MAP[id].name + '</div>';
  }).join('');
  var rgBuDefault = defaultRgPanelBuId();
  panelState['resource-group'].draft.buId = rgBuDefault;
  markInvalid('ss-rg-bu', false);
  initSingleselect('ss-rg-bu-trigger', 'ss-rg-bu-dropdown', 'ss-rg-bu-label', function (val) {
    panelState['resource-group'].draft.buId = val;
    markInvalid('ss-rg-bu', !val);
    rebuildRgOptions();
  }, '请选择结算单元', rgBuDefault);

  rebuildRgOptions();

  // 默认选中项同时作为初始查询条件生效
  Object.keys(panelState).forEach(function (k) {
    panelState[k].applied = cloneFilters(k, panelState[k].draft);
  });
}

// 资源组单选项（必填）：受角色权限 + 已选结算单元过滤，
// 结算单元变更后自动落到该结算单元下的第一个资源组。
function rebuildRgOptions() {
  var dropdown = document.getElementById('ss-rg-dropdown');
  var buId = panelState['resource-group'].draft.buId;
  var ids = allowedRgIds().filter(function (id) { return !buId || RG_MAP[id].buId === buId; });

  dropdown.innerHTML = ids.map(function (id) {
    return '<div class="ms-option ss-option" data-value="' + id + '">' + RG_MAP[id].name + '</div>';
  }).join('');

  var rgDefault = defaultRgId(buId);
  panelState['resource-group'].draft.rgId = rgDefault;
  markInvalid('ss-rg', false);
  initSingleselect('ss-rg-trigger', 'ss-rg-dropdown', 'ss-rg-label', function (val) {
    panelState['resource-group'].draft.rgId = val;
    markInvalid('ss-rg', !val);
  }, '请选择资源组', rgDefault);
}

// ====== 重置 ======
// 筛选框恢复默认状态（账单类型、账期、结算单元 / 资源组），并按默认条件刷新。
// 结算单元 / 资源组为必填项，重置后回到「第一个有权限项」而非空值。
function resetPanel(dim) {
  var bar = document.querySelector('.filter-bar[data-dim="' + dim + '"]');
  if (!bar) return;

  var billType = bar.querySelector('.bill-type');
  if (billType) billType.selectedIndex = 0;

  panelState[dim].draft = emptyFilters(dim);
  clearTopSearch(dim);
  syncDateInput(dim);

  var draft = panelState[dim].draft;
  if (dim === 'billing-unit') {
    markInvalid('ss-bu', false);
    if (ssInstances['ss-bu-dropdown']) ssInstances['ss-bu-dropdown'].set(draft.buId, true);
  } else if (dim === 'resource-group') {
    markInvalid('ss-rg-bu', false);
    if (ssInstances['ss-rg-bu-dropdown']) ssInstances['ss-rg-bu-dropdown'].set(draft.buId, true);
    // 重建资源组选项并回落到默认资源组
    rebuildRgOptions();
  }

  panelState[dim].applied = cloneFilters(dim, panelState[dim].draft);
  refreshPanel(dim);
}

// ====== 角色 / Tab 切换 ======
function switchRole(roleKey) {
  var cfg = roleConfig[roleKey];
  if (!cfg) return;
  currentRole = roleKey;

  document.getElementById('role-hint').textContent = cfg.hint;

  document.querySelectorAll('.role-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.role === roleKey);
  });

  // 控制 tab 可见性：无权限的分析维度直接隐藏
  document.querySelectorAll('#analysis-tabs .tab').forEach(function (tab) {
    tab.style.display = cfg.tabs.indexOf(tab.dataset.panel) !== -1 ? '' : 'none';
  });

  // 重置全部筛选条件与卡片搜索词，避免跨角色残留
  clearTopSearch(null);
  Object.keys(panelState).forEach(function (k) {
    panelState[k].draft = emptyFilters(k);
    panelState[k].applied = emptyFilters(k);
    var bar = document.querySelector('.filter-bar[data-dim="' + k + '"]');
    var sel = bar && bar.querySelector('.bill-type');
    if (sel) sel.selectedIndex = 0;
    syncDateInput(k);
  });

  rebuildFilters();
  cfg.tabs.forEach(refreshPanel);
  switchTab(cfg.tab);
}

function switchTab(panelKey) {
  document.querySelectorAll('#analysis-tabs .tab').forEach(function (tab) {
    tab.classList.toggle('active', tab.dataset.panel === panelKey);
  });
  document.querySelectorAll('.tab-panel').forEach(function (panel) {
    panel.classList.toggle('active', panel.id === 'panel-' + panelKey);
  });
  refreshPanel(panelKey);
}

document.querySelectorAll('.role-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { switchRole(btn.dataset.role); });
});

document.querySelectorAll('#analysis-tabs .tab').forEach(function (tab) {
  tab.addEventListener('click', function () { switchTab(tab.dataset.panel); });
});

// 初始化：默认主账号角色
switchRole('master');

// ====== 与外壳页（../index.html）通信 ======
(function () {
  // 嵌入模式（右侧抽屉内展示）：由 URL 参数 embed=1 识别。
  // 抽屉内的分析页是「概览页的附属视图」，角色只跟随主视图，
  // 因此隐藏角色演示栏、也不向外壳上报角色，避免覆盖顶部角色显示。
  var embed = /[?&]embed=1/.test(window.location.search);

  // 通知外壳页同步顶部角色显示
  function reportRole() {
    var cfg = roleConfig[currentRole];
    if (!cfg || !window.parent || window.parent === window) return;
    window.parent.postMessage({ type: 'role-change', role: currentRole, label: cfg.label }, '*');
  }
  if (!embed) {
    document.querySelectorAll('.role-btn').forEach(function (btn) {
      btn.addEventListener('click', reportRole);
    });
    reportRole();
  }

  // 接受外壳页广播的角色，保持各视图一致
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'set-role') return;
    if (!roleConfig[e.data.role] || e.data.role === currentRole) return;
    switchRole(e.data.role);
  });

  if (embed) {
    // 角色由概览页统一切换，抽屉内不再重复提供角色入口
    var roleBar = document.querySelector('.role-demo-bar');
    if (roleBar) roleBar.style.display = 'none';
    // ESC 关闭抽屉：焦点在 iframe 内时外壳页收不到按键，需转发
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'close-analysis-drawer' }, '*');
      }
    });
  }
})();