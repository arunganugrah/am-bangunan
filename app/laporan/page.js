'use client';
// app/laporan/page.js — Laporan Keuangan Analitik (ADMIN ONLY)
// Menghitung Omzet, HPP, Laba Kotor, analitik mendalam
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { C, S, fmt, fmtTgl, fmtTglShort, BULAN } from '@/components/theme';

const ADMIN_EMAIL = 'admin@ambangunan.com';
const AV_KEY = 'XXXXXXXXXXXXXXXX'; // ← API key Alpha Vantage kamu

// Komoditas + proxy materialnya
const KOMODITAS_PANEL = [
  { key:'COPPER',      label:'Tembaga',     icon:'🔴', proxy:'Besi beton, kawat, hollow, kanal' },
  { key:'ALUMINUM',    label:'Aluminium',   icon:'⚪', proxy:'Seng, kawat seng, rangka atap'   },
  { key:'WTI',         label:'Minyak WTI',  icon:'🛢️', proxy:'Biaya logistik, ongkir semua material' },
  { key:'NATURAL_GAS', label:'Gas Alam',    icon:'💨', proxy:'Pipa PVC, plastik, produk petrokimia'  },
];

// Fungsi kalkulasi sinyal — sama seperti di komoditas/page.js
function maL(prices, n) {
  if (prices.length < n) return null;
  return prices.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function rsiL(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (gains / period) / avgLoss));
}
function sinyalCepat(prices) {
  if (!prices || prices.length < 5) return null;
  const last  = prices[prices.length - 1];
  const prev  = prices[prices.length - 2];
  const pct   = ((last - prev) / prev) * 100;
  const rsi   = rsiL(prices);
  const ma5v  = maL(prices, 5);
  const ma20v = maL(prices, 20);

  let skor = 0;
  if (rsi !== null) { if (rsi < 30) skor += 2; else if (rsi > 70) skor -= 2; }
  if (ma5v && ma20v) { if (ma5v > ma20v) skor += 1; else skor -= 1; }
  if (pct > 2) skor -= 1; else if (pct < -2) skor += 1; // harga naik = waspada beli

  let saran, warna, bg;
  if (skor >= 2)       { saran = '🟢 BELI STOK';    warna = '#16a34a'; bg = '#f0fdf4'; }
  else if (skor >= 1)  { saran = '📈 Pertimbangkan'; warna = '#d97706'; bg = '#fffbeb'; }
  else if (skor <= -2) { saran = '🔴 TAHAN/JUAL';   warna = '#dc2626'; bg = '#fef2f2'; }
  else if (skor <= -1) { saran = '⏳ Tunggu Dulu';  warna = '#9333ea'; bg = '#faf5ff'; }
  else                 { saran = '➖ Netral';        warna = C.muted;   bg = '#f7fafc'; }

  return { pct, rsi, ma5v, ma20v, skor, saran, warna, bg };
}

export default function LaporanPage() {
  const router   = useRouter();
  const [user, setUser]       = useState(null);
  const [transaksi, setTransaksi] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [produk, setProduk]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [komoditasData, setKomoditasData] = useState({});
  const [loadingKomoditas, setLoadingKomoditas] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const today = new Date();
  const [bulan, setBulan]   = useState(today.getMonth());
  const [tahun, setTahun]   = useState(today.getFullYear());
  const [activeView, setActiveView] = useState('ringkasan'); // ringkasan | harian | transaksi | pembelian | produk
  const [hariDipilih, setHariDipilih] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.push('/admin-login'); return; }
      if (u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        alert('Akses ditolak. Halaman ini hanya untuk Admin.');
        router.push('/kasir'); return;
      }
      setUser(u);
      loadData();
      fetchKomoditas();
    });
    return unsub;
  }, []);
