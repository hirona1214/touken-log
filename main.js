import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { GEMINI_API_KEY } from './config.js';

// --- Gemini API 設定 ---
// const GEMINI_API_KEY = "AIzaSyArZk5fhj9coNM_B4abYJvWP0lwo1MmFuY";

// --- Firebase 設定 ---
const firebaseConfig = {
    apiKey: "AIzaSyC32tKkWQTDZrxM2rypST5KIMINI5wFzVc",
    authDomain: "touken-manager.firebaseapp.com",
    projectId: "touken-manager",
    storageBucket: "touken-manager.firebasestorage.app",
    messagingSenderId: "628627612862",
    appId: "1:628627612862:web:c06b91f4fc656064472aef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let charts = {};
let rawToukenData = [];
let toukenMaster = [];
let rowCount = 0;
let rawResourceData = [];
let rawItemData = [];
let resourcePeriod = 'all';
let toukenPeriod = 'all';
// --- Chart.js：凡例を四角で囲うプラグイン ---
const boxedLegendPlugin = {
    id: 'boxedLegendPlugin',
    beforeDraw(chart) {
        const legend = chart.legend;
        if (!legend || !legend.options.display) return;

        const ctx = chart.ctx;
        const paddingX = 14;
        const paddingY = 9;
        const radius = 8;

        // 凡例枠が canvas の左端・右端で見切れないように、
        // 描画エリアの横幅内に収める。
        const safeLeft = chart.chartArea?.left ?? paddingX;
        const safeRight = chart.chartArea?.right ?? (chart.width - paddingX);
        const x = Math.max(paddingX, safeLeft);
        const y = legend.top - paddingY;
        const w = Math.max(0, safeRight - x);
        const h = legend.height + paddingY * 2;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.strokeStyle = 'rgba(31, 95, 74, 0.95)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
};

// --- Chart.js：x軸の下に年をまとめて表示するプラグイン ---
const yearBandPlugin = {
    id: 'yearBandPlugin',
    afterDraw(chart) {
        const xScale = chart.scales.x;
        if (!xScale) return;

        const chartArea = chart.chartArea;
        const ctx = chart.ctx;

        const minTime = xScale.min;
        const maxTime = xScale.max;
        if (!minTime || !maxTime) return;

        const minDate = new Date(minTime);
        const maxDate = new Date(maxTime);

        const startYear = minDate.getFullYear();
        const endYear = maxDate.getFullYear();

        ctx.save();
        ctx.fillStyle = '#555';
        ctx.font = 'bold 12px "Yu Mincho", "Hiragino Mincho ProN", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let year = startYear; year <= endYear; year++) {
            const yearStart = new Date(year, 0, 1).getTime();
            const yearEnd = new Date(year, 11, 31, 23, 59, 59).getTime();

            const visibleStart = Math.max(yearStart, minTime);
            const visibleEnd = Math.min(yearEnd, maxTime);

            if (visibleStart > maxTime || visibleEnd < minTime) continue;

            const centerTime = visibleStart + (visibleEnd - visibleStart) / 2;
            const centerX = xScale.getPixelForValue(centerTime);

            if (centerX >= chartArea.left && centerX <= chartArea.right) {
                ctx.fillText(String(year), centerX, chartArea.bottom + 42);
            }
        }

        ctx.restore();
    }
};

Chart.register(boxedLegendPlugin, yearBandPlugin);

// --- 認証状態の監視 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userInfo').innerText = ``;
        document.getElementById('loginBtn').innerText = "ログアウト";
        loadResourceData(user.uid);
        loadToukenData(user.uid);
        loadMasterData();
    } else {
        document.getElementById('userInfo').innerText = "(未ログイン)";
        document.getElementById('loginBtn').innerText = "ログイン";
    }
});

// --- データ読み込み系 ---
function loadMasterData() {
    onSnapshot(collection(db, "touken_master"), (snapshot) => {
        toukenMaster = [];
        snapshot.forEach(doc => {
            toukenMaster.push({ id: doc.id, ...doc.data() });
        });
        renderMasterEditList();
    });
}

function loadToukenData(uid) {
    const q = query(collection(db, "users", uid, "touken"), orderBy("date", "asc"));
    onSnapshot(q, (snapshot) => {
        rawToukenData = [];
        snapshot.forEach(doc => {
            rawToukenData.push({ id: doc.id, ...doc.data() });
        });
        updateToukenView();
        renderEditList();
        calculateGrowthRanking();
    });
}

function loadResourceData(uid) {
    onSnapshot(query(collection(db, "users", uid, "resources"), orderBy("date", "asc")), (snapshot) => {
        rawResourceData = [];
        snapshot.forEach(doc => {
            rawResourceData.push({ id: doc.id, ...doc.data() });
        });
        updateResourceView();
    });

    onSnapshot(query(collection(db, "users", uid, "items"), orderBy("date", "asc")), (snapshot) => {
        rawItemData = [];
        snapshot.forEach(doc => {
            rawItemData.push({ id: doc.id, ...doc.data() });
        });
        updateResourceView();
    });
}

