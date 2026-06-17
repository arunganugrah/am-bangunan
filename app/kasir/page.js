'use client';
// app/kasir/page.js — Halaman Kasir Premium AM Bangunan
// RBAC: karyawan & admin bisa akses; hanya admin bisa override harga
import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, serverTimestamp, doc,
  updateDoc, increment, query, orderBy
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { C, S, fmt, fmtTgl } from '@/components/theme';

const ADMIN_EMAIL = 'admin@ambangunan.com';

export default function KasirPage() {
  const router      = useRouter();
  const [user, setUser]        = useState(null);
  const [isAdmin, setIsAdmin]  = useState(false);
  const [produk, setProduk]    = useState([]);
  const [kategori, setKategori]= useState([]);
  const [filterKat, setFilterKat] = useState('');
  const [searchQ, setSearchQ]  = useState('');
  const [keranjang, setKeranjang] = useState([]);
  const [namaPembeli, setNamaPembeli] = useState('');
  const [catatan, setCatatan]  = useState('');
  const [diskon, setDiskon]    = useState('');
  const [bayar, setBayar]      = useState('');
  const [loading, setLoading]  = useState(false);
  const [sukses, setSukses]    = useState('');
  const [showReceipt, setShowReceipt] = useState(null);
  const searchRef = useRef(null);
  const [itemBebas, setItemBebas] = useState({ nama:'', harga:'', qty:'1' });

  // ✅ State mobile
  const [mobileTab, setMobileTab] = useState('produk');
  const [isMobile, setIsMobile]   = useState(false);

  // ✅ Deteksi ukuran layar — reaktif saat resize
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) { router.push('/admin-login'); return; }
      const admin = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      setUser(u); setIsAdmin(admin);
      loadProduk();
    });
    return unsub;
  }, []);

  const loadProduk = async () => {
    const [pSnap, kSnap] = await Promise.all([
      getDocs(query(collection(db, 'produk'), orderBy('nama'))),
      getDocs(collection(db, 'kategori')),
    ]);
    setProduk(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setKategori(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const produkFiltered = produk.filter(p => {
    const matchKat = filterKat ? p.kategori_id === filterKat : true;
    const matchQ = searchQ
      ? p.nama.toLowerCase().includes(searchQ.toLowerCase()) ||
        p.kode.toLowerCase().includes(searchQ.toLowerCase())
      : true;
    return matchKat && matchQ;
  });

  // ✅ tambahItem: auto-switch ke tab keranjang di mobile
  const tambahItemBebas = () => {
    const { nama, harga, qty } = itemBebas;
    if (!nama) return alert('Nama item wajib!');
    if (!harga) return alert('Harga wajib!');
    const q = parseFloat(qty) || 1;
    const h = parseInt(harga);
    const fakeId = 'BEBAS-' + Date.now();
    setKeranjang(prev => [...prev, {
      produk_id: fakeId,
      kode: 'ITEM',
      nama: nama.trim(),
      satuan: 'pcs',
      harga_beli: 0,
      harga_jual: h,
      harga_jual_override: null,
      qty: q,
      stok: 999,
      subtotal: q * h,
      isBebas: true,
    }]);
    setItemBebas({ nama:'', harga:'', qty:'1' });
    if (isMobile) setMobileTab('keranjang');
  };

  const tambahItem = (p, qty = 1) => {
    setKeranjang(prev => {
      const idx = prev.findIndex(i => i.produk_id === p.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          qty: updated[idx].qty + qty,
          subtotal: (updated[idx].qty + qty) * updated[idx].harga_jual,
        };
        return updated;
      }
      return [...prev, {
        produk_id: p.id,
        kode: p.kode,
        nama: p.nama,
        satuan: p.satuan,
        harga_beli: p.harga_beli,
        harga_jual: p.harga_jual,
        harga_jual_override: null,
        qty,
        stok: p.stok,
        subtotal: qty * p.harga_jual,
      }];
    });
    // ✅ Auto-pindah ke tab keranjang saat item ditambah di mobile
    if (isMobile) setMobileTab('keranjang');
  };

  const updateQty = (produk_id, qty) => {
    if (qty <= 0) { hapusItem(produk_id); return; }
    setKeranjang(prev => prev.map(i => i.produk_id === produk_id
      ? { ...i, qty, subtotal: qty * (i.harga_jual_override || i.harga_jual) }
      : i));
  };

  const updateHargaOverride = (produk_id, harga) => {
    setKeranjang(prev => prev.map(i => i.produk_id === produk_id
      ? { ...i, harga_jual_override: harga ? parseInt(harga) : null,
          subtotal: i.qty * (harga ? parseInt(harga) : i.harga_jual) }
      : i));
  };

  const hapusItem = (produk_id) => setKeranjang(prev => prev.filter(i => i.produk_id !== produk_id));

  const subtotalBruto = keranjang.reduce((s, i) => s + i.subtotal, 0);
  const diskonNominal = diskon ? (diskon.includes('%')
    ? subtotalBruto * parseFloat(diskon) / 100
    : parseInt(diskon)) : 0;
  const totalBayar    = Math.max(0, subtotalBruto - diskonNominal);
  const totalHPP      = keranjang.reduce((s, i) => s + i.harga_beli * i.qty, 0);
  const labaTransaksi = totalBayar - totalHPP;
  const kembalian     = bayar ? parseInt(bayar) - totalBayar : null;

 const cetakStruk = (receipt) => {
    const tanggal = new Date(receipt.tanggal.seconds * 1000);
    const tglStr  = tanggal.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' });
    const jamStr  = tanggal.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });

    // Generate nomor struk random 8 digit
    const noStruk = 'INV-' + Math.random().toString(36).substring(2,6).toUpperCase() +
                    '-' + String(Math.floor(Math.random()*9000)+1000);

    const itemsHtml = receipt.items.map(item => `
      <div class="item-row">
        <div class="item-nama">${item.nama}</div>
        <div class="item-detail">
          <span>${item.qty} ${item.satuan} &times; Rp ${Math.round(item.harga_jual).toLocaleString('id-ID')}</span>
          <span class="item-total">Rp ${Math.round(item.subtotal).toLocaleString('id-ID')}</span>
        </div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width">
  <title>Struk AM Bangunan</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      background: #fff;
      color: #000;
      /* Center konten di tengah halaman (untuk A4/Letter di iPhone) */
      display: flex;
      justify-content: center;
      padding: 8px 0;
    }

    /* Wrapper utama — lebar thermal 58mm */
    .struk {
      width: 54mm;       /* sedikit di bawah 58mm untuk margin printer */
      max-width: 54mm;
    }

    /* Header toko */
    .header { text-align: center; margin-bottom: 6px; }
    .header .nama-toko { font-size: 15px; font-weight: 900; letter-spacing: 0.5px; }
    .header .info      { font-size: 10px; line-height: 1.6; }
    .header .no-struk  { font-size: 10px; font-weight: 700; margin-top: 4px; }

    /* Garis pemisah */
    .garis { border-top: 1px dashed #000; margin: 5px 0; }
    .garis-solid { border-top: 1px solid #000; margin: 5px 0; }

    /* Baris info (tanggal/kasir, jam/pembeli) */
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      line-height: 1.7;
    }
    .info-row .kiri { text-align: left; }
    .info-row .kanan { text-align: right; }

    /* Item produk */
    .item-row { margin-bottom: 5px; }
    .item-nama {
      font-size: 11px;
      font-weight: 700;
      word-break: break-word;
    }
    .item-detail {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding-left: 2mm;
    }
    .item-total { font-weight: 700; white-space: nowrap; margin-left: 4px; }

    /* Baris total & diskon */
    .total-section { margin-top: 2px; }
    .total-baris {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      line-height: 1.8;
    }
    .total-baris.diskon { color: #555; }
    .total-baris.grand {
      font-size: 14px;
      font-weight: 900;
      margin-top: 2px;
    }
    .total-baris.kembalian { font-size: 11px; }

    /* Footer */
    .footer {
      text-align: center;
      font-size: 11px;
      margin-top: 8px;
      line-height: 1.8;
    }

    /* Tombol cetak — hilang saat print */
    .btn-cetak {
      display: block;
      width: 100%;
      margin-top: 12px;
      padding: 10px;
      font-size: 13px;
      cursor: pointer;
      background: #1a7f4b;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-family: sans-serif;
    }

    /* ═══════════════════════════
       PRINT STYLES
       Solusi iOS Safari (A4/Letter/dll):
       - Tidak set ukuran kertas custom
       - Konten di-center otomatis karena flexbox
       - margin kecil agar tidak terpotong
       ═══════════════════════════ */
    @media print {
      @page {
        /* 'auto' = pakai ukuran yang dipilih user di dialog print */
        /* Ini penting agar iOS Safari (A4/Letter) tetap bisa cetak */
        size: auto;
        margin: 6mm 8mm;
      }

      body {
        display: block;       /* reset flex saat print */
        padding: 0;
      }

      .struk {
        /* Center di halaman A4/Letter */
        margin: 0 auto;
        width: 54mm;
        max-width: 54mm;
      }

      .btn-cetak { display: none !important; }

      /* Potong kertas tepat setelah konten selesai */
      .struk::after {
        content: '';
        display: block;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="struk">

    <!-- HEADER TOKO -->
    <div class="header">
      <div class="nama-toko">AM BANGUNAN</div>
      <div class="info">
        Jl. Andi Panggaru<br>
        Sengkang<br>
        No. Telp 082188871788
      </div>
      <div class="no-struk">${noStruk}</div>
    </div>

    <div class="garis"></div>

    <!-- INFO TRANSAKSI: tanggal | kasir & jam | pembeli -->
    <div class="info-row">
      <span class="kiri">${tglStr}</span>
      <span class="kanan">Oleh: ${receipt.kasir?.split('@')[0] || '—'}</span>
    </div>
    <div class="info-row">
      <span class="kiri">${jamStr}</span>
      <span class="kanan">${receipt.namaPembeli !== 'Umum' ? receipt.namaPembeli : 'Umum'}</span>
    </div>

    <div class="garis"></div>

    <!-- ITEM-ITEM -->
    ${itemsHtml}

    <div class="garis"></div>

    <!-- TOTAL -->
    <div class="total-section">
      ${receipt.diskon > 0 ? `
      <div class="total-baris diskon">
        <span>Diskon</span>
        <span>- Rp ${Math.round(receipt.diskon).toLocaleString('id-ID')}</span>
      </div>` : ''}
      <div class="total-baris grand">
        <span>TOTAL</span>
        <span>Rp ${Math.round(receipt.total).toLocaleString('id-ID')}</span>
      </div>
      ${receipt.kembalian > 0 ? `
      <div class="total-baris kembalian">
        <span>Bayar</span>
        <span>Rp ${Math.round(receipt.bayar).toLocaleString('id-ID')}</span>
      </div>
      <div class="total-baris kembalian">
        <span>Kembalian</span>
        <span>Rp ${Math.round(receipt.kembalian).toLocaleString('id-ID')}</span>
      </div>` : ''}
    </div>

    <div class="garis-solid"></div>

    <!-- FOOTER -->
    <div class="footer">
      Terima kasih telah Berbelanja
    </div>

    <!-- Tombol cetak (hilang saat print) -->
    <button class="btn-cetak" onclick="window.print(); setTimeout(()=>window.close(),500);">
      🖨️ Cetak Sekarang
    </button>

  </div>
</body>
</html>`;

    const popup = window.open('', '_blank', 'width=420,height=650,scrollbars=yes');
    if (!popup) {
      alert('Popup diblokir browser. Izinkan popup untuk situs ini di pengaturan browser, lalu coba lagi.');
      return;
    }
    popup.document.write(html);
    popup.document.close();
  }; 
  const simpanTransaksi = async () => {
    if (keranjang.length === 0) return;
    if (kembalian !== null && kembalian < 0) return alert('Uang bayar kurang!');
    setLoading(true);
    try {
      const items = keranjang.map(i => ({
        produk_id: i.produk_id,
        kode: i.kode,
        nama: i.nama,
        satuan: i.satuan,
        harga_beli: i.harga_beli,
        harga_jual: i.harga_jual_override || i.harga_jual,
        qty: i.qty,
        subtotal: i.subtotal,
        laba: ((i.harga_jual_override || i.harga_jual) - i.harga_beli) * i.qty,
      }));

      const data = {
        tanggal: serverTimestamp(),
        namaPembeli: namaPembeli || 'Umum',
        catatan: catatan || '',
        items,
        subtotal: subtotalBruto,
        diskon: diskonNominal,
        total: totalBayar,
        hpp: totalHPP,
        laba: labaTransaksi,
        bayar: bayar ? parseInt(bayar) : totalBayar,
        kembalian: kembalian || 0,
        kasir: user.email,
        kasir_role: isAdmin ? 'admin' : 'kasir',
      };

      const ref = await addDoc(collection(db, 'transaksi'), data);

      for (const item of keranjang) {
        if (item.isBebas) continue;
        await updateDoc(doc(db, 'produk', item.produk_id), {
          stok: increment(-item.qty)
        });
      }

      const receiptData = {
        ...data,
        id: ref.id,
        tanggal: { seconds: Date.now() / 1000 }
      };
      setShowReceipt(receiptData);
      setKeranjang([]);
      setNamaPembeli('');
      setCatatan('');
      setDiskon('');
      setBayar('');
      // ✅ Balik ke tab produk setelah transaksi selesai
      if (isMobile) setMobileTab('produk');
      loadProduk();

    } catch (err) {
      alert('Gagal simpan transaksi: ' + err.message);
    }
    setLoading(false);
  };

  const btnKat = (active) => ({
    padding: '7px 14px',
    borderRadius: 20,
    border: `1px solid ${active ? C.gold : C.border}`,
    background: active ? C.goldBg : 'transparent',
    color: active ? C.gold : C.muted,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
  });

  // 52 topbar + 48 tab kasir + 62 bottom nav = 162px
  // Desktop: 60px navbar saja
  const contentHeight = isMobile ? 'calc(100vh - 162px)' : 'calc(100vh - 60px)';

  return (
    <div style={{ minHeight:'100vh', background:C.bgPage, color:C.text }}>
      <Navbar title="Kasir" role={isAdmin ? 'admin' : 'kasir'} links={[
        { href:'/stok', label:'Stok' },
        ...(isAdmin ? [{ href:'/admin', label:'Admin' }, { href:'/laporan', label:'Laporan' }] : []),
      ]} />

      {/* ✅ Tab bar MOBILE — di LUAR grid, tepat di bawah Navbar */}
      {isMobile && (
        <div style={{
          display: 'flex',
          borderBottom: '2px solid #2d4a6e',
          background: '#1a2535',
          height: 48,
        }}>
          {['produk', 'keranjang'].map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: mobileTab === tab ? '#0f1c2b' : 'transparent',
              color: mobileTab === tab ? '#f6c90e' : '#7a8fa6',
              fontWeight: mobileTab === tab ? 700 : 400,
              fontSize: 14,
              cursor: 'pointer',
              borderBottom: mobileTab === tab ? '3px solid #f6c90e' : '3px solid transparent',
            }}>
              {tab === 'keranjang'
                ? `🛒 Keranjang${keranjang.length > 0 ? ` (${keranjang.length})` : ''}`
                : '📦 Produk'}
            </button>
          ))}
        </div>
      )}

      {/* ✅ Grid utama — responsive columns & height */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 380px',
        // Mobile: tinggi auto agar konten bisa scroll bebas
        // Desktop: tinggi fixed agar layout split screen bekerja
        height: isMobile ? 'auto' : contentHeight,
        gridTemplateRows: '1fr',
        overflow: isMobile ? 'visible' : 'hidden',
      }}>

        {/* KIRI: Produk — disembunyikan di mobile saat tab keranjang aktif */}
        <div style={{
          padding: 20,
          paddingBottom: isMobile ? 84 : 20,
          overflowY: 'auto',
          background: C.bgPage,
          display: isMobile && mobileTab === 'keranjang' ? 'none' : 'block',
        }}>
          {/* Search */}
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input
              ref={searchRef}
              style={{ ...S.input, flex:1, minWidth:200 }}
              placeholder="Cari nama / kode produk..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              autoFocus
            />
          </div>

          {/* Kategori pills */}
          <div style={{ display:'flex', gap:8, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
            <button style={btnKat(!filterKat)} onClick={() => setFilterKat('')}>Semua</button>
            {kategori.map(k => (
              <button key={k.id} style={btnKat(filterKat===k.id)} onClick={() => setFilterKat(k.id)}>
                {k.nama}
              </button>
            ))}
          </div>

          {/* ── Item Bebas ── */}
          <div style={{ background:'#fff8e7', border:`1px dashed ${C.gold}`, borderRadius:10,
            padding:'10px 14px', marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:8 }}>
              ➕ Item Bebas — tidak masuk stok, muncul di struk
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ flex:2, minWidth:120 }}>
                <label style={{ fontSize:10, color:C.muted, display:'block', marginBottom:3 }}>Nama Item</label>
                <input style={{ ...S.input, fontSize:12 }} placeholder="mis. Ongkos kirim, Jasa pasang..."
                  value={itemBebas.nama} onChange={e => setItemBebas({...itemBebas, nama:e.target.value})} />
              </div>
              <div style={{ flex:1, minWidth:80 }}>
                <label style={{ fontSize:10, color:C.muted, display:'block', marginBottom:3 }}>Harga</label>
                <input style={{ ...S.input, fontSize:12 }} type="number" placeholder="0"
                  value={itemBebas.harga} onChange={e => setItemBebas({...itemBebas, harga:e.target.value})} />
              </div>
              <div style={{ width:56 }}>
                <label style={{ fontSize:10, color:C.muted, display:'block', marginBottom:3 }}>Qty</label>
                <input style={{ ...S.input, fontSize:12 }} type="number" placeholder="1"
                  value={itemBebas.qty} onChange={e => setItemBebas({...itemBebas, qty:e.target.value})} />
              </div>
              <button onClick={tambahItemBebas} style={{ ...S.btnGold, fontSize:12, padding:'9px 14px' }}>
                + Tambah
              </button>
            </div>
          </div>

          {/* Grid Produk */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12 }}>
            {produkFiltered.map(p => {
              const habis = p.stok <= 0;
              const inCart = keranjang.find(i => i.produk_id === p.id);
              return (
                <div key={p.id}
                  onClick={() => !habis && tambahItem(p)}
                  style={{
                    background: habis ? '#f7fafc' : C.bgCard,
                    border: `2px solid ${inCart ? C.gold : C.border}`,
                    borderRadius: 12,
                    padding: 14,
                    cursor: habis ? 'not-allowed' : 'pointer',
                    opacity: habis ? 0.6 : 1,
                    transition: 'all 0.15s',
                    boxShadow: inCart ? `0 0 0 2px ${C.goldBright}` : S.card.boxShadow,
                    position: 'relative',
                  }}>
                  {inCart && (
                    <div style={{
                      position:'absolute', top:8, right:8,
                      background:C.gold, color:'#1a2535',
                      borderRadius:'50%', width:22, height:22,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, fontWeight:700,
                    }}>{inCart.qty}</div>
                  )}
                  <div style={{ fontFamily:'monospace', fontSize:10, color:C.muted, marginBottom:4 }}>{p.kode}</div>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:8, lineHeight:1.3 }}>{p.nama}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:C.gold }}>{fmt(p.harga_jual)}</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                    <span style={{
                      background: p.stok <= 0 ? C.redBg : p.stok <= (p.stok_minimum||5) ? C.orangeBg : C.greenBg,
                      color: p.stok <= 0 ? C.red : p.stok <= (p.stok_minimum||5) ? C.orange : C.green,
                      padding:'1px 6px', borderRadius:10, fontSize:10, fontWeight:600,
                    }}>
                      {p.stok <= 0 ? 'Habis' : `${p.stok} ${p.satuan}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {produkFiltered.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:C.muted }}>
              Tidak ada produk ditemukan.
            </div>
          )}
        </div>

        {/* KANAN: Keranjang — disembunyikan di mobile saat tab produk aktif */}
        <div style={{
          background: '#1a2535',
          color: '#e8edf2',
          display: isMobile && mobileTab === 'produk' ? 'none' : 'flex',
          flexDirection: 'column',
          borderLeft: isMobile ? 'none' : `1px solid #2d4a6e`,
          // Desktop: overflow hidden agar flex bekerja dengan benar
          // Mobile: overflow auto agar SELURUH panel bisa scroll
          overflow: isMobile ? 'auto' : 'hidden',
          minHeight: 0,
        }}>
          {/* Header keranjang */}
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #2d4a6e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:15 }}>
              Keranjang{keranjang.length > 0 ? ` (${keranjang.length})` : ''}
            </span>
            {keranjang.length > 0 && (
              <button onClick={() => setKeranjang([])} style={{ background:'none', border:'none', color:'#7a8fa6', cursor:'pointer', fontSize:12 }}>
                Kosongkan
              </button>
            )}
          </div>

          {/* Items */}
          <div style={{
            flex: isMobile ? 'none' : 1,
            overflowY: isMobile ? 'visible' : 'auto',
            padding: '12px 16px',
            minHeight: 0,
          }}>
            {keranjang.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#3d4f60' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🛒</div>
                <div style={{ fontSize:14 }}>
                  {isMobile
                    ? 'Kembali ke tab Produk untuk menambah item'
                    : 'Klik produk untuk menambah'}
                </div>
                {/* ✅ Tombol shortcut balik ke produk di mobile */}
                {isMobile && (
                  <button onClick={() => setMobileTab('produk')} style={{
                    marginTop: 16,
                    padding: '10px 24px',
                    borderRadius: 20,
                    border: '1px solid #2d4a6e',
                    background: '#0f1c2b',
                    color: '#f6c90e',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    📦 Pilih Produk
                  </button>
                )}
              </div>
            ) : keranjang.map(item => (
              <div key={item.produk_id} style={{
                background:'#0f1c2b', borderRadius:10, padding:'12px 14px',
                marginBottom:10, border:'1px solid #2d4a6e',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, lineHeight:1.3, marginBottom:2 }}>{item.nama}</div>
                    <div style={{ fontSize:11, color:'#7a8fa6' }}>{item.kode}</div>
                  </div>
                  <button onClick={() => hapusItem(item.produk_id)}
                    style={{ background:'none', border:'none', color:'#7a8fa6', cursor:'pointer', fontSize:16, marginLeft:8, flexShrink:0 }}>
                    ✕
                  </button>
                </div>

                {isAdmin && (
                  <div style={{ marginBottom:8 }}>
                    <input
                      type="number"
                      placeholder={`Harga: ${fmt(item.harga_jual)} (override)`}
                      value={item.harga_jual_override || ''}
                      onChange={e => updateHargaOverride(item.produk_id, e.target.value)}
                      style={{ width:'100%', padding:'6px 10px', borderRadius:7, border:'1px solid #2d4a6e',
                        background:'#1a2535', color:'#e8edf2', fontSize:12 }}
                    />
                  </div>
                )}

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <button onClick={() => updateQty(item.produk_id, item.qty - 1)}
                      style={{ width:28, height:28, borderRadius:6, border:'1px solid #2d4a6e', background:'#1a2535',
                        color:'#e8edf2', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      −
                    </button>
                    <input type="number" value={item.qty}
                      onChange={e => updateQty(item.produk_id, parseFloat(e.target.value)||1)}
                      style={{ width:50, padding:'4px', borderRadius:6, border:'1px solid #2d4a6e',
                        background:'#1a2535', color:'#e8edf2', fontSize:13, textAlign:'center' }}
                    />
                    <button onClick={() => updateQty(item.produk_id, item.qty + 1)}
                      style={{ width:28, height:28, borderRadius:6, border:'1px solid #2d4a6e', background:'#1a2535',
                        color:'#e8edf2', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      +
                    </button>
                    <span style={{ fontSize:12, color:'#7a8fa6' }}>{item.satuan}</span>
                  </div>
                  <div style={{ fontWeight:700, color:'#f6c90e', fontSize:14 }}>{fmt(item.subtotal)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Form bawah & total */}
          {keranjang.length > 0 && (
            <div style={{
              padding: '14px 16px',
              // Padding bawah ekstra di mobile agar tombol tidak tertutup bottom nav
              paddingBottom: isMobile ? '80px' : '14px',
              borderTop: '1px solid #2d4a6e',
              flexShrink: 0,
            }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:11, color:'#7a8fa6', display:'block', marginBottom:4 }}>NAMA PEMBELI</label>
                  <input style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #2d4a6e',
                    background:'#0f1c2b', color:'#e8edf2', fontSize:13 }}
                    placeholder="Umum / nama" value={namaPembeli} onChange={e => setNamaPembeli(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#7a8fa6', display:'block', marginBottom:4 }}>DISKON</label>
                  <input style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #2d4a6e',
                    background:'#0f1c2b', color:'#e8edf2', fontSize:13 }}
                    placeholder="mis. 10000 atau 5%" value={diskon} onChange={e => setDiskon(e.target.value)} />
                </div>
              </div>

              <div style={{ background:'#0f1c2b', borderRadius:10, padding:'12px 14px', marginBottom:12, fontSize:13 }}>
                <div style={{ display:'flex', justifyContent:'space-between', color:'#7a8fa6', marginBottom:4 }}>
                  <span>Subtotal</span><span>{fmt(subtotalBruto)}</span>
                </div>
                {diskonNominal > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', color:C.orange, marginBottom:4 }}>
                    <span>Diskon</span><span>− {fmt(diskonNominal)}</span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:18,
                  color:'#f6c90e', borderTop:'1px solid #2d4a6e', paddingTop:8, marginTop:4 }}>
                  <span>TOTAL</span><span>{fmt(totalBayar)}</span>
                </div>
                {isAdmin && (
                  <div style={{ display:'flex', justifyContent:'space-between', color:'#3d6b48', fontSize:12, marginTop:4 }}>
                    <span>Laba Kotor</span><span>{fmt(labaTransaksi)}</span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#7a8fa6', display:'block', marginBottom:4 }}>UANG BAYAR (opsional)</label>
                <input type="number" style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #2d4a6e',
                  background:'#0f1c2b', color:'#e8edf2', fontSize:14 }}
                  placeholder={fmt(totalBayar)} value={bayar} onChange={e => setBayar(e.target.value)} />
                {bayar && kembalian !== null && (
                  <div style={{ marginTop:6, display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700,
                    color: kembalian >= 0 ? '#4caf7d' : '#ff7070' }}>
                    <span>Kembalian</span><span>{fmt(kembalian)}</span>
                  </div>
                )}
              </div>

              <button
                style={{ width:'100%', padding:'14px', borderRadius:10,
                  background: loading ? '#3d4f60' : 'linear-gradient(135deg, #f6c90e, #e8a800)',
                  color:'#1a2535', fontWeight:700, fontSize:15, border:'none', cursor: loading ? 'not-allowed' : 'pointer' }}
                onClick={simpanTransaksi} disabled={loading}>
                {loading ? 'Menyimpan...' : 'Selesaikan Transaksi'}
              </button>
            </div>
          )}
        </div>

      </div>{/* end grid utama */}

      {/* Struk / Receipt Modal */}
      {showReceipt && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
          padding: isMobile ? '16px' : 0,
        }}>
          <div className="struk-print" style={{
            background:'#fff', borderRadius:16, padding:28,
            width: isMobile ? '100%' : 360,
            maxWidth: 400,
            maxHeight:'85vh', overflowY:'auto',
            fontFamily:'monospace',
          }}>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontWeight:900, fontSize:18, letterSpacing:1 }}>AM BANGUNAN</div>
              <div style={{ fontSize:11, color:C.muted }}>Struk Pembelian</div>
              <div style={{ fontSize:11, color:C.muted }}>
                {new Date(showReceipt.tanggal.seconds * 1000).toLocaleString('id-ID')}
              </div>
              {showReceipt.namaPembeli !== 'Umum' && (
                <div style={{ fontSize:12, marginTop:4 }}>Pembeli: {showReceipt.namaPembeli}</div>
              )}
            </div>
            <div style={{ borderTop:'1px dashed #ccc', borderBottom:'1px dashed #ccc', padding:'10px 0', marginBottom:10 }}>
              {showReceipt.items.map((item, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <div>
                    <div>{item.nama}</div>
                    <div style={{ color:C.muted }}>{item.qty} {item.satuan} × {fmt(item.harga_jual)}</div>
                  </div>
                  <div style={{ fontWeight:600 }}>{fmt(item.subtotal)}</div>
                </div>
              ))}
            </div>
            {showReceipt.diskon > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                <span>Diskon</span><span style={{ color:C.orange }}>− {fmt(showReceipt.diskon)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:15, marginBottom:6 }}>
              <span>TOTAL</span><span>{fmt(showReceipt.total)}</span>
            </div>
            {showReceipt.kembalian > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span>Bayar</span><span>{fmt(showReceipt.bayar)}</span>
              </div>
            )}
            {showReceipt.kembalian > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span>Kembalian</span><span>{fmt(showReceipt.kembalian)}</span>
              </div>
            )}
            <div style={{ borderTop:'1px dashed #ccc', marginTop:12, paddingTop:12, textAlign:'center', fontSize:11, color:C.muted }}>
              Terima kasih atas kunjungan Anda!
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={() => cetakStruk(showReceipt)}
                style={{ ...S.btnGold, flex:1, padding:12, fontSize:14, background:'#1a7f4b', color:'#fff' }}>
                🖨️ Cetak
              </button>
              <button onClick={() => { setShowReceipt(null); searchRef.current?.focus(); }}
                style={{ ...S.btnGold, flex:1, padding:12, fontSize:14 }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}