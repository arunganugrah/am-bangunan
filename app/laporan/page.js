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

export default function LaporanPage() {
  const router   = useRouter();
  const [user, setUser]       = useState(null);
  const [transaksi, setTransaksi] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [produk, setProduk]   = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [bulan, setBulan]   = useState(today.getMonth());
  const [tahun, setTahun]   = useState(today.getFullYear());
  const [activeView, setActiveView] = useState('ringkasan'); // ringkasan | transaksi | produk

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.push('/admin-login'); return; }
      if (u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        alert('Akses ditolak. Halaman ini hanya untuk Admin.');
        router.push('/kasir'); return;
      }
      setUser(u);
      loadData();
    });
    return unsub;
  }, []);
const hapusTransaksi = async (id, items) => {
    if (!confirm('Hapus transaksi ini? Stok akan dikembalikan otomatis.')) return;
    try {
      if (items && items.length > 0) {
        for (const item of items) {
          if (!item.isBebas) {
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

        {/* View tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
          {[
          ['ringkasan','Ringkasan Eksekutif'],
          ['transaksi','Riwayat Transaksi'],
          ['pembelian','Riwayat Pembelian Stok'],
          ['produk','Analitik Produk'],
        ].map(([v,l]) => (
            <button key={v} style={tabStyle(activeView===v)} onClick={() => setActiveView(v)}>{l}</button>
          ))}
        </div>

        {/* ── RINGKASAN ── */}
        {activeView === 'ringkasan' && (
          <>
            {/* KPI Utama */}
            <div style={{ fontSize:11, color:C.muted, letterSpacing:1, fontWeight:700, textTransform:'uppercase', marginBottom:10 }}>
              KPI Utama — {BULAN[bulan]} {tahun}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
              <KPICard label="Total Omzet" value={fmt(omzet)} sub={`${txPeriode.length} transaksi`} color={C.gold} growth={gOmzet} big />
              <KPICard label="HPP (Harga Pokok)" value={fmt(hpp)} sub={`${omzet>0?(hpp/omzet*100).toFixed(1):0}% dari omzet`} color={C.orange} />
              <KPICard label="Laba Kotor" value={fmt(labaKotor)} sub={`GPM ${gpm.toFixed(1)}%`} color={labaKotor>=0?C.green:C.red} growth={gLaba} big />
              <KPICard label="Nilai Inventori" value={fmt(nilaiStok)} sub="harga beli stok saat ini" color={C.blue} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
              <KPICard label="Rata-rata / Transaksi" value={fmt(avgTransaksi)} color={C.text} />
              <KPICard label="Omzet / Hari Aktif" value={fmt(avgPerHari)} sub={`${hariAktif} hari ada transaksi`} color={C.text} />
              <KPICard label="Gross Profit Margin"
                value={`${gpm.toFixed(1)}%`}
                sub={gpm>=30?'Margin sehat':gpm>=15?'Perlu ditingkatkan':'Margin tipis'}
                color={gpm>=30?C.green:gpm>=15?C.orange:C.red} />
              <KPICard label="Pembelian Stok (HPP Beli)" value={fmt(hppBeli)} sub={`${bliPeriode.length} pembelian`} color={C.red} />
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
          <div style={S.card}>
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