// --- CSVインポート機能 ---
window.handleCsvUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const user = auth.currentUser;
    if (!user) return alert("ログインしてください");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/);
        const dateVal = prompt("登録する日付を入力してください (YYYY-MM-DD)", new Date().toISOString().split('T')[0]);
        if (!dateVal) return;

        let successCount = 0;
        let skipCount = 0;
        for (let line of lines) {
            if (!line.trim()) continue;
            const [name, lvStr] = line.split(',').map(s => s.trim());
            const lv = parseInt(lvStr);
            if (!name || isNaN(lv)) { skipCount++; continue; }

            const master = toukenMaster.find(m => m.name === name || name.includes(m.name));
            if (master) {
                await addDoc(collection(db, "users", user.uid, "touken"), {
                    date: dateVal, name: master.name, lv: lv, type: master.type, rarity: master.rarity, timestamp: new Date()
                });
                successCount++;
            } else { skipCount++; }
        }
        alert(`インポート完了！\n登録: ${successCount}振り\nスキップ: ${skipCount}件`);
        event.target.value = ""; 
    };
    reader.readAsText(file);
};

// --- ランキング計算 ---
function formatSlashDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
}

function calculateGrowthRanking() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const startStr = thirtyDaysAgo.toISOString().split('T')[0];

    // ⑥ タイトル右に集計期間を表示
    const rankingTitle = [...document.querySelectorAll('.chart-inner-title')]
        .find(el => el.textContent.includes('直近30日の成長TOP10'));

    if (rankingTitle) {
        let rangeEl = rankingTitle.parentElement.querySelector('.ranking-range');
        if (!rangeEl) {
            rangeEl = document.createElement('span');
            rangeEl.className = 'ranking-range';
            rankingTitle.parentElement.appendChild(rangeEl);
        }
        rangeEl.textContent = `${formatSlashDate(thirtyDaysAgo)}～${formatSlashDate(today)}`;
    }

    const stats = {};
    rawToukenData.forEach(d => {
        if (!stats[d.name]) stats[d.name] = [];
        stats[d.name].push({ date: d.date, lv: Number(d.lv) });
    });

    const ranking = [];

    Object.keys(stats).forEach(name => {
        const history = stats[name].sort((a, b) => a.date.localeCompare(b.date));
        if (history.length < 2) return;

        const lv30DaysAgo = getInterpolatedLevel(history, thirtyDaysAgo);
        if (lv30DaysAgo === null) return;

        const latestLog = history[history.length - 1];
        const lvNow = Number(latestLog.lv);
        const beforeLv = Math.floor(lv30DaysAgo);
        const diff = Math.floor(lvNow - lv30DaysAgo);

        if (diff > 0) {
            ranking.push({
                name,
                diff,
                beforeLv,
                afterLv: lvNow,
                history: [
                    { date: startStr, lv: lv30DaysAgo },
                    ...history.filter(h => new Date(h.date) > thirtyDaysAgo),
                    { date: todayStr, lv: lvNow }
                ]
            });
        }
    });

    ranking.sort((a, b) => b.diff - a.diff);
    const top10 = ranking.slice(0, 10);

    const listEl = document.getElementById('rankingList');
    if (listEl) {
        listEl.innerHTML = top10.length
    ? top10.map((item, i) => {
        const rank = i + 1;

        const rankColor = stringToColor(item.name);

        return `
            <div class="ranking-item" style="--rank-color: ${rankColor};">
                <span class="rank-swatch" aria-hidden="true"></span>
                <span class="rank-num">${rank}</span>
                <span class="rank-name" title="${item.name}">${item.name}</span>
                <span class="rank-diff">+${item.diff}Lv</span>
                <span class="rank-level">Lv.${item.beforeLv} → Lv.${item.afterLv}</span>
            </div>
        `;
    }).join('')
    : '<div class="ranking-empty">直近30日で成長を集計できるデータがまだありません。</div>';
}
    const top10Datasets = top10.map(item => ({
        label: item.name,
        data: item.history.map(h => ({ x: h.date, y: h.lv })),
        borderColor: stringToColor(item.name),
        backgroundColor: stringToColor(item.name),
        pointBackgroundColor: stringToColor(item.name),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 6,
        tension: 0.16,
        fill: false
    }));

    renderToukenChart('top10Chart', top10Datasets, startStr);
}

function getInterpolatedLevel(history, targetDate) {
    const targetTime = targetDate.getTime();
    const firstLog = history[0];
    const lastLog = history[history.length - 1];
    const firstTime = new Date(firstLog.date).getTime();
    const lastTime = new Date(lastLog.date).getTime();
    if (targetTime < firstTime) return null;
    if (targetTime >= lastTime) return lastLog.lv;
    for (let i = 0; i < history.length - 1; i++) {
        const start = history[i];
        const end = history[i + 1];
        const startTime = new Date(start.date).getTime();
        const endTime = new Date(end.date).getTime();
        if (targetTime >= startTime && targetTime <= endTime) {
            const timeDiff = endTime - startTime;
            const lvDiff = end.lv - start.lv;
            const progress = (targetTime - startTime) / timeDiff;
            return start.lv + (lvDiff * progress);
        }
    }
    return null;
}

// --- 期間フィルタリング用ヘルパー ---
function getStartDate(period) {
    const now = new Date();
    switch (period) {
        case '1y': now.setFullYear(now.getFullYear() - 1); break;
        case '6m': now.setMonth(now.getMonth() - 6); break;
        case '3m': now.setMonth(now.getMonth() - 3); break;
        case '1m': now.setMonth(now.getMonth() - 1); break;
        case '1w': now.setDate(now.getDate() - 7); break;
        case 'all': return null;
    }
    return now.toISOString().split('T')[0];
}

function filterByPeriod(data, period) {
    const startDateStr = getStartDate(period);
    if (!startDateStr) return data;

    return data.filter(d => d.date >= startDateStr);
}

