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

// HTML要素の取得
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

// 今日の日付をセット
if(dateInput) dateInput.value = new Date().toISOString().substr(0, 10);

// モーダル表示・非表示
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

// 資材データの保存
saveBtn.addEventListener('click', async () => {
    const data = {
        date: dateInput.value,
        charcoal: parseInt(charcoalInput.value) || 0,
        steel: parseInt(steelInput.value) || 0,
        coolant: parseInt(coolantInput.value) || 0,
        whetstone: parseInt(whetstoneInput.value) || 0,
        timestamp: new Date()
    };

    if (!data.date) return alert("日付を入力してください");

    try {
        await addDoc(collection(db, "resources"), data);
        alert("報告を記録しました");
        modal.style.display = "none";
        // 入力欄をリセット
        charcoalInput.value = ""; steelInput.value = ""; 
        coolantInput.value = ""; whetstoneInput.value = "";
    } catch (e) { alert("保存に失敗しました"); }
});

// データのリアルタイム監視と描画
let myChart;
const q = query(collection(db, "resources"), orderBy("date", "asc"));

onSnapshot(q, (snapshot) => {
    const labels = [], cData = [], sData = [], coData = [], wData = [];
    historyBody.innerHTML = "";

    // ★ここが重要！ 引数を (docSnap) にして、ブラウザの document と分ける
    snapshot.forEach((docSnap) => { 
        const d = docSnap.data();
        const id = docSnap.id;
        
        labels.push(d.date);
        cData.push(d.charcoal); 
        sData.push(d.steel);
        coData.push(d.coolant || 0); 
        wData.push(d.whetstone || 0);

        // テーブル（修正用）の作成
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td>${d.date.slice(5)}</td>
            <td>${d.charcoal}</td><td>${d.steel}</td>
            <td>${d.coolant || 0}</td><td>${d.whetstone || 0}</td>
            <td><button class="delete-btn" data-id="${id}">削</button></td>
        `;
        historyBody.appendChild(tr);
    });

    // 削除ボタンの機能
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async (e) => {
            if (confirm("この記録を削除してもよろしいですか？")) {
                await deleteDoc(doc(db, "resources", e.target.dataset.id));
            }
        };
    });

    // グラフの描画
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: '木炭', data: cData, borderColor: '#e67e22', backgroundColor: '#e67e22', tension: 0.1 },
                { label: '玉鋼', data: sData, borderColor: '#95a5a6', backgroundColor: '#95a5a6', tension: 0.1 },
                { label: '冷却', data: coData, borderColor: '#3498db', backgroundColor: '#3498db', tension: 0.1 },
                { label: '砥石', data: wData, borderColor: '#27ae60', backgroundColor: '#27ae60', tension: 0.1 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
});