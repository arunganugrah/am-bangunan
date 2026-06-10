'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) router.replace('/kasir');
      else router.replace('/admin-login');
    });
    return unsub;
  }, []);
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f2027' }}>
      <div style={{ color:'#fff', fontSize:16 }}>Memuat...</div>
    </div>
  );
}
