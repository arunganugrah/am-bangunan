'use client';
// components/Navbar.js
import { useRouter, usePathname } from 'next/navigation';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState, useEffect } from 'react';

const ADMIN_EMAIL = 'admin@ambangunan.com';

export default function Navbar({ title, role, links = [] }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser]         = useState(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await signOut(auth);
    router.push('/admin-login');
  };

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Bottom tab items — admin dapat semua, kasir hanya 2
  const bottomTabs = [
    { href: '/kasir',   label: 'Kasir',   icon: '🏪' },
    { href: '/stok',    label: 'Stok',    icon: '📦' },
    ...(isAdmin ? [
      { href: '/admin',   label: 'Admin',   icon: '⚙️'  },
      { href: '/laporan', label: 'Laporan', icon: '📊' },
    ] : []),
  ];

  // ══════════════════════════════════════
  //  DESKTOP — tetap seperti aslinya
  // ══════════════════════════════════════
  if (!isMobile) {
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

        {/* Nav Links + Role + Logout */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {links.map((link, i) => (
            <button key={i}
              onClick={() => router.push(link.href)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid #2d4a6e',
                background: pathname === link.href ? '#2d4a6e' : 'transparent',
                color: pathname === link.href ? '#f6c90e' : '#a0b4c8',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: pathname === link.href ? 700 : 500,
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

  // ══════════════════════════════════════
  //  MOBILE — top bar tipis + bottom tabs
  // ══════════════════════════════════════
  return (
    <>
      {/* ── Top bar ── */}
      <div style={{
        background: '#1a2535',
        borderBottom: '1px solid #2d4a6e',
        padding: '0 16px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {/* Brand */}
        <div style={{
          background: 'linear-gradient(135deg, #f6c90e, #e8a800)',
          borderRadius: 6,
          padding: '4px 10px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#1a2535', letterSpacing: '-0.3px' }}>
            AM BANGUNAN
          </span>
        </div>

        {/* Judul halaman — tengah */}
        <span style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#7a8fa6',
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: 'none',
        }}>
          {title}
        </span>

        {/* Avatar + dropdown menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#0f1c2b',
              border: '2px solid #2d4a6e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: '#f6c90e',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
            {user?.email?.[0]?.toUpperCase() || '?'}
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 42,
              background: '#1a2535',
              border: '1px solid #2d4a6e',
              borderRadius: 12,
              minWidth: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 300,
              overflow: 'hidden',
            }}>
              {/* Info akun */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #2d4a6e',
                background: '#0f1c2b',
              }}>
                <div style={{ fontSize: 10, color: '#7a8fa6', marginBottom: 3 }}>
                  Masuk sebagai
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#e8edf2',
                  fontWeight: 600,
                  wordBreak: 'break-all',
                }}>
                  {user?.email || '—'}
                </div>
                <div style={{
                  display: 'inline-block',
                  marginTop: 6,
                  padding: '2px 10px',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  background: isAdmin ? '#fef9e720' : '#e9d8fd20',
                  color: isAdmin ? '#f6c90e' : '#a78bfa',
                }}>
                  {isAdmin ? '⭐ ADMIN' : '👤 KARYAWAN'}
                </div>
              </div>

              {/* Tombol keluar */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  background: 'none',
                  border: 'none',
                  color: '#ff7070',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                🚪 Keluar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tap di luar untuk tutup dropdown */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 199,
          }}
        />
      )}

      {/* ── Bottom Tab Bar ── */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 62,
        background: '#1a2535',
        borderTop: '1px solid #2d4a6e',
        display: 'flex',
        zIndex: 200,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
        // safe area untuk iPhone
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {bottomTabs.map(tab => {
          const active = pathname === tab.href ||
            (tab.href !== '/' && pathname?.startsWith(tab.href));
          return (
            <button
              key={tab.href}
              onClick={() => { setMenuOpen(false); router.push(tab.href); }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                border: 'none',
                background: active ? '#0f1c2b' : 'transparent',
                borderTop: `2px solid ${active ? '#f6c90e' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
                padding: '6px 0',
              }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                color: active ? '#f6c90e' : '#7a8fa6',
                letterSpacing: 0.2,
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Spacer — dorong konten agar tidak tertutup bottom bar */}
      <div style={{ height: 62 }} />
    </>
  );
}