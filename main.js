import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
        snapshot.forEach(doc => toukenMaster.push(doc.data()));
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
    });
}

function loadResourceData(uid) {
    // 資材チャート用
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

    // アイテムチャート用
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

// --- 保存処理系 ---

// 資材保存
async function saveResource() {
    const user = auth.currentUser;
    const date = document.getElementById('date').value;
    if (!user || !date) return alert("日付とログインを確認してください");
    
    const data = {
        date: date,
        charcoal: parseInt(document.getElementById('charcoal').value) || 0,
        steel: parseInt(document.getElementById('steel').value) || 0,
        coolant: parseInt(document.getElementById('coolant').value) || 0,
        whetstone: parseInt(document.getElementById('whetstone').value) || 0,
        timestamp: new Date()
    };
    await addDoc(collection(db, "users", user.uid, "resources"), data);
    closeModal('resourceModal');
}

// アイテム保存
async function saveItems() {
    const user = auth.currentUser;
    const date = document.getElementById('itemDate').value;
    if (!user || !date) return alert("日付とログインを確認してください");

    const data = {
        date: date,
        koban: parseInt(document.getElementById('koban').value) || 0,
        requestTicket: parseInt(document.getElementById('requestTicket').value) || 0,
        helpTicket: parseInt(document.getElementById('helpTicket').value) || 0,
        timestamp: new Date()
    };
    await addDoc(collection(db, "users", user.uid, "items"), data);
    closeModal('itemModal');
}

// 刀剣レベル一括保存
async function saveAllLevels() {
    const user = auth.currentUser;
    const dateVal = document.getElementById('lvDate').value;
    if (!user || !dateVal) return alert("日付を確認してください");

    for (let i = 1; i <= rowCount; i++) {
        const name = document.getElementById(`name_${i}`).value;
        const lv = parseInt(document.getElementById(`lv_${i}`).value);
        const type = document.getElementById(`type_${i}`).value;
        const rarity = parseInt(document.getElementById(`rarity_${i}`).value);
        if (name && lv) {
            await addDoc(collection(db, "users", user.uid, "touken"), {
                date: dateVal, name, lv, type, rarity, timestamp: new Date()
            });
        }
    }
    closeModal('levelModal');
}

// 名簿登録
async function saveMasterEntry() {
    const name = document.getElementById('newMasterName').value;
    const type = document.getElementById('newMasterType').value;
    const rarity = parseInt(document.getElementById('newMasterRarity').value);
    if (!name || !type || !rarity) return alert("全項目入力してください");
    await addDoc(collection(db, "touken_master"), { name, type, rarity });
    closeModal('masterModal');
}

// --- 刀剣UI操作・修正機能 ---

window.deleteLevelRecord = async (docId) => {
    if (!confirm("記録を削除しますか？")) return;
    await deleteDoc(doc(db, "users", auth.currentUser.uid, "touken", docId));
};

function renderEditList() {
    const container = document.getElementById('levelEditList');
    if (!container) return;
    const sorted = [...rawToukenData].sort((a, b) => b.date.localeCompare(a.date));
    container.innerHTML = sorted.map(d => `
        <div class="edit-item" style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;">
            <span>${d.date} | <strong>${d.name}</strong> (Lv${d.lv})</span>
            <button onclick="deleteLevelRecord('${d.id}')" style="background:#b54434; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px;">削除</button>
        </div>
    `).join('');
}

window.updateRarityOptions = (rowIdx) => {
    const type = document.getElementById(`type_${rowIdx}`).value;
    const rarities = [...new Set(toukenMaster.filter(t => t.type === type).map(t => t.rarity))].sort();
    document.getElementById(`rarity_${rowIdx}`).innerHTML = '<option value="">レア度</option>' + rarities.map(r => `<option value="${r}">${r}</option>`).join('');
};

window.updateNameOptions = (rowIdx) => {
    const type = document.getElementById(`type_${rowIdx}`).value;
    const rarity = document.getElementById(`rarity_${rowIdx}`).value;
    const names = toukenMaster.filter(t => t.type === type && t.rarity == rarity).map(t => t.name);
    document.getElementById(`name_${rowIdx}`).innerHTML = '<option value="">名前選択</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
};

let rowCount = 1;
window.addInputRow = () => {
    if (rowCount >= 6) return alert("一度に登録できるのは6振りまでです");
    rowCount++;
    const row = document.createElement('div');
    row.className = 'input-row border-top pt-2 mt-2';
    row.innerHTML = `
        <select id="type_${rowCount}" onchange="updateRarityOptions(${rowCount})">
            <option value="">刀種</option>
            <option value="短刀(極)">短刀(極)</option><option value="打刀(極)">打刀(極)</option><option value="太刀(極)">太刀(極)</option>
            <option value="短刀">短刀</option><option value="打刀">打刀</option><option value="太刀">太刀</option>
        </select>
        <select id="rarity_${rowCount}" onchange="updateNameOptions(${rowCount})"><option>レア度</option></select>
        <select id="name_${rowCount}"><option>名前</option></select>
        <input type="number" id="lv_${rowCount}" placeholder="Lv">
    `;
    document.getElementById('levelInputContainer').appendChild(row);
};

// --- グラフ・表示制御系 ---

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
        label: key, data: dataObj[key], borderColor: colors[key], yAxisID: (key === 'koban' ? 'y' : (id === 'itemChart' ? 'y1' : 'y'))
    }));
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: datasetArr },
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

// --- イベントバインド ---

const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

// 資材・アイテム系
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

// 刀剣系
bindClick('saveMasterBtn', saveMasterEntry);
bindClick('saveLevelBtn', saveAllLevels);
bindClick('addRowBtn', window.addInputRow);
bindClick('openLevelModalBtn', () => { 
    document.getElementById('lvDate').value = new Date().toISOString().split('T')[0]; 
    document.getElementById('levelModal').style.display = 'block'; 
});
bindClick('openMasterModalBtn', () => { document.getElementById('masterModal').style.display = 'block'; });
bindClick('openLevelEditBtn', () => { document.getElementById('levelEditSection').style.display = 'block'; });

// 共通
bindClick('loginBtn', () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider));

const filterType = document.getElementById('filterType');
const filterRarity = document.getElementById('filterRarity');
if(filterType) filterType.addEventListener('change', updateToukenView);
if(filterRarity) filterRarity.addEventListener('change', updateToukenView);