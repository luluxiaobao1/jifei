// ========== 对账工具 - Tab3 资源包列表 + API ==========

// ========== 常量 ==========
const RESOURCE_PACK_API = '/api/resourcePack/list';
const TOKEN_KEYS = ['token', 'Token', 'authorization', 'Authorization', 'access_token', 'accessToken', 'admin_token', 'adminToken', 'hulk3', 'HULK3', 'zyun_ticket', 'secret_token', 'gateway_token', 'gw_token'];

const PACK_COLUMNS = [
    { key: 'pack_name', label: '套餐名称', render: v => v || '-' },
    { key: 'pack_sign', label: '套餐标识', render: v => v || '-' },
    { key: 'product_sign', label: '产品名称', render: (v, item) => {
        const productName = PRODUCT_NAME_MAP[v] || '-';
        const smallName = item.small_sign_name;
        if (smallName && smallName.trim()) {
            return productName + ' - ' + smallName;
        }
        return productName;
    } },
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
let tacticValueMap = {};  // tag_info_key → tag_info_value 映射（来自 tactic/list 接口）

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

// ========== 深度查找数组（用于解析未知嵌套的 API 响应） ==========
function findArrayDeep(obj, depth) {
    if (depth === undefined) depth = 0;
    if (!obj || typeof obj !== 'object' || depth > 5) return null;
    if (Array.isArray(obj)) return obj.length > 0 ? obj : null;
    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        var v = obj[k];
        if (Array.isArray(v) && v.length > 0) return v;
    }
    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        var v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            var found = findArrayDeep(v, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

// ========== 计费标签值查询（tactic/list，按产品分别调用） ==========
async function fetchTacticListByProduct(token, productSign) {
    try {
        const resp = await fetch('/api/tactic/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Cookie-Token': token },
            body: JSON.stringify({ product_sign: productSign, page: 1, size: 1000 })
        });
        if (!resp.ok) { console.warn('[tactic/list]', productSign, 'HTTP', resp.status); return; }
        const json = await resp.json();
        if (json.errno !== undefined && json.errno !== 0) { console.warn('[tactic/list]', productSign, '接口错误:', json.errmsg); return; }
        // 实际数据结构：json.data.tactic_list[].tag_info[].tag_info_key / tag_info_value
        const tacticList = (json.data && json.data.tactic_list) || null;
        if (!tacticList || !Array.isArray(tacticList)) {
            console.warn('[tactic/list]', productSign, '未找到 tactic_list，data 字段:', json.data ? Object.keys(json.data).join(', ') : 'null');
            return;
        }
        // 遍历每条 tactic → 遍历其 tag_info 数组，构建 tag_info_key → tag_info_value 映射
        let count = 0;
        tacticList.forEach(tactic => {
            if (!tactic || !Array.isArray(tactic.tag_info)) return;
            tactic.tag_info.forEach(tag => {
                if (!tag) return;
                const key = tag.tag_info_key || '';
                const val = tag.tag_info_value || '';
                if (key) { tacticValueMap[key] = val; count++; }
            });
        });
        console.log('[tactic/list]', productSign, '→', tacticList.length, '条tactic,', count, '条tag映射');
    } catch (e) {
        console.warn('[tactic/list]', productSign, '查询失败:', e.message);
    }
}

async function fetchAllTacticLists(token) {
    if (allPackData.length === 0) return;
    tacticValueMap = {};
    const productSigns = [...new Set(allPackData.map(p => p.product_sign).filter(Boolean))];
    console.log('[tactic/list] 开始查询', productSigns.length, '个产品的计费标签值');
    for (const ps of productSigns) {
        await fetchTacticListByProduct(token, ps);
    }
    console.log('[tactic/list] 共获取', Object.keys(tacticValueMap).length, '条计费标签值映射', tacticValueMap);
}

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
        // 同时获取计费标签值映射
        await fetchAllTacticLists(token);
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
        return '<td' + cls + ' title="' + plainText.replace(/"/g, '&quot;') + '">' + html + '</td>';
    }).join('') + '</tr>').join('');
}

function renderPackConfigCell(packId) {
    const configs = packConfigStore[packId];
    if (!configs || configs.length === 0) return '-';
    return '<button onclick="showPackConfigModal(' + packId + ')" class="pack-config-btn">' + configs.length + ' 个计费项</button>';
}

