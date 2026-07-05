// ========== 对账工具 - 共享文件处理 ==========

/**
 * 通用文件解析流程：大小校验 → 遮罩 → 读取 → 解析 → 回调
 * @param {FileList|File[]} fileList - 文件列表
 * @param {Object} options
 * @param {boolean} options.acceptMulti - 是否允许多文件
 * @param {Function} options.onParsed - 解析完成回调，接收 [{ name, workbook }]
 */
async function handleFilesGeneric(fileList, { acceptMulti = true, onParsed }) {
    let validFiles = Array.from(fileList).filter(f => f.name.match(/\.(xlsx|xls|csv)$/i));
    if (validFiles.length === 0) { alert('请选择 Excel 或 CSV 文件'); return; }

    if (!acceptMulti && validFiles.length > 1) {
        validFiles = [validFiles[0]];
    }

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
        if (onParsed) onParsed(parsed);
    } catch (err) {
        console.error(err);
        alert('文件解析失败：' + (err && err.message ? err.message : err));
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * 通用数据预览渲染
 * @param {HTMLElement} container - 容器元素
 * @param {Object} file - { name, headers, rows }
 * @param {Object} options
 * @param {number} options.maxRows - 最大渲染行数
 * @param {string} options.colorDot - 颜色点标识
 * @param {boolean} options.collapsible - 是否可折叠
 */
function renderPreviewTable(container, file, { maxRows = PREVIEW_MAX_ROWS, colorDot = '', collapsible = true } = {}) {
    if (!file) { container.innerHTML = ''; return; }

    const totalRows = file.rows.length;
    const truncated = totalRows > maxRows;
    const renderRows = truncated ? file.rows.slice(0, maxRows) : file.rows;

    const headHtml = file.headers.map(h => `<th class="txt">${escapeHtml(h === '' ? '' : h)}</th>`).join('');
    const bodyHtml = renderRows.map(r => {
        const cells = file.headers.map((_, ci) => {
            const v = r[ci];
            const rawVal = v !== undefined && v !== null ? v : '';
            const val = formatCellValue(rawVal);
            const isNum = typeof rawVal === 'number' || (typeof rawVal === 'string' && rawVal !== '' && !isNaN(rawVal));
            return `<td class="${isNum ? 'num' : 'txt'}">${escapeHtml(val)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    const colorDotHtml = colorDot ? `<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${colorDot}"></span>` : '';
    const titleHtml = `<h4 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
        ${colorDotHtml}
        ${escapeHtml(file.name)}
        <span class="text-xs font-normal text-gray-400">(${totalRows} 行 × ${file.headers.length} 列)</span>
    </h4>`;

    const warningHtml = truncated
        ? `<p class="text-xs text-amber-600 mb-2">⚠️ 数据量较大，预览仅显示前 ${maxRows} 行（共 ${totalRows} 行）。完整数据已加载，图表与计算均基于全部数据。</p>`
        : '';

    if (collapsible) {
        container.innerHTML = `
            <button onclick="togglePreview(this)" class="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition rounded-lg">
                ${titleHtml}
                <span class="preview-arrow text-gray-400 text-sm transition-transform duration-300">▶</span>
            </button>
            <div class="preview-content hidden px-5 pb-4">
                ${warningHtml}
                <div class="preview-table-wrap border rounded">
                    <table>
                        <thead><tr>${headHtml}</tr></thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                ${titleHtml}
                <span class="text-xs text-gray-400">共 ${totalRows} 行${truncated ? '（仅显示前 ' + maxRows + ' 行）' : ''}，${file.headers.length} 列</span>
            </div>
            ${warningHtml}
            <div class="border rounded overflow-auto" style="max-height: calc(100vh - 360px);">
                <table>
                    <thead><tr>${headHtml}</tr></thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>`;
    }
}

/**
 * 通用文件标签渲染
 * @param {HTMLElement} container - 容器元素
 * @param {Array} files - 文件列表 [{ name, rows }]
 * @param {number} activeIndex - 当前选中索引
 * @param {Function} onSelect - 选中回调
 * @param {Function} onRemove - 删除回调
 */
function renderFileTags(container, files, activeIndex, onSelect, onRemove) {
    container.innerHTML = '';
    files.forEach((f, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const isActive = i === activeIndex;
        const tag = document.createElement('span');
        tag.className = 'file-tag cursor-pointer transition' + (isActive ? ' file-tag-active' : '');
        tag.onclick = (e) => { if (e.target.tagName !== 'BUTTON') onSelect(i); };
        tag.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
            <span class="${isActive ? 'text-blue-600 font-semibold' : 'text-gray-700'}">${f.name}</span>
            <span class="text-gray-400 text-xs">(${f.rows.length}行)</span>
            <button onclick="event.stopPropagation(); (${onRemove.toString()})(${i})" class="text-gray-400 hover:text-red-500 ml-1 font-bold">&times;</button>
        `;
        container.appendChild(tag);
    });
}

function togglePreview(btn) {
    const wrapper = btn.closest('.bi-card');
    const content = wrapper.querySelector('.preview-content');
    const arrow = wrapper.querySelector('.preview-arrow');
    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}
