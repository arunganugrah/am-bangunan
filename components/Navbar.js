'use client';
// components/Navbar.js
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Navbar({ title, role, links = [] }) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/admin-login');
  };

  return (
    <div style={{
      background: '#1a2535',
      borderBottom: '1px solid #2d4a6e',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 60,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          background: 'linear-gradient(135deg, #f6c90e, #e8a800)',
          borderRadius: 8,
          padding: '5px 12px',
        }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#1a2535', letterSpacing: '-0.3px' }}>
            AM BANGUNAN
          </span>
        </div>
        {title && (
          <span style={{ color: '#7a8fa6', fontSize: 13 }}>/ {title}</span>
        )}
      </div>

      {/* Nav Links */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {links.map((link, i) => (
          <button key={i}
            onClick={() => router.push(link.href)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid #2d4a6e',
              background: 'transparent',
              color: '#a0b4c8',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
            {link.label}
          </button>
        ))}
        {role && (
          <div style={{
            padding: '5px 12px',
            borderRadius: 20,
            background: role === 'admin' ? '#fef9e7' : '#e9d8fd',
            color: role === 'admin' ? '#92400e' : '#5b21b6',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginLeft: 6,
          }}>
            {role === 'admin' ? 'ADMIN' : 'KARYAWAN'}
          </div>
        )}
        <button onClick={handleLogout} style={{
          padding: '7px 14px',
          borderRadius: 8,
          border: 'none',
          background: '#2d4a6e',
          color: '#a0b4c8',
          fontSize: 13,
          cursor: 'pointer',
          marginLeft: 4,
        }}>
          Keluar
        </button>
      </div>
    </div>
  );
}
