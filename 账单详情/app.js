/* =========================================================
   组织结构：企业 → 结算单元 → 资源组
   ========================================================= */
var ORG = [
  { id:'bu1', name:'结算单元-研发部', w:0.42, groups:[
    { id:'rg1', name:'资源组-后端服务', w:0.38 },
    { id:'rg2', name:'资源组-前端服务', w:0.27 },
    { id:'rg3', name:'资源组-数据中台', w:0.35 }
  ]},
  { id:'bu2', name:'结算单元-运营部', w:0.34, groups:[
    { id:'rg4', name:'资源组-运营支撑', w:0.46 },
    { id:'rg5', name:'资源组-数据分析', w:0.54 }
  ]},
  { id:'bu3', name:'结算单元-市场部', w:0.24, groups:[
    { id:'rg6', name:'资源组-营销活动', w:0.58 },
    { id:'rg7', name:'资源组-测试环境', w:0.42 }
  ]}
];
var BU_MAP = {}, RG_MAP = {}, RG_PARENT = {}, RG_INDEX = {};
var rgSeq = 0;
ORG.forEach(function(b){
  BU_MAP[b.id] = b;
  b.groups.forEach(function(g){
    RG_MAP[g.id] = g;
    RG_PARENT[g.id] = b.id;
    /* 资源组的全局固定序号：作为金额波动种子的一部分。
       必须与「当前可见哪些资源组」无关，否则切角色 / 改结算单元筛选时，
       同一个资源组在同一账期的金额会跳动。 */
    RG_INDEX[g.id] = rgSeq++;
  });
});

/* =========================================================
   产品 → 费用项（每个产品下多个费用名称 / 费用类型）
   base：月账单口径的企业级基准（计量类为用量，增项/抵扣类为金额）
   ========================================================= */
var PRODUCTS = [
  { id:'monitor', name:'云监控', fees:[
    { name:'增项', type:'增项', amount:72000 }
  ]},
  { id:'sms', name:'云短信 SMS', fees:[
    { name:'增项', type:'增项', amount:719 },
    { name:'国内短信-通知类', type:'按量计费', unit:'万条', price:38, disc:19, base:0.862 }
  ]},
  { id:'cm', name:'内容审核 CM', fees:[
    { name:'文本审核-违规文本', type:'按量计费', unit:'万次', price:1.26, disc:0.63, base:0.4056 },
    { name:'图片审核', type:'按量计费', unit:'万张', price:0.9, disc:0.45, base:0.1279 }
  ]},
  { id:'ecs', name:'云服务器 ECS', fees:[
    { name:'云服务器-计算资源', type:'按量计费', unit:'核时', price:0.09, disc:0.063, base:128600 },
    { name:'云服务器-包年包月', type:'预付费', unit:'台月', price:268, disc:196, base:42 },
    { name:'云硬盘-高效云盘', type:'按量计费', unit:'GB时', price:0.0006, disc:0.00042, base:2860000 }
  ]},
  { id:'obs', name:'对象存储 OBS', fees:[
    { name:'标准存储-容量', type:'按量计费', unit:'GB时', price:0.00017, disc:0.00012, base:5120000 },
    { name:'外网下行流量', type:'按量计费', unit:'GB', price:0.5, disc:0.35, base:8600 },
    { name:'存储资源包抵扣', type:'抵扣', amount:-1806.4 }
  ]},
  { id:'tidb', name:'分布式数据库 TiDB', fees:[
    { name:'TiDB 节点-包年包月', type:'预付费', unit:'节点月', price:1580, disc:1106, base:6 },
    { name:'TiKV 存储', type:'按量计费', unit:'GB时', price:0.0011, disc:0.00077, base:960000 }
  ]},
  { id:'apimkt', name:'API市场 APIMKT', fees:[
    { name:'API调用-标准版', type:'按量计费', unit:'万次', price:12, disc:8.4, base:3.62 }
  ]}
];
var ALL_PROD_IDS = PRODUCTS.map(function(p){ return p.id; });
var FEE_TYPES = ['按量计费','预付费','增项','抵扣'];

/* =========================================================
   角色 → 数据权限范围
   本页固定展示「资源组」维度，角色不在本页切换，仅作为权限数据源：
   由外壳页（账单概览 / 账单分析）广播的 set-role 静默驱动可见范围。
     buIds:null / rgIds:null 表示不受限（企业下全部）
   ========================================================= */
var roleConfig = {
  'master':           { label:'主账号',        buIds:null,           rgIds:null },
  'enterprise-admin': { label:'企业管理员',    buIds:null,           rgIds:null },
  'sys-admin':        { label:'系统管理员',    buIds:null,           rgIds:null },
  'billing-admin':    { label:'结算单元管理员', buIds:['bu1','bu2'],  rgIds:null },
  'rg-admin':         { label:'资源组管理员',   buIds:['bu1','bu2'],  rgIds:['rg1','rg2','rg5'] }
};

