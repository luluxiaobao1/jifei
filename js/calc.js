// ========== 对账工具 - Tab3 资源包测算 ==========

// ========== 产品名称映射 ==========
const PRODUCT_NAME_MAP = {"etcd_cloud":"数据库 ETCD","olap":"OLAP数据库 OLAP","img":"图床","airun":"智能体 AIRUN","milvus_cloud":"向量数据库 Milvus","pika_cloud":"KV数据库 ZestKV","druid":"Druid","docker":"Docker","greenplum":"GreenPlum","cluster":"托管集群服务 MCS","memcache":"数据库 Memcache","etcd":"数据库 ETCD","tep":"AI评测平台 TEP","big_data_computing":"大数据计算 BDC","pgsql_cloud":"云数据库 PGSQL","tae":"AI评测平台 TEP","memory_saas":"智能体记忆 AMS","sandbox":"AI沙箱 Sandbox","memory":"智能体记忆 AMS","crs":"容器镜像服务 CRS","cis":"容器实例服务 CIS","pgsql_hulk":"云数据库 PGSQL","apimkt_vs":"视频生成 VS","apimkt_tts":"语音合成 TTS","apimkt_asr":"语音识别 ASR","apimkt_ic":"图像生成 IC","apimkt_iu":"图像理解 IU","ces_sign":"测试产品22","mcpmkt":"MCP市场 MCPMKT","signature":"电子签章","data_integration":"数据集成 DI","zie":"边缘计算","cdw":"云数仓 CDW","dsc":"流计算 DSC","aimi":"智能体对话 AIMI","appmkt":"应用市场 APPMKT","ocr_new":"OCR识别 OCR","llm":"大语言模型 LLM","tlgpublic":"大模型广场 TLG","tlppubllic":"AI标注平台 TLP","dlc":"湖计算 DLC","tlp":"AI标注平台 TLP","tlg":"大模型广场 TLG","pulsar_serverless":"消息队列 Pulsar","ai_model":"模型市场 MaaS","mongo_cloud":"文档数据库 MongoDB","vpc":"专有网络 VPC","geelib":"极库云 DevSecOps","geedoc":"知识中心 GeeDoc","iot_video":"帝视物联网 IOT","SLA":"运维服务 SLA","milvus":"向量数据库 Milvus","tidb":"分布式数据库 TiDB","pika":"KV数据库 Pika","ssl_hulk":"证书管理 SSL","vcs":"视频会议 VCS","publicdns":"域名管理 DNS","monitor_saas":"企业物联网平台 IOT","cds_public":"云硬盘 CDS","game":"游戏","redis_cloud":"KV数据库 Redis","es_cloud":"检索数据库 ES","tidb_cloud":"分布式数据库 TiDB","polefs_public":"文件系统 PoleFS","prophet":"大模型开发 TLM","zhouhe":"360宙合流量威胁分析平台 Zhouhe","zhoushi_public":"宙视资产监测与漏洞扫描平台ZhouShi","zhoushi":"宙视资产监测与漏洞扫描平台ZhouShi","cds":"云硬盘 CDS","ssl":"证书管理 SSL","cdw_qilin":"云数仓 CDW","apimarket":"API市场 APIMKT","slb":"负载均衡 SLB","eip":"弹性公网 EIP","mysql_cloud":"云数据库 MySQL","taipublic":"AI开发平台 TAI","tlm":"大模型开发 TLM","tai":"AI开发平台 TAI","s3_qilin":"对象存储 OBS","ecs":"云服务器 ECS","live":"视频直播 LIVE","qvod":"视频点播 VOD","cdn":"内容分发网络 CDN","interact":"音视频通话 RTC","sdk":"视频工具 VTK","qusm":"媒体处理 MPC","ai":"内容审核 CM","ocr":"OCR识别 OCR_定制","faceid":"人脸人体识别 FHR","muyin":"幕印企业学堂 MuYin","livingiot":"生活物联网 LifeIOT","aimonitor":"视图计算 VEC","yj":"易讲教室直播 YiJiang","k8s_image":"容器镜像服务 CRS","k8s":"容器实例服务 CIS","hdfs":"大数据存储 QHDFS","cloud_server":"云服务器 ECS","publicgc":"云舟观测 GC","firehawk":"云舟观测 GC","apicloud1":"API协作云 APICloud","apicloud":"API协作云 APICloud","zlambda":"函数计算 FC","graphics":"图像技术 IA_定制","pcdn":"P2P内容分发 PCDN","sms":"云短信 SMS","public_s3":"对象存储 OBS","ScheduledTasks":"定时任务","starrocks":"MPP数据库 StarRocks","spark":"湖计算 DLC","hulk":"Hulk","flink":"流计算 DSC","cephfs":"文件存储 CEPHFS","jiagubao":"三六零天御加固保 JiaGu","ApachePulsar":"消息队列 Pulsar","event_bridge":"事件总线 EB","dts":"数据迁移 DTS","hbase":"宽表型数据库 HBase","es":"检索数据库 ES","mongodb":"文档数据库 MongoDB","mysql":"云数据库 MySQL","cloud_drive":"文件系统 PoleFS","file_storage":"文件存储 HDFS","DNS":"域名管理 DNS","ElasticIP":"弹性公网 EIP","lvs":"负载均衡 SLB","vpc_net":"专有网络 VPC","qcm":"配置管理 QCM","iam":"统一身份认证 IAM","qbus":"消息队列 Kafka","redis":"KV数据库 Redis"};

