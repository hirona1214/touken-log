import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userInfo').innerText = `${user.displayName} の本丸`;
        document.getElementById('loginBtn').innerText = "ログアウト";
        document.querySelectorAll('.btn-action.red').forEach(b => b.style.display = "block");
        loadData(user.uid, "resources", "mainChart");
        loadData(user.uid, "items", "itemChart");
    } else {
        document.getElementById('userInfo').innerText = "(未ログイン)";
        document.getElementById('loginBtn').innerText = "ログイン";
        document.querySelectorAll('.btn-action.red').forEach(b => b.style.display = "none");
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
        charcoal: '#b54434', steel: '#7f8c8d', coolant: '#3498db', whetstone: '#27ae60',
        koban: '#f1c40f', requestTicket: '#9b59b6', helpTicket: '#e74c3c'
    };
    
    const labelNames = {
        charcoal: '木炭', steel: '玉鋼', coolant: '冷却', whetstone: '砥石',
        koban: '小判', requestTicket: '依頼札', helpTicket: '手伝札'
    };

    const datasetArr = Object.keys(dataObj).map(key => {
        const isKoban = (key === 'koban');
        return {
            label: labelNames[key] || key,
            data: dataObj[key],
            borderColor: colors[key] || '#333',
            backgroundColor: colors[key] || '#333',
            tension: 0.1,
            pointRadius: 4,
            yAxisID: (id === 'itemChart') ? (isKoban ? 'y' : 'y1') : 'y'
        };
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MM/dd' } } },
            y: {
                type: 'linear', position: 'left',
                title: { display: true, text: id === 'itemChart' ? '小判' : '資材量' }
            }
        }
    };

    if (id === 'itemChart') {
        chartOptions.scales.y1 = {
            type: 'linear', position: 'right',
            title: { display: true, text: '札' },
            grid: { drawOnChartArea: false }
        };
    }

    charts[id] = new Chart(ctx, { type: 'line', data: { labels, datasets: datasetArr }, options: chartOptions });
}

async function saveData(path, fields, dateInputId, modalId) {
    const user = auth.currentUser;
    if (!user) return alert("ログインしてください");
    const dateVal = document.getElementById(dateInputId).value;
    if (!dateVal) return alert("日付を選択してください");

    const data = { date: dateVal, timestamp: new Date() };
    for (let key in fields) {
        data[key] = parseInt(document.getElementById(key).value) || 0;
    }
    
    try {
        await addDoc(collection(db, "users", user.uid, path), data);
        closeModal(modalId);
        for (let key in fields) document.getElementById(key).value = "";
    } catch (e) {
        alert("保存に失敗しました。");
    }
}

document.getElementById('saveBtn').onclick = () => saveData("resources", { charcoal: "charcoal", steel: "steel", coolant: "coolant", whetstone: "whetstone" }, "date", "inputModal");
document.getElementById('saveItemBtn').onclick = () => saveData("items", { koban: "koban", requestTicket: "requestTicket", helpTicket: "helpTicket" }, "itemDate", "itemModal");

document.getElementById('openModalBtn').onclick = () => { document.getElementById('date').value = new Date().toISOString().split('T')[0]; document.getElementById('inputModal').style.display = 'block'; };
document.getElementById('openItemModalBtn').onclick = () => { document.getElementById('itemDate').value = new Date().toISOString().split('T')[0]; document.getElementById('itemModal').style.display = 'block'; };
window.closeModal = (id) => document.getElementById(id).style.display = 'none';
document.getElementById('loginBtn').onclick = () => auth.currentUser ? signOut(auth) : signInWithPopup(auth, provider);
document.getElementById('editModeBtn').onclick = () => { const s = document.getElementById('editSection'); s.style.display = s.style.display === 'none' ? 'block' : 'none'; };
document.getElementById('editItemModeBtn').onclick = () => { const s = document.getElementById('editSection'); s.style.display = s.style.display === 'none' ? 'block' : 'none'; };