var BILL_TYPES = [
  { id:'month', label:'月账单' },
  { id:'day',   label:'天账单' },
  { id:'hour',  label:'小时账单' }
];

/* 演示"当前时间"：2026-08 账期 */
var NOW = { y:2026, m:8, d:29, h:14 };

/* =========================================================
   工具函数
   ========================================================= */
function pad2(n){ return n < 10 ? '0' + n : '' + n; }
function daysInMonth(y,m){ return new Date(y, m, 0).getDate(); }

/* 确定性伪随机：保证同一账期/同一费用项的数据不跳动 */
function pseudo(seed){
  var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function fmtNum(v, maxDec){
  if (v === null || v === undefined || isNaN(v)) return '--';
  if (maxDec === undefined) maxDec = 6;
  var neg = v < 0;
  var a = Math.abs(v);
  var s = a.toFixed(maxDec);
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  var parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + parts.join('.');
}

/* 金额：大额保留2位，小额保留6位，贴合账单展示习惯 */
function fmtAmount(v){
  if (v === null || v === undefined || isNaN(v)) return '--';
  return Math.abs(v) >= 100 ? fmtNum(v, 2) : fmtNum(v, 6);
}
function fmtUsage(v){ return v === null ? '--' : fmtNum(v, 4); }

function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}

/* ---- 账期：单值（非区间） ---- */
function fmtPeriodInput(type, p){
  if (type === 'month') return p.y + '.' + pad2(p.m);
  if (type === 'day')   return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  return p.y + '-' + pad2(p.m) + '-' + pad2(p.d) + ' ' + pad2(p.h) + ':00';
}
/* 表格「账单时间」列：紧凑编码，与生产账单一致 */
function fmtPeriodCell(type, p){
  if (type === 'month') return '' + p.y + pad2(p.m);
  if (type === 'day')   return '' + p.y + pad2(p.m) + pad2(p.d);
  return '' + p.y + pad2(p.m) + pad2(p.d) + ' ' + pad2(p.h);
}
function defaultPeriod(type){
  if (type === 'month') return { y:NOW.y, m:NOW.m, d:1, h:0 };
  if (type === 'day')   return { y:NOW.y, m:NOW.m, d:NOW.d, h:0 };
  return { y:NOW.y, m:NOW.m, d:NOW.d, h:NOW.h };
}
function periodSeed(type, p){
  if (type === 'month') return p.y * 100 + p.m;
  if (type === 'day')   return p.y * 10000 + p.m * 100 + p.d;
  return p.y * 1000000 + p.m * 10000 + p.d * 100 + p.h;
}
/* 账期粒度对用量的缩放：月为基准 */
function periodScale(type){
  if (type === 'month') return 1;
  if (type === 'day')   return 1 / 30;
  return 1 / 720;
}

/* =========================================================
   下拉组件（多选 / 单选共用）
   ========================================================= */
function selectShell(id, placeholder, minWidth){
  return '<div class="multiselect" id="' + id + '">' +
    '<div class="ms-trigger"' + (minWidth ? ' style="min-width:' + minWidth + 'px"' : '') + '>' +
      '<span class="ms-placeholder">' + esc(placeholder) + '</span>' +
      '<svg class="ms-arrow" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8.5l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span class="ms-clear" title="清空"><svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.2" fill="currentColor" opacity=".28"/><path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg></span>' +
    '</div>' +
    '<div class="ms-dropdown"></div>' +
  '</div>';
}