function updateResourceView() {
    const filteredResources = filterByPeriod(rawResourceData, resourcePeriod);
    const resourceLabels = [];
    const resourceDatasets = {
        charcoal: [],
        steel: [],
        coolant: [],
        whetstone: []
    };

    filteredResources.forEach(d => {
        resourceLabels.push(d.date);
        resourceDatasets.charcoal.push(d.charcoal);
        resourceDatasets.steel.push(d.steel);
        resourceDatasets.coolant.push(d.coolant);
        resourceDatasets.whetstone.push(d.whetstone);
    });

    renderChart('mainChart', resourceLabels, resourceDatasets, resourcePeriod);

    const filteredItems = filterByPeriod(rawItemData, resourcePeriod);
    const itemLabels = [];
    const itemDatasets = {
        koban: [],
        requestTicket: [],
        helpTicket: []
    };

    filteredItems.forEach(d => {
        itemLabels.push(d.date);
        itemDatasets.koban.push(d.koban);
        itemDatasets.requestTicket.push(d.requestTicket);
        itemDatasets.helpTicket.push(d.helpTicket);
    });

    renderChart('itemChart', itemLabels, itemDatasets, resourcePeriod);

    renderResourceEditList();
    renderItemEditList();
}

// --- 刀剣グラフ更新 (期間フィルタ反映) ---
function updateToukenView() {
    const period = toukenPeriod;
    const startDateStr = getStartDate(period);
    const startDate = startDateStr ? new Date(startDateStr) : null;
    const todayStr = new Date().toISOString().split('T')[0];
    
    const typeFilter = document.getElementById('filterType')?.value || 'all';
    const rarityFilter = document.getElementById('filterRarity')?.value || 'all';
    
    const swordGroups = {};
    rawToukenData.forEach(d => {
        if ((typeFilter === 'all' || d.type === typeFilter) && (rarityFilter === 'all' || d.rarity == rarityFilter)) {
            if (!swordGroups[d.name]) swordGroups[d.name] = [];
            swordGroups[d.name].push({ x: d.date, y: d.lv });
        }
    });

    const datasets = Object.keys(swordGroups).map(name => {
        let history = swordGroups[name].sort((a, b) => a.x.localeCompare(b.x));
        let chartData = [];

        // --- ここが重要：期間内のデータのみを抽出する ---
        if (startDateStr) {
            // 1. 期間開始時のレベルを計算して「開始点」を作る
            const startLv = getInterpolatedLevel(history.map(h => ({date: h.x, lv: h.y})), startDate);
            if (startLv !== null) {
                chartData.push({ x: startDateStr, y: startLv });
            }
            // 2. 期間内の実データだけを追加する[cite: 6]
            const inPeriodData = history.filter(h => h.x > startDateStr);
            chartData = [...chartData, ...inPeriodData];
        } else {
            // 全期間の場合はそのまま[cite: 6]
            chartData = [...history];
        }

        // 最新日の補完
        const last = chartData[chartData.length - 1];
        if (last && last.x < todayStr) {
            chartData.push({ x: todayStr, y: last.y });
        }

        return {
            label: name,
            data: chartData,
            borderColor: stringToColor(name),
            backgroundColor: stringToColor(name),
            tension: 0.1,
            fill: false
        };
    });

    // フィルタリング後のデータのみを渡す
    renderToukenChart('levelChart', datasets, startDateStr);
}
// --- チャート描画関数 ---
// --- チャート描画関数（資材・小判用） ---
function formatMan(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;

    if (Math.abs(num) >= 10000) {
        const man = num / 10000;
        return `${Number(man.toFixed(1)).toLocaleString()}万`;
    }

    return num.toLocaleString();
}

function formatMonthDayTick(value, index, ticks) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const year = String(date.getFullYear());
    const prevTick = index > 0 ? ticks[index - 1] : null;
    const prevDate = prevTick ? new Date(prevTick.value) : null;
    const isFirstYearTick = !prevDate || Number.isNaN(prevDate.getTime()) || prevDate.getFullYear() !== date.getFullYear();

    // 1行目は月日、2行目は年。同じ西暦は繰り返さず、年が変わる位置だけ表示する。
    return isFirstYearTick ? [monthDay, year] : monthDay;
}

function getSharedLineChartOptions({ minDate = null, suggestedMax = null, yTickCallback = null, yStepSize = null } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: {
                top: 8,
                right: 12,
                bottom: 14,
                left: 8
            }
        },
        animation: {
            duration: 900,
            easing: 'easeOutQuart'
        },
        animations: {
            y: {
                from(ctx) {
                    const chart = ctx.chart;
                    const scale = chart.scales[ctx.dataset.yAxisID || 'y'];
                    return scale ? scale.getPixelForValue(0) : undefined;
                }
            }
        },
        plugins: {
            legend: {
                position: 'bottom',
                fullSize: true,
                labels: {
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                    boxWidth: 14,
                    boxHeight: 10,
                    padding: 24,
                    color: '#333',
                    font: {
                        family: "'Yu Mincho', 'Hiragino Mincho ProN', serif",
                        size: 12,
                        weight: 'bold'
                    }
                }
            }
        },
        elements: {
            line: {
                borderWidth: 2.5,
                tension: 0.18
            },
            point: {
                radius: 3.5,
                hoverRadius: 6,
                borderWidth: 2,
                borderColor: '#ffffff'
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    displayFormats: { day: 'MM/dd' }
                },
                min: minDate || undefined,
                grid: {
                    color: 'rgba(10,17,40,0.08)'
                },
                ticks: {
                    color: '#333',
                    maxRotation: 0,
                    autoSkip: true,
                    padding: 10,
                    callback: formatMonthDayTick
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                min: suggestedMax ? 0 : undefined,
                suggestedMax: suggestedMax || undefined,
                grid: {
                    color: 'rgba(10,17,40,0.08)'
                },
                ticks: {
                    color: '#333',
                    stepSize: yStepSize || undefined,
                    callback: yTickCallback || undefined
                }
            },
            y1: {
                type: 'linear',
                display: false,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: {
                    color: '#333',
                    callback(value) {
                        return Number(value).toLocaleString();
                    }
                }
            }
        }
    };
}


