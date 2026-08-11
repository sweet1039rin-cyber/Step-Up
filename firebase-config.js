  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyDgK-YG2fcI0N1kb8io-B9GFnmPtllthQY",
    authDomain: "stepup-family.firebaseapp.com",
    projectId: "stepup-family",
    storageBucket: "stepup-family.firebasestorage.app",
    messagingSenderId: "836645248497",
    appId: "1:836645248497:web:130a9bc57182ec817c7850"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
window.stepUpFirebase = { app, auth, signInWithEmailAndPassword, onAuthStateChanged, signOut };