function createSelect(root, cfg) {
  var trigger = root.querySelector('.ms-trigger');
  var label   = root.querySelector('.ms-placeholder');
  var dd      = root.querySelector('.ms-dropdown');
  var clearEl = root.querySelector('.ms-clear');

  var api = {
    options: cfg.options || [],
    values: (cfg.values || []).slice(),
    single: !!cfg.single
  };

  function syncLabel(){
    var txt, has;
    if (api.single) {
      var opt = null;
      for (var i = 0; i < api.options.length; i++) {
        if (api.options[i].id === api.values[0]) { opt = api.options[i]; break; }
      }
      has = !!opt;
      txt = has ? opt.name : cfg.placeholder;
    } else {
      has = api.values.length > 0;
      if (!has) txt = cfg.placeholder;
      else if (api.values.length === api.options.length) txt = cfg.allLabel || cfg.placeholder;
      else {
        var first = null;
        for (var j = 0; j < api.options.length; j++) {
          if (api.options[j].id === api.values[0]) { first = api.options[j]; break; }
        }
        txt = (first ? first.name : '') + (api.values.length > 1 ? ' 等' + api.values.length + '项' : '');
      }
    }
    label.textContent = txt;
    trigger.classList.toggle('has-selection', has);
  }

  function render(){
    var html = '';
    if (!api.single && cfg.allLabel) {
      var allOn = api.options.length > 0 && api.values.length === api.options.length;
      html += '<div class="ms-option ms-all' + (allOn ? ' checked' : '') + '" data-id="__all">' +
              '<span class="ms-check"></span><span>' + esc(cfg.allLabel) + '</span></div>';
    }
    api.options.forEach(function(o){
      var on = api.values.indexOf(o.id) > -1;
      if (api.single) {
        html += '<div class="ms-option ss-option' + (on ? ' selected' : '') + '" data-id="' + o.id + '">' +
                '<span>' + esc(o.name) + '</span></div>';
      } else {
        html += '<div class="ms-option' + (on ? ' checked' : '') + '" data-id="' + o.id + '">' +
                '<span class="ms-check"></span><span>' + esc(o.name) + '</span></div>';
      }
    });
    if (!api.options.length) {
      html = '<div class="ms-option muted" style="cursor:default">暂无可选项</div>';
    }
    dd.innerHTML = html;
    syncLabel();
  }

  function emit(){ if (cfg.onChange) cfg.onChange(api.values.slice()); }

  trigger.addEventListener('click', function(e){
    if (clearEl.contains(e.target)) return;
    var isOpen = dd.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) dd.classList.add('open');
  });

  clearEl.addEventListener('click', function(e){
    e.stopPropagation();
    api.values = [];
    render();
    emit();
  });

  dd.addEventListener('click', function(e){
    var opt = e.target.closest('.ms-option');
    if (!opt || !opt.dataset.id) return;
    var id = opt.dataset.id;
    if (api.single) {
      api.values = [id];
      dd.classList.remove('open');
    } else if (id === '__all') {
      api.values = (api.values.length === api.options.length) ? [] : ALL_IDS(api.options);
    } else {
      var i = api.values.indexOf(id);
      if (i > -1) api.values.splice(i, 1); else api.values.push(id);
    }
    render();
    emit();
  });

  api.setOptions = function(options, values){
    api.options = options;
    if (values) api.values = values.slice();
    /* 选项变化后清掉已失效的选中值 */
    api.values = api.values.filter(function(v){
      for (var i = 0; i < options.length; i++) if (options[i].id === v) return true;
      return false;
    });
    render();
  };
  api.setValues = function(values){ api.values = values.slice(); render(); };
  api.getValues = function(){ return api.values.slice(); };
  api.close = function(){ dd.classList.remove('open'); };

  render();
  return api;
}

function ALL_IDS(options){ return options.map(function(o){ return o.id; }); }

