'use client';
// app/stok/page.js — Halaman Monitoring Stok (karyawan & admin)
// Karyawan bisa tambah stok baru (tanpa harga); admin bisa edit semua
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { C, S, fmt, generateKode } from '@/components/theme';

const ADMIN_EMAIL = 'admin@ambangunan.com';

export default function StokPage() {
  const router = useRouter();
  const [user, setUser]         = useState(null);
  const [isAdmin, setIsAdmin]   = useState(false);
  const [produk, setProduk]     = useState([]);
  const [kategori, setKategori] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterStatus, setFilterStatus] = useState('semua');
  const [filterKat, setFilterKat] = useState('');
  const [searchQ, setSearchQ]   = useState('');

  // Form tambah stok baru oleh karyawan (tanpa harga)
  const emptyForm = { kode:'', nama:'', satuan:'pcs', stok:'', kategori_id:'', keterangan:'' };
  const [formBaru, setFormBaru] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) { router.push('/admin-login'); return; }
      const admin = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      setUser(u); setIsAdmin(admin);
      loadData();
    });
    return unsub;
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pSnap, kSnap] = await Promise.all([
        getDocs(query(collection(db, 'produk'), orderBy('nama'))),
        getDocs(collection(db, 'kategori')),
      ]);
      setProduk(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setKategori(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('loadData stok error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const simpanProdukBaru = async () => {
    if (!formBaru.nama) return alert('Nama produk wajib!');
    const kat = kategori.find(k => k.id === formBaru.kategori_id);
    await addDoc(collection(db, 'produk'), {
      kode: formBaru.kode || generateKode(),
      nama: formBaru.nama,
      kategori_id: formBaru.kategori_id || '',
      nama_kategori: kat?.nama || '',
      satuan: formBaru.satuan || 'pcs',
      harga_beli: 0, // karyawan tidak isi harga
      harga_jual: 0,
      stok: parseFloat(formBaru.stok) || 0,
      stok_minimum: 5,
      keterangan: formBaru.keterangan || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    alert('Produk berhasil ditambahkan. Admin perlu mengisi harga jual.');
    setFormBaru(emptyForm); setShowForm(false);
    loadData();
  };

  const updateStokManual = async (id, stokBaru) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'produk', id), { stok: parseFloat(stokBaru) || 0, updatedAt: serverTimestamp() });
    loadData();
  };

  const produkFiltered = produk.filter(p => {
    const matchKat = filterKat ? p.kategori_id === filterKat : true;
    const matchQ   = searchQ   ? p.nama.toLowerCase().includes(searchQ.toLowerCase()) ||
                                  p.kode.toLowerCase().includes(searchQ.toLowerCase()) : true;
    const matchStatus = filterStatus === 'habis' ? p.stok <= 0
                      : filterStatus === 'menipis' ? p.stok > 0 && p.stok <= (p.stok_minimum||5)
                      : filterStatus === 'aman' ? p.stok > (p.stok_minimum||5)
                      : true;
    return matchKat && matchQ && matchStatus;
  });

  const stokHabis   = produk.filter(p => p.stok <= 0).length;
  const stokMenipis = produk.filter(p => p.stok > 0 && p.stok <= (p.stok_minimum||5)).length;

  const pillStyle = (active, color) => ({
    padding: '7px 14px',
    borderRadius: 20,
    border: `1px solid ${active ? color : C.border}`,
    background: active ? color + '20' : 'transparent',
    color: active ? color : C.muted,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontSize: 12,
  });

  return (
    <div style={{ minHeight:'100vh', background:C.bgPage, color:C.text }}>
      <Navbar title="Monitoring Stok" role={isAdmin ? 'admin' : 'kasir'} links={[
        { href:'/kasir', label:'Kasir' },
        ...(isAdmin ? [{ href:'/admin', label:'Admin' }, { href:'/laporan', label:'Laporan' }] : []),
      ]} />

      <div style={{ padding: isMobile ? '16px 14px 80px' : '24px 28px' }}>
        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          {[
            { label:'Total Produk', val:produk.length, color:C.blue, sub:'jenis barang' },
            { label:'Stok Aman', val:produk.length - stokHabis - stokMenipis, color:C.green, sub:'produk' },
            { label:'Stok Menipis', val:stokMenipis, color:C.orange, sub:'perlu restock segera' },
            { label:'Stok Habis', val:stokHabis, color:C.red, sub:'tidak bisa dijual' },
          ].map((m,i) => (
            <div key={i} style={{ background:C.bgCard, borderRadius:14, padding:20, border:`1px solid ${C.border}`,
              boxShadow:S.card.boxShadow }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', marginBottom:6 }}>
                {m.label}
              </div>
              <div style={{ fontSize:28, fontWeight:700, color:m.color }}>{m.val}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Form tambah produk baru (karyawan) */}
        <div style={{ marginBottom:16 }}>
          <button style={{ ...S.btnGold, marginBottom: showForm ? 0 : 0 }}
            onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Tutup Form' : '+ Tambah Produk Baru'}
          </button>
        </div>

        {showForm && (
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.gold, marginBottom:4 }}>
              Input Produk Baru
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
              {isAdmin
                ? 'Sebagai Admin, Anda disarankan mengisi harga melalui halaman Admin.'
                : 'Karyawan hanya bisa menambah jenis & kode stok. Harga akan diisi oleh admin.'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label style={S.label}>Nama Produk *</label>
                <input style={S.input} placeholder="mis. Cat Tembok Dulux 5L"
                  value={formBaru.nama} onChange={e => setFormBaru({...formBaru, nama:e.target.value})} />
              </div>
              <div>
                <label style={S.label}>Kode (kosong = auto)</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input style={S.input} value={formBaru.kode}
                    onChange={e => setFormBaru({...formBaru, kode:e.target.value})} placeholder="Auto" />
                  <button onClick={() => setFormBaru({...formBaru, kode:generateKode()})}
                    style={{ ...S.btnGold, padding:'0 10px', flexShrink:0 }}>⟳</button>
                </div>
              </div>
              <div>
                <label style={S.label}>Kategori</label>
                <select style={S.select} value={formBaru.kategori_id}
                  onChange={e => setFormBaru({...formBaru, kategori_id:e.target.value})}>
                  <option value="">— Pilih —</option>
                  {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Satuan</label>
                <select style={S.select} value={formBaru.satuan}
                  onChange={e => setFormBaru({...formBaru, satuan:e.target.value})}>
                  {['pcs','sak','kg','m','m²','m³','liter','roll','batang','lembar','dus','lusin','unit'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={S.label}>Stok Awal</label>
                <input style={S.input} type="number" placeholder="0"
                  value={formBaru.stok} onChange={e => setFormBaru({...formBaru, stok:e.target.value})} />
              </div>
              <div>
                <label style={S.label}>Keterangan</label>
                <input style={S.input} placeholder="opsional"
                  value={formBaru.keterangan} onChange={e => setFormBaru({...formBaru, keterangan:e.target.value})} />
              </div>
            </div>
            <button style={S.btnGold} onClick={simpanProdukBaru}>Simpan Produk</button>
          </div>
        )}

        {/* Filter */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          <input style={{ ...S.input, width:240 }} placeholder="Cari nama / kode..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          <select style={{ ...S.select, width:160 }} value={filterKat} onChange={e => setFilterKat(e.target.value)}>
            <option value="">Semua Kategori</option>
            {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
          <div style={{ display:'flex', gap:8 }}>
            {[['semua','Semua',C.blue],['aman','Aman',C.green],['menipis','Menipis',C.orange],['habis','Habis',C.red]].map(([v,l,col]) => (
              <button key={v} style={pillStyle(filterStatus===v, col)} onClick={() => setFilterStatus(v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Tabel Stok */}
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:C.gold }}>Memuat stok...</div>
        ) : (
          <div style={S.card}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Kode</th>
                <th style={S.th}>Nama Produk</th>
                <th style={S.th}>Kategori</th>
                <th style={S.th}>Stok</th>
                <th style={S.th}>Min. Stok</th>
                <th style={S.th}>Status</th>
                {isAdmin && <th style={S.th}>Harga Beli</th>}
                {isAdmin && <th style={S.th}>Harga Jual</th>}
                {isAdmin && <th style={S.th}>Edit Stok</th>}
              </tr></thead>
              <tbody>
                {produkFiltered.map(p => {
                  const habis    = p.stok <= 0;
                  const menipis  = p.stok > 0 && p.stok <= (p.stok_minimum||5);
                  const status   = habis ? { l:'Habis', bg:C.redBg, c:C.red }
                                 : menipis ? { l:'Menipis', bg:C.orangeBg, c:C.orange }
                                 : { l:'Aman', bg:C.greenBg, c:C.green };
                  return (
                    <tr key={p.id}>
                      <td style={S.td}>
                        <span style={{ fontFamily:'monospace', background:'#f0f4f8', padding:'2px 8px', borderRadius:6, fontSize:11 }}>
                          {p.kode}
                        </span>
                      </td>
                      <td style={{ ...S.td, fontWeight:600 }}>{p.nama}</td>
                      <td style={S.td}>
                        {p.nama_kategori
                          ? <span style={{ background:C.blueBg, color:C.blue, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>{p.nama_kategori}</span>
                          : <span style={{ color:C.muted }}>—</span>}
                      </td>
                      <td style={{ ...S.td, fontWeight:700, color:status.c }}>
                        {p.stok} {p.satuan}
                      </td>
                      <td style={{ ...S.td, color:C.muted }}>{p.stok_minimum||5} {p.satuan}</td>
                      <td style={S.td}>
                        <span style={{ background:status.bg, color:status.c, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                          {status.l}
                        </span>
                      </td>
                      {isAdmin && <td style={{ ...S.td, color:C.muted }}>{fmt(p.harga_beli)}</td>}
                      {isAdmin && <td style={{ ...S.td, fontWeight:600 }}>{fmt(p.harga_jual)}</td>}
                      {isAdmin && (
                        <td style={S.td}>
                          <EditableStok value={p.stok} onSave={v => updateStokManual(p.id, v)} satuan={p.satuan} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {produkFiltered.length === 0 && (
              <div style={{ textAlign:'center', padding:40, color:C.muted }}>Tidak ada data.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableStok({ value, onSave, satuan }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  if (editing) return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      <input type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} autoFocus
        style={{ width:80, padding:'5px 8px', borderRadius:6, border:`1px solid ${C.border}`,
          background:'#f7fafc', fontSize:13 }} />
      <button onClick={() => { onSave(val); setEditing(false); }}
        style={{ ...S.btnGold, padding:'5px 10px', fontSize:12 }}>✓</button>
      <button onClick={() => setEditing(false)}
        style={{ ...S.btnGhost, padding:'5px 8px', fontSize:12 }}>✕</button>
    </div>
  );
  return (
    <div onClick={() => setEditing(true)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:13 }}>{value} {satuan}</span>
      <span style={{ fontSize:12, color:C.blue }}>✏</span>
    </div>
  );
}
