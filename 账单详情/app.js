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
var BU_MAP = {}, RG_MAP = {}, RG_PARENT = {};
ORG.forEach(function(b){
  BU_MAP[b.id] = b;
  b.groups.forEach(function(g){ RG_MAP[g.id] = g; RG_PARENT[g.id] = b.id; });
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
   角色 → 可见 Tab（不再基于权限聚合：各角色只看自己维度的账单）
   主账号 / 企业管理员 / 系统管理员：三个 Tab 都能看
   ========================================================= */
var ALL_TABS = ['enterprise','billing-unit','resource-group'];
var TAB_LABEL = { 'enterprise':'企业账单', 'billing-unit':'结算单元账单', 'resource-group':'资源组账单' };

var roleConfig = {
  'master': { label:'主账号', tabs:ALL_TABS, tab:'enterprise', buIds:null, rgIds:null,
    hint:'可查看企业账单、结算单元账单、资源组账单三个维度' },
  'enterprise-admin': { label:'企业管理员', tabs:ALL_TABS, tab:'enterprise', buIds:null, rgIds:null,
    hint:'可查看企业账单、结算单元账单、资源组账单三个维度' },
  'sys-admin': { label:'系统管理员', tabs:ALL_TABS, tab:'enterprise', buIds:null, rgIds:null,
    hint:'可查看企业账单、结算单元账单、资源组账单三个维度' },
  'billing-admin': { label:'结算单元管理员', tabs:['billing-unit','resource-group'], tab:'billing-unit',
    buIds:['bu1','bu2'], rgIds:null,
    hint:'可查看有权限的结算单元账单，以及该结算单元下所有资源组的账单（无企业账单）' },
  'rg-admin': { label:'资源组管理员', tabs:['resource-group'], tab:'resource-group',
    buIds:['bu1','bu2'], rgIds:['rg1','rg2','rg5'],
    hint:'仅可查看有权限的资源组账单（无企业账单 / 结算单元账单）' }
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
   面板：每个 Tab 一套独立筛选状态
   ========================================================= */
var currentRole = 'master';
var currentTab  = 'enterprise';
var panelState  = {};
var comp = {};   // 各 Tab 的组件实例

function allowedBUs(){
  var cfg = roleConfig[currentRole];
  var ids = cfg.buIds;
  return ORG.filter(function(b){ return !ids || ids.indexOf(b.id) > -1; });
}
function allowedRGs(buId){
  var cfg = roleConfig[currentRole];
  var bu = BU_MAP[buId];
  if (!bu) return [];
  return bu.groups.filter(function(g){ return !cfg.rgIds || cfg.rgIds.indexOf(g.id) > -1; });
}

function defaultFilters(tab){
  var bus = allowedBUs();
  var buId = bus.length ? bus[0].id : '';
  var rgs = (tab === 'resource-group') ? allowedRGs(buId) : [];
  return {
    type: 'month',
    period: defaultPeriod('month'),
    buId: buId,
    rgIds: rgs.map(function(g){ return g.id; }),   /* 资源组默认全选 */
    prodIds: ALL_PROD_IDS.slice(),                 /* 产品默认选中全部 */
    feeName: '',
    feeType: ''
  };
}
function cloneFilters(f){
  return {
    type: f.type,
    period: { y:f.period.y, m:f.period.m, d:f.period.d, h:f.period.h },
    buId: f.buId,
    rgIds: f.rgIds.slice(),
    prodIds: f.prodIds.slice(),
    feeName: f.feeName,
    feeType: f.feeType
  };
}

/* 原地修改：wirePanel 的事件闭包持有该对象引用，不能整体替换 */
function initPanelState(tab){
  var f = defaultFilters(tab);
  var st = panelState[tab] || (panelState[tab] = {});
  st.draft = cloneFilters(f);
  st.applied = cloneFilters(f);
  st.sortDir = '';        /* '' | 'asc' | 'desc' */
  st.expanded = {};
}

/* =========================================================
   账单数据计算
   ========================================================= */
/* 当前查询范围：整体系数 + 下钻明细的构成部分 */
function scopeOf(tab, f){
  if (tab === 'enterprise') {
    return {
      factor: 1,
      partLabel: '结算单元',
      parts: ORG.map(function(b){ return { name:b.name, w:b.w }; })
    };
  }
  var bu = BU_MAP[f.buId];
  if (!bu) return { factor:0, partLabel:'资源组', parts:[] };

  if (tab === 'billing-unit') {
    return {
      factor: bu.w,
      partLabel: '资源组',
      parts: bu.groups.map(function(g){ return { name:g.name, w:g.w }; })
    };
  }
  /* 资源组账单：结算单元单选 + 资源组多选 */
  var picked = bu.groups.filter(function(g){ return f.rgIds.indexOf(g.id) > -1; });
  var sum = picked.reduce(function(s, g){ return s + g.w; }, 0);
  return {
    factor: bu.w * sum,
    partLabel: '资源组',
    parts: picked.map(function(g){ return { name:g.name, w: sum ? g.w / sum : 0 }; })
  };
}

function buildRows(tab, f){
  var scope = scopeOf(tab, f);
  var pScale = periodScale(f.type);
  var pSeed = periodSeed(f.type, f.period);
  var keyword = f.feeName.trim();
  var rows = [];

  PRODUCTS.forEach(function(p, pi){
    if (f.prodIds.indexOf(p.id) < 0) return;

    p.fees.forEach(function(fee, fi){
      if (f.feeType && fee.type !== f.feeType) return;
      if (keyword && fee.name.indexOf(keyword) < 0) return;

      /* 同一费用项在不同账期有小幅波动，但对同一账期恒定 */
      var jitter = 0.85 + pseudo(pSeed + pi * 31 + fi * 7) * 0.3;
      var mult = pScale * scope.factor * jitter;

      var row = {
        period: fmtPeriodCell(f.type, f.period),
        product: p.name,
        feeName: fee.name,
        feeType: fee.type,
        unit: fee.unit || '',
        price: (fee.price === undefined ? null : fee.price),
        disc:  (fee.disc  === undefined ? null : fee.disc),
        buName: BU_MAP[f.buId] ? BU_MAP[f.buId].name : '',
        partLabel: scope.partLabel,
        parts: scope.parts
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
      if (scope.factor === 0) return;
      rows.push(row);
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

function tableHeadHTML(tab, sortDir){
  var h = '<tr><th class="col-exp"></th><th>账单时间</th><th>产品</th>';
  if (tab === 'billing-unit' || tab === 'resource-group') h += '<th>结算单元</th>';
  if (tab === 'resource-group') h += '<th>资源组</th>';
  h += '<th>费用名称</th><th>费用类型</th>' +
       '<th>用量' + HELP + '</th>' +
       '<th>官网标准价</th>' +
       '<th>官网标准价金额' + HELP + '</th>' +
       '<th>客户折扣价</th>' +
       '<th class="sortable' + (sortDir ? ' sort-' + sortDir : '') + '" data-sort="pay">应付金额' + HELP +
         '<span class="sort-arrows"><i class="up"></i><i class="down"></i></span></th>' +
       '<th>操作</th></tr>';
  return h;
}

function colCount(tab){
  var n = 11;
  if (tab === 'billing-unit') n += 1;
  if (tab === 'resource-group') n += 2;
  return n;
}

function subTableHTML(row){
  var html = '<table class="sub-table"><thead><tr>' +
    '<th style="width:220px">' + row.partLabel + '</th>' +
    '<th>用量</th><th>官网标准价金额</th><th>应付金额</th></tr></thead><tbody>';
  row.parts.forEach(function(part){
    html += '<tr>' +
      '<td>' + esc(part.name) + '</td>' +
      '<td class="num">' + (row.usage === null ? '--' : fmtUsage(row.usage * part.w) + ' ' + row.unit) + '</td>' +
      '<td class="num">' + fmtAmount(row.std * part.w) + '</td>' +
      '<td class="num">' + fmtAmount(row.pay * part.w) + '</td>' +
    '</tr>';
  });
  return html + '</tbody></table>';
}

function renderTable(tab){
  var st = panelState[tab];
  var f = st.applied;
  var rows = buildRows(tab, f);

  if (st.sortDir) {
    rows.sort(function(a, b){ return st.sortDir === 'asc' ? a.pay - b.pay : b.pay - a.pay; });
  }

  var thead = document.getElementById('thead-' + tab);
  var tbody = document.getElementById('tbody-' + tab);
  thead.innerHTML = tableHeadHTML(tab, st.sortDir);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="' + colCount(tab) + '">' +
      (f.prodIds.length === 0 ? '请至少选择一个产品' : '当前筛选条件下暂无账单数据') + '</td></tr>';
    return;
  }

  var rgNames = '';
  if (tab === 'resource-group') {
    var picked = allowedRGs(f.buId).filter(function(g){ return f.rgIds.indexOf(g.id) > -1; });
    rgNames = picked.length === 1 ? picked[0].name : picked.length + ' 个资源组';
  }

  var html = '';
  rows.forEach(function(row, i){
    var key = row.product + '|' + row.feeName;
    var open = !!st.expanded[key];
    html += '<tr class="data-row" data-key="' + esc(key) + '">' +
      '<td class="col-exp"><span class="row-toggle' + (open ? ' open' : '') + '" data-toggle="' + esc(key) + '">' + (open ? '−' : '+') + '</span></td>' +
      '<td class="num">' + row.period + '</td>' +
      '<td>' + esc(row.product) + '</td>';
    if (tab === 'billing-unit' || tab === 'resource-group') html += '<td>' + esc(row.buName) + '</td>';
    if (tab === 'resource-group') html += '<td>' + esc(rgNames) + '</td>';
    html +=
      '<td>' + esc(row.feeName) + '</td>' +
      '<td><span class="fee-tag t-' + row.feeType + '">' + row.feeType + '</span></td>' +
      '<td class="num">' + usageText(row) + '</td>' +
      '<td class="num">' + priceText(row) + '</td>' +
      '<td class="num">' + fmtAmount(row.std) + '</td>' +
      '<td class="num">' + discText(row) + '</td>' +
      '<td class="num pay-amount' + (row.pay < 0 ? ' minus' : '') + '">' + fmtAmount(row.pay) + '</td>' +
      '<td><div class="op-links"><a href="#" data-detail="' + esc(key) + '">明细</a></div></td>' +
    '</tr>';
    html += '<tr class="sub-row' + (open ? ' open' : '') + '" data-sub="' + esc(key) + '">' +
      '<td colspan="' + colCount(tab) + '">' + subTableHTML(row) + '</td></tr>';
  });

  tbody.innerHTML = html;
}


/* 查询范围文案 */
function scopeText(tab, f){
  if (tab === 'enterprise') return '当前范围：本企业 · 全部结算单元';
  var bu = BU_MAP[f.buId];
  if (!bu) return '当前范围：请先选择结算单元';
  if (tab === 'billing-unit') return '当前范围：本企业 · ' + bu.name + ' · 全部资源组';
  var picked = allowedRGs(f.buId).filter(function(g){ return f.rgIds.indexOf(g.id) > -1; });
  return '当前范围：本企业 · ' + bu.name + ' · ' +
    (picked.length ? picked.map(function(g){ return g.name; }).join('、') : '未选择资源组');
}

/* =========================================================
   面板 HTML 构建
   ========================================================= */
function panelHTML(tab){
  var filters = '';

  filters += '<select class="select w-sm" id="type-' + tab + '">' +
    BILL_TYPES.map(function(t){ return '<option value="' + t.id + '">' + t.label + '</option>'; }).join('') +
    '</select>';

  filters += datePickerShell('dp-' + tab);

  if (tab === 'billing-unit' || tab === 'resource-group') {
    filters += selectShell('bu-' + tab, '请选择结算单元', 190);
  }
  if (tab === 'resource-group') {
    filters += selectShell('rg-' + tab, '请选择资源组', 190);
  }

  filters += selectShell('prod-' + tab, '全部产品', 170);
  filters += '<input class="input w-md" id="fee-' + tab + '" placeholder="费用名称搜索">';
  filters += '<select class="select w-sm" id="ftype-' + tab + '">' +
    '<option value="">全部费用类型</option>' +
    FEE_TYPES.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select>';

  filters += '<button class="btn btn-primary" id="search-' + tab + '">搜 索</button>';
  filters += '<button class="btn btn-text" id="reset-' + tab + '">重置</button>';
  filters += '<button class="btn btn-link" id="export-' + tab + '">导出数据</button>';

  return '<div class="tab-panel" id="panel-' + tab + '">' +
    '<div class="filter-bar">' + filters + '</div>' +
    '<div class="table-wrap"><table>' +
      '<thead id="thead-' + tab + '"></thead>' +
      '<tbody id="tbody-' + tab + '"></tbody>' +
    '</table></div>' +
  '</div>';
}

function buildPanels(){
  document.getElementById('panels').innerHTML = ALL_TABS.map(panelHTML).join('');
  ALL_TABS.forEach(wirePanel);
}

function wirePanel(tab){
  var st = panelState[tab];
  var c = comp[tab] = {};

  /* 账单类型 */
  var typeSel = document.getElementById('type-' + tab);
  typeSel.value = st.draft.type;
  typeSel.addEventListener('change', function(){
    st.draft.type = typeSel.value;
    st.draft.period = defaultPeriod(st.draft.type);
    c.dp.setType(st.draft.type, st.draft.period);
  });

  /* 账期 */
  c.dp = createDatePicker(document.getElementById('dp-' + tab), {
    type: st.draft.type,
    value: st.draft.period,
    onChange: function(v){ st.draft.period = v; }
  });

  /* 结算单元（单选） */
  if (tab === 'billing-unit' || tab === 'resource-group') {
    c.bu = createSelect(document.getElementById('bu-' + tab), {
      single: true,
      placeholder: '请选择结算单元',
      options: allowedBUs().map(function(b){ return { id:b.id, name:b.name }; }),
      values: st.draft.buId ? [st.draft.buId] : [],
      onChange: function(vals){
        st.draft.buId = vals[0] || '';
        if (tab === 'resource-group') {
          /* 结算单元变更后，资源组候选随之变化并默认全选 */
          var opts = allowedRGs(st.draft.buId).map(function(g){ return { id:g.id, name:g.name }; });
          st.draft.rgIds = ALL_IDS(opts);
          c.rg.setOptions(opts, st.draft.rgIds);
        }
      }
    });
  }

  /* 资源组（多选） */
  if (tab === 'resource-group') {
    c.rg = createSelect(document.getElementById('rg-' + tab), {
      placeholder: '请选择资源组',
      allLabel: '全部资源组',
      options: allowedRGs(st.draft.buId).map(function(g){ return { id:g.id, name:g.name }; }),
      values: st.draft.rgIds,
      onChange: function(vals){ st.draft.rgIds = vals; }
    });
  }

  /* 产品（多选，默认全选） */
  c.prod = createSelect(document.getElementById('prod-' + tab), {
    placeholder: '请选择产品',
    allLabel: '全部产品',
    options: PRODUCTS.map(function(p){ return { id:p.id, name:p.name }; }),
    values: st.draft.prodIds,
    onChange: function(vals){ st.draft.prodIds = vals; }
  });

  /* 费用名称 / 费用类型 */
  var feeInput = document.getElementById('fee-' + tab);
  feeInput.value = st.draft.feeName;
  feeInput.addEventListener('input', function(){ st.draft.feeName = feeInput.value; });
  feeInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') doSearch(tab); });

  var ftypeSel = document.getElementById('ftype-' + tab);
  ftypeSel.value = st.draft.feeType;
  ftypeSel.addEventListener('change', function(){ st.draft.feeType = ftypeSel.value; });

  document.getElementById('search-' + tab).addEventListener('click', function(){ doSearch(tab); });
  document.getElementById('reset-' + tab).addEventListener('click', function(){ doReset(tab); });
  document.getElementById('export-' + tab).addEventListener('click', function(){
    toast('已开始导出「' + TAB_LABEL[tab] + '」，' + scopeText(tab, st.applied).replace('当前范围：', ''));
  });

  /* 表格交互：展开 / 排序 / 明细 */
  var tbody = document.getElementById('tbody-' + tab);
  tbody.addEventListener('click', function(e){
    var tg = e.target.closest('.row-toggle');
    if (tg) {
      var key = tg.dataset.toggle;
      st.expanded[key] = !st.expanded[key];
      var sub = tbody.querySelector('.sub-row[data-sub="' + cssEscape(key) + '"]');
      tg.classList.toggle('open', st.expanded[key]);
      tg.textContent = st.expanded[key] ? '−' : '+';
      if (sub) sub.classList.toggle('open', st.expanded[key]);
      return;
    }
    var dl = e.target.closest('a[data-detail]');
    if (dl) {
      e.preventDefault();
      toast('跳转「计费明细」：' + dl.dataset.detail.replace('|', ' / '));
    }
  });

  document.getElementById('thead-' + tab).addEventListener('click', function(e){
    var th = e.target.closest('th.sortable');
    if (!th) return;
    st.sortDir = st.sortDir === 'desc' ? 'asc' : (st.sortDir === 'asc' ? '' : 'desc');
    renderTable(tab);
  });
}

function cssEscape(s){ return s.replace(/["\\]/g, '\\$&'); }

function doSearch(tab){
  var st = panelState[tab];
  if ((tab === 'billing-unit' || tab === 'resource-group') && !st.draft.buId) {
    toast('请先选择结算单元'); return;
  }
  if (tab === 'resource-group' && !st.draft.rgIds.length) {
    toast('请至少选择一个资源组'); return;
  }
  st.applied = cloneFilters(st.draft);
  st.expanded = {};
  renderTable(tab);
}

function doReset(tab){
  initPanelState(tab);
  syncPanelUI(tab);
  renderTable(tab);
}

/* 把 draft 状态回写到各控件 */
function syncPanelUI(tab){
  var st = panelState[tab], c = comp[tab];
  if (!c) return;
  document.getElementById('type-' + tab).value = st.draft.type;
  c.dp.setType(st.draft.type, st.draft.period);
  if (c.bu) {
    c.bu.setOptions(allowedBUs().map(function(b){ return { id:b.id, name:b.name }; }),
                    st.draft.buId ? [st.draft.buId] : []);
  }
  if (c.rg) {
    c.rg.setOptions(allowedRGs(st.draft.buId).map(function(g){ return { id:g.id, name:g.name }; }),
                    st.draft.rgIds);
  }
  c.prod.setValues(st.draft.prodIds);
  document.getElementById('fee-' + tab).value = st.draft.feeName;
  document.getElementById('ftype-' + tab).value = st.draft.feeType;
}

/* =========================================================
   Tab / 角色切换
   ========================================================= */
function renderTabs(){
  var tabs = roleConfig[currentRole].tabs;
  document.getElementById('tabs').innerHTML = tabs.map(function(t){
    return '<div class="tab' + (t === currentTab ? ' active' : '') + '" data-tab="' + t + '">' + TAB_LABEL[t] + '</div>';
  }).join('');
  ALL_TABS.forEach(function(t){
    document.getElementById('panel-' + t).classList.toggle('active', t === currentTab);
  });
}

document.getElementById('tabs').addEventListener('click', function(e){
  var el = e.target.closest('.tab');
  if (!el) return;
  currentTab = el.dataset.tab;
  renderTabs();
  renderTable(currentTab);
});

function switchRole(role){
  currentRole = role;
  var cfg = roleConfig[role];
  currentTab = cfg.tab;

  document.querySelectorAll('.role-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.role === role);
  });
  document.getElementById('role-hint').textContent = cfg.hint;

  /* 角色变化会改变可选的结算单元 / 资源组范围，重置各面板 */
  ALL_TABS.forEach(function(t){
    initPanelState(t);
    syncPanelUI(t);
  });

  renderTabs();
  renderTable(currentTab);
}

document.querySelector('.role-btn-group').addEventListener('click', function(e){
  var btn = e.target.closest('.role-btn');
  if (btn) switchRole(btn.dataset.role);
});

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
ALL_TABS.forEach(initPanelState);
buildPanels();
switchRole('master');

// ====== 与外壳页（../index.html）通信 ======
(function(){
  // 通知外壳页同步顶部角色显示
  function reportRole(){
    var cfg = roleConfig[currentRole];
    if (!cfg || !window.parent || window.parent === window) return;
    window.parent.postMessage({ type:'role-change', role:currentRole, label:cfg.label }, '*');
  }
  // 角色按钮为容器代理，须在其之后注册才能读到更新后的 currentRole
  document.querySelector('.role-btn-group').addEventListener('click', function(e){
    if (e.target.closest('.role-btn')) reportRole();
  });
  reportRole();

  // 接受外壳页广播的角色，保持两个视图一致
  window.addEventListener('message', function(e){
    if (!e.data || e.data.type !== 'set-role') return;
    if (!roleConfig[e.data.role] || e.data.role === currentRole) return;
    switchRole(e.data.role);
  });
})();