var dropdownRegistry = [];
function closeAllDropdowns(){
  document.querySelectorAll('.ms-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
  document.querySelectorAll('.dp-pop.open').forEach(function(d){ d.classList.remove('open'); });
}
document.addEventListener('click', function(e){
  if (!e.target.closest('.multiselect') && !e.target.closest('.date-single')) closeAllDropdowns();
});

/* =========================================================
   账期选择器（单值：月 / 天 / 天+小时）
   ========================================================= */
function datePickerShell(id){
  return '<div class="date-single" id="' + id + '">' +
    '<input type="text" readonly placeholder="请选择账期">' +
    '<svg class="cal" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.5h12M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
    '<div class="dp-pop"></div>' +
  '</div>';
}

function createDatePicker(root, cfg){
  var input = root.querySelector('input');
  var pop   = root.querySelector('.dp-pop');
  var type  = cfg.type;
  var value = cfg.value;
  var view  = { y:value.y, m:value.m };

  function syncClass(){
    root.classList.remove('picker-day', 'picker-hour');
    if (type === 'day')  root.classList.add('picker-day');
    if (type === 'hour') root.classList.add('picker-hour');
  }

  function renderMonthGrid(){
    var html = '<div class="dp-head">' +
      '<span class="dp-nav" data-nav="-1">&lsaquo;</span>' +
      '<span class="dp-title">' + view.y + ' 年</span>' +
      '<span class="dp-nav" data-nav="1">&rsaquo;</span></div>' +
      '<div class="dp-grid dp-grid-month">';
    for (var m = 1; m <= 12; m++) {
      var on = (value.y === view.y && value.m === m);
      html += '<div class="dp-cell' + (on ? ' edge' : '') + '" data-m="' + m + '">' + m + '月</div>';
    }
    return html + '</div><div class="dp-foot">按月查看该账期下各产品的费用构成</div>';
  }

  function renderDayGrid(){
    var html = '<div class="dp-head">' +
      '<span class="dp-nav" data-nav="-1">&lsaquo;</span>' +
      '<span class="dp-title">' + view.y + ' 年 ' + view.m + ' 月</span>' +
      '<span class="dp-nav" data-nav="1">&rsaquo;</span></div>' +
      '<div class="dp-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>' +
      '<div class="dp-grid dp-grid-day">';
    var firstDow = new Date(view.y, view.m - 1, 1).getDay();
    for (var b = 0; b < firstDow; b++) html += '<div class="dp-cell dp-blank"></div>';
    var total = daysInMonth(view.y, view.m);
    for (var d = 1; d <= total; d++) {
      var on = (value.y === view.y && value.m === view.m && value.d === d);
      html += '<div class="dp-cell' + (on ? ' edge' : '') + '" data-d="' + d + '">' + d + '</div>';
    }
    html += '</div>';

    if (type === 'hour') {
      var hours = '<div class="dp-hours"><div class="dp-hours-title">时</div><div class="dp-hours-list">';
      for (var h = 0; h < 24; h++) {
        hours += '<span class="dp-hour' + (value.h === h ? ' edge' : '') + '" data-h="' + h + '">' + pad2(h) + ':00</span>';
      }
      hours += '</div></div>';
      return '<div class="dp-head">' +
        '<span class="dp-nav" data-nav="-1">&lsaquo;</span>' +
        '<span class="dp-title">' + view.y + ' 年 ' + view.m + ' 月</span>' +
        '<span class="dp-nav" data-nav="1">&rsaquo;</span></div>' +
        '<div class="dp-body"><div class="dp-cal">' +
        '<div class="dp-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>' +
        html.substring(html.indexOf('<div class="dp-grid')) +
        '</div>' + hours + '</div>' +
        '<div class="dp-foot">小时账单：选择某一天的某个整点</div>';
    }
    return html + '<div class="dp-foot">按天查看该账期下各产品的费用构成</div>';
  }

  function render(){
    pop.innerHTML = (type === 'month') ? renderMonthGrid() : renderDayGrid();
    input.value = fmtPeriodInput(type, value);
    syncClass();
  }

  root.addEventListener('click', function(e){
    if (e.target.closest('.dp-pop')) return;
    var isOpen = pop.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) { view = { y:value.y, m:value.m }; render(); pop.classList.add('open'); }
  });

  pop.addEventListener('click', function(e){
    var nav = e.target.closest('.dp-nav');
    if (nav) {
      var step = parseInt(nav.dataset.nav, 10);
      if (type === 'month') view.y += step;
      else {
        view.m += step;
        if (view.m > 12) { view.m = 1; view.y++; }
        if (view.m < 1)  { view.m = 12; view.y--; }
      }
      render();
      return;
    }
    var cell = e.target.closest('.dp-cell');
    if (cell && cell.dataset.m) {
      value = { y:view.y, m:parseInt(cell.dataset.m, 10), d:1, h:0 };
      commit();
      return;
    }
    if (cell && cell.dataset.d) {
      value = { y:view.y, m:view.m, d:parseInt(cell.dataset.d, 10), h:value.h || 0 };
      if (type === 'day') commit(); else render();
      return;
    }
    var hr = e.target.closest('.dp-hour');
    if (hr) {
      value.h = parseInt(hr.dataset.h, 10);
      commit();
    }
  });

  function commit(){
    render();
    pop.classList.remove('open');
    if (cfg.onChange) cfg.onChange({ y:value.y, m:value.m, d:value.d, h:value.h });
  }

  render();

  return {
    setType: function(t, v){ type = t; value = v; view = { y:v.y, m:v.m }; render(); },
    setValue: function(v){ value = v; view = { y:v.y, m:v.m }; render(); },
    getValue: function(){ return { y:value.y, m:value.m, d:value.d, h:value.h }; }
  };
}

/* =========================================================
   面板状态：单一资源组维度视图（无 Tab，仅一套筛选状态）
   ========================================================= */
var currentRole = 'master';
var state = {};   /* { draft, applied, sortDir } */
var comp = {};    /* 组件实例 */

/* 当前角色可见的结算单元 */
function allowedBUs(){
  var ids = roleConfig[currentRole].buIds;
  return ORG.filter(function(b){ return !ids || ids.indexOf(b.id) > -1; });
}

/* 当前角色可见的资源组（跨结算单元）。
   传 buIds 时只返回这些结算单元下的资源组。
   返回项附带所属结算单元，供表格「结算单元」列与分组展示使用。 */
