// ========== 对账工具 - 全局状态 ==========

const tabState = {
    business: { workbook: null, currentSheet: null, validationResults: {}, pieChart: null, barChart: null },
    resource: { files: [], trendCharts: [], activeFileIndex: 0, chartConfig: null },
    calc: { files: [], activeFileIndex: 0, activeSubTab: 'calcEstimate' }
};

const STORAGE_KEYS = {
    business: 'reconciliation_tool_data',
    resource: 'reconciliation_tool_data_resource',
    calc: 'reconciliation_tool_data_calc',
    calcSubTab: 'reconciliation_tool_calc_subtab',
    activeTab: 'reconciliation_tool_active_tab',
    packList: 'reconciliation_tool_pack_list',
    packConfig: 'reconciliation_tool_pack_config',
    packDeductRule: 'reconciliation_tool_pack_deduct_rule'
};

// ========== 日期规整（根治东八区跨日问题） ==========
function normalizeDateCells(workbook) {
    if (!workbook || !workbook.SheetNames) return workbook;
    workbook.SheetNames.forEach(name => {
        const ws = workbook.Sheets[name];
        if (!ws || !ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        const cellCount = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
        if (cellCount > NORMALIZE_MAX_CELLS) {
            console.warn(`Sheet「${name}」单元格数约 ${cellCount}，超过 ${NORMALIZE_MAX_CELLS}，跳过日期规整以避免主线程阻塞。`);
            return;
        }
        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const addr = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[addr];
                if (!cell) continue;
                const isDate = cell.t === 'd' && cell.v instanceof Date;
                const z = cell.z != null ? String(cell.z) : '';
                const isDateFormattedNum = cell.t === 'n' && /y/i.test(z);
                if (isDate) {
                    cell.v = _dateToExcelSerialLocal(cell.v);
                    cell.t = 'n';
                    delete cell.w;
                } else if (isDateFormattedNum) {
                    delete cell.w;
                }
            }
        }
    });
    return workbook;
}