// ========== 上传初始化 ==========
function initCalcUpload() {
    const uploadArea = document.getElementById('uploadArea-calc');
    const fileInput = document.getElementById('fileInput-calc');

    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        handleCalcFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        handleCalcFiles(e.target.files);
        fileInput.value = '';
    });
}

// ========== 二级 tab 切换 ==========
function switchCalcSubTab(sub) {
    document.querySelectorAll('.calc-sub-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('subTab-' + sub).classList.remove('hidden');
    document.querySelectorAll('#tab-calc .sub-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('subTabBtn-' + sub).classList.add('active');
    tabState.calc.activeSubTab = sub;
    try { localStorage.setItem(STORAGE_KEYS.calcSubTab, sub); } catch(e) {}
}

// ========== 文件处理 ==========
async function handleCalcFiles(fileList) {
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
        processCalcParsedFiles(parsed);
    } catch (err) {
        console.error(err);
        alert('文件解析失败：' + (err && err.message ? err.message : err));
    } finally {
        hideLoadingOverlay();
    }
}

function processCalcParsedFiles(parsed) {
    parsed.forEach(p => {
        const wb = p.workbook, sheetNames = wb.SheetNames;
        sheetNames.forEach(sn => {
            const sd = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false, dateNF: 'yyyy/mm/dd' });
            if (sd.length > 1) {
                tabState.calc.files.push({
                    name: sheetNames.length > 1 ? p.name + ' - ' + sn : p.name,
                    headers: sd[0], rows: sd.slice(1)
                });
            }
        });
    });
    updateCalcUI();
}

function removeCalcFile(index) {
    tabState.calc.files.splice(index, 1);
    if (tabState.calc.activeFileIndex >= tabState.calc.files.length) {
        tabState.calc.activeFileIndex = Math.max(0, tabState.calc.files.length - 1);
    }
    updateCalcUI();
}

function selectCalcFile(index) {
    if (index < 0 || index >= tabState.calc.files.length) return;
    tabState.calc.activeFileIndex = index;
    renderCalcFileTags();
    renderCalcPreview();
}

function resetCalc() {
    tabState.calc.files = [];
    tabState.calc.activeFileIndex = 0;
    try { localStorage.removeItem(STORAGE_KEYS.calc); } catch(e) {}
    updateCalcUI();
}

