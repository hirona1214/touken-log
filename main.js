import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, signOut, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- 2. 要素取得 ---
const loginBtn = document.getElementById('loginBtn');
const userInfo = document.getElementById('userInfo');
const openModalBtn = document.getElementById('openModalBtn');
const historyBody = document.getElementById('historyBody');
const modal = document.getElementById("inputModal");

let unsubscribe = null; 
let myChart = null;

// --- 3. 認証・ログイン管理（デバッグ強化版） ---

console.log("【チェック】JS読み込み完了");

// ログイン画面から戻ってきた時の処理
getRedirectResult(auth).then((result) => {
    if (result?.user) {
        console.log("【チェック】リダイレクト成功:", result.user.displayName);
    }
}).catch((error) => {
    console.error("【エラー】リダイレクト失敗:", error);
    alert("ログインに失敗しました。コンソールを確認してください。");
});

// ログイン状態が変わった時の監視
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("【チェック】ログイン済みです！ UID:", user.uid);
        userInfo.innerText = `${user.displayName} の本丸`;
        loginBtn.innerText = "ログアウト";
        openModalBtn.style.display = "block";
        loadUserData(user.uid); 
    } else {
        console.log("【チェック】ログインしていません（閲覧制限）");
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
        console.log("【チェック】Googleログイン（リダイレクト）開始...");
        signInWithRedirect(auth, provider);
    }
};

// --- 4. データ読み込み ---
function loadUserData(uid) {
    console.log("【チェック】データ読み込み開始... フォルダ:", uid);
    const q = query(collection(db, "users", uid, "resources"), orderBy("date", "asc"));

    if (unsubscribe) unsubscribe();
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("【チェック】Firestoreからデータ受信。件数:", snapshot.size);
        const labels = [], cData = [], sData = [], coData = [], wData = [];
        historyBody.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            labels.push(d.date);
            cData.push(d.charcoal); sData.push(d.steel);
            coData.push(d.coolant || 0); wData.push(d.whetstone || 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.date.slice(5)}</td>
                <td>${d.charcoal}</td><td>${d.steel}</td>
                <td>${d.coolant || 0}</td><td>${d.whetstone || 0}</td>
                <td><button class="delete-btn" data-id="${docSnap.id}">削</button></td>
            `;
            historyBody.appendChild(tr);
        });

        renderChart(labels, cData, sData, coData, wData);
    }, (error) => {
        console.error("【エラー】データ受信失敗:", error);
    });
}

// グラフ描画関数などは以前のものをそのまま引き継いでください（省略せずに全文に含めています）
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

// 保存ボタン、UI制御なども同様に全文上書きしてください
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
    try {
        await addDoc(collection(db, "users", user.uid, "resources"), data);
        document.getElementById("inputModal").style.display = "none";
    } catch (e) { console.error("【エラー】保存失敗:", e); }
});

const editModeBtn = document.getElementById('editModeBtn');
const editSection = document.getElementById('editSection');
editModeBtn.onclick = () => {
    editSection.style.display = editSection.style.display === "none" ? "block" : "none";
    editModeBtn.innerText = editSection.style.display === "none" ? "修正" : "閉じる";
};
document.querySelector(".close-btn").onclick = () => modal.style.display = "none";