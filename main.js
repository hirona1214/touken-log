
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- 認証状態の監視 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userInfo').innerText = `${user.displayName} の本丸`;
        document.getElementById('loginBtn').innerText = "ログアウト";
        document.querySelectorAll('.btn-action.red').forEach(b => b.style.display = "block");
        
        loadResourceData(user.uid);
        loadToukenData(user.uid);
    } else {
        document.getElementById('userInfo').innerText = "(未ログイン)";
        document.getElementById('loginBtn').innerText = "ログイン";
        document.querySelectorAll('.btn-action.red').forEach(b => b.style.display = "none");
    }
});

// --- タブ切り替え ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

// --- 資材データの読み込み ---
function loadResourceData(uid) {
    // 資源
    onSnapshot(query(collection(db, "users", uid, "resources"), orderBy("date", "asc")), (snapshot) => {
        const labels = [];
        const datasets = { charcoal: [], steel: [], coolant: [], whetstone: [] };
        snapshot.forEach(doc => {
            const d = doc.data();
            labels.push(d.date);
            datasets.charcoal.push(d.charcoal);
            datasets.steel.push(d.steel);
            datasets.coolant.push(d.coolant);
            datasets.whetstone.push(d.whetstone);
        });
        renderChart('mainChart', labels, datasets);
    });

    // 札・小判
    onSnapshot(query(collection(db, "users", uid, "items"), orderBy("date", "asc")), (snapshot) => {
        const labels = [];
        const datasets = { koban: [], requestTicket: [], helpTicket: [] };
        snapshot.forEach(doc => {
            const d = doc.data();
            labels.push(d.date);
            datasets.koban.push(d.koban);
            datasets.requestTicket.push(d.requestTicket);
            datasets.helpTicket.push(d.helpTicket);
        });
        renderChart('itemChart', labels, datasets);
    });
}

// --- 刀剣データの読み込み ---
function loadToukenData(uid) {
    const q = query(collection(db, "users", uid, "touken"), orderBy("date", "asc"));
    onSnapshot(q, (snapshot) => {
        rawToukenData = [];
        snapshot.forEach(doc => rawToukenData.push(doc.data()));
        updateToukenView();
    });
}

// フィルター変更時に表示更新
document.getElementById('filterType').addEventListener('change', updateToukenView);
document.getElementById('filterRarity').addEventListener('change', updateToukenView);

function updateToukenView() {
    const typeFilter = document.getElementById('filterType').value;
    const rarityFilter = document.getElementById('filterRarity').value;

    const grouped = {};
    rawToukenData.forEach(d => {
        if ((typeFilter === 'all' || d.type === typeFilter) &&
            (rarityFilter === 'all' || d.rarity == rarityFilter)) {
            if (!grouped[d.name]) grouped[d.name] = { labels: [], values: [] };
            grouped[d.name].labels.push(d.date);
            grouped[d.name].values.push(d.lv);
        }
    });

    // メインのレベル推移グラフ
    const datasets = Object.keys(grouped).map(name => ({
        label: name,
        data: grouped[name].labels.map((date, i) => ({ x: date, y: grouped[name].values[i] })),
        borderColor: stringToColor(name),
        tension: 0.1,
        fill: false
    }));
    renderToukenChart('levelChart', datasets);

    // ランキング更新
    calculateGrowthRanking();
}

// --- 成長ランキング計算 (直近30日) ---
function calculateGrowthRanking() {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const swordStats = {};

    rawToukenData.forEach(d => {
        if (!swordStats[d.name]) swordStats[d.name] = { minLv: null, maxLv: null, history: [] };
        
        // 30日以内のデータを収集
        if (d.date >= thirtyDaysAgoStr) {
            if (swordStats[d.name].minLv === null || d.date < swordStats[d.name].minDate) {
                swordStats[d.name].minLv = d.lv;
                swordStats[d.name].minDate = d.date;
            }
            if (swordStats[d.name].maxLv === null || d.date > swordStats[d.name].maxDate) {
                swordStats[d.name].maxLv = d.lv;
                swordStats[d.name].maxDate = d.date;
            }
            swordStats[d.name].history.push({ x: d.date, y: d.lv });
        }
    });

    const ranking = Object.keys(swordStats)
        .map(name => ({
            name: name,
            growth: swordStats[name].maxLv - swordStats[name].minLv,
            history: swordStats[name].history.sort((a,b) => a.x.localeCompare(b.x))
        }))
        .filter(item => item.growth > 0)
        .sort((a, b) => b.growth - a.growth)
        .slice(0, 10);

    // リスト表示
    const rankingList = document.getElementById('rankingList');
    rankingList.innerHTML = ranking.length ? ranking.map((tk, i) => `
        <div class="ranking-item">${i+1}位：${tk.name} (+${tk.growth} Lv)</div>
    `).join('') : '<div class="ranking-item">データ不足</div>';

    // ランキンググラフ
    const top10Datasets = ranking.map(tk => ({
        label: tk.name,
        data: tk.history,
        borderColor: stringToColor(tk.name),
        tension: 0.1
    }));
    renderToukenChart('top10Chart', top10Datasets);
}

