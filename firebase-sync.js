import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

function prepareFirestore() {
  const firebase = window.stepUpFirebase;
  if (!firebase?.app || firebase.firestoreReady) return;
  const db = getFirestore(firebase.app);
  Object.assign(firebase, { db, doc, getDoc, setDoc, onSnapshot, firestoreReady: true });
  window.dispatchEvent(new Event("stepUpFirestoreReady"));
}

if (window.stepUpFirebase) {
  prepareFirestore();
} else {
  window.addEventListener("stepUpFirebaseReady", prepareFirestore, { once: true });
}
