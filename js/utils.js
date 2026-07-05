// ========== 对账工具 - 通用工具函数 + 常量 ==========

// ========== 常量 ==========
const CHART_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
    '#e11d48', '#84cc16', '#0ea5e9', '#d946ef', '#facc15'
];
const COMPARE_COLORS = ['#7c3aed', '#c2410c', '#0f766e', '#be185d', '#4338ca'];

const MAX_FILE_SIZE = 25 * 1024 * 1024;   // 25 MB
const LARGE_FILE_SIZE = 5 * 1024 * 1024;  // 5 MB
const STORAGE_MAX_ROWS = 50000;
const NORMALIZE_MAX_CELLS = 200000;
const PREVIEW_MAX_ROWS = 200;
const DIM_SEP = ' / ';

// ========== HTML 转义 ==========
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtmlTags(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

// ========== 日期格式化 ==========
function _datePartsLocal(d) {
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

function _datePartsUTC(d) {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function _pad(n) { return String(n).padStart(2, '0'); }

function _fmtDate(parts) { return `${parts.y}/${_pad(parts.m)}/${_pad(parts.d)}`; }

function _dateToExcelSerialLocal(d) {
    const epoch = Date.UTC(1899, 11, 30);
    const wall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((wall - epoch) / 86400000);
}

function formatCellValue(val) {
    if (val === undefined || val === null || val === '') return '';
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return String(val);
        return _fmtDate(_datePartsLocal(val));
    }
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return _fmtDate(_datePartsUTC(d));
    }
    if (typeof val === 'string' && /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(val.trim())) {
        return val.trim().replace(/-/g, '/');
    }
    return typeof val === 'string' ? val : String(val);
}

// ========== 文件大小 ==========
function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
}

function checkFilesSize(files) {
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
    return { ok: oversized.length === 0, oversized };
}

function alertOversized(oversized) {
    const lines = oversized.map(f => `· ${f.name}（${formatFileSize(f.size)}）`).join('\n');
    alert(`以下文件超过单个 ${formatFileSize(MAX_FILE_SIZE)} 的上限，已被忽略：\n${lines}\n\n请拆分或精简后再上传，以免页面卡顿。`);
}

// ========== 加载遮罩 ==========
function showLoadingOverlay(text, sub) {
    const ov = document.getElementById('loadingOverlay');
    document.getElementById('loadingText').textContent = text || '正在解析文件，请稍候…';
    document.getElementById('loadingSub').textContent = sub || '';
    ov.classList.remove('hidden');
}

function setLoadingSub(sub) {
    const el = document.getElementById('loadingSub');
    if (el) el.textContent = sub || '';
}

function hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// ========== 文件读取 ==========
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target.result));
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

// ========== 存储 ==========
function saveFilesToStorage(key, files) {
    try {
        const totalRows = files.reduce((s, f) => s + (f.rows ? f.rows.length : 0), 0);
        if (totalRows > STORAGE_MAX_ROWS) {
            localStorage.removeItem(key);
            console.warn(`数据量较大（${totalRows} 行），已跳过本地缓存以保证流畅，刷新后需重新上传。`);
            return;
        }
        localStorage.setItem(key, JSON.stringify(files));
    } catch (e) {
        console.warn('数据过大，无法保存到本地存储');
        try { localStorage.removeItem(key); } catch (_) {}
    }
}
