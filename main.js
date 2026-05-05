import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. Firebase初期設定 ---
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

// --- 2. HTML要素の取得 ---
const loginBtn = document.getElementById('loginBtn');
const userInfo = document.getElementById('userInfo');
const openModalBtn = document.getElementById('openModalBtn');
const historyBody = document.getElementById('historyBody');
const modal = document.getElementById("inputModal");
const editModeBtn = document.getElementById('editModeBtn');
const editSection = document.getElementById('editSection');

let unsubscribe = null; 
let myChart = null;

// --- 3. 認証・ログイン管理 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userInfo.innerText = `${user.displayName} の本丸`;
        loginBtn.innerText = "ログアウト";
        openModalBtn.style.display = "block";
        loadUserData(user.uid); // ログインユーザーのデータを読み込み
    } else {
        userInfo.innerText = "閲覧制限中";
        loginBtn.innerText = "Googleログイン";
        openModalBtn.style.display = "none";
        if (unsubscribe) unsubscribe();
        if (myChart) myChart.destroy();
        historyBody.innerHTML = "<tr><td colspan='6'>ログインするとデータが表示されます</td></tr>";
    }
});

loginBtn.onclick = async () => {
    if (auth.currentUser) {
        if (confirm("ログアウトしますか？")) signOut(auth);
    } else {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            console.error(e);
            alert("ログインに失敗しました。ポップアップがブロックされていないか確認してください。");
        }
    }
};

// --- 4. データ読み込み・リアルタイム更新 ---
function loadUserData(uid) {
    // ユーザー別のパス (users/UID/resources) を監視
    const q = query(collection(db, "users", uid, "resources"), orderBy("date", "asc"));

    if (unsubscribe) unsubscribe();
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        const labels = [], cData = [], sData = [], coData = [], wData = [];
        historyBody.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const id = docSnap.id;
            
            labels.push(d.date);
            cData.push(d.charcoal); 
            sData.push(d.steel);
            coData.push(d.coolant || 0); 
            wData.push(d.whetstone || 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.date.slice(5)}</td>
                <td>${d.charcoal}</td><td>${d.steel}</td>
                <td>${d.coolant || 0}</td><td>${d.whetstone || 0}</td>
                <td><button class="delete-btn" data-id="${id}">削</button></td>
            `;
            historyBody.appendChild(tr);
        });

        renderChart(labels, cData, sData, coData, wData);

        // 削除ボタンイベント
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                if (confirm("この記録を削除しますか？")) {
                    await deleteDoc(doc(db, "users", uid, "resources", e.target.dataset.id));
                }
            };
        });
    });
}

// --- 5. データ保存処理 ---
document.getElementById('saveBtn').addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return alert("ログインが必要です");

    const data = {
        date: document.getElementById('date').value,
        charcoal: parseInt(document.getElementById('charcoal').value) || 0,
        steel: parseInt(document.getElementById('steel').value) || 0,
        coolant: parseInt(document.getElementById('coolant').value) || 0,
        whetstone: parseInt(document.getElementById('whetstone').value) || 0,
        timestamp: new Date()
    };

    if (!data.date) return alert("日付を入力してください");

    try {
        await addDoc(collection(db, "users", user.uid, "resources"), data);
        modal.style.display = "none";
        // 入力フォームクリア
        ['charcoal','steel','coolant','whetstone'].forEach(id => document.getElementById(id).value = "");
    } catch (e) { 
        console.error(e);
        alert("保存権限がありません。セキュリティルールを確認してください。"); 
    }
});

// --- 6. グラフ描画関数 ---
function renderChart(labels, cData, sData, coData, wData) {
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
            scales: { y: { beginAtZero: false } }
        }
    });
}

// --- 7. UI制御（モーダル・修正モード） ---
if(document.getElementById('date')) {
    document.getElementById('date').value = new Date().toISOString().substr(0, 10);
}

openModalBtn.onclick = () => modal.style.display = "block";
document.querySelector(".close-btn").onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

editModeBtn.onclick = () => {
    if (editSection.style.display === "none") {
        editSection.style.display = "block";
        editModeBtn.innerText = "閉じる";
    } else {
        editSection.style.display = "none";
        editModeBtn.innerText = "修正";
    }
};