// --- 汎用チャート描画 ---
function renderChart(id, labels, dataObj) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();

    const colors = {
        charcoal: '#b54434', steel: '#7f8c8d', coolant: '#3498db', whetstone: '#27ae60',
        koban: '#f1c40f', requestTicket: '#9b59b6', helpTicket: '#e74c3c'
    };
    const labelNames = {
        charcoal: '木炭', steel: '玉鋼', coolant: '冷却', whetstone: '砥石',
        koban: '小判', requestTicket: '依頼札', helpTicket: '手伝札'
    };

    const datasetArr = Object.keys(dataObj).map(key => ({
        label: labelNames[key] || key,
        data: dataObj[key],
        borderColor: colors[key] || '#333',
        backgroundColor: colors[key] || '#333',
        yAxisID: (id === 'itemChart') ? (key === 'koban' ? 'y' : 'y1') : 'y'
    }));

    const options = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MM/dd' } } },
            y: { type: 'linear', position: 'left' }
        }
    };
    if (id === 'itemChart') {
        options.scales.y1 = { type: 'linear', position: 'right', grid: { drawOnChartArea: false } };
    }

    charts[id] = new Chart(ctx, { type: 'line', data: { labels, datasets: datasetArr }, options });
}

function renderToukenChart(id, datasets) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'time', time: { unit: 'day' } } }
        }
    });
}

// --- データ保存処理 ---
async function saveData(path, fields, dateId, modalId) {
    const user = auth.currentUser;
    if (!user) return alert("ログインしてください");
    const dateVal = document.getElementById(dateId).value;
    if (!dateVal) return alert("日付を入力してください");

    const data = { date: dateVal, timestamp: new Date() };
    for (let key in fields) {
        const el = document.getElementById(fields[key]);
        data[key] = el.type === 'number' ? parseInt(el.value) || 0 : el.value;
    }

    try {
        await addDoc(collection(db, "users", user.uid, path), data);
        closeModal(modalId);
    } catch (e) { alert("保存失敗"); }
}

document.getElementById('saveBtn').onclick = () => saveData("resources", { charcoal: "charcoal", steel: "steel", coolant: "coolant", whetstone: "whetstone" }, "date", "inputModal");
document.getElementById('saveItemBtn').onclick = () => saveData("items", { koban: "koban", requestTicket: "requestTicket", helpTicket: "helpTicket" }, "itemDate", "itemModal");
document.getElementById('saveLevelBtn').onclick = () => saveData("touken", { name: "tkName", type: "tkType", rarity: "tkRarity", lv: "tkLv" }, "lvDate", "levelModal");

// --- 補助機能 ---
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}

document.getElementById('openModalBtn').onclick = () => { document.getElementById('date').value = new Date().toISOString().split('T')[0]; document.getElementById('inputModal').style.display = 'block'; };
document.getElementById('openItemModalBtn').onclick = () => { document.getElementById('itemDate').value = new Date().toISOString().split('T')[0]; document.getElementById('itemModal').style.display = 'block'; };
document.getElementById('openLevelModalBtn').onclick = () => { document.getElementById('lvDate').value = new Date().toISOString().split('T')[0]; document.getElementById('levelModal').style.display = 'block'; };
window.closeModal = (id) => document.getElementById(id).style.display = 'none';
document.getElementById('loginBtn').onclick = () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider);
window.toggleEdit = () => { const s = document.getElementById('editSection'); s.style.display = s.style.display === 'none' ? 'block' : 'none'; };