function visibleRGs(buIds){
  var cfg = roleConfig[currentRole];
  var out = [];
  allowedBUs().forEach(function(b){
    if (buIds && buIds.length && buIds.indexOf(b.id) < 0) return;
    b.groups.forEach(function(g){
      if (cfg.rgIds && cfg.rgIds.indexOf(g.id) < 0) return;
      out.push({ id:g.id, name:g.name, w:g.w, buId:b.id, buName:b.name, buW:b.w });
    });
  });
  return out;
}

/* 默认：全部有权限的结算单元 + 其下全部有权限的资源组 */
function defaultFilters(){
  var buIds = allowedBUs().map(function(b){ return b.id; });
  return {
    type: 'month',
    period: defaultPeriod('month'),
    buIds: buIds,
    rgIds: visibleRGs(buIds).map(function(g){ return g.id; }),
    prodIds: ALL_PROD_IDS.slice(),
    feeName: '',
    feeType: ''
  };
}
function cloneFilters(f){
  return {
    type: f.type,
    period: { y:f.period.y, m:f.period.m, d:f.period.d, h:f.period.h },
    buIds: f.buIds.slice(),
    rgIds: f.rgIds.slice(),
    prodIds: f.prodIds.slice(),
    feeName: f.feeName,
    feeType: f.feeType
  };
}

/* 原地修改：wirePanel 的事件闭包持有该对象引用，不能整体替换 */
function initPanelState(){
  var f = defaultFilters();
  state.draft = cloneFilters(f);
  state.applied = cloneFilters(f);
  state.sortDir = '';   /* '' | 'asc' | 'desc' */

  /* 支持从 URL 参数初始化筛选（账单概览 / 账单分析页跳转入口带入） */
  applyURLParams();
}

/* =========================================================
   URL 参数初始化：账单概览 / 账单分析列表跳转进入时，
   按 账单类型 / 账期 / 产品 / 结算单元 / 资源组 预置筛选。
   参数名与跳转链接保持一致：
     billType       month | day
     period         月 YYYY.MM，天 YYYY.MM.DD
     product        产品名称
     billingUnit    结算单元名称
     resourceGroup  资源组名称
   匹配不到（如名称已改、无权限）时保持默认全选，不中断渲染。
   ========================================================= */
function applyURLParams(){
  var params = {};
  var q = (window.location.search || '').replace(/^\?/, '');
  q.split('&').forEach(function(pair){
    if (!pair) return;
    var idx = pair.indexOf('=');
    if (idx < 0) { params[decodeURIComponent(pair)] = ''; return; }
    params[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
  });

  /* 账单类型：概览页只跳天账单 / 月账单 */
  if (params.billType === 'day' || params.billType === 'month') {
    state.draft.type = params.billType;
    state.applied.type = params.billType;
  }

  /* 账期：月 YYYY.MM / 天 YYYY.MM.DD → {y,m,d,h} */
  var p = parsePeriodParam(state.draft.type, params.period);
  if (p) {
    state.draft.period = p;
    state.applied.period = p;
  }

  /* 结算单元 / 资源组 / 产品：按名称匹配 id，匹配不到保持默认 */
  var buId = params.billingUnit ? buIdByName(params.billingUnit) : '';
  var rgId = params.resourceGroup ? rgIdByName(params.resourceGroup) : '';
  var prodId = params.product ? prodIdByName(params.product) : '';

  if (buId) {
    state.draft.buIds = [buId];
    state.applied.buIds = [buId];
  }
  if (rgId) {
    state.draft.rgIds = [rgId];
    state.applied.rgIds = [rgId];
  } else if (buId) {
    /* 指定结算单元但未指定资源组：默认该单元下全部有权限的资源组 */
    var rgs = visibleRGs([buId]).map(function(g){ return g.id; });
    state.draft.rgIds = rgs;
    state.applied.rgIds = rgs;
  }
  if (prodId) {
    state.draft.prodIds = [prodId];
    state.applied.prodIds = [prodId];
  }
}

/* 账期字符串解析：月 YYYY.MM / 天 YYYY.MM.DD */
function parsePeriodParam(type, s){
  if (!s) return null;
  var m;
  if (type === 'month') {
    m = /^(\d{4})\.(\d{1,2})/.exec(s);
    if (m) return { y:+m[1], m:+m[2], d:1, h:0 };
  } else {
    m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(s);
    if (m) return { y:+m[1], m:+m[2], d:+m[3], h:0 };
  }
  return null;
}

/* 按名称匹配组织 / 产品 id */
function buIdByName(name){
  for (var i = 0; i < ORG.length; i++) {
    if (ORG[i].name === name) return ORG[i].id;
  }
  return '';
}
function rgIdByName(name){
  for (var i = 0; i < ORG.length; i++) {
    for (var j = 0; j < ORG[i].groups.length; j++) {
      if (ORG[i].groups[j].name === name) return ORG[i].groups[j].id;
    }
  }
  return '';
}
function prodIdByName(name){
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].name === name) return PRODUCTS[i].id;
  }
  return '';
}

