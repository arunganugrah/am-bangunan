'use client';
// app/admin-login/page.js — Halaman Login AM Bangunan
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

const ADMIN_EMAIL = 'admin@ambangunan.com'; // ← ganti sesuai email admin Anda

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      if (cred.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        router.push('/admin');
        return;
      }

      const q = query(collection(db, 'karyawan'), where('email', '==', cred.user.email.toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('Akun Anda belum terdaftar. Hubungi pemilik toko.');
        await auth.signOut(); return;
      }

      const data = snap.docs[0].data();
      if (data.aktif === false) {
        setError('Akun Anda dinonaktifkan. Hubungi pemilik toko.');
        await auth.signOut(); return;
      }

      if (data.role === 'admin') router.push('/admin');
      if (data.role === 'manajer_stok') {
      router.push('/manajer-stok');
      } else {
      router.push('/kasir');
      }

    } catch (err) {
      const kode = err.code;
      if (['auth/invalid-credential','auth/wrong-password','auth/invalid-email'].includes(kode))
        setError('Email atau password salah.');
      else if (kode === 'auth/user-not-found')
        setError('Email tidak ditemukan.');
      else if (kode === 'auth/too-many-requests')
        setError('Terlalu banyak percobaan. Coba lagi nanti.');
      else if (kode === 'auth/network-request-failed')
        setError('Tidak ada koneksi internet.');
      else
        setError('Gagal masuk. Kode: ' + kode);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#1a2535',
        border: '1px solid #2d4a6e',
        borderRadius: 20,
        padding: '52px 44px',
        width: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Logo Area */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #f6c90e, #e8a800)',
            borderRadius: 12,
            padding: '12px 24px',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#1a2535', letterSpacing: '-0.5px' }}>
              AM BANGUNAN
            </span>
          </div>
          <div style={{ color: '#7a8fa6', fontSize: 13, letterSpacing: 1 }}>
            SISTEM KASIR & MANAJEMEN STOK
          </div>
        </div>

        {error && (
          <div style={{
            background: '#2d1515',
            border: '1px solid #7f3030',
            borderRadius: 10,
            color: '#ff9090',
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#7a8fa6', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>
              EMAIL
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 10,
                border: '1px solid #2d4a6e',
                background: '#0f1c2b',
                color: '#e8edf2',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontSize: 12, color: '#7a8fa6', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>
              PASSWORD
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 10,
                border: '1px solid #2d4a6e',
                background: '#0f1c2b',
                color: '#e8edf2',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 10,
              background: loading ? '#3d4f60' : 'linear-gradient(135deg, #f6c90e, #e8a800)',
              color: loading ? '#7a8fa6' : '#1a2535',
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5,
            }}
          >
            {loading ? 'Memeriksa...' : 'Masuk'}
          </button>
        </form>

        <p style={{ color: '#3d4f60', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
          Lupa password? Hubungi pemilik toko.
        </p>
      </div>
    </div>
  );
}
