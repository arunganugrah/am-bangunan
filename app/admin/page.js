'use client';
// app/admin/page.js — Panel Admin AM Bangunan
// Fitur: Manajemen Produk, Kategori, Karyawan, Pembelian Stok
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { db, auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { C, S, fmt, fmtTgl, generateKode, BULAN } from '@/components/theme';

const ADMIN_EMAIL = 'admin@ambangunan.com'; // ← samakan dengan admin-login/page.js
// App kedua khusus untuk daftar karyawan, agar session admin tidak terganggu
const secondaryApp = getApps().find(a => a.name === 'secondary') ||
  initializeApp(auth.app.options, 'secondary');
const secondaryAuth = getAuth(secondaryApp);
const TABS = ['Produk & Stok', 'Kategori', 'Pembelian Stok', 'Karyawan', 'Pengaturan'];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser]         = useState(null);
  const [tab, setTab]           = useState(0);
  const [loading, setLoading]   = useState(true);
  const [produk, setProduk]     = useState([]);
  const [kategori, setKategori] = useState([]);
  const [karyawan, setKaryawan] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [filterKat, setFilterKat] = useState('');
  const [searchQ, setSearchQ]   = useState('');
  // ── MOBILE RESPONSIVE ──
const [isMobile, setIsMobile] = useState(false);
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
useEffect(() => {
  const check = () => setIsMobile(window.innerWidth < 768);
  check();
  window.addEventListener('resize', check);
  return () => window.removeEventListener('resize', check);
}, []);
  // Form produk
  const emptyProduk = {
    kode:'', nama:'', kategori_id:'', satuan:'pcs',
    harga_beli:'', harga_jual:'', stok:'', stok_minimum:'5',
    keterangan:'',
  };
  const [formProduk, setFormProduk] = useState(emptyProduk);
  const [editingProduk, setEditingProduk] = useState(null);

  // Form kategori
  const [formKat, setFormKat]     = useState({ nama:'', warna:'#3b82f6' });
  const [editingKat, setEditingKat] = useState(null);

  // Form pembelian
  const emptyBeli = { produk_id:'', nama_produk:'', jumlah:'', harga_beli:'', pemasok:'', catatan:'' };
  const [formBeli, setFormBeli]   = useState(emptyBeli);

  // Form karyawan
  const emptyKary = { nama:'', email:'', password:'', role:'kasir', aktif:true };
  const [formKary, setFormKary]   = useState(emptyKary);
  const [karyLoading, setKaryLoading] = useState(false);

  // Pengaturan toko
  const [namaTokoEdit, setNamaTokoEdit] = useState('AM Bangunan');
  const [adminEmailEdit, setAdminEmailEdit] = useState(ADMIN_EMAIL);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.push('/admin-login'); return; }
      if (u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.push('/kasir'); return;
      }
      setUser(u);
      loadAll();
    });
    return unsub;
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pSnap, kSnap, kaSnap, bSnap] = await Promise.all([
        getDocs(query(collection(db, 'produk'), orderBy('nama'))),
        getDocs(collection(db, 'kategori')),
        getDocs(collection(db, 'karyawan')),
        getDocs(query(collection(db, 'pembelian_stok'), orderBy('tanggal', 'desc'))),
      ]);
      setProduk(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setKategori(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setKaryawan(kaSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPembelian(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── PRODUK ──
  const simpanProduk = async () => {
    const { kode, nama, harga_beli, harga_jual, stok } = formProduk;
    if (!nama) return alert('Nama produk wajib diisi!');
    if (!harga_beli) return alert('Harga beli wajib diisi!');
    if (!harga_jual) return alert('Harga jual wajib diisi!');
    const kat = kategori.find(k => k.id === formProduk.kategori_id);
    const data = {
      kode: kode || generateKode(),
      nama: formProduk.nama,
      kategori_id: formProduk.kategori_id || '',
      nama_kategori: kat?.nama || '',
      satuan: formProduk.satuan || 'pcs',
      harga_beli: parseInt(formProduk.harga_beli),
      harga_jual: parseInt(formProduk.harga_jual),
      stok: parseFloat(formProduk.stok) || 0,
      stok_minimum: parseFloat(formProduk.stok_minimum) || 5,
      keterangan: formProduk.keterangan || '',
      updatedAt: serverTimestamp(),
    };
    if (editingProduk) {
      await updateDoc(doc(db, 'produk', editingProduk), data);
    } else {
      await addDoc(collection(db, 'produk'), { ...data, createdAt: serverTimestamp() });
    }
    setFormProduk(emptyProduk); setEditingProduk(null);
    loadAll();
  };

  const hapusProduk = async (id) => {
    if (!confirm('Hapus produk ini?')) return;
    await deleteDoc(doc(db, 'produk', id));
    loadAll();
  };

  // ── KATEGORI ──
  const simpanKategori = async () => {
    if (!formKat.nama) return alert('Nama kategori wajib!');
    const data = { nama: formKat.nama, warna: formKat.warna || '#3b82f6', updatedAt: serverTimestamp() };
    if (editingKat) await updateDoc(doc(db, 'kategori', editingKat), data);
    else await addDoc(collection(db, 'kategori'), { ...data, createdAt: serverTimestamp() });
    setFormKat({ nama:'', warna:'#3b82f6' }); setEditingKat(null);
    loadAll();
  };

  const hapusKategori = async (id) => {
    if (!confirm('Hapus kategori ini?')) return;
    await deleteDoc(doc(db, 'kategori', id));
    loadAll();
  };

  // ── PEMBELIAN STOK ──
  const hapusPembelian = async (id, produk_id, jumlah, harga_beli_lama) => {
  if (!confirm('Hapus riwayat pembelian ini?\nStok produk akan dikurangi otomatis.')) return;
  try {
    // Kurangi stok yang pernah ditambahkan
    const p = produk.find(x => x.id === produk_id);
    if (p) {
      await updateDoc(doc(db, 'produk', produk_id), {
        stok: Math.max(0, (p.stok || 0) - jumlah),
        updatedAt: serverTimestamp(),
      });
    }
    await deleteDoc(doc(db, 'pembelian_stok', id));
    alert('Riwayat pembelian berhasil dihapus dan stok disesuaikan.');
    loadAll();
  } catch (err) {
    alert('Gagal hapus: ' + err.message);
  }
};
  const simpanPembelian = async () => {
    const { produk_id, jumlah, harga_beli } = formBeli;
    if (!produk_id) return alert('Pilih produk!');
    if (!jumlah || !harga_beli) return alert('Jumlah & harga beli wajib!');
    const p = produk.find(x => x.id === produk_id);
    const jml = parseFloat(jumlah);
    const hb  = parseInt(harga_beli);
    await addDoc(collection(db, 'pembelian_stok'), {
      tanggal: serverTimestamp(),
      produk_id,
      nama_produk: p?.nama || '',
      jumlah: jml,
      satuan: p?.satuan || 'pcs',
      harga_beli: hb,
      total_bayar: jml * hb,
      pemasok: formBeli.pemasok || '-',
      catatan: formBeli.catatan || '',
      dicatat_oleh: user?.email || '',
    });
    // Update stok produk
    if (p) {
      await updateDoc(doc(db, 'produk', produk_id), {
        stok: (p.stok || 0) + jml,
        harga_beli: hb, // update harga beli terbaru
        updatedAt: serverTimestamp(),
      });
    }
    alert(`Pembelian disimpan. Total: ${fmt(jml * hb)}`);
    setFormBeli(emptyBeli);
    loadAll();
  };

  // ── KARYAWAN ──
  const tambahKaryawan = async () => {
    const { nama, email, password, role } = formKary;
    if (!nama || !email || !password) return alert('Nama, email, password wajib!');
    setKaryLoading(true);
    try {
      // Daftarkan ke Firebase Auth
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
await secondaryAuth.signOut(); // langsung logout dari secondary
      // Simpan data ke Firestore
      await addDoc(collection(db, 'karyawan'), {
        nama,
        email: email.trim().toLowerCase(),
        uid: cred.user.uid,
        role,
        aktif: true,
        createdAt: serverTimestamp(),
      });
      alert(`Karyawan ${nama} berhasil ditambahkan.`);
      setFormKary(emptyKary);
      loadAll();
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') alert('Email sudah digunakan!');
      else alert('Gagal: ' + e.message);
    }
    setKaryLoading(false);
  };

  const toggleAktifKaryawan = async (id, aktif) => {
    await updateDoc(doc(db, 'karyawan', id), { aktif: !aktif });
    loadAll();
  };

  // ── FILTERED PRODUK ──
  const produkFiltered = produk.filter(p => {
    const matchKat = filterKat ? p.kategori_id === filterKat : true;
    const matchQ   = searchQ   ? p.nama.toLowerCase().includes(searchQ.toLowerCase()) ||
                                  p.kode.toLowerCase().includes(searchQ.toLowerCase()) : true;
    return matchKat && matchQ;
  });

  const margin = (p) => p.harga_beli > 0 ? ((p.harga_jual - p.harga_beli) / p.harga_beli * 100).toFixed(1) : '—';

  if (loading) return (
    <div style={{ minHeight:'100vh', background:C.bgPage, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.gold, fontSize:16, fontWeight:600 }}>Memuat data...</div>
    </div>
  );

  const tabStyle = (active) => ({
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: active ? `3px solid ${C.gold}` : '3px solid transparent',
    color: active ? C.gold : C.muted,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontSize: 14,
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ minHeight:'100vh', background:C.bgPage, color:C.text }}>
      <Navbar title="Panel Admin" role="admin" links={[
        { href:'/kasir', label:'Kasir' },
        { href:'/stok',  label:'Stok' },
        { href:'/laporan', label:'Laporan' },
      ]} />

      <div style={{ padding: isMobile ? '12px 14px' : '24px 28px' }}>
        {/* Tabs — mobile: scroll horizontal dengan ukuran lebih kecil */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          marginBottom: isMobile ? 16 : 24,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          gap: 0,
        }}>
          {TABS.map((t, i) => (
            <button key={i} style={{
              ...tabStyle(tab === i),
              fontSize: isMobile ? 12 : 14,
              padding: isMobile ? '10px 12px' : '12px 20px',
              whiteSpace: 'nowrap',
            }} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, marginBottom:24, overflowX:'auto' }}>
          {TABS.map((t,i) => <button key={i} style={tabStyle(tab===i)} onClick={() => setTab(i)}>{t}</button>)}
        </div>

        {/* ══ TAB 0: PRODUK ══ */}
        {tab === 0 && (
          <>
            {/* Form Tambah/Edit */}
            <div style={S.card}>
              <div style={{ fontSize:15, fontWeight:700, color:C.gold, marginBottom:16 }}>
                {editingProduk ? 'Edit Produk' : '+ Tambah Produk Baru'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={S.label}>Nama Produk *</label>
                  <input style={S.input} placeholder="mis. Semen Tiga Roda 50kg"
                    value={formProduk.nama} onChange={e => setFormProduk({...formProduk, nama:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Kode (kosong = auto)</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input style={S.input} placeholder="Auto-generate"
                      value={formProduk.kode} onChange={e => setFormProduk({...formProduk, kode:e.target.value})} />
                    <button onClick={() => setFormProduk({...formProduk, kode:generateKode()})}
                      style={{ ...S.btnGold, whiteSpace:'nowrap', padding:'0 10px' }}>⟳</button>
                  </div>
                </div>
                <div>
                  <label style={S.label}>Kategori</label>
                  <select style={S.select} value={formProduk.kategori_id}
                    onChange={e => setFormProduk({...formProduk, kategori_id:e.target.value})}>
                    <option value="">Tanpa Kategori</option>
                    {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Satuan</label>
                  <select style={S.select} value={formProduk.satuan}
                    onChange={e => setFormProduk({...formProduk, satuan:e.target.value})}>
                    {['pcs','sak','kg','m','m²','m³','liter','roll','batang','lembar','dus','lusin','unit'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr 2fr', gap:12, marginBottom:16 }}>
                <div>
                  <label style={S.label}>Harga Beli (HPP) *</label>
                  <input style={S.input} type="number" placeholder="0"
                    value={formProduk.harga_beli} onChange={e => setFormProduk({...formProduk, harga_beli:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Harga Jual *</label>
                  <input style={S.input} type="number" placeholder="0"
                    value={formProduk.harga_jual} onChange={e => setFormProduk({...formProduk, harga_jual:e.target.value})} />
                </div>
                {formProduk.harga_beli && formProduk.harga_jual && (
                  <div style={{ display:'flex', alignItems:'flex-end' }}>
                    <div style={{ background:C.goldBg, borderRadius:8, padding:'8px 12px', fontSize:13 }}>
                      <span style={{ color:C.muted }}>Margin: </span>
                      <span style={{ fontWeight:700, color:C.green }}>
                        {((parseInt(formProduk.harga_jual||0) - parseInt(formProduk.harga_beli||0)) / parseInt(formProduk.harga_beli||1) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <label style={S.label}>Stok Awal</label>
                  <input style={S.input} type="number" placeholder="0"
                    value={formProduk.stok} onChange={e => setFormProduk({...formProduk, stok:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Keterangan</label>
                  <input style={S.input} placeholder="opsional"
                    value={formProduk.keterangan} onChange={e => setFormProduk({...formProduk, keterangan:e.target.value})} />
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button style={S.btnGold} onClick={simpanProduk}>
                  {editingProduk ? 'Simpan Perubahan' : '+ Tambah Produk'}
                </button>
                {editingProduk && (
                  <button style={S.btnGhost} onClick={() => { setEditingProduk(null); setFormProduk(emptyProduk); }}>
                    Batal
                  </button>
                )}
              </div>
            </div>

            {/* Filter & Search */}
            <div style={{ display:'flex', gap:12, marginBottom:12, alignItems:'center', flexWrap:'wrap' }}>
              <input style={{ ...S.input, width:240 }} placeholder="Cari nama / kode produk..."
                value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <select style={{ ...S.select, width:180 }} value={filterKat} onChange={e => setFilterKat(e.target.value)}>
                <option value="">Semua Kategori</option>
                {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
              <span style={{ color:C.muted, fontSize:13 }}>{produkFiltered.length} produk</span>
            </div>

            {/* Tabel Produk */}
            <div style={{ ...S.card, overflowX: 'auto' }}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Kode</th>
                  <th style={S.th}>Nama Produk</th>
                  <th style={S.th}>Kategori</th>
                  <th style={S.th}>Harga Beli</th>
                  <th style={S.th}>Harga Jual</th>
                  <th style={S.th}>Margin</th>
                  <th style={S.th}>Stok</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Aksi</th>
                </tr></thead>
                <tbody>
                  {produkFiltered.map(p => {
                    const stokWarning = p.stok <= (p.stok_minimum || 5);
                    return (
                      <tr key={p.id}>
                        <td style={{ ...S.td }}>
                          <span style={{ fontFamily:'monospace', background:'#f0f4f8', padding:'2px 8px', borderRadius:6, fontSize:12 }}>
                            {p.kode}
                          </span>
                        </td>
                        <td style={{ ...S.td, fontWeight:600 }}>{p.nama}</td>
                        <td style={S.td}>
                          {p.nama_kategori ? (
                            <span style={{ background:C.blueBg, color:C.blue, padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                              {p.nama_kategori}
                            </span>
                          ) : <span style={{ color:C.muted }}>—</span>}
                        </td>
                        <td style={{ ...S.td, color:C.muted }}>{fmt(p.harga_beli)}</td>
                        <td style={{ ...S.td, fontWeight:600 }}>{fmt(p.harga_jual)}</td>
                        <td style={{ ...S.td, color:C.green, fontWeight:600 }}>{margin(p)}%</td>
                        <td style={{ ...S.td, color: stokWarning ? C.red : C.text, fontWeight: stokWarning ? 700 : 400 }}>
                          {p.stok} {p.satuan}
                        </td>
                        <td style={S.td}>
                          <span style={{
                            background: p.stok <= 0 ? C.redBg : stokWarning ? C.orangeBg : C.greenBg,
                            color: p.stok <= 0 ? C.red : stokWarning ? C.orange : C.green,
                            padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                          }}>
                            {p.stok <= 0 ? 'Habis' : stokWarning ? 'Menipis' : 'Tersedia'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button style={{ ...S.btnGold, fontSize:12, padding:'6px 12px' }}
                              onClick={() => {
                                setEditingProduk(p.id);
                                setFormProduk({
                                  kode: p.kode, nama: p.nama, kategori_id: p.kategori_id||'',
                                  satuan: p.satuan, harga_beli: p.harga_beli, harga_jual: p.harga_jual,
                                  stok: p.stok, stok_minimum: p.stok_minimum||5, keterangan: p.keterangan||''
                                });
                                setTab(0);
                                window.scrollTo(0,0);
                              }}>Edit</button>
                            <button style={S.btnDanger} onClick={() => hapusProduk(p.id)}>Hapus</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {produkFiltered.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:C.muted }}>
                  Belum ada produk. Tambahkan produk di atas.
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ TAB 1: KATEGORI ══ */}
        {tab === 1 && (
          <>
            <div style={S.card}>
              <div style={{ fontSize:15, fontWeight:700, color:C.gold, marginBottom:16 }}>
                {editingKat ? 'Edit Kategori' : '+ Tambah Kategori'}
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <label style={S.label}>Nama Kategori</label>
                  <input style={S.input} placeholder="mis. Semen, Cat, Pipa..."
                    value={formKat.nama} onChange={e => setFormKat({...formKat, nama:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Warna Label</label>
                  <input type="color" value={formKat.warna}
                    onChange={e => setFormKat({...formKat, warna:e.target.value})}
                    style={{ width:50, height:40, borderRadius:8, border:'1px solid #e2e8f0', cursor:'pointer' }} />
                </div>
                <button style={S.btnGold} onClick={simpanKategori}>
                  {editingKat ? 'Simpan' : '+ Tambah'}
                </button>
                {editingKat && (
                  <button style={S.btnGhost} onClick={() => { setEditingKat(null); setFormKat({nama:'',warna:'#3b82f6'}); }}>
                    Batal
                  </button>
                )}
              </div>
            </div>
            <div style={S.card}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
                {kategori.map(k => (
                  <div key={k.id} style={{
                    display:'flex', alignItems:'center', gap:10,
                    background:'#f7fafc', borderRadius:10, padding:'10px 16px',
                    border:`1px solid ${C.border}`,
                  }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', background:k.warna }} />
                    <span style={{ fontWeight:600, fontSize:14 }}>{k.nama}</span>
                    <span style={{ color:C.muted, fontSize:12 }}>
                      ({produk.filter(p => p.kategori_id === k.id).length} produk)
                    </span>
                    <button style={{ ...S.btnGold, fontSize:11, padding:'4px 10px' }}
                      onClick={() => { setEditingKat(k.id); setFormKat({ nama:k.nama, warna:k.warna||'#3b82f6' }); }}>
                      Edit
                    </button>
                    <button style={{ ...S.btnDanger, padding:'4px 10px' }} onClick={() => hapusKategori(k.id)}>
                      Hapus
                    </button>
                  </div>
                ))}
                {kategori.length === 0 && <div style={{ color:C.muted, padding:20 }}>Belum ada kategori.</div>}
              </div>
            </div>
          </>
        )}

        {/* ══ TAB 2: PEMBELIAN STOK ══ */}
        {tab === 2 && (
          <>
            <div style={S.card}>
              <div style={{ fontSize:15, fontWeight:700, color:C.orange, marginBottom:4 }}>
                Catat Pembelian / Restock (Uang Keluar)
              </div>
              <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>
                Setiap pembelian dicatat sebagai HPP dan stok otomatis bertambah.
              </div>
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={S.label}>Produk</label>
                  <select style={S.select} value={formBeli.produk_id}
                    onChange={e => {
                      const p = produk.find(x => x.id === e.target.value);
                      setFormBeli({...formBeli, produk_id:e.target.value, nama_produk:p?.nama||'',
                        harga_beli:p?.harga_beli||''});
                    }}>
                    <option value="">-- Pilih Produk --</option>
                    {produk.map(p => <option key={p.id} value={p.id}>{p.nama} (stok: {p.stok} {p.satuan})</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Jumlah</label>
                  <input style={S.input} type="number" step="0.01" placeholder="0"
                    value={formBeli.jumlah} onChange={e => setFormBeli({...formBeli, jumlah:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Harga Beli per Satuan</label>
                  <input style={S.input} type="number" placeholder="0"
                    value={formBeli.harga_beli} onChange={e => setFormBeli({...formBeli, harga_beli:e.target.value})} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={S.label}>Nama Pemasok</label>
                  <input style={S.input} placeholder="Nama pemasok/distributor"
                    value={formBeli.pemasok} onChange={e => setFormBeli({...formBeli, pemasok:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Catatan</label>
                  <input style={S.input} placeholder="opsional"
                    value={formBeli.catatan} onChange={e => setFormBeli({...formBeli, catatan:e.target.value})} />
                </div>
              </div>
              {formBeli.jumlah && formBeli.harga_beli && (
                <div style={{ background:C.goldBg, borderRadius:10, padding:'12px 18px', marginBottom:14, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:C.muted, fontSize:13 }}>{formBeli.jumlah} × {fmt(formBeli.harga_beli)}</span>
                  <span style={{ fontWeight:700, fontSize:18, color:C.orange }}>
                    Total: {fmt(parseFloat(formBeli.jumlah||0) * parseInt(formBeli.harga_beli||0))}
                  </span>
                </div>
              )}
              <button style={{ ...S.btnGold, background:C.orange, color:'#fff' }} onClick={simpanPembelian}>
                Simpan Pembelian & Tambah Stok
              </button>
            </div>

            <div style={{ ...S.card, overflowX: 'auto' }}>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>Riwayat Pembelian</div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Tanggal</th>
                  <th style={S.th}>Produk</th>
                  <th style={S.th}>Pemasok</th>
                  <th style={S.th}>Jumlah</th>
                  <th style={S.th}>Harga Beli</th>
                  <th style={S.th}>Total Bayar</th>
                  <th style={S.th}>Aksi</th>
                </tr></thead>
                <tbody>
                  {pembelian.map(b => (
                    <tr key={b.id}>
                      <td style={{ ...S.td, color:C.muted, fontSize:12 }}>{fmtTgl(b.tanggal)}</td>
                      <td style={{ ...S.td, fontWeight:600 }}>{b.nama_produk}</td>
                      <td style={S.td}>{b.pemasok}</td>
                      <td style={S.td}>{b.jumlah} {b.satuan}</td>
                      <td style={{ ...S.td, color:C.muted }}>{fmt(b.harga_beli)}</td>
                      <td style={{ ...S.td, fontWeight:700, color:C.orange }}>{fmt(b.total_bayar)}</td>
                      <td style={S.td}>
                        <button
                          style={S.btnDanger}
                          onClick={() => hapusPembelian(b.id, b.produk_id, b.jumlah, b.harga_beli)}>
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pembelian.length === 0 && (
                    <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:C.muted, padding:30 }}>
                      Belum ada riwayat pembelian.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══ TAB 3: KARYAWAN ══ */}
        {tab === 3 && (
          <>
            <div style={S.card}>
              <div style={{ fontSize:15, fontWeight:700, color:C.gold, marginBottom:4 }}>
                Tambah Akun Karyawan
              </div>
              <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>
                Karyawan hanya bisa akses Kasir dan input stok — tidak bisa lihat Laporan Keuangan atau ubah harga.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <label style={S.label}>Nama Lengkap</label>
                  <input style={S.input} placeholder="Nama karyawan"
                    value={formKary.nama} onChange={e => setFormKary({...formKary, nama:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Email</label>
                  <input style={S.input} type="email" placeholder="email@domain.com"
                    value={formKary.email} onChange={e => setFormKary({...formKary, email:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Password Awal</label>
                  <input style={S.input} type="password" placeholder="min. 6 karakter"
                    value={formKary.password} onChange={e => setFormKary({...formKary, password:e.target.value})} />
                </div>
                <div>
                  <label style={S.label}>Role</label>
                  <select style={S.select} value={formKary.role} onChange={e => setFormKary({...formKary, role:e.target.value})}>
                    <option value="kasir">Kasir</option>
                    <option value="manajer_stok">Manajer Stok</option>
                  </select>
                </div>
              </div>
              <button style={S.btnGold} onClick={tambahKaryawan} disabled={karyLoading}>
                {karyLoading ? 'Mendaftarkan...' : '+ Tambah Karyawan'}
              </button>
            </div>
            <div style={{ ...S.card, overflowX: 'auto' }}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Nama</th>
                  <th style={S.th}>Email</th>
                  <th style={S.th}>Role</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Aksi</th>
                </tr></thead>
                <tbody>
                  {karyawan.map(k => (
                    <tr key={k.id}>
                      <td style={{ ...S.td, fontWeight:600 }}>{k.nama}</td>
                      <td style={{ ...S.td, color:C.muted }}>{k.email}</td>
                      <td style={S.td}>
                        <span style={{ background:C.purpleBg, color:C.purple, padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                          {k.role}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span style={{ background: k.aktif ? C.greenBg : C.redBg, color: k.aktif ? C.green : C.red,
                          padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                          {k.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td style={S.td}>
                        <button
                          style={{ ...S.btnDanger, background: k.aktif ? C.redBg : C.greenBg,
                            color: k.aktif ? C.red : C.green }}
                          onClick={() => toggleAktifKaryawan(k.id, k.aktif)}>
                          {k.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {karyawan.length === 0 && (
                    <tr><td colSpan={5} style={{ ...S.td, textAlign:'center', color:C.muted, padding:30 }}>
                      Belum ada karyawan.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══ TAB 4: PENGATURAN ══ */}
        {tab === 4 && (
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:700, color:C.gold, marginBottom:16 }}>Pengaturan Toko</div>
            <div style={{ maxWidth:480 }}>
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Nama Toko</label>
                <input style={S.input} value={namaTokoEdit} onChange={e => setNamaTokoEdit(e.target.value)} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={S.label}>Email Admin</label>
                <input style={S.input} value={adminEmailEdit} onChange={e => setAdminEmailEdit(e.target.value)} />
              </div>
              <div style={{ background:C.goldBg, borderRadius:10, padding:16, fontSize:13, color:C.textMid, lineHeight:1.6 }}>
                <strong>Catatan penting:</strong><br/>
                Untuk mengubah email admin, Anda perlu memperbarui konstanta <code>ADMIN_EMAIL</code> di dalam file
                <code> app/admin-login/page.js</code> dan <code>app/admin/page.js</code>.
                Perubahan ini membutuhkan update kode secara manual.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
