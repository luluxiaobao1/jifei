// ========== 对账工具 - Tab2 资源包抵扣（UI 控制） ==========

// ========== 上传区域初始化 ==========
function initResourceUpload() {
    const uploadArea = document.getElementById('uploadArea-resource');
    const fileInput = document.getElementById('fileInput-resource');

    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        handleResourceFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        handleResourceFiles(e.target.files);
        fileInput.value = '';
    });
}

// ========== 展开/收起坐标轴设置面板 ==========
function toggleAxisSettings() {
    const body = document.getElementById('axisSettingsBody-resource');
    const arrow = document.getElementById('axisSettingsToggle-resource');
    const collapsed = body.classList.toggle('hidden');
    arrow.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ========== Sheet 选择弹窗 ==========
let _sheetModalResolve = null;

function resolveSheetModal(choice) {
    document.getElementById('sheetModal').classList.add('hidden');
    if (_sheetModalResolve) { _sheetModalResolve(choice); _sheetModalResolve = null; }
}

function askSheetMode(multiSheetFiles) {
    const info = multiSheetFiles.map(f => `「${f.name}」(${f.sheetCount} 个 Sheet)`).join('、');
    document.getElementById('sheetModalInfo').textContent = `以下文件包含多个 Sheet：${info}，请选择分析方式：`;
    document.getElementById('sheetModal').classList.remove('hidden');
    return new Promise(resolve => { _sheetModalResolve = resolve; });
}

// ========== 文件处理 ==========
async function handleResourceFiles(fileList) {
    let validFiles = Array.from(fileList).filter(f => f.name.match(/\.(xlsx|xls|csv)$/i));
    if (validFiles.length === 0) { alert('请选择 Excel 或 CSV 文件'); return; }

    const { ok, oversized } = checkFilesSize(validFiles);
    if (!ok) {
        alertOversized(oversized);
        validFiles = validFiles.filter(f => f.size <= MAX_FILE_SIZE);
        if (validFiles.length === 0) return;
    }

    const hasLarge = validFiles.some(f => f.size > LARGE_FILE_SIZE);
    showLoadingOverlay('正在解析文件，请稍候…', hasLarge ? '文件较大，解析可能需要数秒，请勿关闭页面' : '');
    await nextFrame();

    const parsed = [];
    try {
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            if (validFiles.length > 1) setLoadingSub(`正在处理第 ${i + 1} / ${validFiles.length} 个文件：${file.name}`);
            const data = await readFileAsArrayBuffer(file);
            await nextFrame();
            const wb = XLSX.read(data, { type: 'array', cellNF: true });
            normalizeDateCells(wb);
            parsed.push({ name: file.name, workbook: wb });
        }
        await processParsedFiles(parsed);
    } catch (err) {
        console.error(err);
        alert('文件解析失败：' + (err && err.message ? err.message : err));
    } finally {
        hideLoadingOverlay();
    }
}

