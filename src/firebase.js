import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// --- QUAN TRỌNG: Bạn cần thay đoạn mã bên dưới bằng mã của riêng bạn ---
// Cách lấy: Vào console.firebase.google.com -> Project Settings -> Kéo xuống dưới cùng -> Chọn App Web (icon </>)
const firebaseConfig = {
  apiKey: "AIzaSyBSYlhken9G5cTpzmQCDA1tUGTo5ztr2gI",
  authDomain: "appchamcong-2ef18.firebaseapp.com",
  projectId: "appchamcong-2ef18",
  storageBucket: "appchamcong-2ef18.firebasestorage.app",
  messagingSenderId: "651193311180",
  appId: "1:651193311180:web:2ca1d59ad92e7ddd628769",
  measurementId: "G-RZWQEWMXTQ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);