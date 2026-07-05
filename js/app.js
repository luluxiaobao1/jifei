// ========== 对账工具 - 入口：初始化 + 事件绑定 + 数据恢复 ==========

// ========== Tab 切换 ==========
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('tab-' + tabName).classList.remove('hidden');

    document.querySelectorAll('.bi-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('tabBtn-' + tabName).classList.add('active');

    try { localStorage.setItem(STORAGE_KEYS.activeTab, tabName); } catch(e) {}
}

// ========== 重置看板（统一入口） ==========
function resetDashboard(tab) {
    if (tab === 'business') {
        resetBusiness();
    } else if (tab === 'resource') {
        resetResource();
    }
}

// ========== 点击面板外部关闭折叠面板 ==========
function initPanelCloseHandlers() {
    document.addEventListener('click', function (e) {
        const closest = e.target.closest ? e.target.closest.bind(e.target) : null;
        // 数据筛选面板
        const fPanel = document.getElementById('filterPanel-resource');
        if (fPanel && !fPanel.classList.contains('hidden')) {
            if (!(closest && closest('#filterPanel-resource')) && !(closest && closest('#filterToggle-resource'))) {
                fPanel.classList.add('hidden');
            }
        }
        // X / 维度 取值面板
        ['x', 'dim'].forEach(axis => {
            const aPanel = document.getElementById(axis + 'ValuePanel-resource');
            if (aPanel && !aPanel.classList.contains('hidden')) {
                if (!(closest && closest('#' + axis + 'ValueDropdown-resource'))) {
                    aPanel.classList.add('hidden');
                }
            }
        });
        // 维度列多选面板
        const dimColP = document.getElementById('dimColPanel-resource');
        if (dimColP && !dimColP.classList.contains('hidden')) {
            if (!(closest && closest('#dimColPanel-resource')) && !(closest && closest('#dimColToggle-resource'))) {
                dimColP.classList.add('hidden');
            }
        }
        // Y 列取值面板
        document.querySelectorAll('[id^="yValuePanel-"][id$="-resource"]').forEach(yPanel => {
            if (yPanel.classList.contains('hidden')) return;
            const ddId = yPanel.id.replace('yValuePanel-', 'yValueDropdown-');
            if (!(closest && closest('#' + ddId))) {
                yPanel.classList.add('hidden');
            }
        });
    });
}

// ========== 页面加载时恢复数据 ==========
function initApp() {
    // 注册 chartjs-plugin-datalabels
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // 初始化上传区域
    initBusinessUpload();
    initResourceUpload();
    initCalcUpload();

    // 初始化面板关闭处理器
    initPanelCloseHandlers();

    // 恢复经营分析数据
    restoreFromStorage('business');

    // 恢复资源包抵扣数据
    try {
        const savedResource = localStorage.getItem(STORAGE_KEYS.resource);
        if (savedResource) {
            const files = JSON.parse(savedResource);
            if (Array.isArray(files) && files.length > 0) {
                tabState.resource.files = files;
                updateResourceUI();
            }
        }
    } catch(e) { localStorage.removeItem(STORAGE_KEYS.resource); }

    // 恢复资源包测算数据
    try {
        const savedCalc = localStorage.getItem(STORAGE_KEYS.calc);
        if (savedCalc) {
            const files = JSON.parse(savedCalc);
            if (Array.isArray(files) && files.length > 0) {
                tabState.calc.files = files;
                updateCalcUI();
            }
        }
    } catch(e) { localStorage.removeItem(STORAGE_KEYS.calc); }

    // 初始化资源包 Token
    initPackToken();
    loadPackConfigs();
    loadPackDeductRules();

    // Token 输入框回车触发查询
    const packTokenInput = document.getElementById('packToken');
    if (packTokenInput) {
        packTokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') queryResourcePackList(); });
    }

    // 从本地缓存恢复资源包列表数据
    try {
        const savedPack = localStorage.getItem(STORAGE_KEYS.packList);
        if (savedPack) {
            const parsed = JSON.parse(savedPack);
            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                allPackData = parsed.data;
                const total = parsed.total || allPackData.length;
                console.log('[资源包列表] 从本地缓存恢复', allPackData.length, '条数据，上次更新：', parsed.time || '未知');
                renderPackStats(allPackData, total);
                renderPackTable(allPackData);
                populatePackFilters();
                document.getElementById('packResultArea').style.display = 'block';
                document.getElementById('packEmptyState').style.display = 'none';
            }
        }
    } catch(e) { localStorage.removeItem(STORAGE_KEYS.packList); }

    // 恢复二级 tab
    try {
        const savedSub = localStorage.getItem(STORAGE_KEYS.calcSubTab);
        if (savedSub && document.getElementById('subTab-' + savedSub)) switchCalcSubTab(savedSub);
    } catch(e) {}

    // 恢复一级 tab
    try {
        const savedTab = localStorage.getItem(STORAGE_KEYS.activeTab);
        if (savedTab && document.getElementById('tab-' + savedTab)) switchTab(savedTab);
    } catch(e) {}
}

// DOMContentLoaded 时启动
window.addEventListener('DOMContentLoaded', initApp);
