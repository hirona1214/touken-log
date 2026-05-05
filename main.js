// --- 1. Firebase機能のインポート ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 2. Firebaseの初期設定 (あなたのプロジェクト用) ---
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
const saveBtn = document.getElementById('saveBtn');

// デフォルトの日付を今日に設定
dateInput.value = new Date().toISOString().substr(0, 10);

// --- 4. 保存機能 (RECORD TO CLOUD) ---
saveBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    const charcoal = parseInt(charcoalInput.value);
    const steel = parseInt(steelInput.value);

    // バリデーション (入力チェック)
    if (!date || isNaN(charcoal) || isNaN(steel)) {
        alert("数値を入力してください");
        return;
    }

    try {
        // Firebaseの「resources」という名前のコレクションに保存
        await addDoc(collection(db, "resources"), {
            date: date,
            charcoal: charcoal,
            steel: steel,
            timestamp: new Date() // 並び替え用に保存時の時間も記録
        });
        alert("本丸の記録をクラウドに保存しました");
        
        // 入力欄をリセット
        charcoalInput.value = "";
        steelInput.value = "";
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("保存に失敗しました。ルールの設定を確認してください。");
    }
});

// --- 5. 取得 & グラフ描画機能 ---
const ctx = document.getElementById('mainChart').getContext('2d');
let myChart;

// Firestoreのデータを監視 (データが追加されるたびに自動で実行される)
const q = query(collection(db, "resources"), orderBy("date", "asc"));

onSnapshot(q, (querySnapshot) => {
    const labels = [];
    const charcoalData = [];
    const steelData = [];

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        labels.push(data.date);
        charcoalData.push(data.charcoal);
        steelData.push(data.steel);
    });

    // すでにグラフがある場合は一度壊して再作成 (重複防止)
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
                    borderColor: '#e67e22', // 木炭っぽいオレンジ
                    backgroundColor: '#e67e22',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.1
                },
                {
                    label: '玉鋼',
                    data: steelData,
                    borderColor: '#95a5a6', // 鋼っぽいグレー
                    backgroundColor: '#95a5a6',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#888', font: { size: 10 } }
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