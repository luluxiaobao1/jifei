// ========== 对账工具 - Tab2 图表构建 ==========

// 在指定文件中按列名找到实际列下标（兼容不同文件列顺序不同）
function _resolveColIdx(file, headers, baseIdx) {
    const colName = headers[baseIdx];
    return file.headers.indexOf(colName);
}

function _toNum(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

// 采集 UI 上的图表配置（一次配置，供所有文件共用），缓存后渲染当前选中文件
function drawTrendChart() {
    const files = tabState.resource.files;
    if (files.length === 0) return;
    const baseFile = files[tabState.resource.activeFileIndex] || files[0];

    const xColIdx = document.getElementById('xAxis-resource').value;
    if (xColIdx === '') { alert('请选择横坐标（X 轴）列'); return; }
    const xBase = parseInt(xColIdx);

    const yColIdxs = Array.from(document.querySelectorAll('.y-col-checkbox:checked')).map(cb => parseInt(cb.value));
    if (yColIdxs.length === 0) { alert('请至少选择一个纵坐标（Y 轴）列'); return; }

    const secondaryCols = new Set(
        Array.from(document.querySelectorAll('.y-secondary-checkbox:checked')).map(cb => parseInt(cb.dataset.col))
    );

    const dimCols = dimColsState.map(i => baseFile.headers[i] || ('列' + (i + 1)));

    const dataFilters = resourceFilterFields
        .filter(ff => ff.explicit)
        .map(ff => ({ name: ff.name, values: ff.checked.size > 0 ? Array.from(ff.checked) : ['\u0000__NONE__'] }));
    const axisFilters = _collectAxisValueFilters();
    const dimFilters = _collectDimValueFilters();
    const yFilters = _collectYValueFilters();
    const filters = mergeFilterDefs(dataFilters, axisFilters, yFilters, dimFilters);

    const showLegend = document.getElementById('optShowLegend-resource').checked;
    const showDataLabels = document.getElementById('optShowDataLabels-resource').checked;
    const mirrorNegative = document.getElementById('optMirrorNegative-resource').checked;
    const chartType = document.getElementById('chartType-resource').value || 'line';

    const prevCompares = (tabState.resource.chartConfig && tabState.resource.chartConfig.compares) || [];
    tabState.resource.chartConfig = {
        headers: baseFile.headers,
        baseFileName: baseFile.name,
        xBase, yColIdxs, secondaryCols, dimCols,
        filters, axisFilters, yFilters, dimFilters,
        showLegend, showDataLabels, mirrorNegative, chartType,
        compares: prevCompares
    };

    renderActiveChart();
    renderResourcePreview();
}

// 根据缓存配置渲染"当前选中文件"的图表
function renderActiveChart() {
    const files = tabState.resource.files;
    const cfg = tabState.resource.chartConfig;
    tabState.resource.trendCharts.forEach(c => c.destroy());
    tabState.resource.trendCharts = [];
    const chartArea = document.getElementById('chartArea-resource');
    chartArea.innerHTML = '';
    if (files.length === 0 || !cfg) return;
    const f = files[tabState.resource.activeFileIndex] || files[0];
    buildChartForFile(f, cfg);
}

// 当前文件缺少必需列时，渲染一张占位空图并给出说明
function _renderEmptyChartForFile(f, msg) {
    const chartArea = document.getElementById('chartArea-resource');
    const fileColor = CHART_COLORS[tabState.resource.files.indexOf(f) % CHART_COLORS.length];
    const wrapper = document.createElement('div');
    wrapper.className = 'bi-card p-5 mb-4';
    wrapper.innerHTML = `<h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${fileColor}"></span>
        <span>${f.name}</span>
        <span class="text-gray-400 font-normal">— 无法绘制</span></h4>
        <p class="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">${msg}</p>`;
    chartArea.appendChild(wrapper);
}

// 针对单个文件、依据共用配置 cfg 构建并渲染一张趋势图（列按列名自适应）
function buildChartForFile(f, cfg) {
    const { xBase, yColIdxs, secondaryCols, filters, showLegend, showDataLabels, mirrorNegative } = cfg;
    const dimCols = cfg.dimCols || [];
    const chartType = cfg.chartType || 'line';
    const chartArea = document.getElementById('chartArea-resource');

    const headers = cfg.headers || f.headers;
    const fx = _resolveColIdx(f, headers, xBase);
    const hasDim = dimCols.length > 0;
    const fdimCols = dimCols.map(name => f.headers.indexOf(name));
    const dimMissing = hasDim && fdimCols.some(i => i === -1);
    const effDim = hasDim && !dimMissing;

    if (fx === -1) {
        _renderEmptyChartForFile(f, '当前文件缺少所需的 X 轴列「' + (headers[xBase] || '') + '」，无法绘制。');
        return;
    }

    const filterDefs = (filters || [])
        .filter(flt => flt.values && flt.values.length > 0)
        .map(flt => {
            const colIdx = f.headers.indexOf(flt.name);
            return colIdx === -1 ? null : { colIdx, allow: new Set(flt.values) };
        })
        .filter(Boolean);

    const filteredRows = f.rows.filter(row => {
        for (const fd of filterDefs) {
            const cellVal = formatCellValue(row[fd.colIdx]);
            if (!fd.allow.has(cellVal)) return false;
        }
        return true;
    });

    const labelOrder = [];
    const labelSet = new Set();
    filteredRows.forEach(row => {
        const xVal = formatCellValue(row[fx]);
        if (xVal === '') return;
        if (!labelSet.has(xVal)) { labelSet.add(xVal); labelOrder.push(xVal); }
    });
    const labels = labelOrder;

    const datasets = [];
    let colorIdx = 0;
    const hasMultiYAxis = secondaryCols.size > 0;

    yColIdxs.forEach(yColIdx => {
        const fy = _resolveColIdx(f, headers, yColIdx);
        const yColName = headers[yColIdx] || ('列' + (yColIdx + 1));
        if (fy === -1) return;
        const isSecondary = secondaryCols.has(yColIdx);

        const groups = new Map();

        filteredRows.forEach(row => {
            const xVal = formatCellValue(row[fx]);
            if (xVal === '') return;

            const yRaw = row[fy];

            let dimKey = '';
            if (effDim) {
                dimKey = _dimKeyOfRow(row, fdimCols);
                if (dimKey === '') dimKey = '(空)';
            }

            if (!groups.has(dimKey)) groups.set(dimKey, new Map());
            const yNum = _toNum(yRaw);
            const g = groups.get(dimKey);
            if (yNum !== null) g.set(xVal, (g.get(xVal) || 0) + yNum);
            else if (!g.has(xVal)) g.set(xVal, null);
        });

        groups.forEach((xyMap, dimKey) => {
            const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
            colorIdx++;

            let mirrored = false;
            const data = labels.map(L => {
                let v = xyMap.has(L) && typeof xyMap.get(L) === 'number' ? xyMap.get(L) : 0;
                if (mirrorNegative && v < 0) { v = Math.abs(v); mirrored = true; }
                return v;
            });

            const parts = [];
            if (yColIdxs.length > 1 || !effDim) parts.push(yColName);
            if (effDim) parts.push(dimKey);
            let lbl = parts.join(' · ');
            if (isSecondary) lbl += ' ⟂';
            if (mirrored) lbl += ' (镜像)';
            if (dimMissing) lbl += ' (本文件无维度列)';

            datasets.push({
                label: lbl,
                data,
                mirrored,
                _color: color,
                yAxisID: isSecondary ? 'y1' : 'y',
                borderColor: color,
                backgroundColor: chartType === 'bar' ? color : color + '15',
                borderDash: (chartType === 'line' && isSecondary) ? [6, 3] : [],
                tension: 0.3, pointRadius: 3, pointHoverRadius: 6, borderWidth: chartType === 'bar' ? 1 : 2, fill: false,
                spanGaps: true
            });
        });
    });

    const baseLabels = datasets.map(d => d.label);
    tabState.resource._lastBaseLabels = baseLabels;

    let hasCompareSecondary = false;
    const compares = cfg.compares || [];
    compares.forEach((cmp, ci) => {
        const dsA = datasets.find(d => d.label === cmp.a);
        const dsB = datasets.find(d => d.label === cmp.b);
        if (!dsA || !dsB) return;
        const opSym = { '/': '÷', '-': '−', '+': '＋', '*': '×' }[cmp.op] || cmp.op;
        const cmpData = labels.map((L, idx) => {
            const a = typeof dsA.data[idx] === 'number' ? dsA.data[idx] : 0;
            const b = typeof dsB.data[idx] === 'number' ? dsB.data[idx] : 0;
            switch (cmp.op) {
                case '/': return b === 0 ? null : +(a / b).toFixed(4);
                case '-': return +(a - b).toFixed(4);
                case '+': return +(a + b).toFixed(4);
                case '*': return +(a * b).toFixed(4);
                default: return null;
            }
        });
        const cmpColor = COMPARE_COLORS[ci % COMPARE_COLORS.length];
        hasCompareSecondary = true;
        datasets.push({
            label: '对比：' + cmp.a + ' ' + opSym + ' ' + cmp.b,
            data: cmpData,
            _isCompare: true,
            _color: cmpColor,
            yAxisID: 'yCompare',
            borderColor: cmpColor,
            backgroundColor: cmpColor + '20',
            borderDash: [8, 4],
            tension: 0.3, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2, fill: false,
            spanGaps: true,
            type: 'line'
        });
    });

    const titleParts = [];
    titleParts.push(yColIdxs.map(i => headers[i] || ('列' + (i + 1))).join('、'));
    if (effDim) titleParts.push('按「' + dimCols.join(DIM_SEP) + '」分维度');
    else if (dimMissing) titleParts.push('（本文件缺少维度列「' + dimCols.join(DIM_SEP) + '」，未分维度）');

    const typeMeta = {
        line: { icon: '📈', name: '趋势曲线' },
        bar:  { icon: '📊', name: '柱状对比' },
        pie:  { icon: '🥧', name: '占比分布' }
    }[chartType] || { icon: '📈', name: '趋势曲线' };

    const fileColor = CHART_COLORS[tabState.resource.files.indexOf(f) % CHART_COLORS.length];
    const wrapper = document.createElement('div');
    wrapper.className = 'bi-card p-5 mb-4';

    if (chartType === 'pie') {
        buildPieChart(f, cfg, { labels, datasets, titleParts, typeMeta, fileColor, wrapper, chartArea });
        return;
    }

    wrapper.innerHTML = `<h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${fileColor}"></span>
        <span>${f.name}</span>
        <span class="text-gray-400 font-normal">— ${typeMeta.icon} ${titleParts.join(' — ')} ${typeMeta.name}</span>
        <span class="text-xs font-normal text-gray-400">（${datasets.length} 条）</span>
        <button onclick="openCompareModal()" class="ml-auto text-xs font-medium text-amber-600 hover:text-amber-700 border border-amber-300 hover:border-amber-400 rounded-md px-2.5 py-1 transition" title="用两条曲线做四则运算，结果作为次坐标对比曲线叠加">➕ 对比</button></h4>
        <div style="height: 420px;"><canvas></canvas></div>`;
    chartArea.appendChild(wrapper);
    const canvas = wrapper.querySelector('canvas');

    const primaryYTitle = yColIdxs.filter(i => !secondaryCols.has(i)).map(i => headers[i] || ('列' + (i + 1))).join('、') || 'Y 轴';
    const secondaryYTitle = yColIdxs.filter(i => secondaryCols.has(i)).map(i => headers[i] || ('列' + (i + 1))).join('、');

    const scales = {
        x: { title: { display: true, text: headers[xBase] || 'X 轴', font: { size: 11 }, color: '#94a3b8' },
             grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
        y: { type: 'linear', position: 'left',
             title: { display: true, text: primaryYTitle, font: { size: 11 }, color: '#94a3b8' },
             beginAtZero: false, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8' } }
    };
    if (hasMultiYAxis) {
        scales.y1 = { type: 'linear', position: 'right',
            title: { display: true, text: secondaryYTitle || '次坐标', font: { size: 11 }, color: '#d97706' },
            beginAtZero: false, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: '#d97706' } };
    }
    if (hasCompareSecondary) {
        scales.yCompare = { type: 'linear', position: 'right',
            title: { display: true, text: '对比', font: { size: 11 }, color: '#7c3aed' },
            beginAtZero: false, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: '#7c3aed' },
            offset: hasMultiYAxis };
    }

    const chart = new Chart(canvas.getContext('2d'), {
        type: chartType === 'bar' ? 'bar' : 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: showLegend, position: 'bottom',
                    labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                tooltip: { backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 6,
                    callbacks: { label: function(ctx) {
                        const v = ctx.parsed.y;
                        if (v === null || v === undefined) return ctx.dataset.label + ': -';
                        const suffix = ctx.dataset.mirrored ? '（原值 -' + v + '）' : '';
                        return ctx.dataset.label + ': ' + v + suffix;
                    } } },
                datalabels: {
                    display: showDataLabels,
                    align: chartType === 'bar' ? 'end' : 'top',
                    anchor: 'end',
                    color: '#475569', font: { size: 9 },
                    backgroundColor: showDataLabels ? 'rgba(255,255,255,0.78)' : null,
                    borderRadius: 3, padding: { top: 1, bottom: 1, left: 3, right: 3 },
                    formatter: function(value, ctx) {
                        if (value === null || value === undefined) return '';
                        const x = ctx.chart.data.labels[ctx.dataIndex];
                        const yStr = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value;
                        return '(' + x + ', ' + yStr + ')';
                    }
                }
            },
            scales
        }
    });
    tabState.resource.trendCharts.push(chart);
}

