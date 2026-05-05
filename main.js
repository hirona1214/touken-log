import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- ランキング計算 ---
function calculateGrowthRanking() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
    const stats = {};
    rawToukenData.forEach(d => {
        if (!stats[d.name]) stats[d.name] = [];
        stats[d.name].push({ date: d.date, lv: d.lv });
    });
    const ranking = [];
    Object.keys(stats).forEach(name => {
        const history = stats[name].sort((a, b) => a.date.localeCompare(b.date));
        const recentRecords = history.filter(h => h.date >= dateStr);
        if (recentRecords.length >= 2) {
            const first = recentRecords[0];
            const last = recentRecords[recentRecords.length - 1];
            const diff = last.lv - first.lv;
            if (diff > 0) ranking.push({ name, diff, history: recentRecords });
        }
    });
    ranking.sort((a, b) => b.diff - a.diff);
    const top10 = ranking.slice(0, 10);
    const listEl = document.getElementById('rankingList');
    if (listEl) {
        listEl.innerHTML = top10.length ? top10.map((item, i) => `
            <div class="ranking-item">
                <strong>${i + 1}位: ${item.name}</strong> 
                <span style="color:#b54434;">(+${item.diff})</span>
            </div>
        `).join('') : '<p>データ不足です</p>';
    }
    const top10Datasets = top10.map(item => ({
        label: item.name,
        data: item.history.map(h => ({ x: h.date, y: h.lv })),
        borderColor: stringToColor(item.name),
        tension: 0.1, fill: false
    }));
    renderToukenChart('top10Chart', top10Datasets);
}

// --- 名簿（マスタ）の修正・削除・更新機能 ---
function renderMasterEditList() {
    const container = document.getElementById('masterEditList');
    if (!container) return;
    const sorted = [...toukenMaster].sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });
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
            <div style="margin-left:auto; display:flex; gap:5px;">
                <button onclick="updateMasterEntry('${m.id}')" style="background:#27ae60; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer;">更新</button>
                <button onclick="deleteMasterEntry('${m.id}')" style="background:#7f8c8d; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer;">削除</button>
            </div>
        </div>
    `).join('');
}

window.updateMasterEntry = async (id) => {
    const newName = document.getElementById(`editName_${id}`).value;
    const newType = document.getElementById(`editType_${id}`).value;
    const newRarity = parseInt(document.getElementById(`editRarity_${id}`).value);
    if (!newName || isNaN(newRarity)) return alert("名前とレア度を正しく入力してください");
    try {
        await updateDoc(doc(db, "touken_master", id), {
            name: newName, type: newType, rarity: newRarity
        });
        alert("修正完了しました");
    } catch (e) {
        alert("修正に失敗しました");
    }
};

window.deleteMasterEntry = async (id) => {
    if (!confirm("この刀剣男士を名簿から削除しますか？")) return;
    await deleteDoc(doc(db, "touken_master", id));
};

// --- レベル登録画面の制御 ---
window.openLevelModal = () => {
    document.getElementById('lvDate').value = new Date().toISOString().split('T')[0];
    const container = document.getElementById('levelInputContainer');
    container.innerHTML = "";
    rowCount = 0;
    addInputRow();
    document.getElementById('levelModal').style.display = 'block';
};

window.addInputRow = () => {
    if (rowCount >= 10) return alert("一度に登録できるのは10振りまでです");
    rowCount++;
    const rowId = `row_${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'input-row';
    row.id = rowId;
    row.innerHTML = `
        <select class="type-select" onchange="updateRarityOptions(this)">
            <option value="">刀種</option>
            <option value="短刀(極)">短刀(極)</option><option value="脇差(極)">脇差(極)</option>
            <option value="打刀(極)">打刀(極)</option><option value="太刀(極)">太刀(極)</option>
            <option value="大太刀(極)">大太刀(極)</option><option value="槍(極)">槍(極)</option>
            <option value="薙刀(極)">薙刀(極)</option><option value="剣(極)">剣(極)</option>
        </select>
        <select class="rarity-select" onchange="updateNameOptions(this)"><option value="">レア度</option></select>
        <select class="name-select"><option value="">名前</option></select>
        <input type="number" class="lv-input" placeholder="Lv">
        <button class="remove-row-btn" onclick="removeInputRow('${rowId}')">×</button>
    `;
    document.getElementById('levelInputContainer').appendChild(row);
};

