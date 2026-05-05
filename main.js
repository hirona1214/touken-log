import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC32tKkWQTDZrxM2rypST5KIMINI5wFzVc",
    authDomain: "touken-manager.firebaseapp.com",
    projectId: "touken-manager",
    storageBucket: "touken-manager.firebasestorage.app",
    messagingSenderId: "628627612862",
    appId: "1:628627612862:web:c06b91f4fc656064472aef",
    measurementId: "G-942WCG4VMM"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let charts = {};

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userInfo').innerText = `${user.displayName} の本丸`;
        document.getElementById('loginBtn').innerText = "ログアウト";
        document.getElementById('openModalBtn').style.display = "block";
        document.getElementById('openItemModalBtn').style.display = "block";
        // データの読み込み
        loadData(user.uid, "resources", "mainChart");
        loadData(user.uid, "items", "itemChart");
    } else {
        document.getElementById('userInfo').innerText = "閲覧制限中";
        document.getElementById('loginBtn').innerText = "Googleログイン";
    }
});

function loadData(uid, path, canvasId) {
    const q = query(collection(db, "users", uid, path), orderBy("date", "asc"));
    onSnapshot(q, (snapshot) => {
        const datasets = {};
        const labels = [];
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            labels.push(d.date);
            Object.keys(d).forEach(key => {
                if(key === 'date' || key === 'timestamp') return;
                if(!datasets[key]) datasets[key] = [];
                datasets[key].push(d[key]);
            });
        });
        renderChart(canvasId, labels, datasets);
    });
}

function renderChart(id, labels, dataObj) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    
    const colors = {
        charcoal: '#e67e22', steel: '#95a5a6', coolant: '#3498db', whetstone: '#27ae60',
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
        tension: 0.1
    }));

    charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: datasetArr },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MM/dd' } } } }
        }
    });
}

// 保存アクション
document.getElementById('saveBtn').onclick = () => saveData("resources", {
    charcoal: document.getElementById('charcoal').value,
    steel: document.getElementById('steel').value,
    coolant: document.getElementById('coolant').value,
    whetstone: document.getElementById('whetstone').value
}, "inputModal");

document.getElementById('saveItemBtn').onclick = () => saveData("items", {
    koban: document.getElementById('koban').value,
    requestTicket: document.getElementById('requestTicket').value,
    helpTicket: document.getElementById('helpTicket').value
}, "itemModal");

async function saveData(path, fields, modalId) {
    const user = auth.currentUser;
    if (!user) return alert("ログインが必要です");
    const dateId = modalId === "inputModal" ? "date" : "itemDate";
    const data = { date: document.getElementById(dateId).value, timestamp: new Date() };
    Object.keys(fields).forEach(k => data[k] = parseInt(fields[k]) || 0);
    
    await addDoc(collection(db, "users", user.uid, path), data);
    document.getElementById(modalId).style.display = "none";
}

// UIイベント
document.getElementById('openModalBtn').onclick = () => {
    document.getElementById('date').value = new Date().toISOString().substr(0, 10);
    document.getElementById('inputModal').style.display = 'block';
};
document.getElementById('openItemModalBtn').onclick = () => {
    document.getElementById('itemDate').value = new Date().toISOString().substr(0, 10);
    document.getElementById('itemModal').style.display = 'block';
};
window.closeModal = (id) => document.getElementById(id).style.display = 'none';
document.getElementById('loginBtn').onclick = () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider);
document.getElementById('editModeBtn').onclick = () => {
    const s = document.getElementById('editSection');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
};