function showPackConfigModal(packId) {
    const configs = packConfigStore[packId];
    if (!configs || configs.length === 0) return;
    const pack = allPackData.find(p => p.id === packId);
    const packName = pack ? pack.pack_name : '';

    const listHtml = configs.map(c => {
        // 显示时多级回退：存储值 → tacticValueMap → 空
        const tiv = c.tag_info_value || tacticValueMap[c.tag_info_key] || '';
        // 计费项名称展示规则：label_name_tag_info_value
        const displayName = tiv ? (c.label_name + '_' + tiv) : (c.label_name || '');
        return '<tr><td>' + escapeHtml(displayName) + '</td><td><code>' + escapeHtml(c.info_key || c.label_key) + '</code></td><td><code>' + escapeHtml(tiv) + '</code></td><td><code>' + escapeHtml(c.tag_info_key || '') + '</code></td></tr>';
    }).join('');

    document.getElementById('configModalTitle').textContent = packName || '计费项配置';
    document.getElementById('configModalCount').textContent = '共 ' + configs.length + ' 个计费项';
    document.getElementById('configModalBody').innerHTML =
        '<table class="pack-config-modal-table"><thead><tr><th>计费项名称</th><th>计费项标识</th><th>计费标签值</th><th>计费项标签Key</th></tr></thead><tbody>' + listHtml + '</tbody></table>';
    document.getElementById('packConfigModal').classList.remove('hidden');
}