async function processParsedFiles(parsed) {
    const multiSheetFiles = parsed.filter(p => p.workbook.SheetNames.length > 1);
    let mode = 'separate';
    if (multiSheetFiles.length > 0) mode = await askSheetMode(multiSheetFiles);

    parsed.forEach(p => {
        const wb = p.workbook, sheetNames = wb.SheetNames;
        if (mode === 'combined' && sheetNames.length > 1) {
            const firstSheet = XLSX.utils.sheet_to_json(wb.Sheets[sheetNames[0]], { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
            if (firstSheet.length < 1) return;
            const headers = firstSheet[0];
            let allRows = firstSheet.slice(1);
            for (let s = 1; s < sheetNames.length; s++) {
                const sd = XLSX.utils.sheet_to_json(wb.Sheets[sheetNames[s]], { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
                if (sd.length > 1) allRows = allRows.concat(sd.slice(1));
            }
            if (allRows.length > 0) tabState.resource.files.push({ name: p.name + '（合并）', headers, rows: allRows });
        } else {
            sheetNames.forEach(sn => {
                const sd = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
                if (sd.length > 1) {
                    tabState.resource.files.push({
                        name: sheetNames.length > 1 ? p.name + ' - ' + sn : p.name,
                        headers: sd[0], rows: sd.slice(1)
                    });
                }
            });
        }
    });
    updateResourceUI();
}

function removeResourceFile(index) {
    tabState.resource.files.splice(index, 1);
    if (tabState.resource.activeFileIndex >= tabState.resource.files.length) {
        tabState.resource.activeFileIndex = Math.max(0, tabState.resource.files.length - 1);
    }
    updateResourceUI();
}

function selectResourceFile(index) {
    if (index < 0 || index >= tabState.resource.files.length) return;
    tabState.resource.activeFileIndex = index;
    renderResourceFileTags();
    if (tabState.resource.chartConfig) {
        updateColumnSelectors();
        applyConfigToSelectors(tabState.resource.chartConfig);
        renderActiveChart();
    } else {
        updateColumnSelectors();
        tabState.resource.trendCharts.forEach(c => c.destroy());
        tabState.resource.trendCharts = [];
        document.getElementById('chartArea-resource').innerHTML = '';
    }
    renderResourcePreview();
}

function renderResourceFileTags() {
    const files = tabState.resource.files;
    const active = tabState.resource.activeFileIndex;
    const tagsContainer = document.getElementById('fileTags-resource');
    tagsContainer.innerHTML = '';
    files.forEach((f, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const isActive = i === active;
        const tag = document.createElement('span');
        tag.className = 'file-tag cursor-pointer transition' + (isActive ? ' file-tag-active' : '');
        tag.onclick = (e) => { if (e.target.tagName !== 'BUTTON') selectResourceFile(i); };
        tag.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
            <span class="${isActive ? 'text-blue-600 font-semibold' : 'text-gray-700'}">${f.name}</span>
            <span class="text-gray-400 text-xs">(${f.rows.length}行)</span>
            <button onclick="removeResourceFile(${i})" class="text-gray-400 hover:text-red-500 ml-1 font-bold">&times;</button>
        `;
        tagsContainer.appendChild(tag);
    });
}

function updateResourceUI() {
    const files = tabState.resource.files;
    const hasFiles = files.length > 0;

    try {
        if (hasFiles) saveFilesToStorage(STORAGE_KEYS.resource, files);
        else localStorage.removeItem(STORAGE_KEYS.resource);
    } catch(e) { console.warn('资源包数据过大，无法保存到本地存储'); }

    if (tabState.resource.activeFileIndex >= files.length) tabState.resource.activeFileIndex = 0;

    document.getElementById('uploadArea-resource').classList.toggle('hidden', hasFiles);
    document.getElementById('fileList-resource').classList.toggle('hidden', !hasFiles);
    renderResourceFileTags();

    document.getElementById('columnSelector-resource').classList.toggle('hidden', !hasFiles);
    if (hasFiles) updateColumnSelectors();

    tabState.resource.chartConfig = null;
    tabState.resource.trendCharts.forEach(c => c.destroy());
    tabState.resource.trendCharts = [];
    document.getElementById('chartArea-resource').innerHTML = '';
    document.getElementById('previewArea-resource').innerHTML = '';
    if (hasFiles) renderResourcePreview();
}

// ========== 坐标轴选择器 ==========
function updateColumnSelectors() {
    const files = tabState.resource.files;
    if (files.length === 0) return;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    const headers = activeFile.headers;

    const xSelect = document.getElementById('xAxis-resource');
    xSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    headers.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = h || `列${i + 1}`;
        xSelect.appendChild(opt);
    });

    dimColsState = [];
    dimValueFilters = {};
    dimValueExpanded = new Set();
    renderDimColPanel();
    updateDimColToggleText();
    _syncDimValueDropdown();

    const yContainer = document.getElementById('yAxis-resource');
    yContainer.innerHTML = '';
    headers.forEach((h, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'py-1';
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 rounded';
        label.innerHTML = `<input type="checkbox" value="${i}" class="y-col-checkbox rounded text-blue-500" data-col="${i}" onchange="onYColCheckboxChange(${i}, this.checked)">
            <span class="font-medium text-sm">${h || `列${i + 1}`}</span>
            <label class="flex items-center gap-1 text-xs text-gray-400 ml-auto cursor-pointer" title="将该列绘制到右侧次坐标轴" onclick="event.stopPropagation()">
                <input type="checkbox" class="y-secondary-checkbox rounded text-amber-500" data-col="${i}"> 次坐标
            </label>`;
        wrapper.appendChild(label);
        const valWrap = document.createElement('div');
        valWrap.id = 'yValueDropdown-' + i + '-resource';
        valWrap.className = 'relative mt-1 ml-6 hidden';
        valWrap.setAttribute('onclick', 'event.stopPropagation()');
        valWrap.innerHTML = `<button type="button" onclick="toggleYValuePanel(${i})" class="bi-select w-full flex items-center justify-between text-left" style="padding-top:4px;padding-bottom:4px;">
                <span id="yValueToggleText-${i}-resource" class="truncate text-gray-500 text-xs">全部取值</span>
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="yValuePanel-${i}-resource" onclick="event.stopPropagation()" class="hidden absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2"></div>`;
        wrapper.appendChild(valWrap);
        yContainer.appendChild(wrapper);
    });

    yValueFilters = {};
    axisValueFilters = { x: { colIdx: null, explicit: false, checked: new Set() } };
    ['x', 'dim'].forEach(axis => {
        const dd = document.getElementById(axis + 'ValueDropdown-resource');
        const panel = document.getElementById(axis + 'ValuePanel-resource');
        if (dd) dd.classList.add('hidden');
        if (panel) panel.classList.add('hidden');
    });

    resourceFilterFields = [];
    resourceFilterExpanded = new Set();
    renderFilterPanel();
    updateFilterToggleText();
    updateFilterSummary();
}

// ========== 取值面板通用工具 ==========
let axisValueFilters = { x: { colIdx: null, explicit: false, checked: new Set() } };
let yValueFilters = {};

function filterValueItems(inputEl) {
    const kw = (inputEl.value || '').trim().toLowerCase();
    let list = inputEl.nextElementSibling;
    if (!list || !list.hasAttribute('data-value-list')) {
        list = inputEl.parentElement ? inputEl.parentElement.querySelector('[data-value-list]') : null;
    }
    if (!list) return;
    list.querySelectorAll('[data-search]').forEach(item => {
        const txt = item.getAttribute('data-search') || '';
        item.classList.toggle('hidden', kw !== '' && txt.indexOf(kw) === -1);
    });
}

function _getPanelKeyword(panelEl) {
    if (!panelEl) return '';
    const input = panelEl.querySelector('input[placeholder="搜索取值…"]');
    return input ? (input.value || '').trim().toLowerCase() : '';
}

function _visibleValsByKeyword(allVals, kw) {
    if (!kw) return allVals.slice();
    return allVals.filter(v => String(v).toLowerCase().indexOf(kw) !== -1);
}

function _restorePanelKeyword(panelEl, kw) {
    if (!panelEl || !kw) return;
    const input = panelEl.querySelector('input[placeholder="搜索取值…"]');
    if (!input) return;
    input.value = kw;
    filterValueItems(input);
}

// ========== Y 轴取值筛选 ==========
function onYColCheckboxChange(colIdx, checked) {
    const dd = document.getElementById('yValueDropdown-' + colIdx + '-resource');
    if (dd) dd.classList.toggle('hidden', !checked);
    if (checked) {
        if (!yValueFilters[colIdx]) yValueFilters[colIdx] = { explicit: false, checked: new Set() };
        renderYValuePanel(colIdx);
        updateYValueToggleText(colIdx);
    } else {
        const panel = document.getElementById('yValuePanel-' + colIdx + '-resource');
        if (panel) panel.classList.add('hidden');
    }
}

function toggleYValuePanel(colIdx) {
    const panel = document.getElementById('yValuePanel-' + colIdx + '-resource');
    if (!panel) return;
    if (panel.classList.contains('hidden')) renderYValuePanel(colIdx);
    panel.classList.toggle('hidden');
}

function renderYValuePanel(colIdx) {
    const panel = document.getElementById('yValuePanel-' + colIdx + '-resource');
    if (!panel) return;
    if (!yValueFilters[colIdx]) yValueFilters[colIdx] = { explicit: false, checked: new Set() };
    const state = yValueFilters[colIdx];
    const vals = _collectColumnValues(colIdx);
    if (vals.length === 0) {
        panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">该列无可选取值。</p>';
        return;
    }
    const allSelected = !state.explicit || state.checked.size === vals.length;
    const toggleLabel = allSelected ? '取消全选' : '全选';
    let html = `<div class="flex items-center justify-between px-1 pb-1 mb-1 border-b border-gray-100">
        <span class="text-xs font-semibold text-gray-500">勾选要绘制的取值</span>
        <button type="button" onclick="toggleYSelectAll(${colIdx})" class="text-xs text-blue-500 hover:text-blue-700">${toggleLabel}</button>
    </div>
    <input type="text" placeholder="搜索取值…" oninput="filterValueItems(this)" class="w-full mb-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300">
    <div data-value-list class="flex flex-col gap-0.5">`;
    vals.forEach(val => {
        const safe = String(val).replace(/"/g, '&quot;');
        const checked = !state.explicit || state.checked.has(val);
        html += `<label data-search="${String(val).toLowerCase().replace(/"/g, '&quot;')}" class="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 hover:bg-gray-100 rounded px-1 py-0.5">
            <input type="checkbox" class="rounded text-blue-500" ${checked ? 'checked' : ''} onchange="onYValueChange(${colIdx}, &quot;${safe}&quot;, this.checked)">
            <span class="truncate" title="${safe}">${val}</span>
        </label>`;
    });
    html += `</div>`;
    panel.innerHTML = html;
}

function updateYValueToggleText(colIdx) {
    const el = document.getElementById('yValueToggleText-' + colIdx + '-resource');
    const state = yValueFilters[colIdx];
    if (!el) return;
    if (!state || !state.explicit) {
        el.textContent = '全部取值';
        el.className = 'truncate text-gray-500 text-xs';
    } else {
        el.textContent = `已选 ${state.checked.size} 项`;
        el.className = 'truncate text-gray-700 text-xs';
    }
}

function onYValueChange(colIdx, val, checked) {
    if (!yValueFilters[colIdx]) yValueFilters[colIdx] = { explicit: false, checked: new Set() };
    const state = yValueFilters[colIdx];
    const allVals = _collectColumnValues(colIdx);
    if (!state.explicit) { state.explicit = true; state.checked = new Set(allVals); }
    if (checked) state.checked.add(val); else state.checked.delete(val);
    updateYValueToggleText(colIdx);
}

function toggleYSelectAll(colIdx) {
    if (!yValueFilters[colIdx]) yValueFilters[colIdx] = { explicit: false, checked: new Set() };
    const state = yValueFilters[colIdx];
    const vals = _collectColumnValues(colIdx);
    const panel = document.getElementById('yValuePanel-' + colIdx + '-resource');
    const kw = _getPanelKeyword(panel);
    if (kw) {
        const visible = _visibleValsByKeyword(vals, kw);
        if (!state.explicit) state.checked = new Set(vals);
        state.explicit = true;
        const allVisibleChecked = visible.every(v => state.checked.has(v));
        if (allVisibleChecked) visible.forEach(v => state.checked.delete(v));
        else visible.forEach(v => state.checked.add(v));
    } else {
        const allSelected = !state.explicit || state.checked.size === vals.length;
        if (allSelected) { state.explicit = true; state.checked = new Set(); }
        else { state.explicit = false; state.checked = new Set(); }
    }
    renderYValuePanel(colIdx);
    _restorePanelKeyword(document.getElementById('yValuePanel-' + colIdx + '-resource'), kw);
    updateYValueToggleText(colIdx);
}

// ========== 维度列（多列） ==========
let dimColsState = [];
let dimValueFilters = {};
let dimValueExpanded = new Set();

function renderDimColPanel() {
    const panel = document.getElementById('dimColPanel-resource');
    if (!panel) return;
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) { panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">请先上传文件</p>'; return; }
    const headers = activeFile.headers;
    let html = '<div class="flex flex-col gap-0.5">';
    headers.forEach((h, i) => {
        const checked = dimColsState.indexOf(i) !== -1 ? 'checked' : '';
        html += `<label class="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:bg-gray-100 rounded px-2 py-1">
            <input type="checkbox" class="dim-col-checkbox rounded text-blue-500" value="${i}" ${checked} onchange="onDimColChange(${i}, this.checked)">
            <span class="truncate" title="${(h || ('列' + (i + 1))).replace(/"/g, '&quot;')}">${h || ('列' + (i + 1))}</span>
        </label>`;
    });
    html += '</div>';
    panel.innerHTML = html;
}

function toggleDimColPanel() {
    const panel = document.getElementById('dimColPanel-resource');
    if (panel) panel.classList.toggle('hidden');
}

function onDimColChange(colIdx, checked) {
    if (checked) { if (dimColsState.indexOf(colIdx) === -1) dimColsState.push(colIdx); }
    else {
        dimColsState = dimColsState.filter(i => i !== colIdx);
        delete dimValueFilters[colIdx];
        dimValueExpanded.delete(colIdx);
    }
    updateDimColToggleText();
    _syncDimValueDropdown();
}

function updateDimColToggleText() {
    const el = document.getElementById('dimColToggleText-resource');
    if (!el) return;
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile || dimColsState.length === 0) {
        el.textContent = '-- 不分维度 --';
        el.className = 'truncate text-gray-500';
        return;
    }
    const names = dimColsState.map(i => activeFile.headers[i] || ('列' + (i + 1)));
    el.textContent = names.join(DIM_SEP);
    el.className = 'truncate text-gray-700';
}

function _getDimValueField(colIdx) {
    if (!dimValueFilters[colIdx]) dimValueFilters[colIdx] = { explicit: false, checked: new Set() };
    return dimValueFilters[colIdx];
}

function _syncDimValueDropdown() {
    const dd = document.getElementById('dimValueDropdown-resource');
    const panel = document.getElementById('dimValuePanel-resource');
    Object.keys(dimValueFilters).forEach(k => {
        if (dimColsState.indexOf(parseInt(k)) === -1) delete dimValueFilters[k];
    });
    Array.from(dimValueExpanded).forEach(k => { if (dimColsState.indexOf(k) === -1) dimValueExpanded.delete(k); });
    if (dimColsState.length === 0) {
        if (dd) dd.classList.add('hidden');
        if (panel) panel.classList.add('hidden');
        updateDimValueToggleText();
        return;
    }
    if (dd) dd.classList.remove('hidden');
    renderDimValuePanel();
    updateDimValueToggleText();
}

function toggleDimValuePanel() {
    const panel = document.getElementById('dimValuePanel-resource');
    if (panel) panel.classList.toggle('hidden');
}

function renderDimValuePanel() {
    const panel = document.getElementById('dimValuePanel-resource');
    if (!panel) return;
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile || dimColsState.length === 0) {
        panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">请先勾选维度列。</p>';
        return;
    }
    let html = '';
    dimColsState.forEach(colIdx => {
        const name = activeFile.headers[colIdx] || ('列' + (colIdx + 1));
        const vals = _collectColumnValues(colIdx);
        const ff = dimValueFilters[colIdx];
        const colActive = ff && ff.explicit;
        const expanded = dimValueExpanded.has(colIdx);
        const badge = colActive ? `<span class="ml-1 text-xs text-blue-600">(${ff.checked.size})</span>` : '';
        html += `<div class="border-b border-gray-50 last:border-0">
            <button type="button" onclick="toggleDimValueColumn(${colIdx})" class="w-full flex items-center justify-between text-left px-1 py-1 hover:bg-gray-50 rounded">
                <span class="text-xs font-medium ${colActive ? 'text-blue-700' : 'text-gray-700'} truncate" title="${name.replace(/"/g, '&quot;')}">${name}${badge}</span>
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform" style="transform:rotate(${expanded ? 180 : 0}deg)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>`;
        if (expanded) {
            if (vals.length === 0) {
                html += `<div class="pl-3 pr-1 pb-1"><p class="text-gray-400 text-xs py-1">该列无可选取值。</p></div>`;
            } else {
                const allSelected = !colActive || ff.checked.size === vals.length;
                const toggleLabel = allSelected ? '取消全选' : '全选';
                html += `<div class="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                    <div class="flex items-center justify-end pb-0.5">
                        <button type="button" onclick="toggleDimValueColumnSelectAll(${colIdx})" class="text-xs text-blue-500 hover:text-blue-700">${toggleLabel}</button>
                    </div>
                    <input type="text" data-dimcol="${colIdx}" placeholder="搜索取值…" oninput="filterValueItems(this)" class="w-full mb-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300">
                    <div data-value-list class="flex flex-col gap-0.5">`;
                vals.forEach(val => {
                    const safe = String(val).replace(/"/g, '&quot;');
                    const checked = !colActive || ff.checked.has(val);
                    html += `<label data-search="${String(val).toLowerCase().replace(/"/g, '&quot;')}" class="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 hover:bg-gray-100 rounded px-1 py-0.5">
                        <input type="checkbox" class="rounded text-blue-500" ${checked ? 'checked' : ''} onchange="onDimValueChange(${colIdx}, &quot;${safe}&quot;, this.checked)">
                        <span class="truncate" title="${safe}">${val}</span>
                    </label>`;
                });
                html += `</div></div>`;
            }
        }
        html += `</div>`;
    });
    panel.innerHTML = html;
}

function toggleDimValueColumn(colIdx) {
    if (dimValueExpanded.has(colIdx)) dimValueExpanded.delete(colIdx);
    else dimValueExpanded.add(colIdx);
    renderDimValuePanel();
}

function updateDimValueToggleText() {
    const el = document.getElementById('dimValueToggleText-resource');
    if (!el) return;
    const active = dimColsState.filter(ci => dimValueFilters[ci] && dimValueFilters[ci].explicit);
    if (active.length === 0) {
        el.textContent = '全部取值';
        el.className = 'truncate text-gray-500';
    } else {
        el.textContent = `已筛选 ${active.length} 列`;
        el.className = 'truncate text-gray-700';
    }
}

function onDimValueChange(colIdx, val, checked) {
    const ff = _getDimValueField(colIdx);
    const allVals = _collectColumnValues(colIdx);
    if (!ff.explicit) { ff.explicit = true; ff.checked = new Set(allVals); }
    if (checked) ff.checked.add(val); else ff.checked.delete(val);
    renderDimValuePanel();
    updateDimValueToggleText();
}

function toggleDimValueColumnSelectAll(colIdx) {
    const ff = _getDimValueField(colIdx);
    const vals = _collectColumnValues(colIdx);
    const panel = document.getElementById('dimValuePanel-resource');
    const searchInput = panel ? panel.querySelector('input[data-dimcol="' + colIdx + '"]') : null;
    const kw = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    if (kw) {
        const visible = _visibleValsByKeyword(vals, kw);
        if (!ff.explicit) ff.checked = new Set(vals);
        ff.explicit = true;
        const allVisibleChecked = visible.every(v => ff.checked.has(v));
        if (allVisibleChecked) visible.forEach(v => ff.checked.delete(v));
        else visible.forEach(v => ff.checked.add(v));
    } else {
        const allSelected = !ff.explicit || ff.checked.size === vals.length;
        if (allSelected) { ff.explicit = true; ff.checked = new Set(); }
        else { ff.explicit = false; ff.checked = new Set(); }
    }
    renderDimValuePanel();
    if (kw) {
        const newPanel = document.getElementById('dimValuePanel-resource');
        const newInput = newPanel ? newPanel.querySelector('input[data-dimcol="' + colIdx + '"]') : null;
        if (newInput) { newInput.value = kw; filterValueItems(newInput); }
    }
    updateDimValueToggleText();
}

// ========== X 轴取值筛选 ==========
function onAxisColumnChange(axis) {
    if (axis === 'dim') { _syncDimValueDropdown(); return; }
    const sel = document.getElementById('xAxis-resource');
    const dd = document.getElementById(axis + 'ValueDropdown-resource');
    const panel = document.getElementById(axis + 'ValuePanel-resource');
    if (!sel || !dd || !panel) return;
    const val = sel.value;
    if (val === '') {
        axisValueFilters[axis] = { colIdx: null, checked: new Set() };
        dd.classList.add('hidden');
        panel.classList.add('hidden');
        return;
    }
    axisValueFilters[axis] = { colIdx: parseInt(val), explicit: false, checked: new Set() };
    dd.classList.remove('hidden');
    panel.classList.add('hidden');
    renderAxisValuePanel(axis);
    updateAxisValueToggleText(axis);
}

function toggleAxisValuePanel(axis) {
    const panel = document.getElementById(axis + 'ValuePanel-resource');
    if (!panel) return;
    panel.classList.toggle('hidden');
}

function _axisVals(axis) {
    const state = axisValueFilters[axis];
    return state && state.colIdx !== null ? _collectColumnValues(state.colIdx) : [];
}

function renderAxisValuePanel(axis) {
    const panel = document.getElementById(axis + 'ValuePanel-resource');
    const state = axisValueFilters[axis];
    if (!panel || !state || state.colIdx === null) return;
    const vals = _axisVals(axis);
    if (vals.length === 0) {
        panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">该列无可选取值。</p>';
        return;
    }
    const allSelected = !state.explicit || state.checked.size === vals.length;
    const toggleLabel = allSelected ? '取消全选' : '全选';
    let html = `<div class="flex items-center justify-between px-1 pb-1 mb-1 border-b border-gray-100">
        <span class="text-xs font-semibold text-gray-500">勾选要绘制的取值</span>
        <button type="button" onclick="toggleAxisSelectAll('${axis}')" class="text-xs text-blue-500 hover:text-blue-700">${toggleLabel}</button>
    </div>
    <input type="text" placeholder="搜索取值…" oninput="filterValueItems(this)" class="w-full mb-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300">
    <div data-value-list class="flex flex-col gap-0.5">`;
    vals.forEach(val => {
        const safe = String(val).replace(/"/g, '&quot;');
        const checked = !state.explicit || state.checked.has(val);
        html += `<label data-search="${String(val).toLowerCase().replace(/"/g, '&quot;')}" class="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 hover:bg-gray-100 rounded px-1 py-0.5">
            <input type="checkbox" class="rounded text-blue-500" ${checked ? 'checked' : ''} onchange="onAxisValueChange('${axis}', &quot;${safe}&quot;, this.checked)">
            <span class="truncate" title="${safe}">${val}</span>
        </label>`;
    });
    html += `</div>`;
    panel.innerHTML = html;
}

function updateAxisValueToggleText(axis) {
    const el = document.getElementById(axis + 'ValueToggleText-resource');
    const state = axisValueFilters[axis];
    if (!el) return;
    if (!state || state.colIdx === null || !state.explicit) {
        el.textContent = '全部取值';
        el.className = 'truncate text-gray-500';
    } else {
        el.textContent = `已选 ${state.checked.size} 项`;
        el.className = 'truncate text-gray-700';
    }
}

function onAxisValueChange(axis, val, checked) {
    const state = axisValueFilters[axis];
    if (!state || state.colIdx === null) return;
    const allVals = _axisVals(axis);
    if (!state.explicit) { state.explicit = true; state.checked = new Set(allVals); }
    if (checked) state.checked.add(val); else state.checked.delete(val);
    updateAxisValueToggleText(axis);
}

function toggleAxisSelectAll(axis) {
    const state = axisValueFilters[axis];
    if (!state || state.colIdx === null) return;
    const vals = _axisVals(axis);
    const panel = document.getElementById(axis + 'ValuePanel-resource');
    const kw = _getPanelKeyword(panel);
    if (kw) {
        const visible = _visibleValsByKeyword(vals, kw);
        if (!state.explicit) state.checked = new Set(vals);
        state.explicit = true;
        const allVisibleChecked = visible.every(v => state.checked.has(v));
        if (allVisibleChecked) visible.forEach(v => state.checked.delete(v));
        else visible.forEach(v => state.checked.add(v));
    } else {
        const allSelected = !state.explicit || state.checked.size === vals.length;
        if (allSelected) { state.explicit = true; state.checked = new Set(); }
        else { state.explicit = false; state.checked = new Set(); }
    }
    renderAxisValuePanel(axis);
    _restorePanelKeyword(document.getElementById(axis + 'ValuePanel-resource'), kw);
    updateAxisValueToggleText(axis);
}

// ========== 数据筛选 ==========
let resourceFilterFields = [];
let resourceFilterExpanded = new Set();

function _getFilterField(colIdx, name) {
    let ff = resourceFilterFields.find(f => f.colIdx === colIdx);
    if (!ff) {
        ff = { colIdx, name, explicit: false, checked: new Set() };
        resourceFilterFields.push(ff);
    }
    return ff;
}

function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel-resource');
    if (!panel) return;
    panel.classList.toggle('hidden');
}

function renderFilterPanel() {
    const panel = document.getElementById('filterPanel-resource');
    if (!panel) return;
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) { panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">请先上传文件。</p>'; return; }

    const cols = [];
    activeFile.headers.forEach((h, i) => {
        const vals = _collectColumnValues(i);
        if (vals.length === 0 || vals.length > 200) return;
        cols.push({ colIdx: i, name: h || ('列' + (i + 1)), vals });
    });
    if (cols.length === 0) { panel.innerHTML = '<p class="text-gray-400 text-xs px-1 py-2">没有可筛选的列。</p>'; return; }

    let html = '';
    cols.forEach(col => {
        const ff = resourceFilterFields.find(f => f.colIdx === col.colIdx);
        const colActive = ff && ff.explicit;
        const expanded = resourceFilterExpanded.has(col.colIdx);
        const badge = colActive ? `<span class="ml-1 text-xs text-blue-600">(${ff.checked.size})</span>` : '';
        html += `<div class="border-b border-gray-50 last:border-0">
            <button type="button" onclick="toggleFilterColumn(${col.colIdx})" class="w-full flex items-center justify-between text-left px-1 py-1 hover:bg-gray-50 rounded">
                <span class="text-xs font-medium ${colActive ? 'text-blue-700' : 'text-gray-700'} truncate" title="${col.name}">${col.name}${badge}</span>
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform" style="transform:rotate(${expanded ? 180 : 0}deg)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>`;
        if (expanded) {
            const allSelected = !colActive || ff.checked.size === col.vals.length;
            const toggleLabel = allSelected ? '取消全选' : '全选';
            html += `<div class="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                <div class="flex items-center justify-end pb-0.5">
                    <button type="button" onclick="toggleFilterColumnSelectAll(${col.colIdx})" class="text-xs text-blue-500 hover:text-blue-700">${toggleLabel}</button>
                </div>
                <input type="text" data-col="${col.colIdx}" placeholder="搜索取值…" oninput="filterValueItems(this)" class="w-full mb-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300">
                <div data-value-list class="flex flex-col gap-0.5">`;
            col.vals.forEach(val => {
                const safe = String(val).replace(/"/g, '&quot;');
                const checked = !colActive || ff.checked.has(val);
                html += `<label data-search="${String(val).toLowerCase().replace(/"/g, '&quot;')}" class="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 hover:bg-gray-100 rounded px-1 py-0.5">
                    <input type="checkbox" class="rounded text-blue-500" ${checked ? 'checked' : ''} onchange="onFilterValueChange(${col.colIdx}, &quot;${safe}&quot;, this.checked)">
                    <span class="truncate" title="${safe}">${val}</span>
                </label>`;
            });
            html += `</div></div>`;
        }
        html += `</div>`;
    });
    panel.innerHTML = html;
}

function toggleFilterColumn(colIdx) {
    if (resourceFilterExpanded.has(colIdx)) resourceFilterExpanded.delete(colIdx);
    else resourceFilterExpanded.add(colIdx);
    renderFilterPanel();
}

function updateFilterToggleText() {
    const el = document.getElementById('filterToggleText-resource');
    if (!el) return;
    const active = resourceFilterFields.filter(f => f.explicit);
    if (active.length === 0) {
        el.textContent = '全部数据（未筛选）';
        el.className = 'truncate text-gray-500';
    } else {
        el.textContent = `已筛选 ${active.length} 列`;
        el.className = 'truncate text-gray-700';
    }
}

function updateFilterSummary() {
    const el = document.getElementById('filterSummary-resource');
    if (!el) return;
    const active = resourceFilterFields.filter(f => f.explicit);
    if (active.length === 0) {
        el.textContent = '点击展开后可勾选多个列，每列再展开多选要保留的取值；某列未勾选任何值则不限制该列。';
        el.className = 'text-xs text-gray-400 mt-1 leading-relaxed';
        return;
    }
    const parts = active.map(f => `${f.name}(${f.checked.size})`);
    el.textContent = '已筛选：' + parts.join('、');
    el.className = 'text-xs text-blue-600 mt-1 leading-relaxed';
}

function onFilterValueChange(colIdx, val, checked) {
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return;
    const name = activeFile.headers[colIdx] || ('列' + (colIdx + 1));
    const ff = _getFilterField(colIdx, name);
    const allVals = _collectColumnValues(colIdx);
    if (!ff.explicit) { ff.explicit = true; ff.checked = new Set(allVals); }
    if (checked) ff.checked.add(val); else ff.checked.delete(val);
    renderFilterPanel();
    updateFilterToggleText();
    updateFilterSummary();
}

function toggleFilterColumnSelectAll(colIdx) {
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return;
    const name = activeFile.headers[colIdx] || ('列' + (colIdx + 1));
    const ff = _getFilterField(colIdx, name);
    const vals = _collectColumnValues(colIdx);
    const panel = document.getElementById('filterPanel-resource');
    const searchInput = panel ? panel.querySelector('input[data-col="' + colIdx + '"]') : null;
    const kw = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    if (kw) {
        const visible = _visibleValsByKeyword(vals, kw);
        if (!ff.explicit) ff.checked = new Set(vals);
        ff.explicit = true;
        const allVisibleChecked = visible.every(v => ff.checked.has(v));
        if (allVisibleChecked) visible.forEach(v => ff.checked.delete(v));
        else visible.forEach(v => ff.checked.add(v));
    } else {
        const allSelected = !ff.explicit || ff.checked.size === vals.length;
        if (allSelected) { ff.explicit = true; ff.checked = new Set(); }
        else { ff.explicit = false; ff.checked = new Set(); }
    }
    renderFilterPanel();
    if (kw) {
        const newPanel = document.getElementById('filterPanel-resource');
        const newInput = newPanel ? newPanel.querySelector('input[data-col="' + colIdx + '"]') : null;
        if (newInput) { newInput.value = kw; filterValueItems(newInput); }
    }
    updateFilterToggleText();
    updateFilterSummary();
}

// ========== 配置回填 ==========
function applyConfigToSelectors(cfg) {
    const curFile = tabState.resource.files[tabState.resource.activeFileIndex];
    if (!curFile || !cfg) return;
    const curHeaders = curFile.headers;
    const mapIdx = (baseIdx) => {
        const name = cfg.headers[baseIdx];
        return curHeaders.indexOf(name);
    };

    // X 轴
    const xSelect = document.getElementById('xAxis-resource');
    const curXIdx = mapIdx(cfg.xBase);
    if (curXIdx !== -1) xSelect.value = String(curXIdx);
    onAxisColumnChange('x');

    // 维度列
    dimColsState = [];
    (cfg.dimCols || []).forEach(name => {
        const idx = curHeaders.indexOf(name);
        if (idx !== -1 && dimColsState.indexOf(idx) === -1) dimColsState.push(idx);
    });
    dimValueFilters = {};
    dimValueExpanded = new Set();
    dimColsState.forEach(colIdx => {
        const colName = curHeaders[colIdx];
        const saved = (cfg.dimFilters || []).find(a => a.name === colName);
        if (saved && saved.values && saved.values.length > 0) {
            const vals = saved.values.filter(v => v !== '\u0000__NONE__');
            dimValueFilters[colIdx] = { explicit: true, checked: new Set(vals) };
        }
    });
    renderDimColPanel();
    updateDimColToggleText();
    _syncDimValueDropdown();

    // X 轴取值筛选
    ['x'].forEach(axis => {
        const state = axisValueFilters[axis];
        if (!state || state.colIdx === null) return;
        const colName = curHeaders[state.colIdx];
        const saved = (cfg.axisFilters || []).find(a => a.name === colName);
        if (saved && saved.values && saved.values.length > 0) {
            const vals = saved.values.filter(v => v !== '\u0000__NONE__');
            state.explicit = true;
            state.checked = new Set(vals);
            renderAxisValuePanel(axis);
            updateAxisValueToggleText(axis);
        }
    });

    // Y 列 + 次坐标
    yValueFilters = {};
    const curSecondaryIdxs = new Set(Array.from(cfg.secondaryCols || []).map(mapIdx).filter(i => i !== -1));
    cfg.yColIdxs.forEach(baseY => {
        const curY = mapIdx(baseY);
        if (curY === -1) return;
        const yCb = document.querySelector(`.y-col-checkbox[value="${curY}"]`);
        if (yCb) {
            yCb.checked = true;
            onYColCheckboxChange(curY, true);
        }
        if (curSecondaryIdxs.has(curY)) {
            const secCb = document.querySelector(`.y-secondary-checkbox[data-col="${curY}"]`);
            if (secCb) secCb.checked = true;
        }
        const colName = curHeaders[curY];
        const savedY = (cfg.yFilters || []).find(a => a.name === colName);
        if (savedY && savedY.values && savedY.values.length > 0) {
            yValueFilters[curY] = { explicit: true, checked: new Set(savedY.values) };
            renderYValuePanel(curY);
            updateYValueToggleText(curY);
        }
    });

    // 数据筛选
    resourceFilterFields = [];
    (cfg.filters || []).forEach(flt => {
        const curIdx = curHeaders.indexOf(flt.name);
        if (curIdx === -1) return;
        const vals = (flt.values || []).filter(v => v !== '\u0000__NONE__');
        resourceFilterFields.push({ colIdx: curIdx, name: flt.name, explicit: true, checked: new Set(vals) });
    });
    resourceFilterExpanded = new Set();
    renderFilterPanel();
    updateFilterToggleText();
    updateFilterSummary();

    // 显示选项
    document.getElementById('optShowLegend-resource').checked = !!cfg.showLegend;
    document.getElementById('optShowDataLabels-resource').checked = !!cfg.showDataLabels;
    document.getElementById('optMirrorNegative-resource').checked = !!cfg.mirrorNegative;
    document.getElementById('chartType-resource').value = cfg.chartType || 'line';
}

// ========== 对比曲线弹框 ==========
function openCompareModal() {
    const cfg = tabState.resource.chartConfig;
    const baseLabels = tabState.resource._lastBaseLabels || [];
    if (!cfg) return;
    if (baseLabels.length < 2) {
        alert('至少需要 2 条曲线才能做对比，请先在坐标轴设置中选择多个 Y 列或维度。');
        return;
    }
    fillCompareSelects(baseLabels);
    renderCompareList();
    document.getElementById('compareModal').classList.remove('hidden');
}

function closeCompareModal() {
    document.getElementById('compareModal').classList.add('hidden');
}

function fillCompareSelects(baseLabels) {
    const selA = document.getElementById('compareSelA');
    const selB = document.getElementById('compareSelB');
    const optionsHtml = baseLabels.map(l => `<option value="${l.replace(/"/g, '&quot;')}">${l}</option>`).join('');
    selA.innerHTML = optionsHtml;
    selB.innerHTML = optionsHtml;
    if (baseLabels.length >= 2) selB.selectedIndex = 1;
}

