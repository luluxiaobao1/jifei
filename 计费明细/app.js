// ==========================================================
// 计费明细
// 由两个入口新开页打开：
//   账单概览 > 日报表 / 月报表  点击「应付金额」
//   账单分析 > 产品分析        点击「计费明细」
// 通过 URL 参数接收来源页的查询条件并回显：
//   product        产品名称（如「云服务器 ECS」）
//   billType       账单类型 month / day / hour
//   period         账期（月 2026.08 / 天 2026.08.15 / 小时 2026.08.15 14:00）
//   billingUnit    结算单元名称（账单概览的结算单元 / 资源组维度）
//   resourceGroup  资源组名称（账单概览的资源组维度）
//   scope          统计范围（账单分析页沿用的旧参数，与上面两个互补）
// ==========================================================

var BILL_TYPE_LABEL = { month: '月账单', day: '天账单', hour: '小时账单' };

function queryParams() {
  var out = {};
  var qs = location.search.replace(/^\?/, '');
  if (!qs) return out;
  qs.split('&').forEach(function (pair) {
    if (!pair) return;
    var i = pair.indexOf('=');
    var k = i === -1 ? pair : pair.slice(0, i);
    var v = i === -1 ? '' : pair.slice(i + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch (e) {
      out[k] = v;
    }
  });
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 小时账期展示为区间，与账单分析页保持同一文案口径
function periodText(billType, period) {
  if (billType !== 'hour') return period;
  var m = /^(.*)\s(\d{1,2}):00$/.exec(period);
  if (!m) return period;
  var h = +m[2];
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return m[1] + ' ' + pad(h) + ':00-' + pad((h + 1) % 24) + ':00';
}

function condItem(label, value) {
  return '<span class="cond-item"><span class="cond-label">' + escapeHtml(label) +
         '</span><span class="cond-value">' + escapeHtml(value) + '</span></span>';
}

(function () {
  var p = queryParams();
  var bar = document.getElementById('cond-bar');
  var sub = document.getElementById('page-sub');

  var items = [];
  if (p.product) items.push(condItem('产品', p.product));
  // 结算单元 / 资源组来自账单概览；scope 是账单分析页的旧口径，两者只会出现其一
  if (p.billingUnit) items.push(condItem('结算单元', p.billingUnit));
  if (p.resourceGroup) items.push(condItem('资源组', p.resourceGroup));
  if (p.scope) items.push(condItem('统计范围', p.scope));
  if (p.billType && BILL_TYPE_LABEL[p.billType]) items.push(condItem('账单类型', BILL_TYPE_LABEL[p.billType]));
  if (p.period) items.push(condItem('账期', periodText(p.billType, p.period)));

  if (bar) bar.innerHTML = items.join('');

  if (sub) {
    // 侧边栏直接进入时无参数，属正常入口，提示改为「未限定条件」而非报错口径
    sub.textContent = items.length
      ? '来源：账单概览 / 账单分析'
      : '未限定筛选条件，展示全部计费记录；也可从「账单概览 > 日报表 / 月报表」或「账单分析 > 产品分析」带条件进入';
  }

  if (p.product) document.title = p.product + ' 计费明细 - 360智汇云';
})();
