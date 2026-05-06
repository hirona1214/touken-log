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

// --- 認証状態の監視 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userInfo').innerText = `${user.displayName} の本丸`;
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
function calculateGrowthRanking() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const stats = {};
    rawToukenData.forEach(d => {
        if (!stats[d.name]) stats[d.name] = [];
        stats[d.name].push({ date: d.date, lv: d.lv });
    });

    const ranking = [];
    Object.keys(stats).forEach(name => {
        const history = stats[name].sort((a, b) => a.date.localeCompare(b.date));
        if (history.length < 2) return;
        const lv30DaysAgo = getInterpolatedLevel(history, thirtyDaysAgo);
        if (lv30DaysAgo === null) return;
        const lvNow = history[history.length - 1].lv;
        const diff = Math.floor(lvNow - lv30DaysAgo);
        if (diff > 0) {
            ranking.push({ name, diff, history: [{ date: thirtyDaysAgo.toISOString().split('T')[0], lv: lv30DaysAgo }, ...history.filter(h => new Date(h.date) > thirtyDaysAgo), { date: todayStr, lv: lvNow }] });
        }
    });

    ranking.sort((a, b) => b.diff - a.diff);
    const top10 = ranking.slice(0, 10);
    const listEl = document.getElementById('rankingList');
    if (listEl) {
        listEl.innerHTML = top10.length ? top10.map((item, i) => `<div class="ranking-item"><strong>${i + 1}位: ${item.name}</strong> <span style="color:#b54434;">(+${item.diff} Lv)</span></div>`).join('') : '<p>データ不足です</p>';
    }
    const top10Datasets = top10.map(item => ({ label: item.name, data: item.history.map(h => ({ x: h.date, y: h.lv })), borderColor: stringToColor(item.name), backgroundColor: stringToColor(item.name), tension: 0.1, fill: false }));
    renderToukenChart('top10Chart', top10Datasets);
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
}

// --- 刀剣グラフ更新 (期間フィルタ反映) ---
function updateToukenView() {
    const period = document.getElementById('filterPeriod')?.value || 'all';
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
function renderChart(id, labels, dataObj, period = 'all') {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    const labelNames = { 
        charcoal: '木炭', steel: '玉鋼', coolant: '冷却材', whetstone: '砥石', 
        koban: '小判', requestTicket: '依頼札', helpTicket: '手伝い札' 
    };
    const colors = { 
        charcoal: '#b54434', steel: '#7f8c8d', coolant: '#3498db', whetstone: '#27ae60', 
        koban: '#f1c40f', requestTicket: '#9b59b6', helpTicket: '#e74c3c' 
    };

    const datasetArr = Object.keys(dataObj).map(key => ({
        label: labelNames[key] || key,
        data: dataObj[key],
        borderColor: colors[key],
        backgroundColor: colors[key],
        // 小判以外（札系）は右側の軸(y1)を使用
        yAxisID: (id === 'itemChart' && key !== 'koban') ? 'y1' : 'y',
        tension: 0.1,
        fill: false
    }));

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: datasetArr },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' } // 凡例を下へ
            },
            scales: {
                x: {
                    type: 'time',
                    time: { 
                        unit: 'day',
                        displayFormats: { day: 'yyyy/MM/dd' } // 西暦表示[cite: 6]
                    }
                },
                y: { type: 'linear', display: true, position: 'left' },
                y1: { 
                    type: 'linear', 
                    display: id === 'itemChart', 
                    position: 'right', 
                    grid: { drawOnChartArea: false } 
                }
            }
        }
    });
}

function renderToukenChart(id, datasets, minDate) {
    const ctx = document.getElementById(id);
    if (!ctx || charts[id]) charts[id]?.destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' } // ②凡例を下側へ[cite: 5]
            },
            scales: {
                x: {
                    type: 'time',
                    time: { 
                        unit: 'day',
                        displayFormats: { day: 'yyyy/MM/dd' }
                    },
                    min: getStartDate(period)
                },
            }
        }
    });
}

// --- 名簿管理・その他UI制御 (省略なし) ---
function renderMasterEditList() {
    const container = document.getElementById('masterEditList');
    if (!container) return;
    const sorted = [...toukenMaster].sort((a, b) => { if (a.type !== b.type) return a.type.localeCompare(b.type); return a.name.localeCompare(b.name); });
    container.innerHTML = sorted.map(m => `
        <div class="edit-master-row" style="display:flex; gap:5px; align-items:center; padding:10px; border-bottom:1px solid #eee; flex-wrap:wrap;">
            <input type="text" id="editName_${m.id}" value="${m.name}" style="width:100px; padding:5px;">
            <select id="editType_${m.id}" style="padding:5px;">
                <option value="短刀(極)" ${m.type === '短刀(極)' ? 'selected' : ''}>短刀(極)</option>
                <option value="脇差(極)" ${m.type === '脇差(極)' ? 'selected' : ''}>脇差(極)</option>
                <option value="打刀(極)" ${m.type === '打刀(極)' ? 'selected' : ''}>打刀(極)</option>
                <option value="太刀(極)" ${m.type === '太刀(極)' ? 'selected' : ''}>太刀(極)</option>
                <option value="大太刀(極)" ${m.type === '大太刀(極)' ? 'selected' : ''}>大太刀(極)</option>
                <option value="槍(極)" ${m.type === '槍(極)' ? 'selected' : ''}>槍(極)</option>
                <option value="薙刀(極)" ${m.type === '薙刀(極)' ? 'selected' : ''}>薙刀(極)</option>
                <option value="剣(極)" ${m.type === '剣(極)' ? 'selected' : ''}>剣(極)</option>
            </select>
            <input type="number" id="editRarity_${m.id}" value="${m.rarity}" style="width:40px; padding:5px;">
            <div style="margin-left:auto; display:flex; gap:5px;"><button onclick="updateMasterEntry('${m.id}')">更新</button><button onclick="deleteMasterEntry('${m.id}')">削除</button></div>
        </div>
    `).join('');
}