/* =========================================================
   账单数据计算
   行粒度：资源组 × 产品 × 费用项（每个组合一行）
   金额系数 = 结算单元权重 × 资源组权重 × 账期粒度缩放 × 波动
   ========================================================= */
function buildRows(f){
  var pScale = periodScale(f.type);
  var pSeed = periodSeed(f.type, f.period);
  var keyword = f.feeName.trim();
  var period = fmtPeriodCell(f.type, f.period);
  var rows = [];

  /* 选中的资源组：受角色权限 + 结算单元筛选 + 资源组筛选三重约束 */
  var groups = visibleRGs(f.buIds).filter(function(g){
    return f.rgIds.indexOf(g.id) > -1;
  });

  groups.forEach(function(g){
    PRODUCTS.forEach(function(p, pi){
      if (f.prodIds.indexOf(p.id) < 0) return;

      p.fees.forEach(function(fee, fi){
        if (f.feeType && fee.type !== f.feeType) return;
        if (keyword && fee.name.indexOf(keyword) < 0) return;

        /* 同一费用项在不同账期有小幅波动，但对同一账期恒定。
           种子里带入资源组的全局固定序号（非筛选后的下标），
           既让各资源组的数字不是同一组数的等比缩放，
           又保证切角色 / 改筛选时同一资源组的金额不跳动。 */
        var jitter = 0.85 + pseudo(pSeed + RG_INDEX[g.id] * 137 + pi * 31 + fi * 7) * 0.3;
        var mult = pScale * g.buW * g.w * jitter;

        var row = {
          period: period,
          product: p.name,
          feeName: fee.name,
          feeType: fee.type,
          unit: fee.unit || '',
          price: (fee.price === undefined ? null : fee.price),
          disc:  (fee.disc  === undefined ? null : fee.disc),
          buName: g.buName,
          rgName: g.name
        };

        if (fee.amount !== undefined) {
          /* 增项 / 抵扣：无用量与单价，直接给金额 */
          row.usage = null;
          row.std = fee.amount * mult;
          row.pay = fee.amount * mult;
        } else {
          row.usage = fee.base * mult;
          row.std = row.usage * fee.price;
          row.pay = row.usage * fee.disc;
        }
        rows.push(row);
      });
    });
  });
  return rows;
}

/* =========================================================
   渲染
   ========================================================= */
function priceText(row){
  if (row.price === null) return '--';
  return '￥' + fmtNum(row.price, 6) + ' / 1' + row.unit;
}
function discText(row){
  if (row.disc === null) return '--';
  return '￥' + fmtNum(row.disc, 6) + ' / 1' + row.unit;
}
function usageText(row){
  if (row.usage === null) return '--';
  return fmtUsage(row.usage) + ' ' + row.unit;
}

var HELP = '<svg class="help-ico" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.4" stroke="currentColor" stroke-width="1.2"/><path d="M6.4 6.2a1.6 1.6 0 113.2 0c0 1.1-1.6 1.2-1.6 2.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="11.2" r=".75" fill="currentColor"/></svg>';

/* 固定 12 列：资源组维度下列结构不再随 Tab 变化 */
function tableHeadHTML(sortDir){
  return '<tr><th>账单时间</th><th>产品</th>' +
         '<th>结算单元</th><th>资源组</th>' +
         '<th>费用名称</th><th>费用类型</th>' +
         '<th>用量' + HELP + '</th>' +
         '<th>官网标准价</th>' +
         '<th>官网标准价金额' + HELP + '</th>' +
         '<th>客户折扣价</th>' +
         '<th class="sortable' + (sortDir ? ' sort-' + sortDir : '') + '" data-sort="pay">应付金额' + HELP +
           '<span class="sort-arrows"><i class="up"></i><i class="down"></i></span></th>' +
         '<th>操作</th></tr>';
}

var COL_COUNT = 12;

/* 空态文案：区分「无权限」与「筛选条件把结果筛空了」 */
function emptyText(f){
  if (!visibleRGs(null).length) return '当前账号在所选企业下暂无有权限的资源组账单';
  if (!f.buIds.length) return '请至少选择一个结算单元';
  if (!f.rgIds.length) return '请至少选择一个资源组';
  if (!f.prodIds.length) return '请至少选择一个产品';
  return '当前筛选条件下暂无账单数据';
}

