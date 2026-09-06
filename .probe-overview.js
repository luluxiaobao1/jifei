// 临时探测脚本：headless Chrome + CDP 加载账单概览，切到「日趋势」，
// 收集趋势模块、总账统计卡、筛选栏的 DOM 快照，输出文本供分析。
const { spawn } = require('child_process');
const http = require('http');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9230;
const PAGE = 'file:///Users/lujingbao/Desktop/%E3%80%90zyun.2609.01%E3%80%91%E5%AE%A2%E6%88%B7%E4%BE%A7%E8%B4%A6%E5%8D%95%E5%B1%95%E7%A4%BA%E8%B0%83%E6%95%B4/%E8%B4%A6%E5%8D%95%E6%A6%82%E8%A7%88/index.html?v=probe';

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
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/zyun-cdp-profile-probe',
    '--window-size=1600,2000', PAGE
  ], { stdio: 'ignore' });

  let tabs;
  for (let i = 0; i < 40; i++) {
    try { tabs = await getJson(`http://127.0.0.1:${PORT}/json`); break; }
    catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  if (!tabs) { console.error('CDP 启动失败'); chrome.kill(); process.exit(1); }

  const page = tabs.find((t) => t.type === 'page');
  const ws = await connect(page.webSocketDebuggerUrl);
  await send(ws, 'Runtime.enable', {});
  await new Promise((r) => setTimeout(r, 1000));

  async function evalJs(expr) {
    const res = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) return { err: JSON.stringify(res.exceptionDetails) };
    return res.result.value;
  }

  function probeExpr(dim) {
    return `(function(){
      var box = document.getElementById('chartbox-${dim}');
      var bar = document.querySelector('.filter-bar[data-dim="${dim}"]');
      var out = {};
      out.filterBtns = Array.prototype.map.call(bar ? bar.querySelectorAll('.multiselect,.singleselect,.date-ctl,.view-seg,.btn') : [], function(b){
        return { cls: b.className, id: b.id || '' };
      });
      out.blockTitle = box.querySelector('.trend-block-title') ? box.querySelector('.trend-block-title').textContent : null;
      out.blockSub = box.querySelector('.trend-block-sub') ? box.querySelector('.trend-block-sub').textContent : null;
      out.statItems = Array.prototype.map.call(box.querySelectorAll('.trend-stat-item'), function(s){
        var lab = s.querySelector('.trend-stat-label');
        var val = s.querySelector('.trend-stat-value');
        var sub = s.querySelector('.trend-stat-sub');
        return { label: lab ? lab.textContent : '', value: val ? val.textContent.trim() : '', sub: sub ? sub.textContent : '' };
      });
      out.modules = Array.prototype.map.call(box.querySelectorAll('.trend-module'), function(m){
        var t = m.querySelector('.trend-module-title');
        var s = m.querySelector('.trend-module-sub');
        return { key: m.dataset.module, title: t ? t.textContent : '', sub: s ? s.textContent : '',
                 legendItems: m.querySelectorAll('.legend-item').length,
                 legendTexts: Array.prototype.map.call(m.querySelectorAll('.legend-text'), function(x){ return x.textContent; }).slice(0, 8) };
      });
      return out;
    })()`;
  }

  // 1) 企业账单 - 日趋势
  await evalJs(`document.querySelector('.view-seg[data-dim="enterprise"] .seg-btn[data-view="day-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('ENT_DAY', JSON.stringify(await evalJs(probeExpr('enterprise'))));

  // 2) 企业账单 - 月趋势
  await evalJs(`document.querySelector('.view-seg[data-dim="enterprise"] .seg-btn[data-view="month-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('ENT_MONTH', JSON.stringify(await evalJs(probeExpr('enterprise'))));

  // 3) 结算单元账单 - 日趋势
  await evalJs(`document.querySelectorAll('#bill-tabs .tab')[1].click()`);
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`document.querySelector('.view-seg[data-dim="billing-unit"] .seg-btn[data-view="day-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('BU_DAY', JSON.stringify(await evalJs(probeExpr('billing-unit'))));

  // 4) 资源组账单 - 日趋势
  await evalJs(`document.querySelectorAll('#bill-tabs .tab')[2].click()`);
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`document.querySelector('.view-seg[data-dim="resource-group"] .seg-btn[data-view="day-trend"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  console.log('RG_DAY', JSON.stringify(await evalJs(probeExpr('resource-group'))));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error('PROBE_ERR', e && e.message || e); process.exit(1); });