// 饼图：把每条 dataset 的数据汇总为一个扇区
function buildPieChart(f, cfg, ctx) {
    const { labels, datasets, titleParts, typeMeta, fileColor, wrapper, chartArea } = ctx;
    const showLegend = cfg.showLegend;
    const showDataLabels = cfg.showDataLabels;

    let pieLabels, pieData, pieColors;
    if (datasets.length <= 1) {
        const ds = datasets[0];
        pieLabels = labels.slice();
        pieData = (ds ? ds.data : []).map(v => (typeof v === 'number' ? Math.abs(v) : 0));
        pieColors = pieLabels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    } else {
        pieLabels = datasets.map(d => d.label);
        pieData = datasets.map(d => d.data.reduce((s, v) => s + (typeof v === 'number' ? Math.abs(v) : 0), 0));
        pieColors = datasets.map((d, i) => d._color || CHART_COLORS[i % CHART_COLORS.length]);
    }

    const total = pieData.reduce((s, v) => s + v, 0);

    wrapper.innerHTML = `<h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${fileColor}"></span>
        <span>${f.name}</span>
        <span class="text-gray-400 font-normal">— ${typeMeta.icon} ${titleParts.join(' — ')} ${typeMeta.name}</span>
        <span class="text-xs font-normal text-gray-400">（${pieLabels.length} 项）</span></h4>
        <div style="height: 420px;"><canvas></canvas></div>`;
    chartArea.appendChild(wrapper);
    const canvas = wrapper.querySelector('canvas');

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderColor: '#fff', borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: showLegend, position: 'right',
                    labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                tooltip: { backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 6,
                    callbacks: { label: function(c) {
                        const v = c.parsed || 0;
                        const pct = total > 0 ? (v / total * 100).toFixed(1) : '0';
                        return c.label + ': ' + v + '（' + pct + '%）';
                    } } },
                datalabels: {
                    display: showDataLabels,
                    color: '#fff', font: { size: 10, weight: 'bold' },
                    formatter: function(value) {
                        if (!value || total <= 0) return '';
                        const pct = value / total * 100;
                        return pct < 5 ? '' : pct.toFixed(0) + '%';
                    }
                }
            }
        }
    });
    tabState.resource.trendCharts.push(chart);
}

