// components/theme.js — Token desain AM Bangunan

export const C = {
  // Backgrounds
  bgPage:   '#f0f4f8',
  bgCard:   '#ffffff',
  bgDark:   '#0f1c2b',
  bgSidebar:'#1a2535',

  // Brand
  gold:     '#e8a800',
  goldBright:'#f6c90e',
  goldBg:   '#fef9e7',

  // Text
  text:     '#1a202c',
  textMid:  '#4a5568',
  muted:    '#718096',

  // States
  green:    '#276749',
  greenBg:  '#c6f6d5',
  red:      '#c53030',
  redBg:    '#fed7d7',
  orange:   '#c05621',
  orangeBg: '#feebc8',
  blue:     '#2b6cb0',
  blueBg:   '#bee3f8',
  purple:   '#6b46c1',
  purpleBg: '#e9d8fd',

  // UI
  border:   '#e2e8f0',
  borderDark:'#2d4a6e',
  shadow:   '0 1px 4px rgba(0,0,0,0.08)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.12)',
};

export const S = {
  card: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  label: {
    fontSize: 11,
    color: '#718096',
    display: 'block',
    marginBottom: 5,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#f7fafc',
    color: '#1a202c',
    fontSize: 14,
    outline: 'none',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#f7fafc',
    color: '#1a202c',
    fontSize: 14,
    outline: 'none',
  },
  btnGold: {
    background: 'linear-gradient(135deg, #f6c90e, #e8a800)',
    color: '#1a2535',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnDanger: {
    background: '#fed7d7',
    color: '#c53030',
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  btnGhost: {
    background: 'transparent',
    color: '#718096',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: '#f7fafc',
    color: '#718096',
    fontWeight: 700,
    padding: '11px 14px',
    textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  td: { padding: '11px 14px', borderBottom: '1px solid #f0f4f8', fontSize: 13 },
};

export const fmt = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

export const fmtTgl = (ts) => {
  if (!ts?.seconds) return '-';
  return new Date(ts.seconds * 1000).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const fmtTglShort = (ts) => {
  if (!ts?.seconds) return '-';
  return new Date(ts.seconds * 1000).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];

// Generate kode unik 8 karakter alfanumerik
export const generateKode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};
