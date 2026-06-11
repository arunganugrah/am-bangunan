'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, updateDoc, addDoc,
  doc, serverTimestamp, query, orderBy, where
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { C, S, fmt, fmtTgl, generateKode } from '@/components/theme';

const ADMIN_EMAIL = 'admin@ambangunan.com'; // ← samakan

export default function ManajerStokPage() {
  const router = useRouter();
  const [user, setUser]         = useState(null);
  const [produk, setProduk]     = useState([]);
  const [kategori, setKategori] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState(0);
  const [searchQ, setSearchQ]   = useState('');
  const [filterKat, setFilterKat] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [sukses, setSukses]     = useState('');

  // Form penyesuaian stok
  const [formSesuai, setFormSesuai] = useState({
    produk_id: '', jumlah_aktual: '', catatan: ''
  });

  // Form tambah produk baru
  const emptyForm = { kode:'', nama:'', satuan:'pcs', stok:'', kategori_id:'', keterangan:'' };
  const [formBaru, setFormBaru] = useState(emptyForm);
  const [showFormBaru, setShowFormBaru] = useState(false);

  // Riwayat penyesuaian stok
  const [riwayat, setRiwayat] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) { router.push('/admin-login'); return; }

  // Cek apakah admin
    const isAdminUser = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (isAdminUser) {
      setUser(u);
      loadData();
      return;
    }

    // Cek role karyawan — pakai where agar efisien dan tidak gagal rules
    try {
      const q = query(
        collection(db, 'karyawan'),
        where('email', '==', u.email.toLowerCase())
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        router.push('/kasir');
        return;
      }

      const data = snap.docs[0].data();

      if (data.aktif === false) {
        await auth.signOut();
        router.push('/admin-login');
        return;
      }

      if (data.role !== 'manajer_stok') {
        router.push('/kasir');
        return;
      }

      setUser(u);
      loadData();

    } catch (err) {
      console.error('Gagal cek role:', err.message);
      router.push('/admin-login');
    }
    });
    return unsub;
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const pSnap = await getDocs(query(collection(db, 'produk'), orderBy('nama')));
      const kSnap = await getDocs(collection(db, 'kategori'));
      setProduk(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setKategori(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      try {
        const bSnap = await getDocs(query(collection(db, 'pembelian_stok'), orderBy('tanggal', 'desc')));
        setPembelian(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('pembelian_stok:', e.message);
        setPembelian([]);
      }

      try {
        const rSnap = await getDocs(query(collection(db, 'penyesuaian_stok'), orderBy('tanggal', 'desc')));
        setRiwayat(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('penyesuaian_stok:', e.message);
        setRiwayat([]);
      }

    } catch (err) {
      console.error('loadData error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Penyesuaian stok (stock opname)
  const simpanPenyesuaian = async () => {
    const { produk_id, jumlah_aktual, catatan } = formSesuai;
    if (!produk_id) return alert('Pilih produk!');
    if (jumlah_aktual === '') return alert('Isi jumlah stok aktual!');

    const p = produk.find(x => x.id === produk_id);
    const aktual = parseFloat(jumlah_aktual);
    const selisih = aktual - (p?.stok || 0);

    try {
      await addDoc(collection(db, 'penyesuaian_stok'), {
        tanggal: serverTimestamp(),
        produk_id,
        nama_produk: p?.nama || '',
        stok_sistem: p?.stok || 0,
        stok_aktual: aktual,
        selisih,
        catatan: catatan || '',
        dicatat_oleh: user?.email || '',
      });

      await updateDoc(doc(db, 'produk', produk_id), {
        stok: aktual,
        updatedAt: serverTimestamp(),
      });

      setSukses(`Stok ${p?.nama} diperbarui: ${p?.stok} → ${aktual} (selisih: ${selisih > 0 ? '+' : ''}${selisih})`);
      setFormSesuai({ produk_id: '', jumlah_aktual: '', catatan: '' });
      setTimeout(() => setSukses(''), 5000);
      loadData();

    } catch (err) {
      alert('Gagal simpan penyesuaian: ' + err.message);
    }
  };

  // Tambah produk baru (tanpa harga)
  const simpanProdukBaru = async () => {
    if (!formBaru.nama) return alert('Nama produk wajib!');
    const kat = kategori.find(k => k.id === formBaru.kategori_id);
    try {
      await addDoc(collection(db, 'produk'), {
        kode: formBaru.kode || generateKode(),
        nama: formBaru.nama,
        kategori_id: formBaru.kategori_id || '',
        nama_kategori: kat?.nama || '',
        satuan: formBaru.satuan || 'pcs',
        harga_beli: 0,
        harga_jual: 0,
        stok: parseFloat(formBaru.stok) || 0,
        stok_minimum: 5,
        keterangan: formBaru.keterangan || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSukses('Produk berhasil ditambahkan. Admin perlu mengisi harga jual.');
      setFormBaru(emptyForm);
      setShowFormBaru(false);
      setTimeout(() => setSukses(''), 5000);
      loadData();
    } catch (err) {
      alert('Gagal tambah produk: ' + err.message);
    }
  };

  const produkFiltered = produk.filter(p => {
    const matchKat    = filterKat ? p.kategori_id === filterKat : true;
    const matchQ      = searchQ   ? p.nama.toLowerCase().includes(searchQ.toLowerCase()) ||
                                    p.kode.toLowerCase().includes(searchQ.toLowerCase()) : true;
    const matchStatus = filterStatus === 'habis'   ? p.stok <= 0
                      : filterStatus === 'menipis' ? p.stok > 0 && p.stok <= (p.stok_minimum || 5)
                      : filterStatus === 'aman'    ? p.stok > (p.stok_minimum || 5)
                      : true;
    return matchKat && matchQ && matchStatus;
  });

  const stokHabis   = produk.filter(p => p.stok <= 0).length;
  const stokMenipis = produk.filter(p => p.stok > 0 && p.stok <= (p.stok_minimum || 5)).length;
  const nilaiStok   = produk.reduce((s, p) => s + (p.stok || 0) * (p.harga_beli || 0), 0);

  const tabStyle = (active) => ({
    padding: '11px 20px', background: 'none', border: 'none',
    borderBottom: active ? `3px solid ${C.gold}` : '3px solid transparent',
    color: active ? C.gold : C.muted,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer', fontSize: 14,
  });

  const pillStyle = (active, color) => ({
    padding: '7px 14px', borderRadius: 20,
    border: `1px solid ${active ? color : C.border}`,
    background: active ? color + '20' : 'transparent',
    color: active ? color : C.muted,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer', fontSize: 12,
  });

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.gold, fontSize: 16, fontWeight: 600 }}>Memuat data...</div>
    </div>
  );

  const produkDipilih = produk.find(p => p.id === formSesuai.produk_id);

  return (
    <div style={{ minHeight: '100vh', background: C.bgPage, color: C.text }}>
      <Navbar title="Manajer Stok" role="kasir" links={[]} />

      <div style={{ padding: '24px 28px' }}>

        {/* Notifikasi sukses */}
        {sukses && (
          <div style={{
            background: C.greenBg, border: `1px solid ${C.green}`,
            borderRadius: 10, padding: '12px 18px', marginBottom: 16,
            color: C.green, fontWeight: 600, fontSize: 13,
          }}>
            {sukses}
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Produk',   val: produk.length,                             color: C.blue,   sub: 'jenis barang' },
            { label: 'Stok Aman',      val: produk.length - stokHabis - stokMenipis,   color: C.green,  sub: 'produk' },
            { label: 'Stok Menipis',   val: stokMenipis,                               color: C.orange, sub: 'perlu restock' },
            { label: 'Stok Habis',     val: stokHabis,                                 color: C.red,    sub: 'tidak bisa dijual' },
          ].map((m, i) => (
            <div key={i} style={{ background: C.bgCard, borderRadius: 14, padding: 20,
              border: `1px solid ${C.border}`, boxShadow: S.card.boxShadow }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 0.5,
                textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.val}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
          {['Daftar Stok', 'Penyesuaian Stok', 'Tambah Produk Baru', 'Riwayat Pembelian', 'Riwayat Penyesuaian'].map((t, i) => (
            <button key={i} style={tabStyle(tab === i)} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>

        {/* ══ TAB 0: DAFTAR STOK ══ */}
        {tab === 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...S.input, width: 240 }} placeholder="Cari nama / kode..."
                value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <select style={{ ...S.select, width: 160 }} value={filterKat} onChange={e => setFilterKat(e.target.value)}>
                <option value="">Semua Kategori</option>
                {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['semua','Semua',C.blue],['aman','Aman',C.green],['menipis','Menipis',C.orange],['habis','Habis',C.red]].map(([v,l,col]) => (
                  <button key={v} style={pillStyle(filterStatus === v, col)} onClick={() => setFilterStatus(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Kode</th>
                  <th style={S.th}>Nama Produk</th>
                  <th style={S.th}>Kategori</th>
                  <th style={S.th}>Stok</th>
                  <th style={S.th}>Min. Stok</th>
                  <th style={S.th}>Satuan</th>
                  <th style={S.th}>Status</th>
                </tr></thead>
                <tbody>
                  {produkFiltered.map(p => {
                    const habis   = p.stok <= 0;
                    const menipis = p.stok > 0 && p.stok <= (p.stok_minimum || 5);
                    const status  = habis   ? { l: 'Habis',   bg: C.redBg,    c: C.red }
                                  : menipis ? { l: 'Menipis', bg: C.orangeBg, c: C.orange }
                                  :           { l: 'Aman',    bg: C.greenBg,  c: C.green };
                    return (
                      <tr key={p.id}>
                        <td style={S.td}>
                          <span style={{ fontFamily: 'monospace', background: '#f0f4f8',
                            padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>{p.kode}</span>
                        </td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{p.nama}</td>
                        <td style={S.td}>
                          {p.nama_kategori
                            ? <span style={{ background: C.blueBg, color: C.blue, padding: '2px 8px',
                                borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.nama_kategori}</span>
                            : <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: status.c }}>{p.stok}</td>
                        <td style={{ ...S.td, color: C.muted }}>{p.stok_minimum || 5}</td>
                        <td style={{ ...S.td, color: C.muted }}>{p.satuan}</td>
                        <td style={S.td}>
                          <span style={{ background: status.bg, color: status.c,
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                            {status.l}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {produkFiltered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Tidak ada data.</div>
              )}
            </div>
          </>
        )}

        {/* ══ TAB 1: PENYESUAIAN STOK (STOCK OPNAME) ══ */}
        {tab === 1 && (
          <>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.gold, marginBottom: 4 }}>
                Penyesuaian Stok (Stock Opname)
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
                Input jumlah stok aktual hasil hitung fisik. Sistem akan menyesuaikan dan mencatat selisihnya.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={S.label}>Pilih Produk</label>
                  <select style={S.select} value={formSesuai.produk_id}
                    onChange={e => setFormSesuai({ ...formSesuai, produk_id: e.target.value, jumlah_aktual: '' })}>
                    <option value="">-- Pilih Produk --</option>
                    {produk.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nama} (stok sistem: {p.stok} {p.satuan})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Jumlah Aktual (hasil hitung)</label>
                  <input style={S.input} type="number" step="0.01" placeholder="0"
                    value={formSesuai.jumlah_aktual}
                    onChange={e => setFormSesuai({ ...formSesuai, jumlah_aktual: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Catatan</label>
                  <input style={S.input} placeholder="mis. hasil hitung opname bulan Juni"
                    value={formSesuai.catatan}
                    onChange={e => setFormSesuai({ ...formSesuai, catatan: e.target.value })} />
                </div>
              </div>

              {/* Preview selisih */}
              {produkDipilih && formSesuai.jumlah_aktual !== '' && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 12, marginBottom: 16,
                }}>
                  <div style={{ background: '#f7fafc', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>STOK DI SISTEM</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.blue }}>
                      {produkDipilih.stok} <span style={{ fontSize: 13 }}>{produkDipilih.satuan}</span>
                    </div>
                  </div>
                  <div style={{ background: '#f7fafc', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>STOK AKTUAL</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>
                      {formSesuai.jumlah_aktual} <span style={{ fontSize: 13 }}>{produkDipilih.satuan}</span>
                    </div>
                  </div>
                  <div style={{ background: '#f7fafc', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>SELISIH</div>
                    <div style={{ fontSize: 22, fontWeight: 700,
                      color: (parseFloat(formSesuai.jumlah_aktual) - produkDipilih.stok) > 0 ? C.green
                           : (parseFloat(formSesuai.jumlah_aktual) - produkDipilih.stok) < 0 ? C.red
                           : C.muted }}>
                      {parseFloat(formSesuai.jumlah_aktual) - produkDipilih.stok > 0 ? '+' : ''}
                      {(parseFloat(formSesuai.jumlah_aktual) - produkDipilih.stok).toFixed(2)}
                      <span style={{ fontSize: 13 }}> {produkDipilih.satuan}</span>
                    </div>
                  </div>
                </div>
              )}

              <button style={S.btnGold} onClick={simpanPenyesuaian}>
                Simpan Penyesuaian Stok
              </button>
            </div>

            {/* Produk dengan selisih — perlu perhatian */}
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.orange, marginBottom: 14 }}>
                Produk Perlu Perhatian
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Produk</th>
                  <th style={S.th}>Stok Saat Ini</th>
                  <th style={S.th}>Min. Stok</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Aksi Cepat</th>
                </tr></thead>
                <tbody>
                  {produk.filter(p => p.stok <= (p.stok_minimum || 5))
                    .sort((a, b) => a.stok - b.stok)
                    .map(p => (
                    <tr key={p.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{p.nama}</td>
                      <td style={{ ...S.td, color: p.stok <= 0 ? C.red : C.orange, fontWeight: 700 }}>
                        {p.stok} {p.satuan}
                      </td>
                      <td style={{ ...S.td, color: C.muted }}>{p.stok_minimum || 5} {p.satuan}</td>
                      <td style={S.td}>
                        <span style={{
                          background: p.stok <= 0 ? C.redBg : C.orangeBg,
                          color: p.stok <= 0 ? C.red : C.orange,
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        }}>
                          {p.stok <= 0 ? 'Habis' : 'Menipis'}
                        </span>
                      </td>
                      <td style={S.td}>
                        <button
                          style={{ ...S.btnGold, fontSize: 12, padding: '6px 12px' }}
                          onClick={() => {
                            setFormSesuai({ produk_id: p.id, jumlah_aktual: '', catatan: '' });
                          }}>
                          Sesuaikan
                        </button>
                      </td>
                    </tr>
                  ))}
                  {produk.filter(p => p.stok <= (p.stok_minimum || 5)).length === 0 && (
                    <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.green, padding: 20, fontWeight: 600 }}>
                      Semua stok dalam kondisi aman.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══ TAB 2: TAMBAH PRODUK BARU ══ */}
        {tab === 2 && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.gold, marginBottom: 4 }}>
              Tambah Produk Baru
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
              Harga beli dan harga jual akan diisi oleh Admin setelah produk dibuat.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Nama Produk *</label>
                <input style={S.input} placeholder="mis. Cat Tembok Dulux 5L"
                  value={formBaru.nama} onChange={e => setFormBaru({ ...formBaru, nama: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Kode (kosong = auto)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={S.input} value={formBaru.kode}
                    onChange={e => setFormBaru({ ...formBaru, kode: e.target.value })} placeholder="Auto" />
                  <button onClick={() => setFormBaru({ ...formBaru, kode: generateKode() })}
                    style={{ ...S.btnGold, padding: '0 10px', flexShrink: 0 }}>⟳</button>
                </div>
              </div>
              <div>
                <label style={S.label}>Kategori</label>
                <select style={S.select} value={formBaru.kategori_id}
                  onChange={e => setFormBaru({ ...formBaru, kategori_id: e.target.value })}>
                  <option value="">— Pilih —</option>
                  {kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Satuan</label>
                <select style={S.select} value={formBaru.satuan}
                  onChange={e => setFormBaru({ ...formBaru, satuan: e.target.value })}>
                  {['pcs','sak','kg','m','m²','m³','liter','roll','batang','lembar','dus','lusin','unit'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={S.label}>Stok Awal</label>
                <input style={S.input} type="number" placeholder="0"
                  value={formBaru.stok} onChange={e => setFormBaru({ ...formBaru, stok: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Keterangan</label>
                <input style={S.input} placeholder="opsional"
                  value={formBaru.keterangan} onChange={e => setFormBaru({ ...formBaru, keterangan: e.target.value })} />
              </div>
            </div>
            <button style={S.btnGold} onClick={simpanProdukBaru}>Simpan Produk Baru</button>
          </div>
        )}

        {/* ══ TAB 3: RIWAYAT PEMBELIAN ══ */}
        {tab === 3 && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
              Riwayat Pembelian / Restock
            </div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Tanggal</th>
                <th style={S.th}>Produk</th>
                <th style={S.th}>Pemasok</th>
                <th style={S.th}>Jumlah</th>
                <th style={S.th}>Total Bayar</th>
              </tr></thead>
              <tbody>
                {pembelian.map(b => (
                  <tr key={b.id}>
                    <td style={{ ...S.td, color: C.muted, fontSize: 12 }}>{fmtTgl(b.tanggal)}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{b.nama_produk}</td>
                    <td style={S.td}>{b.pemasok}</td>
                    <td style={S.td}>{b.jumlah} {b.satuan}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: C.orange }}>{fmt(b.total_bayar)}</td>
                  </tr>
                ))}
                {pembelian.length === 0 && (
                  <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.muted, padding: 30 }}>
                    Belum ada riwayat pembelian.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ TAB 4: RIWAYAT PENYESUAIAN ══ */}
        {tab === 4 && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
              Riwayat Penyesuaian Stok
            </div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Tanggal</th>
                <th style={S.th}>Produk</th>
                <th style={S.th}>Stok Sistem</th>
                <th style={S.th}>Stok Aktual</th>
                <th style={S.th}>Selisih</th>
                <th style={S.th}>Catatan</th>
                <th style={S.th}>Dicatat Oleh</th>
              </tr></thead>
              <tbody>
                {riwayat.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...S.td, color: C.muted, fontSize: 12 }}>{fmtTgl(r.tanggal)}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.nama_produk}</td>
                    <td style={{ ...S.td, color: C.muted }}>{r.stok_sistem}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.stok_aktual}</td>
                    <td style={{ ...S.td, fontWeight: 700,
                      color: r.selisih > 0 ? C.green : r.selisih < 0 ? C.red : C.muted }}>
                      {r.selisih > 0 ? '+' : ''}{r.selisih?.toFixed(2)}
                    </td>
                    <td style={{ ...S.td, color: C.muted }}>{r.catatan || '—'}</td>
                    <td style={{ ...S.td, fontSize: 12, color: C.muted }}>{r.dicatat_oleh?.split('@')[0]}</td>
                  </tr>
                ))}
                {riwayat.length === 0 && (
                  <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: C.muted, padding: 30 }}>
                    Belum ada riwayat penyesuaian.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}