// 合并多组 {name, values} 筛选：同名列取交集
function mergeFilterDefs(...groups) {
    const byName = new Map();
    groups.forEach(group => {
        (group || []).forEach(flt => {
            if (!flt.values || flt.values.length === 0) return;
            const incoming = new Set(flt.values);
            if (!byName.has(flt.name)) {
                byName.set(flt.name, incoming);
            } else {
                const existing = byName.get(flt.name);
                const inter = new Set();
                existing.forEach(v => { if (incoming.has(v)) inter.add(v); });
                byName.set(flt.name, inter);
            }
        });
    });
    const out = [];
    byName.forEach((set, name) => { out.push({ name, values: Array.from(set) }); });
    return out;
}

// 收集某列的唯一取值（保持出现顺序，跳过空值）
function _collectColumnValues(colIdx) {
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return [];
    const colName = activeFile.headers[colIdx];
    const uniqueValues = new Map();
    files.forEach(file => {
        if (!file || !file.headers || !file.rows) return;
        const ci = colName !== undefined ? file.headers.indexOf(colName) : -1;
        const useIdx = ci !== -1 ? ci : (file === activeFile ? colIdx : -1);
        if (useIdx === -1) return;
        file.rows.forEach(row => {
            const val = row[useIdx];
            const key = val !== undefined && val !== null ? formatCellValue(val) : '';
            if (key !== '' && !uniqueValues.has(key)) uniqueValues.set(key, key);
        });
    });
    return Array.from(uniqueValues.keys());
}