function addCompareItem() {
    const cfg = tabState.resource.chartConfig;
    if (!cfg) return;
    const a = document.getElementById('compareSelA').value;
    const b = document.getElementById('compareSelB').value;
    const op = document.getElementById('compareOp').value;
    if (!a || !b) return;
    if (a === b && op !== '-' && op !== '+') {
        if (!confirm('曲线 A 与 B 相同，确定要继续吗？')) return;
    }
    if (!cfg.compares) cfg.compares = [];
    const exists = cfg.compares.some(c => c.a === a && c.b === b && c.op === op);
    if (exists) { alert('该对比已存在'); return; }
    cfg.compares.push({ a, b, op });
    renderActiveChart();
    renderCompareList();
}

function removeCompareItem(idx) {
    const cfg = tabState.resource.chartConfig;
    if (!cfg || !cfg.compares) return;
    cfg.compares.splice(idx, 1);
    renderActiveChart();
    renderCompareList();
}

function renderCompareList() {
    const cfg = tabState.resource.chartConfig;
    const box = document.getElementById('compareList');
    const compares = (cfg && cfg.compares) || [];
    if (compares.length === 0) {
        box.innerHTML = '<p class="text-gray-400 text-xs py-1">暂无对比曲线</p>';
        return;
    }
    const opSymMap = { '/': '÷', '-': '−', '+': '＋', '*': '×' };
    box.innerHTML = compares.map((c, i) => {
        const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
        return `<div class="flex items-center gap-2 py-1">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
            <span class="flex-1 truncate" title="${c.a} ${opSymMap[c.op] || c.op} ${c.b}">${c.a} <b class="text-amber-600">${opSymMap[c.op] || c.op}</b> ${c.b}</span>
            <button onclick="removeCompareItem(${i})" class="text-gray-400 hover:text-red-500 font-bold px-1">&times;</button>
        </div>`;
    }).join('');
}

