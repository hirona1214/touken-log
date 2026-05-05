// --- 1. Firebase機能のインポート ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 2. Firebaseの初期設定 ---
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

// --- 3. HTML要素の取得 ---
const dateInput = document.getElementById('date');
const charcoalInput = document.getElementById('charcoal');
const steelInput = document.getElementById('steel');
const coolantInput = document.getElementById('coolant');
const whetstoneInput = document.getElementById('whetstone');
const saveBtn = document.getElementById('saveBtn');

// モーダル関連
const modal = document.getElementById("inputModal");
const openBtn = document.getElementById("openModalBtn");
const closeBtn = document.querySelector(".close-btn");

// デフォルトの日付を今日に設定
dateInput.value = new Date().toISOString().substr(0, 10);

// --- 4. モーダルの開閉処理 ---
openBtn.onclick = () => {
    modal.style.display = "block";
};

closeBtn.onclick = () => {
    modal.style.display = "none";
};

window.onclick = (event) => {
    if (event.target == modal) {
        modal.style.display = "none";
    }
};

// --- 5. 保存機能 ---
saveBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    const charcoal = parseInt(charcoalInput.value);
    const steel = parseInt(steelInput.value);
    const coolant = parseInt(coolantInput.value);
    const whetstone = parseInt(whetstoneInput.value);

    if (!date || isNaN(charcoal) || isNaN(steel) || isNaN(coolant) || isNaN(whetstone)) {
        alert("すべての数値を入力してください");
        return;
    }

    try {
        await addDoc(collection(db, "resources"), {
            date: date,
            charcoal: charcoal,
            steel: steel,
            coolant: coolant,
            whetstone: whetstone,
            timestamp: new Date()
        });
        
        alert("報告を完了しました");
        
        // 入力欄をリセットしてモーダルを閉じる
        charcoalInput.value = "";
        steelInput.value = "";
        coolantInput.value = "";
        whetstoneInput.value = "";
        modal.style.display = "none";

    } catch (e) {
        console.error("Error adding document: ", e);
        alert("保存に失敗しました。");
    }
});

// --- 6. 取得 & グラフ描画機能 ---
const ctx = document.getElementById('mainChart').getContext('2d');
let myChart;

const q = query(collection(db, "resources"), orderBy("date", "asc"));

onSnapshot(q, (querySnapshot) => {
    const labels = [];
    const charcoalData = [];
    const steelData = [];
    const coolantData = [];
    const whetstoneData = [];

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        labels.push(data.date);
        charcoalData.push(data.charcoal);
        steelData.push(data.steel);
        coolantData.push(data.coolant || 0);
        whetstoneData.push(data.whetstone || 0);
    });

    if (myChart) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '木炭',
                    data: charcoalData,
                    borderColor: '#e67e22',
                    backgroundColor: '#e67e22',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '玉鋼',
                    data: steelData,
                    borderColor: '#95a5a6',
                    backgroundColor: '#95a5a6',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '冷却材',
                    data: coolantData,
                    borderColor: '#3498db',
                    backgroundColor: '#3498db',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '砥石',
                    data: whetstoneData,
                    borderColor: '#27ae60',
                    backgroundColor: '#27ae60',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // 画面サイズに合わせる
            plugins: {
                legend: {
                    labels: { color: '#888', font: { size: 12 } }
                }
            },
            scales: {
                y: {
                    grid: { color: '#262626' },
                    ticks: { color: '#666' }
                },
                x: {
                    grid: { color: '#262626' },
                    ticks: { color: '#666' }
                }
            }
        }
    });
});