// 由一行 + 维度列下标数组算出组合键
function _dimKeyOfRow(row, cols) {
    const parts = cols.map(ci => {
        const v = row[ci];
        return v !== undefined && v !== null ? formatCellValue(v) : '';
    });
    if (parts.every(p => p === '')) return '';
    return parts.map(p => p === '' ? '(空)' : p).join(DIM_SEP);
}

// 收集 X 轴取值筛选
function _collectAxisValueFilters() {
    const out = [];
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return out;
    ['x'].forEach(axis => {
        const state = axisValueFilters[axis];
        if (state && state.colIdx !== null && state.explicit) {
            const name = activeFile.headers[state.colIdx] || ('列' + (state.colIdx + 1));
            const values = state.checked.size > 0 ? Array.from(state.checked) : ['\u0000__NONE__'];
            out.push({ name, values });
        }
    });
    return out;
}

// 收集"维度"各列的取值筛选
function _collectDimValueFilters() {
    const out = [];
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return out;
    dimColsState.forEach(colIdx => {
        const ff = dimValueFilters[colIdx];
        if (ff && ff.explicit) {
            const name = activeFile.headers[colIdx] || ('列' + (colIdx + 1));
            const allVals = _collectColumnValues(colIdx);
            const coversAll = allVals.length > 0 && allVals.every(v => ff.checked.has(v));
            if (coversAll) return;
            const values = ff.checked.size > 0 ? Array.from(ff.checked) : ['\u0000__NONE__'];
            out.push({ name, values });
        }
    });
    return out;
}

// 收集 Y 列取值筛选
function _collectYValueFilters() {
    const out = [];
    const files = tabState.resource.files;
    const activeFile = files[tabState.resource.activeFileIndex] || files[0];
    if (!activeFile) return out;
    Object.keys(yValueFilters).forEach(k => {
        const colIdx = parseInt(k);
        const state = yValueFilters[colIdx];
        const yCb = document.querySelector(`.y-col-checkbox[value="${colIdx}"]`);
        if (!yCb || !yCb.checked) return;
        if (state && state.explicit) {
            const name = activeFile.headers[colIdx] || ('列' + (colIdx + 1));
            const values = state.checked.size > 0 ? Array.from(state.checked) : ['\u0000__NONE__'];
            out.push({ name, values });
        }
    });
    return out;
}
