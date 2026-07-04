// ========== 对账工具 - Tab3 资源包列表 + API ==========

// ========== 常量 ==========
const RESOURCE_PACK_API = '/api/resourcePack/list';
const TOKEN_KEYS = ['token', 'Token', 'authorization', 'Authorization', 'access_token', 'accessToken', 'admin_token', 'adminToken', 'hulk3', 'HULK3', 'zyun_ticket', 'secret_token', 'gateway_token', 'gw_token'];

const PACK_COLUMNS = [
    { key: 'pack_name', label: '套餐名称', render: v => v || '-' },
    { key: 'pack_sign', label: '套餐标识', render: v => v || '-' },
    { key: 'product_sign', label: '产品名称', render: v => PRODUCT_NAME_MAP[v] || '-' },
    { key: 'product_sign', label: '产品标识', render: v => v || '-' },
    { key: 'small_sign_name', label: '小产品名称', render: v => v || '-' },
    { key: 'pack_type', label: '包类型', render: v => ({1:'总量包',2:'总价包'}[v] || v) },
    { key: 'use_type', label: '使用类型', render: v => ({1:'一次性',2:'持续'}[v] || v) },
    { key: 'bill_type', label: '计费周期', render: v => ({hour:'按小时',day:'按天',month:'按月',year:'按年'}[v] || v) },
    { key: 'id', label: '抵扣规则', render: (v, item) => renderPackDeductRuleCell(item) },
    { key: 'original_price', label: '原价', render: v => v != null ? Number(v).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2}) : '-' },
    { key: 'official_discount', label: '官方折扣', render: v => v != null ? v : '-' },
    { key: 'v_discount', label: 'VIP折扣', render: v => v || '-' },
    { key: 's_v_discount', label: 'SVIP折扣', render: v => v || '-' },
    { key: 'minimum_discount', label: '最低折扣', render: v => v != null ? v : '-' },
    { key: 'status', label: '上架状态', render: v => v === 1 ? '<span class="pack-badge pack-badge-off">已下架</span>' : (v === 2 ? '<span class="pack-badge pack-badge-on">已上架</span>' : '-') },
    { key: 'id', label: '配置', render: (v, item) => renderPackConfigCell(item.id) },
    { key: 'id', label: '操作', render: (v, item) => '<button onclick="syncPackConfig(' + item.id + ', this)" class="pack-sync-btn">同步</button>' },
];

// ========== 全局状态 ==========
let allPackData = [];
let packConfigStore = {};
let packDeductRuleStore = {};

// ========== 存储 ==========
function loadPackConfigs() { try { const s = localStorage.getItem(STORAGE_KEYS.packConfig); if (s) packConfigStore = JSON.parse(s); } catch(e) { packConfigStore = {}; } }
function savePackConfigs() { try { localStorage.setItem(STORAGE_KEYS.packConfig, JSON.stringify(packConfigStore)); } catch(e) { console.warn('计费项配置保存失败:', e); } }
function loadPackDeductRules() { try { const s = localStorage.getItem(STORAGE_KEYS.packDeductRule); if (s) packDeductRuleStore = JSON.parse(s); } catch(e) { packDeductRuleStore = {}; } }
function savePackDeductRules() { try { localStorage.setItem(STORAGE_KEYS.packDeductRule, JSON.stringify(packDeductRuleStore)); } catch(e) { console.warn('抵扣规则保存失败:', e); } }