window.removeInputRow = (id) => {
    const row = document.getElementById(id);
    if (row) { row.remove(); rowCount--; }
    if (rowCount === 0) addInputRow();
};

window.updateRarityOptions = (el) => {
    const type = el.value;
    const raritySelect = el.parentElement.querySelector('.rarity-select');
    const rarities = [...new Set(toukenMaster.filter(t => t.type === type).map(t => t.rarity))].sort();
    raritySelect.innerHTML = '<option value="">レア度</option>' + rarities.map(r => `<option value="${r}">${r}</option>`).join('');
};

window.updateNameOptions = (el) => {
    const rarity = el.value;
    const type = el.parentElement.querySelector('.type-select').value;
    const nameSelect = el.parentElement.querySelector('.name-select');
    const names = toukenMaster.filter(t => t.type === type && t.rarity == rarity).map(t => t.name);
    nameSelect.innerHTML = '<option value="">名前選択</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
};

// --- 保存・表示処理 ---
async function saveAllLevels() {
    const user = auth.currentUser;
    const dateVal = document.getElementById('lvDate').value;
    if (!user || !dateVal) return alert("日付を確認してください");
    const rows = document.querySelectorAll('.input-row');
    let count = 0;
    for (const row of rows) {
        const name = row.querySelector('.name-select').value;
        const lv = parseInt(row.querySelector('.lv-input').value);
        const type = row.querySelector('.type-select').value;
        const rarity = parseInt(row.querySelector('.rarity-select').value);
        if (name && lv) {
            await addDoc(collection(db, "users", user.uid, "touken"), {
                date: dateVal, name, lv, type, rarity, timestamp: new Date()
            });
            count++;
        }
    }
    if (count > 0) { closeModal('levelModal'); } else { alert("名前とレベルを入力してください"); }
}

async function saveResource() {
    const user = auth.currentUser;
    const date = document.getElementById('date').value;
    if (!user || !date) return alert("日付を確認してください");
    await addDoc(collection(db, "users", user.uid, "resources"), {
        date,
        charcoal: parseInt(document.getElementById('charcoal').value) || 0,
        steel: parseInt(document.getElementById('steel').value) || 0,
        coolant: parseInt(document.getElementById('coolant').value) || 0,
        whetstone: parseInt(document.getElementById('whetstone').value) || 0
    });
    closeModal('resourceModal');
}

async function saveItems() {
    const user = auth.currentUser;
    const date = document.getElementById('itemDate').value;
    if (!user || !date) return alert("日付を確認してください");
    await addDoc(collection(db, "users", user.uid, "items"), {
        date,
        koban: parseInt(document.getElementById('koban').value) || 0,
        requestTicket: parseInt(document.getElementById('requestTicket').value) || 0,
        helpTicket: parseInt(document.getElementById('helpTicket').value) || 0
    });
    closeModal('itemModal');
}

async function saveMasterEntry() {
    const name = document.getElementById('newMasterName').value;
    const type = document.getElementById('newMasterType').value;
    const rarity = parseInt(document.getElementById('newMasterRarity').value);
    if (!name || !type || isNaN(rarity)) return alert("全項目入力してください");
    await addDoc(collection(db, "touken_master"), { name, type, rarity });
    closeModal('masterModal');
    document.getElementById('newMasterName').value = "";
    document.getElementById('newMasterRarity').value = "";
}

