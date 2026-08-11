const loginScreen = document.createElement("div");
loginScreen.id = "login-screen";
loginScreen.innerHTML = '<div class="login-card"><h1>Step Up</h1><p>毎日の一歩が、未来を変える。</p></div>';
document.body.appendChild(loginScreen);
loginScreen.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#fff7d6;";
loginScreen.querySelector(".login-card").insertAdjacentHTML("beforeend", '<label>メールアドレス</label><input id="login-email" type="email"><label>パスワード</label><input id="login-password" type="password"><button id="login-button">ログイン</button><p id="login-error"></p>');
const firebase = window.stepUpFirebase;
if (!firebase) location.reload();
const email = document.getElementById("login-email");
const password = document.getElementById("login-password");
const button = document.getElementById("login-button");
const error = document.getElementById("login-error");
firebase.onAuthStateChanged(firebase.auth, user => loginScreen.style.display = user ? "none" : "flex");
button.addEventListener("click", async () => {    
error.textContent = "";    
try {
 await firebase.signInWithEmailAndPassword(firebase.auth, email.value.trim(), password.value);
} catch (e) {  
error.textContent = "ログインできませんでした。入力内容を確認してください。";
} 
});   
