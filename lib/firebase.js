// lib/firebase.js — Konfigurasi Firebase untuk AM Bangunan
// Ganti 6 nilai MASUKKAN_... dengan nilai dari Firebase Console Anda

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAM32xjUGLuXgZRzh_xZDaUzDcN0dZmPUQ",
  authDomain: "am-bangunan.firebaseapp.com",
  projectId: "am-bangunan",
  storageBucket: "am-bangunan.firebasestorage.app",
  messagingSenderId: "804927178093",
  appId: "1:804927178093:web:ac80acb96d7bc6fe1c0664"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