function renderChart(id, labels, dataObj, period = 'all') {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const labelNames = {
        charcoal: '木炭',
        steel: '玉鋼',
        coolant: '冷却材',
        whetstone: '砥石',
        koban: '小判',
        requestTicket: '依頼札',
        helpTicket: '手伝い札'
    };

    const colors = {
        charcoal: '#b54434',
        steel: '#7f8c8d',
        coolant: '#3498db',
        whetstone: '#27ae60',
        koban: '#f1c40f',
        requestTicket: '#9b59b6',
        helpTicket: '#e74c3c'
    };

    const datasetArr = Object.keys(dataObj).map(key => ({
        label: labelNames[key] || key,
        data: dataObj[key],
        borderColor: colors[key],
        backgroundColor: colors[key],
        pointBackgroundColor: colors[key],
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 6,
        yAxisID: (id === 'itemChart' && key !== 'koban') ? 'y1' : 'y',
        tension: 0.18,
        fill: false,
        borderWidth: 2.5
    }));

    const useMonthScale = period === 'all' || period === '1y' || period === '6m';

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: datasetArr
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 16,
                    bottom: 18,
                    left: 8
                }
            },
            animation: {
                duration: 900,
                easing: 'easeOutQuart'
            },
            animations: {
                y: {
                    from(context) {
                        const chart = context.chart;
                        const scale = chart.scales[context.dataset.yAxisID || 'y'];
                        return scale ? scale.getPixelForValue(0) : undefined;
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 13,
                        boxHeight: 13,
                        padding: 18,
                        color: '#333',
                        textAlign: 'center',
                        font: {
                            family: "'Yu Mincho', 'Hiragino Mincho ProN', serif",
                            size: 12,
                            lineHeight: 1.2,
                            weight: 'bold'
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: useMonthScale ? 'month' : 'day',
                        displayFormats: {
                            day: 'MM/dd',
                            month: 'M月'
                        },
                        tooltipFormat: 'yyyy/MM/dd'
                    },
                    grid: {
                        color: 'rgba(10,17,40,0.08)'
                    },
                    ticks: {
                        color: '#333',
                        maxRotation: 0,
                        autoSkip: true,
                        padding: 8,
                        callback: function(value) {
                            const date = new Date(value);

                            if (useMonthScale) {
                                return `${date.getMonth() + 1}月`;
                            }

                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            return `${month}/${day}`;
                        }
                    },
                    afterFit(scale) {
                        scale.height += useMonthScale ? 46 : 22;
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(10,17,40,0.08)'
                    },
                    ticks: {
                        color: '#333',
                        callback: function(value) {
                            return formatMan(value);
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: id === 'itemChart',
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: '#333',
                        callback: function(value) {
                            return Number(value).toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function renderToukenChart(id, datasets, minDate = null) {
    const ctx = document.getElementById(id);
    if (!ctx) return;

    if (charts[id]) {
        charts[id].destroy();
    }

    const allValues = datasets
        .flatMap(ds => ds.data.map(point => Number(point.y)))
        .filter(value => Number.isFinite(value));

    const maxValue = allValues.length ? Math.max(...allValues) : 100;
    const suggestedMax = Math.ceil((maxValue + 5) / 10) * 10;

    const allDates = datasets
        .flatMap(ds => ds.data.map(point => point.x))
        .filter(Boolean)
        .map(date => new Date(date).getTime())
        .filter(time => Number.isFinite(time));

    let useMonthScale = true;

    if (allDates.length) {
        const minTime = Math.min(...allDates);
        const maxTime = Math.max(...allDates);
        const diffDays = (maxTime - minTime) / (1000 * 60 * 60 * 24);

        // 90日未満なら日付表示、90日以上なら月表示＋年表示
        useMonthScale = diffDays >= 90;
    }

    // TOP10グラフは直近30日なので、日付表示の方が見やすい
    if (id === 'top10Chart') {
        useMonthScale = false;
    }

    const isTop10Chart = id === 'top10Chart';
    const isLevelChart = id === 'levelChart';
    const selectedToukenType = document.getElementById('filterType')?.value || 'all';
    // TOP10は左のランキングリストが凡例の役割を持つため非表示。
    // 刀剣レベルは刀種「すべて」の時だけ非表示にし、刀種を絞った時は件数に関係なく表示する。
    const showLegend = !isTop10Chart && !(isLevelChart && selectedToukenType === 'all');

    // 刀剣レベルグラフとTOP10グラフで、線・点の描画スタイルを完全に揃える。
    // canvas内の折れ線や点はCSSクラスでは直接制御できないため、ここで共通化する。
    const toukenLineStyle = {
        pointRadius: 3.5,
        pointHoverRadius: 6,
        pointBorderWidth: 2,
        borderWidth: 2.5,
        tension: 0.16,
        fill: false
    };

    const styledDatasets = datasets.map(dataset => {
        const lineColor = dataset.borderColor || dataset.backgroundColor || stringToColor(dataset.label || 'touken');

        return {
            ...dataset,
            borderColor: lineColor,
            backgroundColor: lineColor,
            pointBackgroundColor: lineColor,
            pointBorderColor: '#ffffff',
            pointBorderWidth: toukenLineStyle.pointBorderWidth,
            pointRadius: toukenLineStyle.pointRadius,
            pointHoverRadius: toukenLineStyle.pointHoverRadius,
            borderWidth: toukenLineStyle.borderWidth,
            tension: toukenLineStyle.tension,
            fill: toukenLineStyle.fill
        };
    });

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: styledDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 16,
                    bottom: useMonthScale ? 18 : 8,
                    left: 8
                }
            },
            animation: {
                duration: 900,
                easing: 'easeOutQuart'
            },
            animations: {
                y: {
                    from(context) {
                        const chart = context.chart;
                        const scale = chart.scales.y;
                        return scale ? scale.getPixelForValue(0) : undefined;
                    }
                }
            },
            plugins: {
                legend: {
                    display: showLegend,
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 13,
                        boxHeight: 13,
                        padding: 18,
                        color: '#333',
                        textAlign: 'center',
                        font: {
                            family: "'Yu Mincho', 'Hiragino Mincho ProN', serif",
                            size: 12,
                            lineHeight: 1.2,
                            weight: 'bold'
                        }
                    }
                }
            },
            elements: {
                line: {
                    borderWidth: toukenLineStyle.borderWidth,
                    tension: toukenLineStyle.tension
                },
                point: {
                    radius: toukenLineStyle.pointRadius,
                    hoverRadius: toukenLineStyle.pointHoverRadius,
                    borderWidth: toukenLineStyle.pointBorderWidth,
                    borderColor: '#ffffff'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: useMonthScale ? 'month' : 'day',
                        displayFormats: {
                            day: 'MM/dd',
                            month: 'M月'
                        },
                        tooltipFormat: 'yyyy/MM/dd'
                    },
                    min: minDate || undefined,
                    grid: {
                        color: 'rgba(10,17,40,0.08)'
                    },
                    ticks: {
                        color: '#333',
                        maxRotation: 0,
                        autoSkip: true,
                        padding: 8,
                        callback: function(value) {
                            const date = new Date(value);

                            if (useMonthScale) {
                                return `${date.getMonth() + 1}月`;
                            }

                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');

                            // TOP10など短期間グラフでは、年を重ねず月日だけ表示
                            return `${month}/${day}`;
                        }
                    },
                    afterFit(scale) {
                        scale.height += useMonthScale ? 46 : 22;
                    }
                },
                y: {
                    type: 'linear',
                    min: 0,
                    suggestedMax: suggestedMax,
                    grid: {
                        color: 'rgba(10,17,40,0.08)'
                    },
                    ticks: {
                        color: '#333',
                        stepSize: 10
                    }
                }
            }
        }
    });
}
// =========================================
// 名簿・入力フォーム・編集リスト
// =========================================
const TOUKEN_TYPES = [
    '短刀(極)',
    '脇差(極)',
    '打刀(極)',
    '太刀(極)',
    '大太刀(極)',
    '槍(極)',
    '薙刀(極)',
    '剣(極)'
];