function renderTable(){
  var f = state.applied;
  var rows = buildRows(f);

  if (state.sortDir) {
    rows.sort(function(a, b){ return state.sortDir === 'asc' ? a.pay - b.pay : b.pay - a.pay; });
  }

  document.getElementById('thead').innerHTML = tableHeadHTML(state.sortDir);
  var tbody = document.getElementById('tbody');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="' + COL_COUNT + '">' +
      emptyText(f) + '</td></tr>';
    return;
  }

  var html = '';
  rows.forEach(function(row){
    var key = row.rgName + '|' + row.product + '|' + row.feeName;
    html += '<tr class="data-row">' +
      '<td class="num">' + row.period + '</td>' +
      '<td>' + esc(row.product) + '</td>' +
      '<td>' + esc(row.buName) + '</td>' +
      '<td>' + esc(row.rgName) + '</td>' +
      '<td>' + esc(row.feeName) + '</td>' +
      '<td><span class="fee-tag t-' + row.feeType + '">' + row.feeType + '</span></td>' +
      '<td class="num">' + usageText(row) + '</td>' +
      '<td class="num">' + priceText(row) + '</td>' +
      '<td class="num">' + fmtAmount(row.std) + '</td>' +
      '<td class="num">' + discText(row) + '</td>' +
      '<td class="num pay-amount' + (row.pay < 0 ? ' minus' : '') + '">' + fmtAmount(row.pay) + '</td>' +
      '<td><div class="op-links"><a href="#" data-detail="' + esc(key) + '">明细</a></div></td>' +
    '</tr>';
  });

  tbody.innerHTML = html;
}


/* 查询范围文案 */
function scopeText(f){
  var groups = visibleRGs(f.buIds).filter(function(g){ return f.rgIds.indexOf(g.id) > -1; });
  if (!groups.length) return '当前范围：未选择资源组';
  if (groups.length <= 3) {
    return '当前范围：本企业 · ' + groups.map(function(g){ return g.name; }).join('、');
  }
  return '当前范围：本企业 · ' + groups.length + ' 个资源组';
}

/* =========================================================
   面板 HTML 构建
   ========================================================= */
function panelHTML(){
  var filters = '';

  filters += '<select class="select w-sm" id="type-sel">' +
    BILL_TYPES.map(function(t){ return '<option value="' + t.id + '">' + t.label + '</option>'; }).join('') +
    '</select>';

  filters += datePickerShell('dp');

  /* 结算单元为可选筛选（默认全选），用于把资源组按部门收窄 */
  filters += selectShell('bu', '全部结算单元', 190);
  filters += selectShell('rg', '全部资源组', 190);
  filters += selectShell('prod', '全部产品', 170);
  filters += '<input class="input w-md" id="fee-input" placeholder="费用名称搜索">';
  filters += '<select class="select w-sm" id="ftype-sel">' +
    '<option value="">全部费用类型</option>' +
    FEE_TYPES.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select>';

  filters += '<button class="btn btn-primary" id="search-btn">搜 索</button>';
  filters += '<button class="btn btn-text" id="reset-btn">重置</button>';
  filters += '<button class="btn btn-link" id="export-btn">导出数据</button>';

  return '<div class="filter-bar">' + filters + '</div>' +
    '<div class="table-wrap"><table>' +
      '<thead id="thead"></thead>' +
      '<tbody id="tbody"></tbody>' +
    '</table></div>';
}

function buildPanel(){
  document.getElementById('panel').innerHTML = panelHTML();
  wirePanel();
}

/* 资源组下拉选项：随已选结算单元变化，默认全选 */
function rgOptions(){
  return visibleRGs(state.draft.buIds).map(function(g){
    return { id:g.id, name:g.name };
  });
}