// ========== 数据预览 ==========
function renderResourcePreview() {
    const files = tabState.resource.files;
    const previewArea = document.getElementById('previewArea-resource');
    previewArea.innerHTML = '';
    if (files.length === 0) return;

    try {
        const fi = tabState.resource.activeFileIndex;
        const f = files[fi] || files[0];
        const color = CHART_COLORS[fi % CHART_COLORS.length];
        const totalRows = f.rows.length;
        const truncated = totalRows > PREVIEW_MAX_ROWS;
        const renderRows = truncated ? f.rows.slice(0, PREVIEW_MAX_ROWS) : f.rows;

        const wrapper = document.createElement('div');
        wrapper.className = 'bi-card mb-4';
        wrapper.innerHTML = `
            <button onclick="togglePreview(this)" class="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition rounded-lg">
                <h4 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span>
                    ${escapeHtml(f.name)}
                    <span class="text-xs font-normal text-gray-400">(${totalRows} 行 × ${f.headers.length} 列)</span>
                </h4>
                <span class="preview-arrow text-gray-400 text-sm transition-transform duration-300">▶</span>
            </button>
            <div class="preview-content hidden px-5 pb-4">
                ${truncated ? `<p class="text-xs text-amber-600 mb-2">⚠️ 数据量较大，预览仅显示前 ${PREVIEW_MAX_ROWS} 行（共 ${totalRows} 行）。完整数据已加载，图表与计算均基于全部数据。</p>` : ''}
                <div class="preview-table-wrap border rounded">
                    <table></table>
                </div>
            </div>`;
        previewArea.appendChild(wrapper);

        const table = wrapper.querySelector('table');
        let html = '<thead><tr>';
        f.headers.forEach(h => { html += `<th>${escapeHtml(h || '-')}</th>`; });
        html += '</tr></thead><tbody>';
        renderRows.forEach(row => {
            html += '<tr>';
            f.headers.forEach((h, ci) => {
                const rawVal = row[ci] !== undefined && row[ci] !== null ? row[ci] : '';
                const val = formatCellValue(rawVal);
                const isNum = typeof rawVal === 'number' || (typeof rawVal === 'string' && rawVal !== '' && !isNaN(rawVal));
                html += `<td class="${isNum ? 'num' : 'txt'}">${escapeHtml(val)}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        table.innerHTML = html;
    } catch (err) {
        console.error('数据预览渲染失败：', err);
        previewArea.innerHTML = '<div class="bi-card px-5 py-4 text-sm text-red-500">数据预览渲染失败（数据量过大或格式异常），但不影响图表绘制与计算。</div>';
    }
}

// ========== 重置资源包抵扣 ==========
function resetResource() {
    localStorage.removeItem(STORAGE_KEYS.resource);
    tabState.resource.files = [];
    tabState.resource.activeFileIndex = 0;
    tabState.resource.chartConfig = null;
    tabState.resource.trendCharts.forEach(c => c.destroy());
    tabState.resource.trendCharts = [];
    document.getElementById('uploadArea-resource').classList.remove('hidden');
    document.getElementById('fileList-resource').classList.add('hidden');
    document.getElementById('columnSelector-resource').classList.add('hidden');
    document.getElementById('chartArea-resource').innerHTML = '';
    document.getElementById('previewArea-resource').innerHTML = '';
    document.getElementById('fileTags-resource').innerHTML = '';
    document.getElementById('fileInput-resource').value = '';
}