function $(id) {
    return document.getElementById(id);
}

function todayIso() {
    return new Date().toISOString().split('T')[0];
}

function toInt(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function openModal(id) {
    const modal = $(id);
    if (modal) modal.style.display = 'block';
}

window.closeModal = (id) => {
    const modal = $(id);
    if (modal) modal.style.display = 'none';
};

function buildTypeOptions(selectedType = '') {
    return [
        '<option value="">刀種</option>',
        ...TOUKEN_TYPES.map(type => `<option value="${type}" ${type === selectedType ? 'selected' : ''}>${type}</option>`)
    ].join('');
}

function renderMasterEditList() {
    const container = $('masterEditList');
    if (!container) return;

    const sorted = [...toukenMaster].sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sorted.map(m => `
        <div class="edit-master-row">
            <input type="text" id="editName_${m.id}" class="edit-master-name" value="${m.name}">
            <select id="editType_${m.id}" class="edit-master-type">
                ${TOUKEN_TYPES.map(type => `<option value="${type}" ${m.type === type ? 'selected' : ''}>${type}</option>`).join('')}
            </select>
            <input type="number" id="editRarity_${m.id}" class="edit-master-rarity" value="${m.rarity}">
            <div class="edit-master-buttons">
                <button class="update-btn" onclick="updateMasterEntry('${m.id}')">更新</button>
                <button class="delete-btn" onclick="deleteMasterEntry('${m.id}')">削除</button>
            </div>
        </div>
    `).join('');
}

window.updateMasterEntry = async (id) => {
    const newName = $(`editName_${id}`).value;
    const newType = $(`editType_${id}`).value;
    const newRarity = toInt($(`editRarity_${id}`).value, NaN);

    if (!newName || Number.isNaN(newRarity)) return alert('正しく入力してください');

    await updateDoc(doc(db, 'touken_master', id), {
        name: newName,
        type: newType,
        rarity: newRarity
    });

    alert('修正完了');
};

window.deleteMasterEntry = async (id) => {
    if (!confirm('削除しますか？')) return;
    await deleteDoc(doc(db, 'touken_master', id));
};

function updateRarityOptions(typeSelect) {
    const type = typeSelect.value;
    const raritySelect = typeSelect.parentElement.querySelector('.rarity-select');
    const rarities = [...new Set(toukenMaster
        .filter(t => t.type === type)
        .map(t => t.rarity)
    )].sort();

    raritySelect.innerHTML = '<option value="">レア度</option>'
        + rarities.map(rarity => `<option value="${rarity}">${rarity}</option>`).join('');
}

function updateNameOptions(raritySelect) {
    const rarity = raritySelect.value;
    const row = raritySelect.parentElement;
    const type = row.querySelector('.type-select').value;
    const nameSelect = row.querySelector('.name-select');
    const names = toukenMaster
        .filter(t => t.type === type && t.rarity == rarity)
        .map(t => t.name);

    nameSelect.innerHTML = '<option value="">名前選択</option>'
        + names.map(name => `<option value="${name}">${name}</option>`).join('');
}

function addInputRow() {
    if (rowCount >= 10) return alert('一度に10振りまでです');

    rowCount++;
    const rowId = `row_${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'input-row';
    row.id = rowId;
    row.innerHTML = `
        <select class="type-select" onchange="updateRarityOptions(this)">${buildTypeOptions()}</select>
        <select class="rarity-select" onchange="updateNameOptions(this)"><option value="">レア度</option></select>
        <select class="name-select"><option value="">名前</option></select>
        <input type="number" class="lv-input" placeholder="Lv">
        <button type="button" class="btn-row-remove" onclick="removeInputRow('${rowId}')">×</button>
    `;

    $('levelInputContainer').appendChild(row);
}

function removeInputRow(id) {
    const row = $(id);
    if (row) {
        row.remove();
        rowCount--;
    }

    if (rowCount === 0) addInputRow();
}

function openLevelModal() {
    $('lvDate').value = todayIso();
    $('levelInputContainer').innerHTML = '';
    rowCount = 0;
    addInputRow();
    openModal('levelModal');
}

window.addInputRow = addInputRow;
window.removeInputRow = removeInputRow;
window.updateRarityOptions = updateRarityOptions;
window.updateNameOptions = updateNameOptions;
window.openLevelModal = openLevelModal;

async function saveAllLevels() {
    const user = auth.currentUser;
    const dateVal = $('lvDate').value;
    if (!user || !dateVal) return alert('日付を確認してください');

    const rows = document.querySelectorAll('.input-row');
    for (const row of rows) {
        const name = row.querySelector('.name-select').value;
        const lv = toInt(row.querySelector('.lv-input').value, NaN);
        const type = row.querySelector('.type-select').value;
        const rarity = toInt(row.querySelector('.rarity-select').value, NaN);

        if (!name || Number.isNaN(lv)) continue;

        await addDoc(collection(db, 'users', user.uid, 'touken'), {
            date: dateVal,
            name,
            lv,
            type,
            rarity,
            timestamp: new Date()
        });
    }

    window.closeModal('levelModal');
}

async function saveResource() {
    const user = auth.currentUser;
    const date = $('date').value;
    if (!user || !date) return alert('日付を確認してください');

    await addDoc(collection(db, 'users', user.uid, 'resources'), {
        date,
        charcoal: toInt($('charcoal').value),
        steel: toInt($('steel').value),
        coolant: toInt($('coolant').value),
        whetstone: toInt($('whetstone').value)
    });

    window.closeModal('resourceModal');
}

async function saveItems() {
    const user = auth.currentUser;
    const date = $('itemDate').value;
    if (!user || !date) return alert('日付を確認してください');

    await addDoc(collection(db, 'users', user.uid, 'items'), {
        date,
        koban: toInt($('koban').value),
        requestTicket: toInt($('requestTicket').value),
        helpTicket: toInt($('helpTicket').value)
    });

    window.closeModal('itemModal');
}

async function saveMasterEntry() {
    const name = $('newMasterName').value;
    const type = $('newMasterType').value;
    const rarity = toInt($('newMasterRarity').value, NaN);

    if (!name || !type || Number.isNaN(rarity)) return alert('全項目入力してください');

    await addDoc(collection(db, 'touken_master'), { name, type, rarity });
    window.closeModal('masterModal');
}

function renderEditList() {
    const container = $('levelEditList');
    if (!container) return;

    container.classList.add('edit-list');
    const sorted = [...rawToukenData].sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = sorted.length
        ? sorted.map(d => {
            const options = toukenMaster.length
                ? toukenMaster
                    .map(m => `<option value="${m.id}" ${m.name === d.name ? 'selected' : ''}>${m.name}</option>`)
                    .join('')
                : `<option value="">${d.name}</option>`;

            return `
                <div class="edit-level-row">
                    <input type="date" id="levelDate_${d.id}" value="${d.date}">
                    <select id="levelName_${d.id}">${options}</select>
                    <input type="number" id="levelLv_${d.id}" value="${d.lv ?? 1}" min="1" max="99" placeholder="Lv">
                    <div class="edit-row-buttons">
                        <button class="update-btn" onclick="updateLevelRecord('${d.id}')">更新</button>
                        <button class="delete-btn" onclick="deleteLevelRecord('${d.id}')">削除</button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="empty-message">レベル記録がありません。</p>';
}

function renderResourceEditList() {
    const container = $('resourceEditList');
    if (!container) return;

    const sorted = [...rawResourceData].sort((a, b) => b.date.localeCompare(a.date));
    container.innerHTML = sorted.length
        ? sorted.map(d => `
            <div class="edit-resource-row">
                <input type="date" id="resourceDate_${d.id}" value="${d.date}">
                <input type="number" id="resourceCharcoal_${d.id}" value="${d.charcoal ?? 0}" placeholder="木炭">
                <input type="number" id="resourceSteel_${d.id}" value="${d.steel ?? 0}" placeholder="玉鋼">
                <input type="number" id="resourceCoolant_${d.id}" value="${d.coolant ?? 0}" placeholder="冷却材">
                <input type="number" id="resourceWhetstone_${d.id}" value="${d.whetstone ?? 0}" placeholder="砥石">
                <div class="edit-row-buttons">
                    <button class="update-btn" onclick="updateResourceRecord('${d.id}')">更新</button>
                    <button class="delete-btn" onclick="deleteResourceRecord('${d.id}')">削除</button>
                </div>
            </div>
        `).join('')
        : '<p class="empty-message">資材データがありません。</p>';
}

function renderItemEditList() {
    const container = $('itemEditList');
    if (!container) return;

    const sorted = [...rawItemData].sort((a, b) => b.date.localeCompare(a.date));
    container.innerHTML = sorted.length
        ? sorted.map(d => `
            <div class="edit-item-row">
                <input type="date" id="itemDate_${d.id}" value="${d.date}">
                <input type="number" id="itemKoban_${d.id}" value="${d.koban ?? 0}" placeholder="小判">
                <input type="number" id="itemRequestTicket_${d.id}" value="${d.requestTicket ?? 0}" placeholder="依頼札">
                <input type="number" id="itemHelpTicket_${d.id}" value="${d.helpTicket ?? 0}" placeholder="手伝い札">
                <div class="edit-row-buttons">
                    <button class="update-btn" onclick="updateItemRecord('${d.id}')">更新</button>
                    <button class="delete-btn" onclick="deleteItemRecord('${d.id}')">削除</button>
                </div>
            </div>
        `).join('')
        : '<p class="empty-message">小判・札データがありません。</p>';
}

window.updateResourceRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');

    const date = $(`resourceDate_${docId}`).value;
    if (!date) return alert('日付を入力してください');

    await updateDoc(doc(db, 'users', user.uid, 'resources', docId), {
        date,
        charcoal: toInt($(`resourceCharcoal_${docId}`).value),
        steel: toInt($(`resourceSteel_${docId}`).value),
        coolant: toInt($(`resourceCoolant_${docId}`).value),
        whetstone: toInt($(`resourceWhetstone_${docId}`).value)
    });

    alert('資材データを更新しました');
};