function wirePanel(){
  var c = comp;

  /* 账单类型 */
  var typeSel = document.getElementById('type-sel');
  typeSel.value = state.draft.type;
  typeSel.addEventListener('change', function(){
    state.draft.type = typeSel.value;
    state.draft.period = defaultPeriod(state.draft.type);
    c.dp.setType(state.draft.type, state.draft.period);
  });

  /* 账期 */
  c.dp = createDatePicker(document.getElementById('dp'), {
    type: state.draft.type,
    value: state.draft.period,
    onChange: function(v){ state.draft.period = v; }
  });

  /* 结算单元（多选，默认全选） */
  c.bu = createSelect(document.getElementById('bu'), {
    placeholder: '请选择结算单元',
    allLabel: '全部结算单元',
    options: allowedBUs().map(function(b){ return { id:b.id, name:b.name }; }),
    values: state.draft.buIds,
    onChange: function(vals){
      state.draft.buIds = vals;
      /* 结算单元变更后，资源组候选随之变化并默认全选 */
      var opts = rgOptions();
      state.draft.rgIds = ALL_IDS(opts);
      c.rg.setOptions(opts, state.draft.rgIds);
    }
  });

  /* 资源组（多选，默认全选） */
  c.rg = createSelect(document.getElementById('rg'), {
    placeholder: '请选择资源组',
    allLabel: '全部资源组',
    options: rgOptions(),
    values: state.draft.rgIds,
    onChange: function(vals){ state.draft.rgIds = vals; }
  });

  /* 产品（多选，默认全选） */
  c.prod = createSelect(document.getElementById('prod'), {
    placeholder: '请选择产品',
    allLabel: '全部产品',
    options: PRODUCTS.map(function(p){ return { id:p.id, name:p.name }; }),
    values: state.draft.prodIds,
    onChange: function(vals){ state.draft.prodIds = vals; }
  });

  /* 费用名称 / 费用类型 */
  var feeInput = document.getElementById('fee-input');
  feeInput.value = state.draft.feeName;
  feeInput.addEventListener('input', function(){ state.draft.feeName = feeInput.value; });
  feeInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') doSearch(); });

  var ftypeSel = document.getElementById('ftype-sel');
  ftypeSel.value = state.draft.feeType;
  ftypeSel.addEventListener('change', function(){ state.draft.feeType = ftypeSel.value; });

  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('reset-btn').addEventListener('click', doReset);
  document.getElementById('export-btn').addEventListener('click', function(){
    toast('已开始导出「资源组账单」，' + scopeText(state.applied).replace('当前范围：', ''));
  });

  /* 表格交互：明细跳转 */
  document.getElementById('tbody').addEventListener('click', function(e){
    var dl = e.target.closest('a[data-detail]');
    if (dl) {
      e.preventDefault();
      toast('跳转「计费明细」：' + dl.dataset.detail.replace(/\|/g, ' / '));
    }
  });

  /* 应付金额排序 */
  document.getElementById('thead').addEventListener('click', function(e){
    var th = e.target.closest('th.sortable');
    if (!th) return;
    state.sortDir = state.sortDir === 'desc' ? 'asc' : (state.sortDir === 'asc' ? '' : 'desc');
    renderTable();
  });
}

function doSearch(){
  if (!state.draft.buIds.length) { toast('请至少选择一个结算单元'); return; }
  if (!state.draft.rgIds.length) { toast('请至少选择一个资源组'); return; }
  if (!state.draft.prodIds.length) { toast('请至少选择一个产品'); return; }
  state.applied = cloneFilters(state.draft);
  renderTable();
}

function doReset(){
  initPanelState();
  syncPanelUI();
  renderTable();
}

/* 把 draft 状态回写到各控件 */
function syncPanelUI(){
  var c = comp;
  if (!c.dp) return;
  document.getElementById('type-sel').value = state.draft.type;
  c.dp.setType(state.draft.type, state.draft.period);
  c.bu.setOptions(allowedBUs().map(function(b){ return { id:b.id, name:b.name }; }),
                  state.draft.buIds);
  c.rg.setOptions(rgOptions(), state.draft.rgIds);
  c.prod.setValues(state.draft.prodIds);
  document.getElementById('fee-input').value = state.draft.feeName;
  document.getElementById('ftype-sel').value = state.draft.feeType;
}

/* =========================================================
   角色变更（由外壳页广播驱动，本页无角色切换入口）
   ========================================================= */
function applyRole(role){
  if (!roleConfig[role]) return;
  currentRole = role;

  /* 角色变化会改变可见的结算单元 / 资源组范围，重置筛选后重新渲染 */
  initPanelState();
  syncPanelUI();
  renderTable();
}

/* =========================================================
   轻提示
   ========================================================= */
var toastTimer = null;
function toast(msg){
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);' +
      'background:rgba(32,32,32,.88);color:#fff;padding:8px 18px;border-radius:4px;' +
      'font-size:13px;z-index:2000;opacity:0;transition:opacity .2s ease;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.style.opacity = '0'; }, 2200);
}

/* =========================================================
   启动
   ========================================================= */
initPanelState();
buildPanel();
renderTable();

// ====== 与外壳页（../index.html）通信 ======
(function(){
  // 本页无角色切换入口，只接收外壳广播的角色，不再向外壳上报，
  // 避免 iframe 加载时把外壳（及其他视图）的当前角色覆盖回默认值。
  window.addEventListener('message', function(e){
    if (!e.data || e.data.type !== 'set-role') return;
    if (!roleConfig[e.data.role] || e.data.role === currentRole) return;
    applyRole(e.data.role);
  });
})();