window.deleteLevelRecord = async (docId) => {
    if (!confirm("記録を削除しますか？")) return;
    await deleteDoc(doc(db, "users", auth.currentUser.uid, "touken", docId));
};

// ★ここを修正：リストをスクロール可能にするスタイルを追加
function renderEditList() {
    const container = document.getElementById('levelEditList');
    if (!container) return;
    const sorted = [...rawToukenData].sort((a, b) => b.date.localeCompare(a.date));
    
    // 親要素に高さを制限してスクロールを許可するスタイルを設定
    container.style.maxHeight = "450px";
    container.style.overflowY = "auto";
    container.style.border = "1px solid #eee";
    container.style.padding = "5px";

    container.innerHTML = sorted.map(d => `
        <div class="edit-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
            <span>${d.date} | <strong>${d.name}</strong> (Lv${d.lv})</span>
            <button onclick="deleteLevelRecord('${d.id}')" style="background:#b54434; color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer;">削除</button>
        </div>
    `).join('');
}

function updateToukenView() {
    const typeFilter = document.getElementById('filterType')?.value || 'all';
    const rarityFilter = document.getElementById('filterRarity')?.value || 'all';
    const grouped = {};
    rawToukenData.forEach(d => {
        if ((typeFilter === 'all' || d.type === typeFilter) && (rarityFilter === 'all' || d.rarity == rarityFilter)) {
            if (!grouped[d.name]) grouped[d.name] = { labels: [], values: [] };
            grouped[d.name].labels.push(d.date);
            grouped[d.name].values.push(d.lv);
        }
    });
    const datasets = Object.keys(grouped).map(name => ({
        label: name,
        data: grouped[name].labels.map((date, i) => ({ x: date, y: grouped[name].values[i] })),
        borderColor: stringToColor(name),
        tension: 0.1, fill: false
    }));
    renderToukenChart('levelChart', datasets);
}

function renderChart(id, labels, dataObj) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    const colors = { charcoal: '#b54434', steel: '#7f8c8d', coolant: '#3498db', whetstone: '#27ae60', koban: '#f1c40f', requestTicket: '#9b59b6', helpTicket: '#e74c3c' };
    const datasetArr = Object.keys(dataObj).map(key => ({
        label: key, data: dataObj[key], borderColor: colors[key],
        yAxisID: (key === 'koban' ? 'y' : (id === 'itemChart' ? 'y1' : 'y'))
    }));
    charts[id] = new Chart(ctx, {
        type: 'line', data: { labels, datasets: datasetArr },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'day' } } } }
    });
}

function renderToukenChart(id, datasets) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line', data: { datasets },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'day' } } } }
    });
}

function stringToColor(str) {
    let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    let color = '#'; for (let i = 0; i < 3; i++) color += ('00' + ((hash >> (i * 8)) & 0xFF).toString(16)).substr(-2);
    return color;
}

window.switchTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
};

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

bindClick('saveBtn', saveResource);
bindClick('saveItemBtn', saveItems);
bindClick('openModalBtn', () => { 
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    document.getElementById('resourceModal').style.display = 'block'; 
});
bindClick('openItemModalBtn', () => { 
    document.getElementById('itemDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('itemModal').style.display = 'block'; 
});
bindClick('saveMasterBtn', saveMasterEntry);
bindClick('saveLevelBtn', saveAllLevels);
bindClick('addRowBtn', window.addInputRow);
bindClick('openLevelModalBtn', window.openLevelModal);
bindClick('openMasterModalBtn', () => { document.getElementById('masterModal').style.display = 'block'; });
bindClick('openMasterEditBtn', () => { document.getElementById('masterEditSection').style.display = 'block'; });
bindClick('openLevelEditBtn', () => { document.getElementById('levelEditSection').style.display = 'block'; });
bindClick('loginBtn', () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider));

document.getElementById('filterType')?.addEventListener('change', updateToukenView);
document.getElementById('filterRarity')?.addEventListener('change', updateToukenView);