const hapusTransaksi = async (id, items) => {
  if (!confirm('Hapus transaksi ini? Stok akan dikembalikan otomatis.')) return;
  try {
    if (items && items.length > 0) {
      for (const item of items) {
        const isBebasItem = item.isBebas ||
          (item.produk_id && item.produk_id.startsWith('BEBAS-'));
        if (!isBebasItem) {
          await updateDoc(doc(db, 'produk', item.produk_id), {
            stok: increment(item.qty)
          });
        }
      }
    }                                           
    await deleteDoc(doc(db, 'transaksi', id));
    alert('Transaksi berhasil dihapus dan stok sudah dikembalikan.');
    loadData();
  } catch (err) {
    alert('Gagal hapus: ' + err.message);
  }
};                                              

  const hapusPembelian = async (id, produk_id, jumlah) => {
    if (!confirm('Hapus riwayat pembelian stok ini?\nStok produk akan dikurangi kembali.')) return;
    try {
      const pSnap = await getDocs(collection(db, 'produk'));
      const pDoc  = pSnap.docs.find(d => d.id === produk_id);
      if (pDoc) {
        await updateDoc(doc(db, 'produk', produk_id), {
          stok: Math.max(0, (pDoc.data().stok || 0) - jumlah),
        });
      }
      await deleteDoc(doc(db, 'pembelian_stok', id));
      alert('Pembelian dihapus dan stok disesuaikan.');
      loadData();
    } catch (err) {
      alert('Gagal hapus: ' + err.message);
    }
  };
  const fetchKomoditas = async () => {
    setLoadingKomoditas(true);
    const hasil = {};
    for (const c of KOMODITAS_PANEL) {
      try {
        const url  = `https://www.alphavantage.co/query?function=${c.key}&interval=monthly&apikey=${AV_KEY}`;
        const res  = await fetch(url);
        const json = await res.json();
        const raw  = json?.data;
        if (!raw || raw.length < 5) continue;
        const prices = raw.slice(0, 30).reverse().map(d => parseFloat(d.value));
        hasil[c.key] = { ...sinyalCepat(prices), last: prices[prices.length - 1] };
      } catch(e) { console.error(c.key, e); }
    }
    setKomoditasData(hasil);
    setLoadingKomoditas(false);
  };
  const loadData = async () => {
    setLoading(true);
    const [tSnap, bSnap, pSnap] = await Promise.all([
      getDocs(query(collection(db, 'transaksi'), orderBy('tanggal', 'desc'))),
      getDocs(query(collection(db, 'pembelian_stok'), orderBy('tanggal', 'desc'))),
      getDocs(collection(db, 'produk')),
    ]);
    setTransaksi(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setPembelian(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProduk(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  // Filter helpers
  const inPeriode = (ts, b, t) => {
    if (!ts?.seconds) return false;
    const d = new Date(ts.seconds * 1000);
    return d.getMonth() === parseInt(b) && d.getFullYear() === parseInt(t);
  };

  const bulanSblm = parseInt(bulan) === 0 ? 11 : parseInt(bulan) - 1;
  const tahunSblm = parseInt(bulan) === 0 ? parseInt(tahun) - 1 : parseInt(tahun);

  const txPeriode  = transaksi.filter(t => inPeriode(t.tanggal, bulan, tahun));
  const bliPeriode = pembelian.filter(b => inPeriode(b.tanggal, bulan, tahun));
  const txSblm     = transaksi.filter(t => inPeriode(t.tanggal, bulanSblm, tahunSblm));
  const bliSblm    = pembelian.filter(b => inPeriode(b.tanggal, bulanSblm, tahunSblm));

  // KPI
  const omzet      = txPeriode.reduce((s,t) => s+(t.total||0), 0);
  const hpp        = txPeriode.reduce((s,t) => s+(t.hpp||0), 0);  // HPP dari transaksi
  const hppBeli    = bliPeriode.reduce((s,b) => s+(b.total_bayar||0), 0); // pembelian stok
  const labaKotor  = omzet - hpp;
  const gpm        = omzet > 0 ? (labaKotor / omzet * 100) : 0;

  const omzetSblm  = txSblm.reduce((s,t) => s+(t.total||0), 0);
  const hppSblm    = txSblm.reduce((s,t) => s+(t.hpp||0), 0);
  const labaSblm   = omzetSblm - hppSblm;

  const growth = (curr, prev) => prev !== 0 ? ((curr - prev) / Math.abs(prev) * 100) : null;
  const gOmzet = growth(omzet, omzetSblm);
  const gLaba  = growth(labaKotor, labaSblm);

  // Harian
  const omzetHarian = {};
  txPeriode.forEach(t => {
    if (!t.tanggal?.seconds) return;
    const tgl = new Date(t.tanggal.seconds*1000).getDate();
    omzetHarian[tgl] = (omzetHarian[tgl]||0) + (t.total||0);
  });

  // Mingguan
  const omzetMinggu = [0,0,0,0,0];
  txPeriode.forEach(t => {
    if (!t.tanggal?.seconds) return;
    const tgl = new Date(t.tanggal.seconds*1000).getDate();
    const mg = Math.min(Math.floor((tgl-1)/7), 4);
    omzetMinggu[mg] += (t.total||0);
  });

  // Per produk
  const rekapProduk = {};
  txPeriode.forEach(t => {
    t.items?.forEach(it => {
      if (!rekapProduk[it.nama]) rekapProduk[it.nama] = { qty:0, omzet:0, hpp:0, laba:0 };
      rekapProduk[it.nama].qty   += it.qty||0;
      rekapProduk[it.nama].omzet += it.subtotal||0;
      rekapProduk[it.nama].hpp   += (it.harga_beli||0) * (it.qty||0);
      rekapProduk[it.nama].laba  += it.laba||0;
    });
  });
  const rekapArr = Object.entries(rekapProduk).sort((a,b) => b[1].omzet - a[1].omzet);

  // Harian stats
  const hariAktif   = new Set(txPeriode.filter(t=>t.tanggal?.seconds).map(t=>new Date(t.tanggal.seconds*1000).getDate())).size;
  const avgPerHari  = hariAktif > 0 ? omzet / hariAktif : 0;
  const avgTransaksi= txPeriode.length > 0 ? omzet / txPeriode.length : 0;

  // ── LAPORAN HARIAN ──
  const today2 = new Date();
  const txHarian = transaksi.filter(t => {
    if (!t.tanggal?.seconds) return false;
    const d = new Date(t.tanggal.seconds * 1000);
    return d.toISOString().slice(0, 10) === hariDipilih;
  });
  const omzetHari      = txHarian.reduce((s, t) => s + (t.total || 0), 0);
  const hppHari        = txHarian.reduce((s, t) => s + (t.hpp || 0), 0);
  const labaHari       = omzetHari - hppHari;
  const gpmHari        = omzetHari > 0 ? (labaHari / omzetHari * 100) : 0;
  const diskonHari     = txHarian.reduce((s, t) => s + (t.diskon || 0), 0);
  const avgTxHari      = txHarian.length > 0 ? omzetHari / txHarian.length : 0;

  // Rekap produk harian
  const rekapHarian = {};
  txHarian.forEach(t => {
    t.items?.forEach(it => {
      if (!rekapHarian[it.nama]) rekapHarian[it.nama] = { qty: 0, omzet: 0, laba: 0 };
      rekapHarian[it.nama].qty   += it.qty || 0;
      rekapHarian[it.nama].omzet += it.subtotal || 0;
      rekapHarian[it.nama].laba  += it.laba || 0;
    });
  });
  const rekapHarianArr = Object.entries(rekapHarian).sort((a, b) => b[1].omzet - a[1].omzet);

  // Jam tersibuk
  const perJam = {};
  txHarian.forEach(t => {
    if (!t.tanggal?.seconds) return;
    const jam = new Date(t.tanggal.seconds * 1000).getHours();
    perJam[jam] = (perJam[jam] || 0) + (t.total || 0);
  });
  const jamTersibuk = Object.entries(perJam).sort((a, b) => b[1] - a[1])[0];

  // RSI-style momentum harian (7 hari terakhir)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const omzetLast7 = last7Days.map(tgl =>
    transaksi.filter(t => {
      if (!t.tanggal?.seconds) return false;
      return new Date(t.tanggal.seconds * 1000).toISOString().slice(0, 10) === tgl;
    }).reduce((s, t) => s + (t.total || 0), 0)
  );
  const rsiHarian = rsiL(omzetLast7, Math.min(6, omzetLast7.filter(v => v > 0).length || 1));
  const ma3Harian = maL(omzetLast7, 3);
  const ma7Harian = maL(omzetLast7, 7);
  const sinyalHarian = sinyalCepat(omzetLast7.filter(v => v > 0).length >= 3 ? omzetLast7 : [1, 1, 1]);
  // Inventory value
  const nilaiStok = produk.reduce((s, p) => s + (p.stok||0) * (p.harga_beli||0), 0);

  const KPICard = ({ label, value, sub, color, growth, big }) => (
    <div style={{ background:C.bgCard, borderRadius:14, padding:20, border:`1px solid ${C.border}`, boxShadow:S.card.boxShadow }}>
      <div style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize: big?30:22, fontWeight:700, color: color||C.text }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>{sub}</div>}
      {growth !== null && growth !== undefined && (
        <div style={{ fontSize:12, fontWeight:700, marginTop:6, color: growth>=0 ? C.green : C.red }}>
          {growth >= 0 ? '▲' : '▼'} {Math.abs(growth).toFixed(1)}% vs bln lalu
        </div>
      )}
    </div>
  );

  const tabStyle = (active) => ({
    padding:'10px 20px', background:'none', border:'none',
    borderBottom: active ? `3px solid ${C.gold}` : '3px solid transparent',
    color: active ? C.gold : C.muted,
    fontWeight: active ? 700 : 400,
    cursor:'pointer', fontSize:14,
  });

  if (loading) return (
    <div style={{ minHeight:'100vh', background:C.bgPage, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.gold, fontSize:16, fontWeight:600 }}>Memuat laporan...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:C.bgPage, color:C.text }}>
      <Navbar title="Laporan Keuangan" role="admin" links={[
        { href:'/kasir', label:'Kasir' },
        { href:'/stok', label:'Stok' },
        { href:'/admin', label:'Admin' },
      ]} />

      <div style={{ padding:'24px 28px' }}>
        {/* Periode Selector */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:700, color:C.muted }}>PERIODE</span>
          <select style={{ ...S.select, width:160 }} value={bulan} onChange={e => setBulan(e.target.value)}>
            {BULAN.map((b,i) => <option key={i} value={i}>{b}</option>)}
          </select>
          <select style={{ ...S.select, width:100 }} value={tahun} onChange={e => setTahun(e.target.value)}>
            {[2023,2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
          <span style={{ color:C.muted, fontSize:12 }}>Pembanding: {BULAN[bulanSblm]} {tahunSblm}</span>
          <button style={{ ...S.btnGold, marginLeft:'auto' }} onClick={loadData}>Refresh Data</button>
        </div>

        {/* View tabs — mobile: scroll horizontal */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 24,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {[
            ['ringkasan', 'Ringkasan'],
            ['harian',    '📅 Harian'],
            ['transaksi', 'Transaksi'],
            ['pembelian', 'Pembelian Stok'],
            ['produk',    'Analitik Produk'],
          ].map(([v, l]) => (
            <button key={v} style={{
              ...tabStyle(activeView === v),
              fontSize: isMobile ? 12 : 14,
              padding:  isMobile ? '10px 12px' : '10px 20px',
              whiteSpace: 'nowrap',
            }} onClick={() => setActiveView(v)}>{l}</button>
          ))}
        </div>
        {/* ══ TAB HARIAN ══ */}
        {activeView === 'harian' && (
          <>
            {/* Pilih tanggal */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.muted }}>TANGGAL</span>
              <input type="date" value={hariDipilih}
                onChange={e => setHariDipilih(e.target.value)}
                style={{ ...S.input, width: isMobile ? '100%' : 200 }} />
              <span style={{ fontSize:12, color:C.muted }}>{txHarian.length} transaksi</span>
            </div>

            {/* KPI Harian — scrollable */}
            <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', marginBottom:20 }}>
              <div style={{
                display:'grid',
                gridTemplateColumns: isMobile ? 'repeat(4, 180px)' : 'repeat(4, 1fr)',
                gap:12,
                minWidth: isMobile ? 'max-content' : 'unset',
              }}>
                <KPICard label="Omzet Hari Ini" value={fmt(omzetHari)} sub={`${txHarian.length} transaksi`} color={C.gold} big />
                <KPICard label="HPP" value={fmt(hppHari)} sub={`${omzetHari>0?(hppHari/omzetHari*100).toFixed(1):0}% dari omzet`} color={C.orange} />
                <KPICard label="Laba Kotor" value={fmt(labaHari)} sub={`GPM ${gpmHari.toFixed(1)}%`} color={labaHari>=0?C.green:C.red} big />
                <KPICard label="Avg / Transaksi" value={fmt(avgTxHari)} sub={diskonHari>0?`Diskon: ${fmt(diskonHari)}`:''} color={C.blue} />
              </div>
            </div>

            {/* Momentum RSI 7 hari */}
            <div style={{ ...S.card, marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:12 }}>
                📊 Momentum Penjualan 7 Hari (RSI-Style)
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:14, overflowX:'auto' }}>
                {last7Days.map((tgl, i) => {
                  const val = omzetLast7[i];
                  const maxVal = Math.max(...omzetLast7, 1);
                  const isToday = tgl === new Date().toISOString().slice(0,10);
                  const isSelected = tgl === hariDipilih;
                  return (
                    <div key={tgl} onClick={() => setHariDipilih(tgl)}
                      style={{ flex:1, minWidth:60, textAlign:'center', cursor:'pointer' }}>
                      <div style={{ fontSize:10, color: isToday ? C.gold : C.muted, fontWeight: isToday ? 700 : 400, marginBottom:4 }}>
                        {new Date(tgl).toLocaleDateString('id-ID',{weekday:'short'})}
                      </div>
                      <div style={{
                        height:60, background:'#f0f4f8', borderRadius:6, position:'relative', overflow:'hidden',
                        border: isSelected ? `2px solid ${C.gold}` : '2px solid transparent',
                      }}>
                        <div style={{
                          position:'absolute', bottom:0, left:0, right:0,
                          height:`${val > 0 ? Math.max((val/maxVal)*100, 8) : 0}%`,
                          background: isSelected ? C.gold : isToday ? C.green : C.blue,
                          borderRadius:'4px 4px 0 0', transition:'height 0.3s',
                        }}/>
                      </div>
                      <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>
                        {val > 0 ? (val >= 1000000 ? `${(val/1000000).toFixed(1)}jt` : `${(val/1000).toFixed(0)}rb`) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Sinyal */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:10 }}>
                <div style={{ background:'#f7fafc', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:4 }}>RSI OMZET (7H)</div>
                  <div style={{ fontSize:20, fontWeight:700,
                    color: rsiHarian === null ? C.muted : rsiHarian < 30 ? C.green : rsiHarian > 70 ? C.red : C.text }}>
                    {rsiHarian !== null ? rsiHarian.toFixed(0) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    {rsiHarian === null ? 'Data belum cukup' :
                      rsiHarian < 30 ? '🟢 Penjualan lemah — momentum beli stok' :
                      rsiHarian > 70 ? '🔴 Penjualan tinggi — pertahankan stok' :
                      '➖ Normal'}
                  </div>
                </div>
                <div style={{ background:'#f7fafc', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:4 }}>MA3 vs MA7</div>
                  <div style={{ fontSize:16, fontWeight:700,
                    color: ma3Harian && ma7Harian ? (ma3Harian > ma7Harian ? C.green : C.red) : C.muted }}>
                    {ma3Harian && ma7Harian ? (ma3Harian > ma7Harian ? '↑ Tren Naik' : '↓ Tren Turun') : '—'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    MA3: {ma3Harian ? fmt(ma3Harian) : '—'} · MA7: {ma7Harian ? fmt(ma7Harian) : '—'}
                  </div>
                </div>
                <div style={{ background:'#f7fafc', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:4 }}>JAM TERSIBUK</div>
                  <div style={{ fontSize:20, fontWeight:700, color:C.orange }}>
                    {jamTersibuk ? `${jamTersibuk[0]}:00` : '—'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    {jamTersibuk ? fmt(jamTersibuk[1]) : 'Belum ada transaksi'}
                  </div>
                </div>
              </div>
            </div>

            {/* Insight harian */}
            <div style={{ ...S.card, marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:12 }}>
                💡 Insight & Rekomendasi Hari Ini
              </div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:10 }}>
                <div style={{ background: gpmHari>=30?'#f0fdf4':gpmHari>=15?'#fffbeb':'#fef2f2', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4 }}>MARGIN HARI INI</div>
                  <div style={{ fontSize:13, color: gpmHari>=30?C.green:gpmHari>=15?C.orange:omzetHari===0?C.muted:C.red }}>
                    {omzetHari===0 ? 'Belum ada transaksi hari ini.' :
                      gpmHari>=30 ? `GPM ${gpmHari.toFixed(1)}% — Hari yang bagus! Margin sehat.` :
                      gpmHari>=15 ? `GPM ${gpmHari.toFixed(1)}% — Margin sedang. Cek produk diskon besar.` :
                      `GPM ${gpmHari.toFixed(1)}% — Margin tipis. Perlu evaluasi harga jual hari ini.`}
                  </div>
                </div>
                {rekapHarianArr[0] && (
                  <div style={{ background:'#f0f9ff', borderRadius:10, padding:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4 }}>TOP SELLER HARI INI</div>
                    <div style={{ fontSize:13, color:C.blue }}>
                      {rekapHarianArr[0][0]}: {rekapHarianArr[0][1].qty} unit · {fmt(rekapHarianArr[0][1].omzet)}
                    </div>
                  </div>
                )}
                <div style={{ background:'#f7fafc', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4 }}>REKOMENDASI STOK</div>
                  <div style={{ fontSize:13, color:C.text }}>
                    {rsiHarian === null ? 'Data 7 hari belum lengkap.' :
                      rsiHarian < 30 && ma3Harian && ma7Harian && ma3Harian < ma7Harian
                        ? '🟢 Penjualan sedang lesu — waktu tepat negosiasi & beli stok di harga lebih baik.'
                        : rsiHarian > 70
                        ? '🔴 Penjualan tinggi — pastikan stok cukup, waspadai kehabisan produk laris.'
                        : ma3Harian && ma7Harian && ma3Harian > ma7Harian
                        ? '📈 Tren penjualan membaik — siapkan stok produk terlaris 2–3 hari ke depan.'
                        : '➖ Kondisi normal — pantau stok menipis dan restock sesuai jadwal.'}
                  </div>
                </div>
                <div style={{ background:'#f7fafc', borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4 }}>PRODUKTIVITAS</div>
                  <div style={{ fontSize:13, color:C.text }}>
                    {txHarian.length} transaksi · avg {fmt(avgTxHari)}/tx
                    {diskonHari > 0 ? ` · Diskon diberikan: ${fmt(diskonHari)}` : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Rekap produk harian */}
            <div style={{ ...S.card, marginBottom:20, overflowX:'auto' }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:12 }}>
                Rekap Produk Terjual Hari Ini
              </div>
              {rekapHarianArr.length === 0 ? (
                <div style={{ color:C.muted, padding:20, textAlign:'center' }}>
                  Belum ada penjualan pada tanggal ini.
                </div>
              ) : (
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Produk</th>
                    <th style={S.th}>Qty Terjual</th>
                    <th style={S.th}>Omzet</th>
                    <th style={S.th}>Laba</th>
                    <th style={S.th}>Kontribusi</th>
                  </tr></thead>
                  <tbody>
                    {rekapHarianArr.map(([nama, r]) => (
                      <tr key={nama}>
                        <td style={{ ...S.td, fontWeight:600 }}>{nama}</td>
                        <td style={S.td}>{r.qty}</td>
                        <td style={{ ...S.td, color:C.gold, fontWeight:700 }}>{fmt(r.omzet)}</td>
                        <td style={{ ...S.td, color:r.laba>=0?C.green:C.red, fontWeight:600 }}>{fmt(r.laba)}</td>
                        <td style={S.td}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ background:'#f0f4f8', borderRadius:4, height:8, width:80, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${omzetHari>0?(r.omzet/omzetHari*100):0}%`,
                                background:C.gold, borderRadius:4 }} />
                            </div>
                            <span style={{ fontSize:11, color:C.muted }}>
                              {omzetHari>0?(r.omzet/omzetHari*100).toFixed(1):0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Daftar transaksi harian */}
            <div style={{ ...S.card, overflowX:'auto' }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>
                Detail Transaksi — {new Date(hariDipilih).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Jam</th>
                  <th style={S.th}>Pembeli</th>
                  <th style={S.th}>Kasir</th>
                  <th style={S.th}>Item</th>
                  <th style={S.th}>Total</th>
                  <th style={S.th}>HPP</th>
                  <th style={S.th}>Laba</th>
                  <th style={S.th}>Aksi</th>
                </tr></thead>
                <tbody>
                  {txHarian.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...S.td, textAlign:'center', color:C.muted, padding:30 }}>
                      Tidak ada transaksi pada tanggal ini.
                    </td></tr>
                  ) : txHarian.map(t => (
                    <tr key={t.id}>
                      <td style={{ ...S.td, fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>
                        {t.tanggal?.seconds
                          ? new Date(t.tanggal.seconds*1000).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})
                          : '—'}
                      </td>
                      <td style={S.td}>{t.namaPembeli}</td>
                      <td style={{ ...S.td, fontSize:11, color:C.muted }}>{t.kasir?.split('@')[0]}</td>
                      <td style={{ ...S.td, fontSize:11, color:C.muted }}>
                        {t.items?.map((it,i) => <div key={i}>{it.nama} ×{it.qty}</div>)}
                      </td>
                      <td style={{ ...S.td, fontWeight:700, color:C.gold }}>{fmt(t.total)}</td>
                      <td style={{ ...S.td, color:C.muted }}>{fmt(t.hpp||0)}</td>
                      <td style={{ ...S.td, fontWeight:600, color:(t.laba||0)>=0?C.green:C.red }}>{fmt(t.laba||0)}</td>
                      <td style={S.td}>
                        <button onClick={() => hapusTransaksi(t.id, t.items)} style={S.btnDanger}>Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}  
        {/* ── RINGKASAN ── */}
        {activeView === 'ringkasan' && (
          <>
            {/* KPI Utama */}
            <div style={{ fontSize:11, color:C.muted, letterSpacing:1, fontWeight:700, textTransform:'uppercase', marginBottom:10 }}>
              KPI Utama — {BULAN[bulan]} {tahun}
            </div>
            {/* KPI row 1 — scrollable di mobile */}
            <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', marginBottom: 14 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(4, 200px)' : 'repeat(4,1fr)',
                gap: 14,
                minWidth: isMobile ? 'max-content' : 'unset',
              }}>
                <KPICard label="Total Omzet" value={fmt(omzet)} sub={`${txPeriode.length} transaksi`} color={C.gold} growth={gOmzet} big />
                <KPICard label="HPP (Harga Pokok)" value={fmt(hpp)} sub={`${omzet>0?(hpp/omzet*100).toFixed(1):0}% dari omzet`} color={C.orange} />
                <KPICard label="Laba Kotor" value={fmt(labaKotor)} sub={`GPM ${gpm.toFixed(1)}%`} color={labaKotor>=0?C.green:C.red} growth={gLaba} big />
                <KPICard label="Nilai Inventori" value={fmt(nilaiStok)} sub="harga beli stok saat ini" color={C.blue} />
              </div>
            </div>
            {/* KPI row 2 */}
            <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', marginBottom: 24 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(4, 200px)' : 'repeat(4,1fr)',
                gap: 14,
                minWidth: isMobile ? 'max-content' : 'unset',
              }}>
                <KPICard label="Rata-rata / Transaksi" value={fmt(avgTransaksi)} color={C.text} />
                <KPICard label="Omzet / Hari Aktif" value={fmt(avgPerHari)} sub={`${hariAktif} hari ada transaksi`} color={C.text} />
                <KPICard label="Gross Profit Margin"
                  value={`${gpm.toFixed(1)}%`}
                  sub={gpm>=30?'Margin sehat':gpm>=15?'Perlu ditingkatkan':'Margin tipis'}
                  color={gpm>=30?C.green:gpm>=15?C.orange:C.red} />
                <KPICard label="Pembelian Stok (HPP Beli)" value={fmt(hppBeli)} sub={`${bliPeriode.length} pembelian`} color={C.red} />
              </div>
            </div>
            {/* ── PANEL KOMODITAS MINI ── */}
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>
                  Sinyal Komoditas Global — Pengaruh ke Harga Material
                </div>
                <button
                  onClick={fetchKomoditas}
                  disabled={loadingKomoditas}
                  style={{ ...S.btnGhost, fontSize:11, padding:'4px 12px' }}>
                  {loadingKomoditas ? '⏳' : '🔄 Refresh'}
                </button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:10 }}>
                {KOMODITAS_PANEL.map(c => {
                  const d = komoditasData[c.key];
                  return (
                    <div key={c.key} style={{
                      background: d ? d.bg : C.bgCard,
                      border: `1px solid ${d ? d.warna + '40' : C.border}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                    }}>
                      {/* Header */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>
                          {c.icon} {c.label}
                        </div>
                        {d && (
                          <span style={{ fontSize:12, fontWeight:700, color: d.pct >= 0 ? '#dc2626' : '#16a34a' }}>
                            {d.pct >= 0 ? '▲' : '▼'} {Math.abs(d.pct).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Proxy material */}
                      <div style={{ fontSize:10, color:C.muted, marginBottom:8, lineHeight:1.4 }}>
                        {c.proxy}
                      </div>

                      {/* Sinyal */}
                      {!d && (
                        <div style={{ fontSize:11, color:C.muted }}>
                          {loadingKomoditas ? '⏳ Memuat...' : 'Klik Refresh'}
                        </div>
                      )}
                      {d && (
                        <>
                          <div style={{ fontWeight:700, fontSize:12, color:d.warna, marginBottom:6 }}>
                            {d.saran}
                          </div>
                          <div style={{ fontSize:10, color:C.muted }}>
                            RSI: <strong style={{ color: d.rsi < 30 ? '#16a34a' : d.rsi > 70 ? '#dc2626' : C.text }}>
                              {d.rsi?.toFixed(0) ?? '—'}
                            </strong>
                            {' · '}
                            MA: <strong style={{ color: d.ma5v > d.ma20v ? '#16a34a' : '#dc2626' }}>
                              {d.ma5v && d.ma20v ? (d.ma5v > d.ma20v ? '↑' : '↓') : '—'}
                            </strong>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Catatan korelasi */}
              <div style={{ fontSize:11, color:C.muted, marginTop:8, padding:'8px 12px',
                background:'#fffbeb', borderRadius:8, border:'1px solid #fde68a' }}>
                💡 <strong>Cara baca:</strong> Tembaga & Aluminium naik → harga besi beton/kawat/seng lokal biasanya ikut naik dalam 2–4 minggu.
                Gas Alam & WTI naik → harga PVC & ongkos kirim naik. Sinyal <strong>BELI STOK</strong> = harga sedang murah, kemungkinan naik.
              </div>
            </div>

            {/* Tren Mingguan + Perbandingan */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
              {/* Bar chart mingguan */}
              <div style={{ ...S.card, padding:20 }}>
                <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:16 }}>
                  Tren Omzet Mingguan
                </div>
                {omzetMinggu.map((val, i) => {
                  const maxVal = Math.max(...omzetMinggu, 1);
                  const pct = (val / maxVal * 100);
                  const isMax = val === Math.max(...omzetMinggu) && val > 0;
                  return (
                    <div key={i} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                        <span style={{ color:C.muted }}>Minggu {i+1}</span>
                        <span style={{ fontWeight: isMax ? 700 : 400, color: isMax ? C.gold : C.text }}>
                          {val > 0 ? fmt(val) : '—'}
                        </span>
                      </div>
                      <div style={{ background:'#f0f4f8', borderRadius:4, height:10, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: isMax ? C.gold : C.blue, borderRadius:4, transition:'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Perbandingan bulan */}
              <div style={{ ...S.card, padding:20 }}>
                <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:16 }}>
                  Perbandingan vs Bulan Lalu
                </div>
                {[
                  { label:'Omzet', curr:omzet, prev:omzetSblm, color:C.gold },
                  { label:'HPP', curr:hpp, prev:hppSblm, color:C.orange },
                  { label:'Laba Kotor', curr:labaKotor, prev:labaSblm, color:C.green },
                ].map(row => {
                  const g = growth(row.curr, row.prev);
                  return (
                    <div key={row.label} style={{ marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:12, color:C.muted, fontWeight:600 }}>{row.label}</span>
                        {g !== null && (
                          <span style={{ fontSize:12, fontWeight:700, color:g>=0?C.green:C.red }}>
                            {g>=0?'▲':'▼'} {Math.abs(g).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>Bulan Ini</div>
                          <div style={{ fontSize:15, fontWeight:700, color:row.color }}>{fmt(row.curr)}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>Bulan Lalu</div>
                          <div style={{ fontSize:14, color:C.muted }}>{fmt(row.prev)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Laporan Laba Rugi Formal */}
            <div style={{ fontSize:11, color:C.muted, letterSpacing:1, fontWeight:700, textTransform:'uppercase', marginBottom:10 }}>
              Laporan Laba Rugi — {BULAN[bulan]} {tahun}
            </div>
            <div style={{ ...S.card, maxWidth:540 }}>
              {[
                { l:'Pendapatan Penjualan', v:omzet, bold:true, color:C.gold },
                { l:'Harga Pokok Penjualan (HPP)', v:-hpp, bold:false, color:C.orange },
                { divider:true },
                { l:'LABA KOTOR', v:labaKotor, bold:true, color:labaKotor>=0?C.green:C.red },
                { l:'Gross Profit Margin', text:`${gpm.toFixed(2)}%`, bold:false, color:C.muted },
                { divider:true },
                { l:'Pembelian Stok Periode Ini', v:-hppBeli, bold:false, color:C.red },
                { divider:true },
                { l:'Nilai Inventori Tersisa', v:nilaiStok, bold:false, color:C.blue },
              ].map((row, i) => {
                if (row.divider) return <div key={i} style={{ borderTop:`1px solid ${C.border}`, margin:'8px 0' }} />;
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0',
                    borderBottom:`1px solid ${C.border}20` }}>
                    <span style={{ fontSize:13, fontWeight:row.bold?700:400, color:row.bold?C.text:C.muted }}>
                      {row.l}
                    </span>
                    <span style={{ fontSize:row.bold?16:13, fontWeight:row.bold?700:400, color:row.color }}>
                      {row.text || (row.v !== undefined ? (row.v < 0 ? `(${fmt(Math.abs(row.v))})` : fmt(row.v)) : '')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Insight */}
            <div style={{ ...S.card, marginTop:16 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:14 }}>Insight & Rekomendasi</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ background:'#f7fafc', borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>MARGIN ASSESSMENT</div>
                  <div style={{ fontSize:13, color:gpm>=30?C.green:gpm>=15?C.orange:omzet===0?C.muted:C.red }}>
                    {omzet === 0 ? 'Belum ada transaksi di periode ini.'
                      : gpm>=30 ? `GPM ${gpm.toFixed(1)}% — Margin sehat. Pertahankan strategi harga.`
                      : gpm>=15 ? `GPM ${gpm.toFixed(1)}% — Margin sedang. Pertimbangkan negosiasi harga beli.`
                      : `GPM ${gpm.toFixed(1)}% — Margin tipis. Tinjau ulang harga jual atau kurangi HPP.`}
                  </div>
                </div>
                {rekapArr[0] && (
                  <div style={{ background:'#f7fafc', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>TOP SELLER</div>
                    <div style={{ fontSize:13, color:C.green }}>
                      {rekapArr[0][0]}: {fmt(rekapArr[0][1].omzet)} ({omzet>0?(rekapArr[0][1].omzet/omzet*100).toFixed(1):0}% omzet)
                    </div>
                  </div>
                )}
                {gOmzet !== null && (
                  <div style={{ background:'#f7fafc', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>TREN PERTUMBUHAN</div>
                    <div style={{ fontSize:13, color:gOmzet>=0?C.green:C.red }}>
                      {gOmzet>=0
                        ? `Omzet naik ${gOmzet.toFixed(1)}% dari ${BULAN[bulanSblm]}. Momentum bagus!`
                        : `Omzet turun ${Math.abs(gOmzet).toFixed(1)}% dari ${BULAN[bulanSblm]}. Evaluasi strategi.`}
                    </div>
                  </div>
                )}
                {hariAktif > 0 && (
                  <div style={{ background:'#f7fafc', borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>PRODUKTIVITAS</div>
                    <div style={{ fontSize:13, color:C.blue }}>
                      {hariAktif} hari aktif. Rata-rata {fmt(avgPerHari)}/hari, {fmt(avgTransaksi)}/transaksi.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── RIWAYAT TRANSAKSI ── */}
        {activeView === 'transaksi' && (
          <div style={{ ...S.card, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>
              Riwayat Transaksi — {BULAN[bulan]} {tahun} ({txPeriode.length} transaksi)
            </div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Tanggal</th>
                <th style={S.th}>Pembeli</th>
                <th style={S.th}>Kasir</th>
                <th style={S.th}>Item</th>
                <th style={S.th}>Subtotal</th>
                <th style={S.th}>Diskon</th>
                <th style={S.th}>Total</th>
                <th style={S.th}>HPP</th>
                <th style={S.th}>Laba</th>
                <th style={S.th}>Aksi</th>
              </tr></thead>
              <tbody>
                {txPeriode.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...S.td, fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>{fmtTgl(t.tanggal)}</td>
                    <td style={S.td}>{t.namaPembeli}</td>
                    <td style={{ ...S.td, fontSize:11, color:C.muted }}>{t.kasir?.split('@')[0]}</td>
                    <td style={{ ...S.td, fontSize:12, color:C.muted }}>
                      {t.items?.map((it,i) => (
                        <div key={i}>{it.nama} ×{it.qty} {it.satuan}</div>
                      ))}
                    </td>
                    <td style={S.td}>{fmt(t.subtotal||t.total)}</td>
                    <td style={{ ...S.td, color:C.orange }}>{t.diskon > 0 ? fmt(t.diskon) : '—'}</td>
                    <td style={{ ...S.td, fontWeight:700, color:C.gold }}>{fmt(t.total)}</td>
                    <td style={{ ...S.td, color:C.muted }}>{fmt(t.hpp||0)}</td>
                    <td style={{ ...S.td, fontWeight:600, color:(t.laba||0)>=0?C.green:C.red }}>{fmt(t.laba||0)}</td>
                    <td style={S.td}>
                      <button
                        onClick={() => hapusTransaksi(t.id, t.items)}
                        style={S.btnDanger}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
                {txPeriode.length === 0 && (
                  <tr><td colSpan={10} style={{ ...S.td, textAlign:'center', color:C.muted, padding:40 }}>
                    Tidak ada transaksi di periode ini.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── RIWAYAT PEMBELIAN STOK ── */}
        {activeView === 'pembelian' && (
          <div style={{ ...S.card, overflowX:'auto' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>
              Riwayat Pembelian Stok — {BULAN[bulan]} {tahun} ({bliPeriode.length} pembelian)
            </div>
            <div style={{ marginBottom:12, padding:'12px 16px', background:'#fff7ed', borderRadius:10,
              border:`1px solid ${C.orange}40`, fontSize:13, color:C.orange }}>
              ⚠️ Menghapus riwayat pembelian akan <strong>mengurangi stok produk</strong> kembali secara otomatis.
            </div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Tanggal</th>
                <th style={S.th}>Produk</th>
                <th style={S.th}>Pemasok</th>
                <th style={S.th}>Jumlah</th>
                <th style={S.th}>Harga Beli</th>
                <th style={S.th}>Total Bayar</th>
                <th style={S.th}>Dicatat Oleh</th>
                <th style={S.th}>Aksi</th>
              </tr></thead>
              <tbody>
                {bliPeriode.map(b => (
                  <tr key={b.id}>
                    <td style={{ ...S.td, fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>{fmtTgl(b.tanggal)}</td>
                    <td style={{ ...S.td, fontWeight:600 }}>{b.nama_produk}</td>
                    <td style={S.td}>{b.pemasok || '—'}</td>
                    <td style={S.td}>{b.jumlah} {b.satuan}</td>
                    <td style={{ ...S.td, color:C.muted }}>{fmt(b.harga_beli)}</td>
                    <td style={{ ...S.td, fontWeight:700, color:C.orange }}>{fmt(b.total_bayar)}</td>
                    <td style={{ ...S.td, fontSize:11, color:C.muted }}>{b.dicatat_oleh?.split('@')[0] || '—'}</td>
                    <td style={S.td}>
                      <button onClick={() => hapusPembelian(b.id, b.produk_id, b.jumlah)} style={S.btnDanger}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
                {bliPeriode.length === 0 && (
                  <tr><td colSpan={8} style={{ ...S.td, textAlign:'center', color:C.muted, padding:40 }}>
                    Tidak ada pembelian di periode ini.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* ── ANALITIK PRODUK ── */}
        {activeView === 'produk' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div style={S.card}>
                <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:14 }}>Produk Terlaris</div>
                {rekapArr.length === 0 ? <div style={{ color:C.muted }}>Belum ada data.</div> : rekapArr.map(([nama,r]) => {
                  const pct = omzet > 0 ? (r.omzet / omzet * 100) : 0;
                  return (
                    <div key={nama} style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                        <span style={{ fontWeight:600 }}>{nama}</span>
                        <span style={{ color:C.gold }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ background:'#f0f4f8', borderRadius:4, height:8, overflow:'hidden', marginBottom:3 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:C.gold, borderRadius:4 }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:C.muted }}>
                        <span>{r.qty} terjual</span>
                        <span>Laba: {fmt(r.laba)}</span>
                        <span>{fmt(r.omzet)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={S.card}>
                <div style={{ fontWeight:700, fontSize:14, color:C.gold, marginBottom:14 }}>Tabel Analitik Produk</div>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Produk</th>
                    <th style={S.th}>Terjual</th>
                    <th style={S.th}>Omzet</th>
                    <th style={S.th}>HPP</th>
                    <th style={S.th}>Laba</th>
                  </tr></thead>
                  <tbody>
                    {rekapArr.map(([nama,r]) => (
                      <tr key={nama}>
                        <td style={{ ...S.td, fontWeight:600 }}>{nama}</td>
                        <td style={S.td}>{r.qty}</td>
                        <td style={{ ...S.td, color:C.gold }}>{fmt(r.omzet)}</td>
                        <td style={{ ...S.td, color:C.muted }}>{fmt(r.hpp)}</td>
                        <td style={{ ...S.td, fontWeight:600, color:r.laba>=0?C.green:C.red }}>{fmt(r.laba)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stok Menipis Alert */}
            <div style={{ ...S.card, marginTop:16 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.orange, marginBottom:14 }}>
                Peringatan Stok
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Produk</th>
                  <th style={S.th}>Stok Saat Ini</th>
                  <th style={S.th}>Min. Stok</th>
                  <th style={S.th}>Harga Beli</th>
                  <th style={S.th}>Status</th>
                </tr></thead>
                <tbody>
                  {produk.filter(p => p.stok <= (p.stok_minimum||5)).sort((a,b)=>a.stok-b.stok).map(p => (
                    <tr key={p.id}>
                      <td style={{ ...S.td, fontWeight:600 }}>{p.nama}</td>
                      <td style={{ ...S.td, color:p.stok<=0?C.red:C.orange, fontWeight:700 }}>{p.stok} {p.satuan}</td>
                      <td style={{ ...S.td, color:C.muted }}>{p.stok_minimum||5} {p.satuan}</td>
                      <td style={{ ...S.td, color:C.muted }}>{fmt(p.harga_beli)}</td>
                      <td style={S.td}>
                        <span style={{ background:p.stok<=0?C.redBg:C.orangeBg, color:p.stok<=0?C.red:C.orange,
                          padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                          {p.stok<=0?'Habis':'Menipis'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {produk.filter(p => p.stok <= (p.stok_minimum||5)).length === 0 && (
                    <tr><td colSpan={5} style={{ ...S.td, textAlign:'center', color:C.green, padding:20, fontWeight:600 }}>
                      Semua stok dalam kondisi aman.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