function closePackConfigModal() {
    document.getElementById('packConfigModal').classList.add('hidden');
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
        // 确保计费标签值映射已加载
        if (Object.keys(tacticValueMap).length === 0) { await fetchAllTacticLists(token); }
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
        console.log('[同步配置] tacticValueMap 大小:', Object.keys(tacticValueMap).length, '| 样本:', JSON.stringify(tacticValueMap).substring(0, 300));
        quota.forEach(q => {
            if (!q.item || !Array.isArray(q.item)) return;
            q.item.forEach(item => {
                const nm = item.label_name || '';
                if (item.tag_item && Array.isArray(item.tag_item) && item.tag_item.length > 0) {
                    // 诊断：打印第一个 tag 对象的完整结构
                    if (item.tag_item.length > 0) {
                        console.log('[同步配置] item:', nm, '| tag_item[0] 完整结构:', JSON.stringify(item.tag_item[0]).substring(0, 400));
                        console.log('[同步配置] item:', nm, '| tag_item[0] 所有字段:', Object.keys(item.tag_item[0]).join(', '));
                    }
                    item.tag_item.forEach(tag => {
                        const tik = tag.tag_info_key || '';
                        // 多级回退：tacticMap → tag自身 → item级别
                        const tiv = tacticValueMap[tik] || tag.tag_info_value || tag.info_value || tag.value || tag.tag_value || item.tag_info_value || item.info_value || item.value || '';
                        const labelKey = tag.label_key || tag.tag_info_key || '';
                        const labelName = tag.label_name || nm;
                        console.log('[同步配置] tag:', labelName, '| key:', tik, '| value:', tiv, '| tacticMap:', !!tacticValueMap[tik], '| tag自身:', !!(tag.tag_info_value || tag.info_value || tag.value));
                        if (labelKey || labelName || tik) configs.push({ label_name: labelName, label_key: labelKey, info_key: tag.label_name_tag_info_key || tag.label_key || tik, tag_info_key: tik, tag_info_value: tiv });
                    });
                } else if (item.label_key) {
                    configs.push({ label_name: nm, label_key: item.label_key, info_key: item.label_name_tag_info_key || item.label_key, tag_info_key: '', tag_info_value: '' });
                }
            });
        });
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
    // 确保计费标签值映射已加载
    if (Object.keys(tacticValueMap).length === 0) { await fetchAllTacticLists(token); }
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
            quota.forEach(q => { if (!q.item || !Array.isArray(q.item)) return; q.item.forEach(item => { const nm = item.label_name || ''; if (item.tag_item && Array.isArray(item.tag_item) && item.tag_item.length > 0) { item.tag_item.forEach(tag => { const tik = tag.tag_info_key || ''; const tiv = tacticValueMap[tik] || tag.tag_info_value || tag.info_value || tag.value || tag.tag_value || item.tag_info_value || item.info_value || item.value || ''; const labelKey = tag.label_key || tag.tag_info_key || ''; const labelName = tag.label_name || nm; if (labelKey || labelName || tik) configs.push({ label_name: labelName, label_key: labelKey, info_key: tag.label_name_tag_info_key || tag.label_key || tik, tag_info_key: tik, tag_info_value: tiv }); }); } else if (item.label_key) { configs.push({ label_name: nm, label_key: item.label_key, info_key: item.label_name_tag_info_key || item.label_key, tag_info_key: '', tag_info_value: '' }); } }); });
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

// ========== 导出资源包列表 ==========
function exportPackList() {
    if (allPackData.length === 0) { alert('没有可导出的资源包数据'); return; }

    // 获取当前筛选条件
    const kw = document.getElementById('packTableSearch').value.trim().toLowerCase();
    const fp = document.getElementById('filterProductSign').value;
    const fs = document.getElementById('filterSmallSignName').value;
    const fpt = document.getElementById('filterPackType').value;
    const fut = document.getElementById('filterUseType').value;
    const fst = document.getElementById('filterStatus').value;

    // 应用筛选
    const filtered = allPackData.filter(item => {
        if (fp && item.product_sign !== fp) return false;
        if (fs && item.small_sign_name !== fs) return false;
        if (fpt && String(item.pack_type) !== fpt) return false;
        if (fut && String(item.use_type) !== fut) return false;
        if (fst && String(item.status) !== fst) return false;
        if (kw) return (item.pack_name||'').toLowerCase().includes(kw) || (item.product_sign||'').toLowerCase().includes(kw) || (item.small_sign_name||'').toLowerCase().includes(kw) || (item.pack_sign||'').toLowerCase().includes(kw) || (item.pack_description||'').toLowerCase().includes(kw);
        return true;
    });

    if (filtered.length === 0) { alert('当前筛选条件下没有数据可导出'); return; }

    // 导出列（排除"配置"和"操作"列）
    const BILL_TYPE_MAP = {hour:'按小时',day:'按天',month:'按月',year:'按年'};
    const PACK_TYPE_MAP = {1:'总量包',2:'总价包'};
    const USE_TYPE_MAP = {1:'一次性',2:'持续'};
    const STATUS_MAP = {1:'已下架',2:'已上架'};

    const exportColumns = [
        { header: '套餐名称', get: item => item.pack_name || '' },
        { header: '套餐标识', get: item => item.pack_sign || '' },
        { header: '产品名称', get: item => {
            const name = PRODUCT_NAME_MAP[item.product_sign] || item.product_sign || '';
            const small = item.small_sign_name;
            return (small && small.trim()) ? name + ' - ' + small : name;
        }},
        { header: '产品标识', get: item => item.product_sign || '' },
        { header: '小产品名称', get: item => item.small_sign_name || '' },
        { header: '包类型', get: item => PACK_TYPE_MAP[item.pack_type] || item.pack_type || '' },
        { header: '使用类型', get: item => USE_TYPE_MAP[item.use_type] || item.use_type || '' },
        { header: '计费周期', get: item => BILL_TYPE_MAP[item.bill_type] || item.bill_type || '' },
        { header: '抵扣规则', get: item => stripHtmlTags(renderPackDeductRuleCell(item)) },
        { header: '原价', get: item => item.original_price != null ? item.original_price : '' },
        { header: '官方折扣', get: item => item.official_discount != null ? item.official_discount : '' },
        { header: 'VIP折扣', get: item => item.v_discount || '' },
        { header: 'SVIP折扣', get: item => item.s_v_discount || '' },
        { header: '最低折扣', get: item => item.minimum_discount != null ? item.minimum_discount : '' },
        { header: '上架状态', get: item => STATUS_MAP[item.status] || '' },
        { header: '配置', get: item => {
            const configs = packConfigStore[item.id];
            if (!configs || configs.length === 0) return '';
            return configs.map(c => c.label_name + '=' + (c.info_key || c.label_key)).join(', ');
        }},
    ];

    const headers = exportColumns.map(c => c.header);
    const rows = filtered.map(item => exportColumns.map(c => c.get(item)));

    // 生成 CSV（带 BOM 以支持 Excel 打开中文）
    const csvContent = '﻿' + [headers, ...rows].map(row =>
        row.map(cell => {
            const s = String(cell == null ? '' : cell);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '资源包列表_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}