window.deleteResourceRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');
    if (!confirm('この資材データを削除しますか？')) return;

    await deleteDoc(doc(db, 'users', user.uid, 'resources', docId));
};

window.updateItemRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');

    const date = $(`itemDate_${docId}`).value;
    if (!date) return alert('日付を入力してください');

    await updateDoc(doc(db, 'users', user.uid, 'items', docId), {
        date,
        koban: toInt($(`itemKoban_${docId}`).value),
        requestTicket: toInt($(`itemRequestTicket_${docId}`).value),
        helpTicket: toInt($(`itemHelpTicket_${docId}`).value)
    });

    alert('小判・札データを更新しました');
};

window.deleteItemRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');
    if (!confirm('この小判・札データを削除しますか？')) return;

    await deleteDoc(doc(db, 'users', user.uid, 'items', docId));
};

window.updateLevelRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');

    const date = $(`levelDate_${docId}`).value;
    const lv = toInt($(`levelLv_${docId}`).value, NaN);
    const selectedMasterId = $(`levelName_${docId}`).value;
    const master = toukenMaster.find(m => m.id === selectedMasterId);

    if (!date || !master || Number.isNaN(lv)) {
        return alert('日付・刀剣男士・レベルを確認してください');
    }

    await updateDoc(doc(db, 'users', user.uid, 'touken', docId), {
        date,
        name: master.name,
        lv,
        type: master.type,
        rarity: master.rarity
    });

    alert('レベル記録を更新しました');
};

