// 临时验证脚本：headless Chrome + CDP 加载账单概览，切到「日趋势」/「月趋势」，
// 收集 DOM 统计信息，验证趋势视图（总账区块已无统计卡 + 拆分模块 + 模块级筛选下拉）。
const { spawn } = require('child_process');
const http = require('http');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;
const PAGE = 'file:///Users/lujingbao/Desktop/%E3%80%90zyun.2609.01%E3%80%91%E5%AE%A2%E6%88%B7%E4%BE%A7%E8%B4%A6%E5%8D%95%E5%B1%95%E7%A4%BA%E8%B0%83%E6%95%B4/%E8%B4%A6%E5%8D%95%E6%A6%82%E8%A7%88/index.html?v=verify';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', (e) => reject(new Error('ws error')), { once: true });
  });
}

function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++send._id;
    const onMsg = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
send._id = 0;

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--disable-background-networking',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/zyun-cdp-profile-2',
    '--window-size=1600,2200', PAGE
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  chrome.stderr.on('data', (c) => { chromeErr += String(c); });

  let tabs;
  for (let i = 0; i < 80; i++) {
    try { tabs = await getJson(`http://127.0.0.1:${PORT}/json`); break; }
    catch (e) { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!tabs) {
    console.error('CDP 启动失败');
    console.error('chrome stderr:', chromeErr.slice(-2000));
    try {
      const res = await getJson(`http://127.0.0.1:${PORT}/json/version`).catch(() => null);
      console.error('CDP 探测:', JSON.stringify(res));
    } catch (e) { console.error('探测异常:', e && e.message); }
    chrome.kill();
    process.exit(1);
  }

  const page = tabs.find((t) => t.type === 'page');
  if (!page) { console.error('未找到 page target'); chrome.kill(); process.exit(1); }

  const ws = await connect(page.webSocketDebuggerUrl);
  await send(ws, 'Runtime.enable', {});
  await new Promise((r) => setTimeout(r, 900));

  async function evalJs(expr) {
    const res = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) return { err: JSON.stringify(res.exceptionDetails) };
    return res.result.value;
  }

  function trendProbeExpr(dim) {
    return `(function(){
      var box = document.getElementById('chartbox-${dim}');
      if (!box) return { missing: true };
      var mods = box.querySelectorAll('.trend-module');
      return {
        trendBlock: !!box.querySelector('.trend-block'),
        blockTitle: box.querySelector('.trend-block-title') ? box.querySelector('.trend-block-title').textContent : null,
        statItems: box.querySelectorAll('.trend-stat-item').length,
        modules: Array.prototype.map.call(mods, function(m){
          var t = m.querySelector('.trend-module-title');
          var s = m.querySelector('.trend-module-sub');
          var pick = m.querySelector('.module-ms');
          return {
            key: m.dataset.module,
            title: t ? t.textContent : '',
            sub: s ? s.textContent : '',
            hasPick: !!pick,
            pickAll: pick ? (pick.querySelector('.ms-all') ? pick.querySelector('.ms-all').textContent.trim() : '') : '',
            pickOptions: pick ? pick.querySelectorAll('.ms-option:not(.ms-all)').length : 0,
            pickOptionTexts: pick ? Array.prototype.map.call(pick.querySelectorAll('.ms-option:not(.ms-all) span:last-child'), function(x){ return x.textContent; }) : [],
            legendItems: m.querySelectorAll('.legend-item').length,
            legendFirst: m.querySelector('.legend-text') ? m.querySelector('.legend-text').textContent : ''
          };
        })
      };
    })()`;
  }

  // 1. 企业账单 - 日趋势
  await evalJs(`document.querySelector('.view-seg[data-dim="enterprise"] .seg-btn[data-view="day-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ENT_DAY', JSON.stringify(await evalJs(trendProbeExpr('enterprise')), null, 2));

  // 2. 模块级筛选交互（企业：结算单元模块选 bu2，然后点搜索）
  console.log('PICK_DIAG', JSON.stringify(await evalJs(`(function(){
    var box = document.getElementById('chartbox-enterprise');
    var m = box.querySelector('.trend-module[data-module="bu"]');
    var trig = m.querySelector('.ms-trigger');
    var dd = m.querySelector('.ms-dropdown');
    trig.click();
    return {
      ddOpen: dd.classList.contains('open'),
      allOpts: dd.querySelectorAll('.ms-option').length,
      nonAll: dd.querySelectorAll('.ms-option:not(.ms-all)').length,
      instance: !!(window.msInstances && msInstances['msm-enterprise-bu-dropdown'])
    };
  })()`)));
  await evalJs(`(function(){
    var box = document.getElementById('chartbox-enterprise');
    var dd = box.querySelector('.trend-module[data-module="bu"] .ms-dropdown');
    var opt = Array.prototype.find.call(dd.querySelectorAll('.ms-option:not(.ms-all)'), function(o){ return o.dataset.value === 'bu2'; });
    opt.click();
    dd.classList.remove('open');
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  console.log('AFTER_OPT_CLICK', JSON.stringify(await evalJs(`(function(){
    var box = document.getElementById('chartbox-enterprise');
    var m = box.querySelector('.trend-module[data-module="bu"]');
    var dd = m.querySelector('.ms-dropdown');
    var label = m.querySelector('.ms-placeholder');
    return {
      draft: panelState['enterprise'].moduleDraft.bu,
      checked: Array.prototype.filter.call(dd.querySelectorAll('.ms-option.checked'), function(o){ return o.dataset.value; }).map(function(o){ return o.dataset.value; }),
      label: label ? label.textContent : '',
      hasSel: m.querySelector('.ms-trigger').classList.contains('has-selection')
    };
  })()`)));
  await evalJs(`document.querySelector('.filter-bar[data-dim="enterprise"] [data-action="search"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('ENT_DAY_AFTER_BU_FILTER', JSON.stringify(await evalJs(`(function(){
    var box = document.getElementById('chartbox-enterprise');
    var m = box.querySelector('.trend-module[data-module="bu"]');
    return {
      buApplied: panelState['enterprise'].moduleApplied.bu,
      buModuleSub: m.querySelector('.trend-module-sub').textContent,
      buLegendCount: m.querySelectorAll('.legend-item').length,
      buLegendTexts: Array.prototype.map.call(m.querySelectorAll('.legend-text'), function(x){ return x.textContent; })
    };
  })()`), null, 2));

  // 3. 清理：重置回企业（验证重置把模块级下拉清空），月趋势也检查一次
  await evalJs(`document.querySelector('.filter-bar[data-dim="enterprise"] [data-action="reset"]').click()`);
  await new Promise((r) => setTimeout(r, 600));
  console.log('AFTER_RESET', JSON.stringify(await evalJs(`(function(){
    var m = document.querySelector('.trend-module[data-module="bu"]');
    return {
      applied: panelState['enterprise'].moduleApplied.bu,
      sub: m.querySelector('.trend-module-sub').textContent,
      hasSel: m.querySelector('.ms-trigger').classList.contains('has-selection'),
      label: m.querySelector('.ms-placeholder').textContent
    };
  })()`)));
  await evalJs(`document.querySelector('.view-seg[data-dim="enterprise"] .seg-btn[data-view="month-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ENT_MONTH', JSON.stringify(await evalJs(trendProbeExpr('enterprise')), null, 2));

  // 4. 结算单元账单 - 日趋势（rg 模块下拉候选 = 该结算单元下资源组）
  await evalJs(`(function(){
    var seg = document.querySelector('.view-seg[data-dim="billing-unit"]');
    seg.querySelector('.seg-btn[data-view="day-trend"]').click();
  })()`);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('BU_DAY', JSON.stringify(await evalJs(trendProbeExpr('billing-unit')), null, 2));

  // 4.1 结算单元账单 rg 模块筛选中 rg2 + 产品模块选中 obs，点搜索
  console.log('BU_DIAG_0', JSON.stringify(await evalJs(`(function(){
    var st = panelState['billing-unit'];
    var m = document.querySelector('#chartbox-billing-unit .trend-module[data-module="rg"]');
    var dd = m.querySelector('.ms-dropdown');
    return {
      moduleDraft: st.moduleDraft,
      moduleApplied: st.moduleApplied,
      ddOptions: Array.prototype.map.call(dd.querySelectorAll('.ms-option'), function(o){ return o.dataset.value; }),
      hasMsi: !!(msInstances && msInstances['msm-billing-unit-rg-dropdown'])
    };
  })()`), null, 2));
  await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var pick = box.querySelector('.trend-module[data-module="rg"] .ms-trigger');
    pick.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 250));
  console.log('BU_DIAG_1', JSON.stringify(await evalJs(`(function(){
    var m = document.querySelector('#chartbox-billing-unit .trend-module[data-module="rg"]');
    return { ddOpen: m.querySelector('.ms-dropdown').classList.contains('open') };
  })()`)));
  await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var dd = box.querySelector('.trend-module[data-module="rg"] .ms-dropdown');
    var opt = Array.prototype.find.call(dd.querySelectorAll('.ms-option:not(.ms-all)'), function(o){ return o.dataset.value === 'rg2'; });
    if (!opt) return 'rg2 opt missing';
    opt.click();
    dd.classList.remove('open');
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  console.log('BU_DIAG_2', JSON.stringify(await evalJs(`(function(){
    var st = panelState['billing-unit'];
    var m = document.querySelector('#chartbox-billing-unit .trend-module[data-module="rg"]');
    return {
      moduleDraft: st.moduleDraft,
      draftRg: st.moduleDraft.rg,
      checkedOpts: Array.prototype.filter.call(m.querySelectorAll('.ms-option.checked'), function(o){ return o.dataset.value; }).map(function(o){ return o.dataset.value; })
    };
  })()`), null, 2));
  await evalJs(`document.querySelector('.filter-bar[data-dim="billing-unit"] [data-action="search"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('BU_DAY_AFTER_FILTER', JSON.stringify(await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var rg = box.querySelector('.trend-module[data-module="rg"]');
    var prod = box.querySelector('.trend-module[data-module="product"]');
    return {
      rgApplied: panelState['billing-unit'].moduleApplied.rg,
      rgSub: rg.querySelector('.trend-module-sub').textContent,
      rgLegend: Array.prototype.map.call(rg.querySelectorAll('.legend-text'), function(x){ return x.textContent; }),
      prodApplied: panelState['billing-unit'].moduleApplied.product,
      prodSub: prod.querySelector('.trend-module-sub').textContent,
      prodLegend: Array.prototype.map.call(prod.querySelectorAll('.legend-text'), function(x){ return x.textContent; })
    };
  })()`), null, 2));

  // 4.2 产品模块再勾选 obs，点搜索验证模块级产品筛选收敛（含总账区块无产品口径说明）
  await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var pick = box.querySelector('.trend-module[data-module="product"] .ms-trigger');
    pick.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 250));
  await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var dd = box.querySelector('.trend-module[data-module="product"] .ms-dropdown');
    var opt = Array.prototype.find.call(dd.querySelectorAll('.ms-option:not(.ms-all)'), function(o){ return o.dataset.value === 'obs'; });
    if (!opt) return 'obs opt missing';
    opt.click();
    dd.classList.remove('open');
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  await evalJs(`document.querySelector('.filter-bar[data-dim="billing-unit"] [data-action="search"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('BU_DAY_AFTER_PROD_FILTER', JSON.stringify(await evalJs(`(function(){
    var box = document.getElementById('chartbox-billing-unit');
    var prod = box.querySelector('.trend-module[data-module="product"]');
    var stat = box.querySelector('.trend-block');
    return {
      prodApplied: panelState['billing-unit'].moduleApplied.product,
      prodSub: prod.querySelector('.trend-module-sub').textContent,
      prodLegend: Array.prototype.map.call(prod.querySelectorAll('.legend-text'), function(x){ return x.textContent; }),
      blockHasProdScopeTxt: stat ? (stat.querySelector('.trend-block-sub') ? stat.querySelector('.trend-block-sub').textContent : null) : null
    };
  })()`), null, 2));

  // 5. 资源组账单 - 日趋势（仅产品模块，且有下拉）
  await evalJs(`(function(){
    var seg = document.querySelector('.view-seg[data-dim="resource-group"]');
    seg.querySelector('.seg-btn[data-view="day-trend"]').click();
  })()`);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('RG_DAY', JSON.stringify(await evalJs(trendProbeExpr('resource-group')), null, 2));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error('VERIFY_ERR', e && e.message || e); process.exit(1); });
