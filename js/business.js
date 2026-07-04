// ========== 对账工具 - Tab1 经营分析 ==========

// ========== 上传区域初始化 ==========
function initBusinessUpload() {
    const uploadArea = document.getElementById('uploadArea-business');
    const fileInput = document.getElementById('fileInput-business');

    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file, 'business');
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file, 'business');
    });
}

// ========== 文件处理 ==========
async function handleFile(file, tab) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        alert('请上传 Excel 或 CSV 文件（.xlsx、.xls 或 .csv）');
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        alertOversized([file]);
        return;
    }
    document.getElementById('fileName-' + tab).textContent = file.name;

    const isLarge = file.size > LARGE_FILE_SIZE;
    showLoadingOverlay('正在解析文件，请稍候…', isLarge ? '文件较大，解析可能需要数秒，请勿关闭页面' : '');
    await nextFrame();

    try {
        const data = await readFileAsArrayBuffer(file);
        await nextFrame();
        tabState[tab].workbook = XLSX.read(data, { type: 'array', cellNF: true });
        normalizeDateCells(tabState[tab].workbook);
        processWorkbook(tab, true);
    } catch (err) {
        console.error(err);
        alert('文件解析失败：' + (err && err.message ? err.message : err));
    } finally {
        hideLoadingOverlay();
    }
}

function processWorkbook(tab, saveData) {
    const workbook = tabState[tab].workbook;
    document.getElementById('uploadSection-' + tab).classList.add('hidden');
    document.getElementById('dashboard-' + tab).classList.remove('hidden');

    if (saveData) saveToStorage(tab, document.getElementById('fileName-' + tab).textContent);

    const sheetTabs = document.getElementById('sheetTabs-' + tab);
    sheetTabs.innerHTML = '';
    workbook.SheetNames.forEach((name, index) => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.className = index === 0 ? 'sheet-btn active' : 'sheet-btn';
        btn.onclick = () => switchSheet(tab, name, btn);
        sheetTabs.appendChild(btn);
    });
    switchSheet(tab, workbook.SheetNames[0], sheetTabs.children[0]);
}

function switchSheet(tab, sheetName, btn) {
    document.querySelectorAll('#sheetTabs-' + tab + ' button').forEach(b => { b.className = 'sheet-btn'; });
    btn.className = 'sheet-btn active';

    const workbook = tabState[tab].workbook;
    tabState[tab].currentSheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(tabState[tab].currentSheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
    if (jsonData.length === 0) { alert('该 Sheet 没有数据'); return; }
    validateData(tab, jsonData);
    renderDashboard(tab, jsonData);
}

// ========== 数据校验 ==========
function validateData(tab, data) {
    const state = tabState[tab];
    state.validationResults = {
        errors: {}, duplicates: new Set(),
        stats: { empty: 0, typeError: 0, formatError: 0, duplicate: 0 },
        columnErrors: {}
    };
    const headers = data[0], rows = data.slice(1), vr = state.validationResults;
    headers.forEach((h, i) => { vr.columnErrors[i] = { name: h || `列${i+1}`, count: 0 }; });

    const rowStrings = rows.map(r => JSON.stringify(r));
    const seen = {};
    rowStrings.forEach((str, idx) => {
        if (seen[str] !== undefined) {
            vr.duplicates.add(idx); vr.duplicates.add(seen[str]); vr.stats.duplicate += 2;
        } else { seen[str] = idx; }
    });

    const columnTypes = inferColumnTypes(rows);
    rows.forEach((row, rowIdx) => {
        headers.forEach((header, colIdx) => {
            const cell = row[colIdx];
            const cellKey = `${rowIdx + 1}-${colIdx}`;
            const errors = [];
            if (cell === '' || cell === null || cell === undefined) {
                errors.push('空值'); vr.stats.empty++; vr.columnErrors[colIdx].count++;
            } else {
                const expectedType = columnTypes[colIdx];
                if (expectedType && !validateType(cell, expectedType)) {
                    errors.push(`类型错误（应为${expectedType}）`); vr.stats.typeError++; vr.columnErrors[colIdx].count++;
                }
                if (expectedType === '数字' && typeof cell === 'string' && cell.match(/^\d+$/)) {
                    errors.push('格式异常（文本格式的数字）'); vr.stats.formatError++;
                }
            }
            if (errors.length > 0) vr.errors[cellKey] = errors;
        });
    });
}

function inferColumnTypes(rows) {
    const types = {};
    const sampleSize = Math.min(20, rows.length);
    for (let col = 0; col < (rows[0]?.length || 0); col++) {
        const samples = [];
        for (let i = 0; i < sampleSize; i++) {
            const val = rows[i]?.[col];
            if (val !== '' && val !== null && val !== undefined) samples.push(val);
        }
        if (samples.length === 0) continue;
        const numberCount = samples.filter(s => typeof s === 'number' || (typeof s === 'string' && !isNaN(s) && s.trim() !== '')).length;
        const dateCount = samples.filter(s => s instanceof Date || (typeof s === 'string' && s.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/))).length;
        if (numberCount / samples.length > 0.7) types[col] = '数字';
        else if (dateCount / samples.length > 0.7) types[col] = '日期';
        else types[col] = '文本';
    }
    return types;
}

function validateType(value, expectedType) {
    if (expectedType === '数字') return typeof value === 'number' || (typeof value === 'string' && !isNaN(value) && value.trim() !== '');
    if (expectedType === '日期') return value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/));
    return true;
}