window.deleteLevelRecord = async (docId) => {
    const user = auth.currentUser;
    if (!user) return alert('ログインしてください');
    if (!confirm('このレベル記録を削除しますか？')) return;

    await deleteDoc(doc(db, 'users', user.uid, 'touken', docId));
};

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '#';
    for (let i = 0; i < 3; i++) {
        color += (`00${((hash >> (i * 8)) & 0xFF).toString(16)}`).slice(-2);
    }

    return color;
}

// =========================================
// タブ・イベント登録
// =========================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    $(tabId)?.classList.add('active');

    const targetBtn = document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`);
    if (targetBtn) targetBtn.classList.add('active');

    setTimeout(() => {
        if (tabId === 'toukenTab') {
            updateToukenView();
            calculateGrowthRanking();
            charts.levelChart?.resize();
            charts.top10Chart?.resize();
        }

        if (tabId === 'resourceTab') {
            updateResourceView();
            charts.mainChart?.resize();
            charts.itemChart?.resize();
        }
    }, 0);
};

function bindClick(id, fn) {
    const el = $(id);
    if (el) el.onclick = fn;
}

function bindPeriodSelector(selector, onChange) {
    document.querySelectorAll(`${selector} .period-btn`).forEach(btn => {
        btn.addEventListener('click', (event) => {
            const selectedPeriod = event.currentTarget.dataset.period;

            document.querySelectorAll(`${selector} .period-btn`).forEach(button => {
                button.classList.toggle('active', button.dataset.period === selectedPeriod);
            });

            onChange(selectedPeriod);
        });
    });
}

function initEventHandlers() {
    bindClick('saveBtn', saveResource);
    bindClick('saveItemBtn', saveItems);
    bindClick('saveMasterBtn', saveMasterEntry);
    bindClick('saveLevelBtn', saveAllLevels);
    bindClick('addRowBtn', addInputRow);
    bindClick('openLevelModalBtn', openLevelModal);
    bindClick('loginBtn', () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider));
    bindClick('openCsvBtn', () => $('csvFileInput')?.click());

    bindClick('openModalBtn', () => {
        $('date').value = todayIso();
        openModal('resourceModal');
    });

    bindClick('openItemModalBtn', () => {
        $('itemDate').value = todayIso();
        openModal('itemModal');
    });

    bindClick('openMasterModalBtn', () => openModal('masterModal'));
    bindClick('openMasterEditBtn', () => openModal('masterEditSection'));

    bindClick('openLevelEditBtn', () => {
        renderEditList();
        openModal('levelEditSection');
    });

    bindClick('openResourceEditBtn', () => {
        renderResourceEditList();
        openModal('resourceEditSection');
    });

    bindClick('openItemEditBtn', () => {
        renderItemEditList();
        openModal('itemEditSection');
    });

    const csvInput = $('csvFileInput');
    if (csvInput) csvInput.onchange = window.handleCsvUpload;

    $('filterType')?.addEventListener('change', updateToukenView);
    $('filterRarity')?.addEventListener('change', updateToukenView);

    bindPeriodSelector('.resource-period-selector', (selectedPeriod) => {
        resourcePeriod = selectedPeriod;
        updateResourceView();
    });

    bindPeriodSelector('.touken-period-selector', (selectedPeriod) => {
        toukenPeriod = selectedPeriod;
        updateToukenView();
    });
}

initEventHandlers();
// Gemini API 解析 (略)
window.handleImageUpload = async (input) => {
    const file = input.files?.[0];
    if (!file) return;

    const loadingEl = document.getElementById('aiLoading');
    if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.textContent = 'AIが解析中...（数秒かかります）';
    }

    try {
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY が読み込めていません。config.js を確認してください。');
        }

        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const base64 = result.split(',')[1];
                if (!base64) reject(new Error('画像の読み込みに失敗しました。'));
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('画像ファイルを読み込めませんでした。'));
            reader.readAsDataURL(file);
        });

        const mimeType = file.type || 'image/png';

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `
刀剣乱舞の刀剣男士一覧スクリーンショットから、見えている「名前」と「レベル」を抽出してください。
必ずJSON配列だけを返してください。
形式:
[
  {"name":"名前","lv":数字}
]
説明文、Markdown、コードブロックは不要です。
                            `.trim()
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        const result = await response.json();

        // 403などAPIエラー時はここに入る
        if (!response.ok) {
            const message = result?.error?.message || `Gemini API error: ${response.status}`;
            throw new Error(message);
        }

        const aiTextRaw = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiTextRaw) {
            console.log('Gemini response:', result);
            throw new Error('AIの解析結果が空でした。画像が読み取りづらい可能性があります。');
        }

        let aiText = aiTextRaw
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        }

        const results = JSON.parse(aiText);

        if (!Array.isArray(results) || results.length === 0) {
            throw new Error('名前とレベルを抽出できませんでした。');
        }

        autoFillLevelForm(results);
        alert(`画像から ${results.length} 件を読み込みました。内容を確認してから登録してください。`);

    } catch (e) {
        console.error(e);

        let message = e.message || String(e);

        if (message.includes('403')) {
            message = 'Gemini APIが403で拒否されています。APIキー、Gemini APIの有効化、HTTPリファラー制限、請求設定を確認してください。';
        }

        alert(`画像解析に失敗しました。\n${message}`);

    } finally {
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        input.value = '';
    }
};

function autoFillLevelForm(results) {
    const container = document.getElementById('levelInputContainer');
    if (!container) return;

    container.innerHTML = "";
    rowCount = 0;

    results.slice(0, 10).forEach(res => {
        const lv = parseInt(res.lv);
        if (!res.name || isNaN(lv)) return;

        addInputRow();

        const rows = document.querySelectorAll('.input-row');
        const currentRow = rows[rows.length - 1];

        const aiName = String(res.name).replace(/\s/g, '');

        const master = toukenMaster.find(m => {
            const masterName = String(m.name).replace(/\s/g, '');
            return aiName === masterName || aiName.includes(masterName) || masterName.includes(aiName);
        });

        if (master) {
            const typeSelect = currentRow.querySelector('.type-select');
            typeSelect.value = master.type;
            updateRarityOptions(typeSelect);

            const raritySelect = currentRow.querySelector('.rarity-select');
            raritySelect.value = master.rarity;
            updateNameOptions(raritySelect);

            currentRow.querySelector('.name-select').value = master.name;
        }

        currentRow.querySelector('.lv-input').value = lv;
    });

    if (rowCount === 0) {
        addInputRow();
    }
}

document.querySelectorAll('.resource-period-selector .period-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const selectedPeriod = e.currentTarget.dataset.period;
        resourcePeriod = selectedPeriod;

        document.querySelectorAll('.resource-period-selector .period-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.period === selectedPeriod);
        });

        updateResourceView();
    });
});