// ========== Token 管理 ==========
function getCookie(name) { const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1') + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
function autoReadToken() { for (const k of TOKEN_KEYS) { try { const v = localStorage.getItem(k); if (v) return v; } catch(e) {} } for (const k of TOKEN_KEYS) { const v = getCookie(k); if (v) return v; } return ''; }
function getActiveToken() { const input = document.getElementById('packToken'); const manual = input ? input.value.trim() : ''; return manual || autoReadToken(); }
function onPackTokenInput() { const v = document.getElementById('packToken').value.trim(); try { if (v) localStorage.setItem('token', v); } catch(e) {} }
function initPackToken() { const input = document.getElementById('packToken'); if (input && !input.value) { const t = autoReadToken(); if (t) input.value = t; } }
function showPackError(msg) { const el = document.getElementById('packErrorMsg'); el.textContent = msg; el.style.display = 'block'; }

// ========== 抵扣规则提取（公共函数，消除 3 处重复） ==========
function extractDeductRule(data, quota) {
    const rule = {};
    // 从 data 提取
    if (data.fixed_number_price != null) rule.fixed_number_price = data.fixed_number_price;
    if (data.fixed_number != null) rule.fixed_number = data.fixed_number;
    if (data.fixed_number_unit != null) rule.fixed_number_unit = data.fixed_number_unit;
    if (data.deduction_month != null) rule.deduction_month = data.deduction_month;
    if (data.charge_type != null) rule.charge_type = data.charge_type;
    if (data.number != null) rule.number = data.number;
    // 从 quota 顶层补充
    if (quota && quota.length > 0) {
        const q0 = quota[0];
        if (rule.fixed_number_price == null && q0.fixed_number_price != null) rule.fixed_number_price = q0.fixed_number_price;
        if (rule.fixed_number == null && q0.fixed_number != null) rule.fixed_number = q0.fixed_number;
        if (rule.fixed_number_unit == null && q0.fixed_number_unit != null) rule.fixed_number_unit = q0.fixed_number_unit;
        if (rule.deduction_month == null && q0.deduction_month != null) rule.deduction_month = q0.deduction_month;
        if (rule.charge_type == null && q0.charge_type != null) rule.charge_type = q0.charge_type;
        if (rule.number == null && q0.number != null) rule.number = q0.number;
        // 从 quota[].item[] 深层提取
        for (let qi = 0; qi < quota.length; qi++) {
            const q = quota[qi];
            if (rule.number == null && q.number != null) rule.number = q.number;
            const items = q.item;
            if (!Array.isArray(items)) continue;
            for (let ii = 0; ii < items.length; ii++) {
                const it = items[ii];
                if (rule.fixed_number == null && it.fixed_number != null) rule.fixed_number = it.fixed_number;
                if (rule.deduction_month == null && it.deduction_month != null) rule.deduction_month = it.deduction_month;
                if (rule.number == null && it.number != null) rule.number = it.number;
            }
        }
    }
    return rule;
}

// ========== 查询资源包列表 ==========
async function queryResourcePackList() {
    const token = getActiveToken();
    const btn = document.getElementById('queryPackBtn');
    const errEl = document.getElementById('packErrorMsg');
    if (!token) { showPackError('请输入 Token'); return; }
    errEl.style.display = 'none';
    btn.classList.add('loading'); btn.disabled = true;
    try {
        const allItems = []; let total = 0; let page = 1; const pageSize = 100;
        while (true) {
            console.log('[资源包查询] 请求:', location.origin + RESOURCE_PACK_API, '| page:', page);
            const resp = await fetch(RESOURCE_PACK_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cookie-Token': token }, body: JSON.stringify({ page, size: pageSize }) });
            if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
            const json = await resp.json();
            if (json.errno !== 0) throw new Error(json.errmsg || '接口返回错误');
            total = json.data.total; allItems.push(...json.data.list);
            if (allItems.length >= total || json.data.list.length < pageSize) break;
            page++;
        }
        allPackData = allItems;
        try { localStorage.setItem(STORAGE_KEYS.packList, JSON.stringify({ data: allPackData, total, time: new Date().toLocaleString('zh-CN') })); } catch(e) { console.warn('资源包数据过大，无法保存到本地存储'); }
        renderPackStats(allPackData, total); renderPackTable(allPackData); populatePackFilters();
        document.getElementById('packResultArea').style.display = 'block';
        document.getElementById('packEmptyState').style.display = 'none';
    } catch (e) {
        const isFile = location.protocol === 'file:';
        console.error('[资源包查询] 失败:', { url: location.origin + RESOURCE_PACK_API, protocol: location.protocol, error: e.message });
        showPackError('查询失败：' + e.message + (isFile ? '（当前是 file:// 协议，请通过 http://localhost:18080 访问）' : '（请确认代理服务器正常运行）'));
        document.getElementById('packResultArea').style.display = 'none';
        document.getElementById('packEmptyState').style.display = 'block';
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// ========== 渲染 ==========
function renderPackStats(items, total) {
    const active = items.filter(i => i.status === 1).length;
    const onSell = items.filter(i => i.is_sell === 1).length;
    const products = new Set(items.map(i => i.product_sign)).size;
    document.getElementById('packStatsBar').innerHTML = '<div class="pack-stat-card"><div class="label">资源包总数</div><div class="value blue">' + total + '</div></div><div class="pack-stat-card"><div class="label">启用中</div><div class="value green">' + active + '</div></div><div class="pack-stat-card"><div class="label">在售中</div><div class="value orange">' + onSell + '</div></div><div class="pack-stat-card"><div class="label">涉及产品</div><div class="value">' + products + '</div></div>';
}

function renderPackTable(items) {
    document.getElementById('packTableHead').innerHTML = '<tr>' + PACK_COLUMNS.map(c => '<th>' + c.label + '</th>').join('') + '</tr>';
    renderPackRows(items);
    document.getElementById('packRowCount').textContent = '共 ' + items.length + ' 条';
}

function renderPackRows(items) {
    const tbody = document.getElementById('packTableBody');
    if (items.length === 0) { tbody.innerHTML = '<tr><td colspan="' + PACK_COLUMNS.length + '" style="text-align:center;padding:40px;color:#bbb;">无匹配数据</td></tr>'; return; }
    tbody.innerHTML = items.map(item => '<tr>' + PACK_COLUMNS.map((c, ci) => {
        const html = c.render(item[c.key], item);
        const plainText = stripHtmlTags(html);
        const isConfigCol = (c.label === '配置');
        const cls = isConfigCol ? ' class="pack-config-cell"' : '';
        const tooltip = isConfigCol ? ' data-tooltip="' + plainText.replace(/"/g, '&quot;') + '"' : '';
        return '<td' + cls + tooltip + ' title="' + plainText.replace(/"/g, '&quot;') + '">' + html + '</td>';
    }).join('') + '</tr>').join('');
}

function renderPackConfigCell(packId) {
    const configs = packConfigStore[packId];
    if (!configs || configs.length === 0) return '-';
    return configs.map(c => '<span class="pack-config-tag">' + escapeHtml(c.label_name) + '(' + escapeHtml(c.label_key) + ')</span>').join('');
}

function renderPackDeductRuleCell(item) {
    const BILL_TYPE_MAP = {hour:'小时',day:'天',month:'月',year:'年'};
    const billLabel = BILL_TYPE_MAP[item.bill_type] || item.bill_type || '';
    const rule = packDeductRuleStore[item.id];
    const packType = Number(item.pack_type);
    const useType = Number(item.use_type);

    if (useType === 2) {
        if (!rule) return '<span style="color:#bbb;">待同步</span>';
        if (packType === 2) {
            const price = rule.fixed_number_price != null ? rule.fixed_number_price : '-';
            const month = rule.deduction_month != null ? rule.deduction_month : '-';
            return '每' + billLabel + '抵扣 ' + price + '，持续抵扣 ' + month + ' 个月';
        }
        if (packType === 1) {
            const num = rule.fixed_number != null ? rule.fixed_number : '-';
            const unit = rule.fixed_number_unit != null ? rule.fixed_number_unit : '-';
            return '每' + billLabel + '抵扣 ' + num + '，持续抵扣 ' + unit + ' 个月';
        }
        return '-';
    }

    if (useType === 1) {
        if (packType === 2) {
            return item.original_price != null ? Number(item.original_price).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2}) : '-';
        }
        if (packType === 1) {
            if (!rule) return '<span style="color:#bbb;">待同步</span>';
            return rule.number != null ? rule.number : '-';
        }
        return '-';
    }

    return '-';
}

// ========== 同步配置（使用 extractDeductRule 公共函数） ==========
async function syncPackConfig(packId, btn) {
    const token = getActiveToken();
    if (!token) { alert('请先输入 Token'); return; }
    btn.disabled = true; btn.textContent = '同步中...';
    try {
        const resp = await fetch('/api/resourcePack/infoById', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cookie-Token': token }, body: JSON.stringify({ id: packId }) });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const responseText = await resp.text();
        console.log('[同步配置] packId:', packId, '| HTTP:', resp.status, '| 长度:', responseText.length);
        if (!responseText || responseText.trim() === '') throw new Error('接口返回空响应（HTTP ' + resp.status + '）');
        let json; try { json = JSON.parse(responseText); } catch(pe) { throw new Error('接口返回非JSON格式'); }
        if (json.errno !== undefined && json.errno !== 0) throw new Error(json.errmsg || '接口返回错误');
        const quota = json.data && json.data.resource_pack_quota;
        if (!quota || !Array.isArray(quota) || quota.length === 0) { alert('该资源包没有计费项信息'); btn.disabled = false; btn.textContent = '同步'; return; }
        const configs = [];
        quota.forEach(q => { if (!q.item || !Array.isArray(q.item)) return; q.item.forEach(item => { const nm = item.label_name || ''; if (item.tag_item && Array.isArray(item.tag_item) && item.tag_item.length > 0) { item.tag_item.forEach(tag => { if (tag.label_key) configs.push({ label_name: tag.label_name || nm, label_key: tag.label_key }); }); } else if (item.label_key) { configs.push({ label_name: nm, label_key: item.label_key }); } }); });
        packConfigStore[packId] = configs; savePackConfigs();

        const data = json.data || {};
        const deductRule = extractDeductRule(data, quota);
        console.log('[抵扣规则提取] packId:', packId, '| 结果:', JSON.stringify(deductRule));
        if (Object.keys(deductRule).length > 0) {
            packDeductRuleStore[packId] = deductRule; savePackDeductRules();
        }

        filterPackTable();
        alert('同步成功！共 ' + configs.length + ' 个计费项');
    } catch (e) { alert('同步失败：' + e.message); } finally { btn.disabled = false; btn.textContent = '同步'; }
}

async function syncAllPackConfigs(btn) {
    const token = getActiveToken();
    if (!token) { alert('请先输入 Token'); return; }
    if (allPackData.length === 0) { alert('没有资源包数据，请先查询资源包列表'); return; }
    btn.disabled = true; const origText = btn.textContent;
    let ok = 0, fail = 0, totalItems = 0;
    for (let i = 0; i < allPackData.length; i++) {
        const pack = allPackData[i]; btn.textContent = '同步中 ' + (i+1) + '/' + allPackData.length + '...';
        try {
            const resp = await fetch('/api/resourcePack/infoById', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cookie-Token': token }, body: JSON.stringify({ id: pack.id }) });
            if (!resp.ok) { fail++; continue; }
            const rt = await resp.text(); if (!rt || rt.trim() === '') { fail++; continue; }
            let json; try { json = JSON.parse(rt); } catch(pe) { fail++; continue; }
            if (json.errno !== undefined && json.errno !== 0) { fail++; continue; }
            const quota = json.data && json.data.resource_pack_quota;
            if (!quota || !Array.isArray(quota) || quota.length === 0) { fail++; continue; }
            const configs = [];
            quota.forEach(q => { if (!q.item || !Array.isArray(q.item)) return; q.item.forEach(item => { const nm = item.label_name || ''; if (item.tag_item && Array.isArray(item.tag_item) && item.tag_item.length > 0) { item.tag_item.forEach(tag => { if (tag.label_key) configs.push({ label_name: tag.label_name || nm, label_key: tag.label_key }); }); } else if (item.label_key) { configs.push({ label_name: nm, label_key: item.label_key }); } }); });
            if (configs.length > 0) { packConfigStore[pack.id] = configs; totalItems += configs.length; ok++; } else { fail++; }

            const data = json.data || {};
            const deductRule = extractDeductRule(data, quota);
            if (Object.keys(deductRule).length > 0) {
                packDeductRuleStore[pack.id] = deductRule;
            }
        } catch (e) { fail++; }
    }
    savePackConfigs(); savePackDeductRules(); filterPackTable(); btn.disabled = false; btn.textContent = origText;
    alert('批量同步完成！\n成功：' + ok + ' 个\n失败：' + fail + ' 个\n共计费项：' + totalItems + ' 个');
}

// ========== 筛选 ==========
function populatePackFilters() {
    const signs = [...new Set(allPackData.map(i => i.product_sign).filter(Boolean))];
    const opts = signs.map(s => ({ sign: s, name: PRODUCT_NAME_MAP[s] || s })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    document.getElementById('filterProductSign').innerHTML = '<option value="">全部</option>' + opts.map(o => '<option value="' + o.sign + '">' + o.name + '</option>').join('');
    updateSmallSignNameOptions('');
}

function updateSmallSignNameOptions(productSign) {
    let items = allPackData;
    if (productSign) items = allPackData.filter(i => i.product_sign === productSign);
    const names = [...new Set(items.map(i => i.small_sign_name).filter(Boolean))].sort();
    document.getElementById('filterSmallSignName').innerHTML = '<option value="">全部</option>' + names.map(v => '<option value="' + v + '">' + v + '</option>').join('');
}

function onProductSignChange() {
    const ps = document.getElementById('filterProductSign').value;
    document.getElementById('filterSmallSignName').value = '';
    updateSmallSignNameOptions(ps); filterPackTable();
}

function resetPackFilters() {
    document.getElementById('filterProductSign').value = '';
    document.getElementById('filterSmallSignName').value = '';
    document.getElementById('filterPackType').value = '';
    document.getElementById('filterUseType').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('packTableSearch').value = '';
    filterPackTable();
}

function filterPackTable() {
    const kw = document.getElementById('packTableSearch').value.trim().toLowerCase();
    const fp = document.getElementById('filterProductSign').value;
    const fs = document.getElementById('filterSmallSignName').value;
    const fpt = document.getElementById('filterPackType').value;
    const fut = document.getElementById('filterUseType').value;
    const fst = document.getElementById('filterStatus').value;
    const filtered = allPackData.filter(item => {
        if (fp && item.product_sign !== fp) return false;
        if (fs && item.small_sign_name !== fs) return false;
        if (fpt && String(item.pack_type) !== fpt) return false;
        if (fut && String(item.use_type) !== fut) return false;
        if (fst && String(item.status) !== fst) return false;
        if (kw) return (item.pack_name||'').toLowerCase().includes(kw) || (item.product_sign||'').toLowerCase().includes(kw) || (item.small_sign_name||'').toLowerCase().includes(kw) || (item.pack_sign||'').toLowerCase().includes(kw) || (item.pack_description||'').toLowerCase().includes(kw);
        return true;
    });
    renderPackRows(filtered);
    const hasFilter = kw || fp || fs || fpt || fut || fst;
    document.getElementById('packRowCount').textContent = hasFilter ? '共 ' + filtered.length + ' 条（筛选自 ' + allPackData.length + ' 条）' : '共 ' + filtered.length + ' 条';
}