// ========== 渲染 ==========
function renderDashboard(tab, data) {
    const headers = data[0], rows = data.slice(1);
    const totalCells = rows.length * headers.length;
    const vr = tabState[tab].validationResults;
    const totalErrors = Object.keys(vr.errors).length + vr.duplicates.size;

    document.getElementById('totalRows-' + tab).textContent = rows.length.toLocaleString();
    document.getElementById('totalCols-' + tab).textContent = headers.length;
    document.getElementById('errorCount-' + tab).textContent = totalErrors.toLocaleString();
    document.getElementById('errorRate-' + tab).textContent = totalCells > 0
        ? ((totalErrors / totalCells) * 100).toFixed(2) + '%' : '0%';

    renderBusinessPieChart(tab);
    renderBusinessBarChart(tab, headers);
    renderBusinessTable(tab, data);
}

function renderBusinessPieChart(tab) {
    const ctx = document.getElementById('pieChart-' + tab).getContext('2d');
    if (tabState[tab].pieChart) tabState[tab].pieChart.destroy();
    const vr = tabState[tab].validationResults;
    tabState[tab].pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['空值', '类型错误', '格式异常', '重复行'],
            datasets: [{ data: [vr.stats.empty, vr.stats.typeError, vr.stats.formatError, vr.stats.duplicate],
                backgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#22c55e'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: true, cutout: '55%',
            plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, datalabels: { display: false } }
        }
    });
}

function renderBusinessBarChart(tab, headers) {
    const ctx = document.getElementById('barChart-' + tab).getContext('2d');
    if (tabState[tab].barChart) tabState[tab].barChart.destroy();
    const vr = tabState[tab].validationResults;
    const labels = [], counts = [];
    Object.values(vr.columnErrors).forEach(col => { if (col.count > 0) { labels.push(col.name); counts.push(col.count); } });
    tabState[tab].barChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: '异常数量', data: counts, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 }] },
        options: { responsive: true, maintainAspectRatio: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                      x: { ticks: { font: { size: 10 } }, grid: { display: false } } },
            plugins: { legend: { display: false }, datalabels: { display: false } }
        }
    });
}

function renderBusinessTable(tab, data) {
    const table = document.getElementById('dataTable-' + tab);
    const headers = data[0], rows = data.slice(1), vr = tabState[tab].validationResults;
    let html = '<thead><tr>';
    headers.forEach(h => { html += `<th>${h || '-'}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach((row, rowIdx) => {
        const isDuplicate = vr.duplicates.has(rowIdx);
        html += `<tr class="${isDuplicate ? 'duplicate-row' : ''}">`;
        headers.forEach((h, colIdx) => {
            const cellKey = `${rowIdx + 1}-${colIdx}`;
            const cellErrors = vr.errors[cellKey];
            let cellClass = '', tooltip = '';
            if (cellErrors) {
                const hasEmpty = cellErrors.some(e => e.includes('空值') || e.includes('类型错误'));
                cellClass = hasEmpty ? 'error-cell' : 'warning-cell';
                tooltip = cellErrors.join(', ');
            }
            const rawValue = row[colIdx] !== undefined && row[colIdx] !== null ? row[colIdx] : '';
            const value = formatCellValue(rawValue);
            const isNum = typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue !== '' && !isNaN(rawValue));
            const typeClass = isNum ? 'num' : 'txt';
            const titleText = tooltip ? `${value}（${tooltip}）` : String(value);
            html += `<td class="${typeClass} ${cellClass} ${tooltip ? 'tooltip' : ''}" title="${titleText}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>${value}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// ========== 展开/收起异常分析 ==========
function toggleAnalysis(btn) {
    const panel = btn.closest('.bi-card');
    const content = panel.querySelector('.analysis-content');
    const arrow = panel.querySelector('.analysis-arrow');
    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

// ========== localStorage ==========
function saveToStorage(tab, fileName) {
    const workbook = tabState[tab].workbook;
    const sheetsData = {};
    workbook.SheetNames.forEach(name => {
        sheetsData[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
    });
    try { localStorage.setItem(STORAGE_KEYS[tab], JSON.stringify({ fileName, sheetNames: workbook.SheetNames, sheets: sheetsData })); }
    catch (e) { console.warn('数据过大，无法保存到本地存储'); }
}

function restoreFromStorage(tab) {
    const saved = localStorage.getItem(STORAGE_KEYS[tab]);
    if (!saved) return false;
    try {
        const storeObj = JSON.parse(saved);
        document.getElementById('fileName-' + tab).textContent = storeObj.fileName;
        tabState[tab].workbook = { SheetNames: storeObj.sheetNames, Sheets: {} };
        storeObj.sheetNames.forEach(name => {
            tabState[tab].workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(storeObj.sheets[name]);
        });
        processWorkbook(tab);
        return true;
    } catch (e) { localStorage.removeItem(STORAGE_KEYS[tab]); return false; }
}

// ========== 重置经营分析 ==========
function resetBusiness() {
    localStorage.removeItem(STORAGE_KEYS.business);
    document.getElementById('uploadSection-business').classList.remove('hidden');
    document.getElementById('dashboard-business').classList.add('hidden');
    document.getElementById('fileInput-business').value = '';
    tabState.business.workbook = null;
    tabState.business.currentSheet = null;
    tabState.business.validationResults = {};
    if (tabState.business.pieChart) tabState.business.pieChart.destroy();
    if (tabState.business.barChart) tabState.business.barChart.destroy();
}