window.updateMasterEntry = async (id) => {
    const newName = document.getElementById(`editName_${id}`).value;
    const newType = document.getElementById(`editType_${id}`).value;
    const newRarity = parseInt(document.getElementById(`editRarity_${id}`).value);
    if (!newName || isNaN(newRarity)) return alert("正しく入力してください");
    await updateDoc(doc(db, "touken_master", id), { name: newName, type: newType, rarity: newRarity });
    alert("修正完了");
};

window.deleteMasterEntry = async (id) => { if (confirm("削除しますか？")) await deleteDoc(doc(db, "touken_master", id)); };

window.openLevelModal = () => { document.getElementById('lvDate').value = new Date().toISOString().split('T')[0]; const container = document.getElementById('levelInputContainer'); container.innerHTML = ""; rowCount = 0; addInputRow(); document.getElementById('levelModal').style.display = 'block'; };

window.addInputRow = () => {
    if (rowCount >= 10) return alert("一度に10振りまでです");
    rowCount++;
    const rowId = `row_${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'input-row';
    row.id = rowId;
    row.innerHTML = `
        <select class="type-select" onchange="updateRarityOptions(this)"><option value="">刀種</option><option value="短刀(極)">短刀(極)</option><option value="脇差(極)">脇差(極)</option><option value="打刀(極)">打刀(極)</option><option value="太刀(極)">太刀(極)</option><option value="大太刀(極)">大太刀(極)</option><option value="槍(極)">槍(極)</option><option value="薙刀(極)">薙刀(極)</option><option value="剣(極)">剣(極)</option></select>
        <select class="rarity-select" onchange="updateNameOptions(this)"><option value="">レア度</option></select>
        <select class="name-select"><option value="">名前</option></select>
        <input type="number" class="lv-input" placeholder="Lv">
        <button onclick="removeInputRow('${rowId}')">×</button>
    `;
    document.getElementById('levelInputContainer').appendChild(row);
};

window.removeInputRow = (id) => { const row = document.getElementById(id); if (row) { row.remove(); rowCount--; } if (rowCount === 0) addInputRow(); };
window.updateRarityOptions = (el) => { const type = el.value; const raritySelect = el.parentElement.querySelector('.rarity-select'); const rarities = [...new Set(toukenMaster.filter(t => t.type === type).map(t => t.rarity))].sort(); raritySelect.innerHTML = '<option value="">レア度</option>' + rarities.map(r => `<option value="${r}">${r}</option>`).join(''); };
window.updateNameOptions = (el) => { const rarity = el.value; const type = el.parentElement.querySelector('.type-select').value; const nameSelect = el.parentElement.querySelector('.name-select'); const names = toukenMaster.filter(t => t.type === type && t.rarity == rarity).map(t => t.name); nameSelect.innerHTML = '<option value="">名前選択</option>' + names.map(n => `<option value="${n}">${n}</option>`).join(''); };

async function saveAllLevels() {
    const user = auth.currentUser; const dateVal = document.getElementById('lvDate').value; if (!user || !dateVal) return alert("日付を確認してください");
    const rows = document.querySelectorAll('.input-row');
    for (const row of rows) {
        const name = row.querySelector('.name-select').value; const lv = parseInt(row.querySelector('.lv-input').value); const type = row.querySelector('.type-select').value; const rarity = parseInt(row.querySelector('.rarity-select').value);
        if (name && lv) await addDoc(collection(db, "users", user.uid, "touken"), { date: dateVal, name, lv, type, rarity, timestamp: new Date() });
    }
    closeModal('levelModal');
}

async function saveResource() {
    const user = auth.currentUser; const date = document.getElementById('date').value; if (!user || !date) return alert("日付を確認してください");
    await addDoc(collection(db, "users", user.uid, "resources"), { date, charcoal: parseInt(document.getElementById('charcoal').value) || 0, steel: parseInt(document.getElementById('steel').value) || 0, coolant: parseInt(document.getElementById('coolant').value) || 0, whetstone: parseInt(document.getElementById('whetstone').value) || 0 });
    closeModal('resourceModal');
}

async function saveItems() {
    const user = auth.currentUser; const date = document.getElementById('itemDate').value; if (!user || !date) return alert("日付を確認してください");
    await addDoc(collection(db, "users", user.uid, "items"), { date, koban: parseInt(document.getElementById('koban').value) || 0, requestTicket: parseInt(document.getElementById('requestTicket').value) || 0, helpTicket: parseInt(document.getElementById('helpTicket').value) || 0 });
    closeModal('itemModal');
}

async function saveMasterEntry() {
    const name = document.getElementById('newMasterName').value; const type = document.getElementById('newMasterType').value; const rarity = parseInt(document.getElementById('newMasterRarity').value); if (!name || !type || isNaN(rarity)) return alert("全項目入力してください");
    await addDoc(collection(db, "touken_master"), { name, type, rarity }); closeModal('masterModal');
}

function renderEditList() {
    const container = document.getElementById('levelEditList'); if (!container) return;
    const sorted = [...rawToukenData].sort((a, b) => b.date.localeCompare(a.date));
    container.innerHTML = sorted.map(d => `<div class="edit-item"><span>${d.date} | <strong>${d.name}</strong> (Lv${d.lv})</span><button onclick="deleteLevelRecord('${d.id}')">削除</button></div>`).join('');
}

window.deleteLevelRecord = async (docId) => { if (confirm("削除しますか？")) await deleteDoc(doc(db, "users", auth.currentUser.uid, "touken", docId)); };
function stringToColor(str) { let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); let color = '#'; for (let i = 0; i < 3; i++) color += ('00' + ((hash >> (i * 8)) & 0xFF).toString(16)).substr(-2); return color; }
// window.switchTab = (id) => { document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.getElementById(id).classList.add('active'); };
window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

window.switchTab = function(tabId) {
    // 1. すべてのタブコンテンツを非表示にする
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 2. すべてのタブボタンから 'active' クラスを除去する
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 3. 選択されたコンテンツを表示する
    document.getElementById(tabId).classList.add('active');

    // 4. クリックされたボタン自身に 'active' クラスを付与する
    // onclick="switchTab('resourceTab')" の呼び出し元を特定してクラスを付与
    const clickedBtn = event.currentTarget;
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
};

// --- イベントバインド ---
const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
bindClick('saveBtn', saveResource);
bindClick('saveItemBtn', saveItems);
bindClick('openModalBtn', () => { document.getElementById('date').value = new Date().toISOString().split('T')[0]; document.getElementById('resourceModal').style.display = 'block'; });
bindClick('openItemModalBtn', () => { document.getElementById('itemDate').value = new Date().toISOString().split('T')[0]; document.getElementById('itemModal').style.display = 'block'; });
bindClick('saveMasterBtn', saveMasterEntry);
bindClick('saveLevelBtn', saveAllLevels);
bindClick('addRowBtn', window.addInputRow);
bindClick('openLevelModalBtn', window.openLevelModal);
bindClick('openMasterModalBtn', () => { document.getElementById('masterModal').style.display = 'block'; });
bindClick('openMasterEditBtn', () => { document.getElementById('masterEditSection').style.display = 'block'; });
bindClick('openLevelEditBtn', () => { document.getElementById('levelEditSection').style.display = 'block'; });
bindClick('loginBtn', () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider));
bindClick('openCsvBtn', () => document.getElementById('csvFileInput').click());
document.getElementById('csvFileInput').onchange = window.handleCsvUpload;

document.getElementById('filterType')?.addEventListener('change', updateToukenView);
document.getElementById('filterRarity')?.addEventListener('change', updateToukenView);
document.getElementById('filterPeriod')?.addEventListener('change', updateToukenView); // ★追加分

// Gemini API 解析 (略)
window.handleImageUpload = async (input) => {
    const file = input.files[0]; if (!file) return;
    const loadingEl = document.getElementById('aiLoading'); loadingEl.style.display = 'block';
    try {
        const base64Data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: '名前とレベルをJSON形式 [{"name":"名前","lv":数字}] で抽出して。' }, { inline_data: { mime_type: "image/png", data: base64Data } }] }] }) });
        const result = await response.json();
        let aiText = result.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        const results = JSON.parse(aiText);
        if (results.length > 0) autoFillLevelForm(results);
    } catch (e) { console.error(e); } finally { loadingEl.style.display = 'none'; }
};

function autoFillLevelForm(results) {
    const container = document.getElementById('levelInputContainer'); container.innerHTML = ""; rowCount = 0;
    results.slice(0, 10).forEach(res => {
        addInputRow(); const rows = document.querySelectorAll('.input-row'); const currentRow = rows[rows.length - 1];
        const master = toukenMaster.find(m => m.name === res.name || res.name.includes(m.name));
        if (master) {
            const typeSelect = currentRow.querySelector('.type-select'); typeSelect.value = master.type; updateRarityOptions(typeSelect);
            const raritySelect = currentRow.querySelector('.rarity-select'); raritySelect.value = master.rarity; updateNameOptions(raritySelect);
            currentRow.querySelector('.name-select').value = master.name;
        }
        currentRow.querySelector('.lv-input').value = res.lv;
    });
}

document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        resourcePeriod = e.target.dataset.period;
        updateResourceView();
    });
});