function renderCalcFileTags() {
    const files = tabState.calc.files;
    const active = tabState.calc.activeFileIndex;
    const tagsContainer = document.getElementById('fileTags-calc');
    tagsContainer.innerHTML = '';
    files.forEach((f, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const isActive = i === active;
        const tag = document.createElement('span');
        tag.className = 'file-tag cursor-pointer transition' + (isActive ? ' file-tag-active' : '');
        tag.onclick = (e) => { if (e.target.tagName !== 'BUTTON') selectCalcFile(i); };
        tag.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${color}"></span>
            <span class="${isActive ? 'text-blue-600 font-semibold' : 'text-gray-700'}">${f.name}</span>
            <span class="text-gray-400 text-xs">(${f.rows.length}行)</span>
            <button onclick="removeCalcFile(${i})" class="text-gray-400 hover:text-red-500 ml-1 font-bold">&times;</button>
        `;
        tagsContainer.appendChild(tag);
    });
}

function updateCalcUI() {
    const files = tabState.calc.files;
    const hasFiles = files.length > 0;

    try {
        if (hasFiles) saveFilesToStorage(STORAGE_KEYS.calc, files);
        else localStorage.removeItem(STORAGE_KEYS.calc);
    } catch(e) { console.warn('资源包测算数据过大，无法保存到本地存储'); }

    if (tabState.calc.activeFileIndex >= files.length) tabState.calc.activeFileIndex = 0;

    document.getElementById('uploadArea-calc').classList.toggle('hidden', hasFiles);
    document.getElementById('fileList-calc').classList.toggle('hidden', !hasFiles);
    document.getElementById('recommendBar-calc').classList.toggle('hidden', !hasFiles);
    renderCalcFileTags();
    renderCalcPreview();

    document.getElementById('resultArea-calc').classList.add('hidden');
    tabState.calc._lastCalcResult = null;
}

function renderCalcPreview() {
    const area = document.getElementById('previewArea-calc');
    const files = tabState.calc.files;
    if (files.length === 0) { area.innerHTML = ''; return; }
    const f = files[tabState.calc.activeFileIndex];
    if (!f) { area.innerHTML = ''; return; }

    const maxRows = 100;
    const rows = f.rows.slice(0, maxRows);
    const headHtml = f.headers.map(h => `<th class="txt">${h === '' ? '' : h}</th>`).join('');
    const bodyHtml = rows.map(r => {
        const cells = f.headers.map((_, ci) => {
            const v = r[ci];
            const isNum = typeof v === 'number';
            return `<td class="${isNum ? 'num' : 'txt'}">${v === undefined || v === null ? '' : v}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    const truncated = f.rows.length > maxRows;
    area.innerHTML = `
        <div class="bi-card">
            <button onclick="toggleCalcPreview(this)" class="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition rounded-lg">
                <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    📋 数据预览 · ${escapeHtml(f.name)}
                    <span class="text-xs font-normal text-gray-400">(${f.rows.length} 行 × ${f.headers.length} 列)</span>
                </h3>
                <span class="calc-preview-arrow text-gray-400 text-sm transition-transform duration-300">▶</span>
            </button>
            <div class="calc-preview-content hidden px-5 pb-4">
                ${truncated ? `<p class="text-xs text-amber-600 mb-2">⚠️ 数据量较大，预览仅显示前 ${maxRows} 行（共 ${f.rows.length} 行）。</p>` : ''}
                <div class="border rounded overflow-auto" style="max-height: calc(100vh - 360px);">
                    <table>
                        <thead><tr>${headHtml}</tr></thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function toggleCalcPreview(btn) {
    const wrapper = btn.closest('.bi-card');
    const content = wrapper.querySelector('.calc-preview-content');
    const arrow = wrapper.querySelector('.calc-preview-arrow');
    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

// ========== 图表功能 ==========
function toggleCalcAxisSettings() {
    const body = document.getElementById('axisSettingsBody-calc');
    const arrow = document.getElementById('axisSettingsToggle-calc');
    const collapsed = body.classList.toggle('hidden');
    arrow.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(180deg)';
}

function populateCalcAxisSelectors() {
    const files = tabState.calc.files;
    if (files.length === 0) return;

    const f = files[tabState.calc.activeFileIndex] || files[0];
    const headers = f.headers;

    const xSelect = document.getElementById('xAxis-calc');
    const currentX = xSelect.value;
    xSelect.innerHTML = '<option value="">-- 请选择 --</option>' +
        headers.map((h, i) => `<option value="${i}">${h === '' ? '列' + (i + 1) : h}</option>`).join('');
    if (currentX && headers[currentX]) xSelect.value = currentX;

    const yAxisDiv = document.getElementById('yAxis-calc');
    yAxisDiv.innerHTML = headers.map((h, i) => {
        const label = h === '' ? '列' + (i + 1) : h;
        return `<label class="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-100 px-1 rounded">
            <input type="checkbox" class="y-col-checkbox-calc rounded text-blue-500" value="${i}">
            <span class="text-sm text-gray-700">${label}</span>
        </label>`;
    }).join('');

    document.getElementById('columnSelector-calc').classList.remove('hidden');
}

function drawCalcChart() {
    const files = tabState.calc.files;
    if (files.length === 0) { alert('请先上传文件'); return; }

    const f = files[tabState.calc.activeFileIndex] || files[0];

    const xColIdx = document.getElementById('xAxis-calc').value;
    if (xColIdx === '') { alert('请选择横坐标（X 轴）列'); return; }
    const xBase = parseInt(xColIdx);

    const yColIdxs = Array.from(document.querySelectorAll('.y-col-checkbox-calc:checked')).map(cb => parseInt(cb.value));
    if (yColIdxs.length === 0) { alert('请至少选择一个纵坐标（Y 轴）列'); return; }

    const showLegend = document.getElementById('optShowLegend-calc').checked;
    const showDataLabels = document.getElementById('optShowDataLabels-calc').checked;
    const chartType = document.getElementById('chartType-calc').value || 'bar';

    const cfg = {
        headers: f.headers, baseFileName: f.name, xBase, yColIdxs,
        secondaryCols: new Set(), dimCols: [],
        filters: [], axisFilters: [], yFilters: [], dimFilters: [],
        showLegend, showDataLabels, mirrorNegative: false, chartType, compares: []
    };

    const chartArea = document.getElementById('chartArea-calc');
    chartArea.innerHTML = '';
    buildChartForFile(f, cfg);
}

// ========== 核心逻辑 ==========
function buildReverseProductMap() {
    const reverse = {};

    // 从 PRODUCT_NAME_MAP 构建基础反向映射
    for (const [sign, name] of Object.entries(PRODUCT_NAME_MAP)) {
        const chinesePart = name.split(/\s+/)[0];
        if (!reverse[name]) reverse[name] = [];
        if (!reverse[chinesePart]) reverse[chinesePart] = [];
        if (!reverse[name].includes(sign)) reverse[name].push(sign);
        if (!reverse[chinesePart].includes(sign)) reverse[chinesePart].push(sign);
    }

    // 从资源包列表数据补充组合名称（产品名称 - 小产品名称）
    if (allPackData && allPackData.length > 0) {
        for (const pack of allPackData) {
            const sign = pack.product_sign;
            if (!sign) continue;
            const baseName = PRODUCT_NAME_MAP[sign] || sign;
            const smallName = pack.small_sign_name;

            // 添加组合名称，与资源包列表「产品名称」列显示一致
            if (smallName && smallName.trim()) {
                const combinedName = baseName + ' - ' + smallName;
                if (!reverse[combinedName]) reverse[combinedName] = [];
                if (!reverse[combinedName].includes(sign)) reverse[combinedName].push(sign);
            }
        }
    }

    return reverse;
}

function findColumnIndex(headers, candidates) {
    for (const c of candidates) {
        const idx = headers.findIndex(h => {
            const ht = String(h).trim().toLowerCase();
            return ht === c.toLowerCase();
        });
        if (idx >= 0) return idx;
    }
    for (const c of candidates) {
        const idx = headers.findIndex(h => String(h).trim().includes(c));
        if (idx >= 0) return idx;
    }
    return -1;
}

function extractProductSummary() {
    const files = tabState.calc.files;
    const reverseMap = buildReverseProductMap();
    const productMap = {};
    let skippedRows = 0;

    const PRODUCT_CANDIDATES = ['产品名称', '产品', 'product', 'product_name', 'productName'];
    const ITEM_CANDIDATES = ['计费项名称', '计费项', '费用项', 'billing_item', 'itemName', 'item_name'];
    const USAGE_CANDIDATES = ['用量', '数量', 'usage', 'quantity', 'amount'];
    const PRICE_CANDIDATES = ['标准价', '原价', '标准价格', 'standard_price', 'standardPrice', 'price'];
    const PAYABLE_CANDIDATES = ['应付金额', '应付', 'payable', 'payable_amount', 'payableAmount'];

    files.forEach(f => {
        const colProduct = findColumnIndex(f.headers, PRODUCT_CANDIDATES);
        const colItem = findColumnIndex(f.headers, ITEM_CANDIDATES);
        const colUsage = findColumnIndex(f.headers, USAGE_CANDIDATES);
        const colPrice = findColumnIndex(f.headers, PRICE_CANDIDATES);
        const colPayable = findColumnIndex(f.headers, PAYABLE_CANDIDATES);

        if (colProduct < 0) {
            console.warn(`文件 "${f.name}" 缺少"产品名称"列，已跳过`);
            return;
        }

        f.rows.forEach(row => {
            const productName = String(row[colProduct] || '').trim();
            if (!productName) { skippedRows++; return; }

            const itemName = colItem >= 0 ? String(row[colItem] || '').trim() : '';
            const usage = colUsage >= 0 ? parseFloat(String(row[colUsage]).replace(/,/g, '')) || 0 : 0;
            const standardPrice = colPrice >= 0 ? parseFloat(String(row[colPrice]).replace(/,/g, '')) || 0 : 0;
            const payable = colPayable >= 0 ? parseFloat(String(row[colPayable]).replace(/,/g, '')) || 0 : 0;

            if (!productMap[productName]) {
                const signs = reverseMap[productName] || [];
                productMap[productName] = {
                    productName, productSigns: signs, billingItems: [],
                    totalUsage: 0, totalStandardPrice: 0, totalPayable: 0
                };
            }

            const p = productMap[productName];
            p.billingItems.push({ name: itemName, usage, standardPrice, payable });
            p.totalUsage += usage;
            p.totalStandardPrice += standardPrice;
            p.totalPayable += payable;
        });
    });

    return { products: productMap, skippedRows };
}

function sumMatchedBillingItems(billingItems, packConfigs) {
    if (!packConfigs || packConfigs.length === 0) {
        return {
            totalUsage: billingItems.reduce((s, b) => s + b.usage, 0),
            totalStandardPrice: billingItems.reduce((s, b) => s + b.standardPrice, 0),
            totalPayable: billingItems.reduce((s, b) => s + b.payable, 0),
            matchedCount: billingItems.length, totalCount: billingItems.length,
            matchedItems: billingItems.map(b => ({ name: b.name, usage: b.usage, standardPrice: b.standardPrice, payable: b.payable }))
        };
    }

    // 计费项名称使用 label_name_tag_info_value 组合格式（与弹框展示一致）
    const configNames = packConfigs.map(c => {
        const name = c.label_name || '';
        const tiv = c.tag_info_value || tacticValueMap[c.tag_info_key] || '';
        return tiv ? (name + '_' + tiv) : name;
    });
    const matched = [];
    const unmatched = [];

    billingItems.forEach(item => {
        const itemName = item.name || '';
        // 精确匹配：计费项名称必须完全一致
        const isMatch = configNames.some(cn => cn && cn === itemName);

        if (isMatch) matched.push(item);
        else unmatched.push(item);
    });

    return {
        totalUsage: matched.reduce((s, b) => s + b.usage, 0),
        totalStandardPrice: matched.reduce((s, b) => s + b.standardPrice, 0),
        totalPayable: matched.reduce((s, b) => s + b.payable, 0),
        matchedCount: matched.length, totalCount: billingItems.length,
        matchedItems: matched.map(b => ({ name: b.name, usage: b.usage, standardPrice: b.standardPrice, payable: b.payable }))
    };
}

function calculateResourcePacks(productSummary) {
    const results = [];
    const unmatched = [];

    if (!allPackData || allPackData.length === 0) {
        return { results: [], unmatched: [], error: '请先在「资源包列表」子页中查询资源包数据' };
    }

    const PACK_TYPE_MAP = { 1: '总量包', 2: '总价包' };
    const USE_TYPE_MAP = { 1: '一次性', 2: '持续' };
    const BILL_TYPE_MAP = { hour: '按小时', day: '按天', month: '按月', year: '按年' };

    for (const [productName, summary] of Object.entries(productSummary.products)) {
        const matchedPacks = allPackData.filter(p =>
            summary.productSigns.includes(p.product_sign) && p.status === 2
        );

        if (matchedPacks.length === 0) {
            unmatched.push({
                productName, productSigns: summary.productSigns,
                totalUsage: summary.totalUsage, totalStandardPrice: summary.totalStandardPrice
            });
            continue;
        }

        matchedPacks.forEach(pack => {
            const packType = Number(pack.pack_type);
            const useType = Number(pack.use_type);
            const billType = pack.bill_type;
            const rule = packDeductRuleStore[pack.id];
            const packConfigs = packConfigStore[pack.id];

            const matched = sumMatchedBillingItems(summary.billingItems, packConfigs);

            const result = {
                productName, packName: pack.pack_name, packId: pack.id, packSign: pack.pack_sign,
                packStatus: pack.status,
                packType: PACK_TYPE_MAP[packType] || String(packType),
                useType: USE_TYPE_MAP[useType] || String(useType),
                billType: BILL_TYPE_MAP[billType] || billType,
                requiredCount: null,
                standardPrice: Number(pack.original_price) || 0,
                vDiscount: pack.v_discount, svipDiscount: pack.s_v_discount, minDiscount: pack.minimum_discount,
                deductRuleDesc: '', matchedBillingItems: matched.matchedItems,
                matchedUsage: matched.totalUsage, matchedStandardPrice: matched.totalStandardPrice, matchedPayable: matched.totalPayable,
                status: 'ok', statusMsg: ''
            };

            if (!rule) {
                result.status = 'no_rule';
                result.statusMsg = '待同步抵扣规则';
                results.push(result);
                return;
            }

            if (matched.matchedCount === 0 && packConfigs && packConfigs.length > 0) {
                result.status = 'no_match';
                result.statusMsg = '未匹配到计费项';
                results.push(result);
                return;
            }

            let count = null;

            if (packType === 1 && useType === 2) {
                const fn = rule.fixed_number;
                const fnUnit = rule.fixed_number_unit || '-';
                result.deductRuleDesc = '每' + (BILL_TYPE_MAP[billType] || billType).replace('按', '') + '抵扣 ' + (fn != null ? fn : '-') + '，持续 ' + fnUnit + ' 个月';
                if (fn == null || fn === 0) { result.status = 'rule_error'; result.statusMsg = '抵扣量为 0 或缺失'; }
                else if (billType === 'hour') count = matched.totalUsage / 24 / fn;
                else if (billType === 'day') count = matched.totalUsage / fn;
                else if (billType === 'month') count = matched.totalUsage * 30 / fn;
                else count = matched.totalUsage / fn;
            } else if (packType === 2 && useType === 2) {
                const fnp = rule.fixed_number_price;
                const dm = rule.deduction_month || '-';
                result.deductRuleDesc = '每' + (BILL_TYPE_MAP[billType] || billType).replace('按', '') + '抵扣 ' + (fnp != null ? fnp : '-') + ' 元，持续 ' + dm + ' 个月';
                if (fnp == null || fnp === 0) { result.status = 'rule_error'; result.statusMsg = '抵扣金额为 0 或缺失'; }
                else if (billType === 'hour') count = matched.totalStandardPrice / 24 / fnp;
                else if (billType === 'day') count = matched.totalStandardPrice / fnp;
                else if (billType === 'month') count = matched.totalStandardPrice * 30 / fnp;
                else count = matched.totalStandardPrice / fnp;
            } else if (packType === 1 && useType === 1) {
                const num = rule.number;
                result.deductRuleDesc = '一次性提供 ' + (num != null ? num : '-') + ' 总量';
                if (num == null || num === 0) { result.status = 'rule_error'; result.statusMsg = '总量为 0 或缺失'; }
                else count = matched.totalUsage / num;
            } else if (packType === 2 && useType === 1) {
                const op = Number(pack.original_price) || 0;
                result.deductRuleDesc = '一次性抵扣 ' + op.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + ' 元';
                if (op === 0) { result.status = 'rule_error'; result.statusMsg = '原价为 0'; }
                else count = summary.totalStandardPrice / op;
            } else {
                result.status = 'unknown_type';
                result.statusMsg = '未知类型组合';
            }

            result.requiredCount = count;
            results.push(result);
        });
    }

    return { results, unmatched, error: null };
}

// ========== 渲染 ==========
function renderCalcStats(stats) {
    const el = document.getElementById('calcResultStats');
    el.innerHTML = `
        <div class="kpi-card kpi-blue"><div class="text-xs text-gray-500 mb-1">涉及产品</div><div class="text-2xl font-bold text-blue-600">${stats.productCount}</div></div>
        <div class="kpi-card kpi-green"><div class="text-xs text-gray-500 mb-1">匹配资源包</div><div class="text-2xl font-bold text-green-600">${stats.matchedCount}</div></div>
        <div class="kpi-card kpi-blue"><div class="text-xs text-gray-500 mb-1">可测算</div><div class="text-2xl font-bold text-blue-600">${stats.calculableCount}</div></div>
        <div class="kpi-card kpi-orange"><div class="text-xs text-gray-500 mb-1">待同步</div><div class="text-2xl font-bold text-orange-500">${stats.pendingSyncCount}</div></div>
    `;
}

function normalizeDiscount(v) {
    if (v == null || v === '' || v === '-') return null;
    const n = Number(v);
    if (isNaN(n) || n <= 0) return null;
    return n >= 1 ? n / 10 : n;
}

function getCalcDiscountRate() {
    const sel = document.getElementById('calcDiscountType');
    return sel ? sel.value : 'svip';
}

function renderCalcResult(calcResult) {
    const { results, unmatched, error } = calcResult;
    const resultArea = document.getElementById('resultArea-calc');
    resultArea.classList.remove('hidden');

    if (error) {
        document.getElementById('calcResultStats').innerHTML = '';
        document.getElementById('calcResultHead').innerHTML = '';
        document.getElementById('calcResultBody').innerHTML =
            '<tr><td colspan="18" style="text-align:center;padding:40px;color:#dc2626;">' + escapeHtml(error) + '</td></tr>';
        document.getElementById('unmatchedProducts').classList.add('hidden');
        return;
    }

    const productNames = new Set(results.map(r => r.productName));
    unmatched.forEach(u => productNames.add(u.productName));
    const stats = {
        productCount: productNames.size, matchedCount: results.length,
        calculableCount: results.filter(r => r.status === 'ok').length,
        pendingSyncCount: results.filter(r => r.status === 'no_rule').length
    };
    renderCalcStats(stats);

    const columns = ['产品名称', '资源包名称', '资源包标识', '上架状态', '包类型', '使用类型', '计费周期', '抵扣规则', '匹配计费项', '匹配用量', '匹配标准价', '匹配应付金额', '所需个数', '推荐购买个数', '资源包标准价', '资源包购买价', '预估总价', '状态'];
    document.getElementById('calcResultHead').innerHTML = '<tr>' + columns.map(c => '<th>' + c + '</th>').join('') + '</tr>';

    if (results.length === 0) {
        document.getElementById('calcResultBody').innerHTML =
            '<tr><td colspan="18" style="text-align:center;padding:40px;color:#999;">无测算结果</td></tr>';
    } else {
        const fmtMoney = v => v != null ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
        const fmtNum = v => v != null ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
        const fmtCount = v => v != null ? v.toFixed(2) : '-';
        const discountType = getCalcDiscountRate();
        const statusBadge = (status, msg) => {
            if (status === 'ok') return '<span style="color:#16a34a;">✅ 正常</span>';
            if (status === 'no_rule') return '<span style="color:#d97706;" title="' + escapeHtml(msg) + '">⚠️ 待同步</span>';
            if (status === 'no_match') return '<span style="color:#d97706;" title="' + escapeHtml(msg) + '">⚠️ ' + escapeHtml(msg) + '</span>';
            if (status === 'rule_error') return '<span style="color:#dc2626;" title="' + escapeHtml(msg) + '">❌ ' + escapeHtml(msg) + '</span>';
            return '<span style="color:#999;">' + escapeHtml(msg) + '</span>';
        };

        document.getElementById('calcResultBody').innerHTML = results.map(r => {
            const countStr = r.requiredCount != null ? '<strong>' + fmtCount(r.requiredCount) + '</strong>' : '-';
            const items = r.matchedBillingItems || [];
            // 匹配计费项：展示匹配到的计费项数量
            const matchedCountStr = items.length > 0 ? items.length : '-';
            // 匹配总量：展示匹配计费项的用量总和
            const matchedUsageStr = r.matchedUsage != null && items.length > 0 ? fmtNum(r.matchedUsage) : '-';
            // 匹配标准价：展示匹配计费项的标准价总和
            const matchedStdPriceStr = r.matchedStandardPrice != null && items.length > 0 ? fmtMoney(r.matchedStandardPrice) : '-';
            // 匹配应付金额：展示匹配计费项的应付金额总和
            const matchedPayableStr = r.matchedPayable != null && items.length > 0 ? fmtMoney(r.matchedPayable) : '-';

            // 推荐购买个数 = 所需个数向下取整
            const recommendedCount = r.requiredCount != null ? Math.floor(r.requiredCount) : null;
            const recommendedStr = recommendedCount != null ? recommendedCount : '-';

            // 资源包购买价 = 标准价 × 对应折扣
            let discountRaw = null;
            if (discountType === 'svip') discountRaw = r.svipDiscount;
            else if (discountType === 'vip') discountRaw = r.vDiscount;
            else if (discountType === 'minimum') discountRaw = r.minDiscount;
            const discountRate = normalizeDiscount(discountRaw);
            const purchasePrice = (r.standardPrice != null && discountRate != null)
                ? r.standardPrice * discountRate : null;
            const purchaseStr = purchasePrice != null ? fmtMoney(purchasePrice)
                : (discountRate == null && r.standardPrice != null ? '<span style="color:#bbb;" title="无该折扣数据">' + fmtMoney(r.standardPrice) + '</span>' : '-');

            // 预估总价 = 推荐购买个数 × 资源包购买价
            const totalCost = (recommendedCount != null && purchasePrice != null)
                ? recommendedCount * purchasePrice : null;
            const totalCostStr = totalCost != null ? fmtMoney(totalCost) : '-';

            // 存储计算后的值供导出使用
            r._recommendedCount = recommendedCount;
            r._purchasePrice = purchasePrice;
            r._totalCost = totalCost;
            r._discountType = discountType;

            const packStatusStr = r.packStatus === 2 ? '<span class="pack-badge pack-badge-on">已上架</span>' : (r.packStatus === 1 ? '<span class="pack-badge pack-badge-off">已下架</span>' : '-');

            return '<tr>' +
                '<td class="txt">' + escapeHtml(r.productName) + '</td>' +
                '<td class="txt">' + escapeHtml(r.packName) + '</td>' +
                '<td class="txt">' + escapeHtml(r.packSign || '-') + '</td>' +
                '<td class="txt">' + packStatusStr + '</td>' +
                '<td class="txt">' + escapeHtml(r.packType) + '</td>' +
                '<td class="txt">' + escapeHtml(r.useType) + '</td>' +
                '<td class="txt">' + escapeHtml(r.billType) + '</td>' +
                '<td class="txt" style="font-size:11px;color:#666;">' + escapeHtml(r.deductRuleDesc) + '</td>' +
                '<td class="num">' + matchedCountStr + '</td>' +
                '<td class="num">' + matchedUsageStr + '</td>' +
                '<td class="num">' + matchedStdPriceStr + '</td>' +
                '<td class="num">' + matchedPayableStr + '</td>' +
                '<td class="num">' + countStr + '</td>' +
                '<td class="num">' + recommendedStr + '</td>' +
                '<td class="num">' + fmtMoney(r.standardPrice) + '</td>' +
                '<td class="num">' + purchaseStr + '</td>' +
                '<td class="num">' + totalCostStr + '</td>' +
                '<td class="txt">' + statusBadge(r.status, r.statusMsg) + '</td>' +
                '</tr>';
        }).join('');
    }

    const unmatchedEl = document.getElementById('unmatchedProducts');
    const unmatchedList = document.getElementById('unmatchedList');
    if (unmatched.length > 0) {
        unmatchedEl.classList.remove('hidden');
        unmatchedList.innerHTML = unmatched.map(u => {
            const signs = u.productSigns.length > 0 ? u.productSigns.join(', ') : '未找到对应 product_sign';
            return '<div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">' +
                '<span class="font-medium text-gray-800">' + escapeHtml(u.productName) + '</span>' +
                '<span class="text-xs text-gray-400">(' + escapeHtml(signs) + ')</span>' +
                '<span class="text-xs text-gray-500">总用量: ' + u.totalUsage.toLocaleString('zh-CN') + ' | 总标准价: ' + u.totalStandardPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</span>' +
                '</div>';
        }).join('');
    } else {
        unmatchedEl.classList.add('hidden');
    }

    tabState.calc._lastCalcResult = results;
    tabState.calc._lastCalcResultRaw = calcResult;
}

function exportCalcResult() {
    const results = tabState.calc._lastCalcResult;
    if (!results || results.length === 0) { alert('没有可导出的测算结果'); return; }

    const headers = ['产品名称', '资源包名称', '资源包标识', '上架状态', '包类型', '使用类型', '计费周期', '抵扣规则', '匹配计费项', '匹配用量', '匹配标准价', '匹配应付金额', '所需个数', '推荐购买个数', '资源包标准价', '资源包购买价', '预估总价', '状态'];
    const rows = results.map(r => [
        r.productName, r.packName, r.packSign || '', r.packStatus === 2 ? '已上架' : (r.packStatus === 1 ? '已下架' : ''), r.packType, r.useType, r.billType,
        r.deductRuleDesc,
        r.matchedBillingItems ? r.matchedBillingItems.length : '',
        r.matchedUsage != null ? r.matchedUsage : '',
        r.matchedStandardPrice != null ? r.matchedStandardPrice : '',
        r.matchedPayable != null ? r.matchedPayable : '',
        r.requiredCount != null ? r.requiredCount : '',
        r._recommendedCount != null ? r._recommendedCount : '',
        r.standardPrice, r._purchasePrice != null ? r._purchasePrice : '',
        r._totalCost != null ? r._totalCost : '',
        r.status === 'ok' ? '正常' : r.statusMsg
    ]);

    const csvContent = '' + [headers, ...rows].map(row =>
        row.map(cell => {
            const s = String(cell == null ? '' : cell);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '资源包测算结果_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ========== 批量同步缺失规则（使用 extractDeductRule 公共函数） ==========
async function syncMissingRules(btn) {
    const results = tabState.calc._lastCalcResult;
    if (!results) { alert('请先执行测算'); return; }

    const missingPacks = results.filter(r => r.status === 'no_rule').map(r => ({ id: r.packId, name: r.packName }));
    if (missingPacks.length === 0) { alert('所有资源包的抵扣规则均已同步，无需操作'); return; }

    const token = getActiveToken();
    if (!token) { alert('请先在「资源包列表」子页中输入 Token'); return; }

    btn.disabled = true;
    const origText = btn.textContent;
    let ok = 0, fail = 0;

    for (let i = 0; i < missingPacks.length; i++) {
        const pack = missingPacks[i];
        btn.textContent = '同步中 ' + (i + 1) + '/' + missingPacks.length + '...';
        try {
            const resp = await fetch('/api/resourcePack/infoById', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Cookie-Token': token },
                body: JSON.stringify({ id: pack.id })
            });
            if (!resp.ok) { fail++; continue; }
            const json = await resp.json();
            if (json.errno !== undefined && json.errno !== 0) { fail++; continue; }

            const data = json.data || {};
            const quota = data.resource_pack_quota;
            const deductRule = extractDeductRule(data, quota);

            if (Object.keys(deductRule).length > 0) {
                packDeductRuleStore[pack.id] = deductRule;
                ok++;
            } else {
                fail++;
            }
        } catch (e) {
            console.warn('同步资源包 ' + pack.id + ' 失败:', e);
            fail++;
        }
    }

    savePackDeductRules();
    btn.disabled = false;
    btn.textContent = origText;
    alert('同步完成：成功 ' + ok + ' 个，失败 ' + fail + ' 个');

    if (ok > 0) recommendResourcePackage();
}

// ========== 资源包推荐（主入口） ==========
function recommendResourcePackage() {
    if (!tabState.calc.files || tabState.calc.files.length === 0) {
        alert('请先上传账单文件');
        return;
    }

    if (!allPackData || allPackData.length === 0) {
        alert('请先在「资源包列表」子页中查询资源包数据，然后再执行测算。\n\n操作步骤：\n1. 点击上方「资源包列表」标签\n2. 输入 Token 并点击「查询资源包」\n3. 返回「资源包测算」标签\n4. 再次点击「资源包推荐」');
        return;
    }

    const summary = extractProductSummary();
    const productCount = Object.keys(summary.products).length;
    if (productCount === 0) {
        alert('未从账单文件中提取到有效的产品数据。\n\n请确认文件包含"产品名称"列。' +
            (summary.skippedRows > 0 ? '\n（已跳过 ' + summary.skippedRows + ' 行空数据）' : ''));
        return;
    }

    console.log('[资源包测算] 提取到 ' + productCount + ' 个产品，跳过 ' + summary.skippedRows + ' 行');

    const calcResult = calculateResourcePacks(summary);
    renderCalcResult(calcResult);
}
