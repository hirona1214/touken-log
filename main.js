import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// 要素取得
const dateInput = document.getElementById('date');
const charcoalInput = document.getElementById('charcoal');
const steelInput = document.getElementById('steel');
const coolantInput = document.getElementById('coolant');
const whetstoneInput = document.getElementById('whetstone');
const saveBtn = document.getElementById('saveBtn');
const modal = document.getElementById("inputModal");
const openBtn = document.getElementById("openModalBtn");
const closeBtn = document.querySelector(".close-btn");
const editModeBtn = document.getElementById('editModeBtn');
const editSection = document.getElementById('editSection');
const historyBody = document.getElementById('historyBody');

dateInput.value = new Date().toISOString().substr(0, 10);

// モーダル制御
openBtn.onclick = () => modal.style.display = "block";
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

// 修正モード切り替え
editModeBtn.onclick = () => {
    if (editSection.style.display === "none") {
        editSection.style.display = "block";
        editModeBtn.innerText = "閉じる";
    } else {
        editSection.style.display = "none";
        editModeBtn.innerText = "修正";
    }
};

// 保存
saveBtn.addEventListener('click', async () => {
    const data = {
        date: dateInput.value,
        charcoal: parseInt(charcoalInput.value),
        steel: parseInt(steelInput.value),
        coolant: parseInt(coolantInput.value),
        whetstone: parseInt(whetstoneInput.value),
        timestamp: new Date()
    };

    if (!data.date || isNaN(data.charcoal)) return alert("入力を確認してください");

    try {
        await addDoc(collection(db, "resources"), data);
        alert("報告完了");
        modal.style.display = "none";
    } catch (e) { alert("失敗"); }
});

// 取得・描画
const ctx = document.getElementById('mainChart').getContext('2d');
let myChart;
const q = query(collection(db, "resources"), orderBy("date", "asc"));

onSnapshot(q, (snapshot) => {
    const labels = [], cData = [], sData = [], coData = [], wData = [];
    historyBody.innerHTML = "";

    snapshot.forEach((document) => {
        const d = document.data();
        const id = document.id;
        labels.push(d.date);
        cData.push(d.charcoal); sData.push(d.steel);
        coData.push(d.coolant || 0); wData.push(d.whetstone || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.date.slice(5)}</td>
            <td>${d.charcoal}</td><td>${d.steel}</td>
            <td>${d.coolant || 0}</td><td>${d.whetstone || 0}</td>
            <td><button class="delete-btn" data-id="${id}">削</button></td>
        `;
        historyBody.appendChild(tr);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async (e) => {
            if (confirm("削除しますか？")) {
                await deleteDoc(doc(db, "resources", e.target.dataset.id));
            }
        };
    });

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: '木炭', data: cData, borderColor: '#e67e22', tension: 0.1 },
                { label: '玉鋼', data: sData, borderColor: '#95a5a6', tension: 0.1 },
                { label: '冷却', data: coData, borderColor: '#3498db', tension: 0.1 },
                { label: '砥石', data: wData, borderColor: '#27ae60', tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
});