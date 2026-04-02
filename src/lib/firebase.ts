// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB6YiROR9EjDyu5R6Bfs1LQdw61Z4Ogr4c",
  authDomain: "clothing-brand-2efac.firebaseapp.com",
  databaseURL: "https://clothing-brand-2efac-default-rtdb.firebaseio.com",
  projectId: "clothing-brand-2efac",
  // Canonical bucket used by Firebase Storage SDK operations.
  storageBucket: "clothing-brand-2efac.appspot.com",
  messagingSenderId: "155151453155",
  appId: "1:155151453155:web:ae72b82a74986ca6656ed6",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

export default app;
