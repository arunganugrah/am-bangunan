# PANDUAN INSTALASI & PENGGUNAAN
# Sistem Kasir AM Bangunan
**Versi 1.0 — Next.js + Firebase**

---

## Daftar Isi

1. [Gambaran Sistem](#1-gambaran-sistem)
2. [Persiapan Awal](#2-persiapan-awal)
3. [Bagian A — Setup Proyek Next.js](#3-bagian-a--setup-proyek-nextjs)
4. [Bagian B — Menyambungkan Firebase](#4-bagian-b--menyambungkan-firebase)
5. [Bagian C — Konfigurasi & Jalankan](#5-bagian-c--konfigurasi--jalankan)
6. [Bagian D — Publikasi ke Internet (Vercel)](#6-bagian-d--publikasi-ke-internet-vercel)
7. [Cara Menggunakan Sistem](#7-cara-menggunakan-sistem)
8. [Hak Akses (RBAC)](#8-hak-akses-rbac)
9. [Struktur Folder](#9-struktur-folder)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Gambaran Sistem

**AM Bangunan** adalah sistem kasir dan manajemen stok berbasis web untuk toko bahan bangunan.

### Fitur Utama

| Fitur | Admin | Karyawan |
|---|---|---|
| Login & Autentikasi | ✅ | ✅ |
| Kasir (transaksi penjualan) | ✅ | ✅ |
| Monitoring stok | ✅ | ✅ |
| Tambah produk baru | ✅ | ✅ (tanpa harga) |
| **Laporan keuangan** | ✅ | ❌ |
| **Ubah harga jual** | ✅ | ❌ |
| **Override harga di kasir** | ✅ | ❌ |
| Manajemen karyawan | ✅ | ❌ |
| Pembelian/restock stok | ✅ | ❌ |

### Halaman-halaman

- `/admin-login` — Login untuk semua pengguna
- `/kasir` — Terminal kasir (POS)
- `/stok` — Monitoring & manajemen stok
- `/admin` — Panel admin (produk, kategori, karyawan, pembelian)
- `/laporan` — Laporan keuangan analitik (admin only)

---

## 2. Persiapan Awal

### Yang Dibutuhkan

- **Node.js** versi 18 atau lebih baru — unduh di https://nodejs.org
- **Git** — https://git-scm.com (opsional, untuk deploy ke Vercel)
- **VS Code** — https://code.visualstudio.com (editor yang direkomendasikan)
- Akun **Google** (untuk Firebase)
- Akun **GitHub** (untuk deploy ke Vercel, opsional)

### Cek Versi Node.js

```
node --version
```

Harus menampilkan `v18.x.x` atau lebih tinggi.

---

## 3. Bagian A — Setup Proyek Next.js

> Lewati bagian ini jika Anda sudah memiliki folder proyek dari file yang diberikan.

### A1. Buat Proyek Baru

```bash
# Di Terminal / Command Prompt
cd ~/Projects

# Salin folder am-bangunan yang diberikan, lalu masuk ke dalamnya:
cd am-bangunan

# Install dependensi
npm install
```

Proses `npm install` membutuhkan koneksi internet dan memakan waktu 1–3 menit.

---

## 4. Bagian B — Menyambungkan Firebase

### B1. Buat Proyek Firebase

1. Buka https://console.firebase.google.com
2. Login dengan akun Google Anda.
3. Klik **Add project** → beri nama `am-bangunan` → klik **Continue**.
4. Matikan Google Analytics (lebih simpel) → klik **Create project** → tunggu → **Continue**.

### B2. Daftarkan Aplikasi Web

1. Di halaman proyek, klik ikon **`</>`** (Web).
2. Beri nama `am-bangunan-web`. Jangan centang Firebase Hosting. Klik **Register app**.
3. Muncul objek `firebaseConfig` berisi 6 nilai. **Biarkan halaman ini terbuka.**

### B3. Aktifkan Authentication

1. Menu kiri: **Build > Authentication** → **Get started**.
2. Tab **Sign-in method** → aktifkan **Email/Password** → **Save**.
3. Tab **Users** → **Add user**:
   - Isi **email admin** Anda (mis. `admin@ambangunan.com`)
   - Buat password yang kuat
   - **Catat baik-baik email & password ini!**

### B4. Aktifkan Firestore Database

1. Menu kiri: **Build > Firestore Database** → **Create database**.
2. Pilih lokasi: `asia-southeast1` (Jakarta/Singapura, terdekat dari Indonesia).
3. Pilih **Production mode** → **Enable**.

> **Catatan:** Kami TIDAK menggunakan Firebase Storage untuk menghemat biaya.
> Semua data disimpan di Firestore (tetap gratis di paket Spark).

### B5. Pasang Security Rules Firestore

1. Di Firebase Console: **Firestore Database > Rules**.
2. Hapus semua isi yang ada, ganti dengan isi dari file `firestore.rules`.
3. **Ganti** `EMAIL_ADMIN_ANDA` dengan email admin Anda (yang didaftarkan di B3).
4. Klik **Publish**.

Contoh rules yang sudah diisi:
```
function isAdmin() {
  return request.auth != null &&
         request.auth.token.email == 'namakamu@gmail.com';  // ← email admin
}
```

### B6. Isi Konfigurasi Firebase di Kode

Buka file `lib/firebase.js`:

```bash
code ~/Projects/am-bangunan/lib/firebase.js
```

Ganti 6 nilai `MASUKKAN_...` dengan nilai dari B2:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // dari Firebase Console
  authDomain:        "am-bangunan.firebaseapp.com",
  projectId:         "am-bangunan",
  storageBucket:     "am-bangunan.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc...",
};
```

Simpan file (Ctrl+S / Cmd+S).

### B7. Sesuaikan Email Admin di Kode

Buka dan edit **3 file** berikut, ganti `admin@ambangunan.com` dengan email admin Anda:

```bash
# File 1
code ~/Projects/am-bangunan/app/admin-login/page.js
# Baris: const ADMIN_EMAIL = 'admin@ambangunan.com';

# File 2
code ~/Projects/am-bangunan/app/admin/page.js
# Baris: const ADMIN_EMAIL = 'admin@ambangunan.com';

# File 3
code ~/Projects/am-bangunan/app/kasir/page.js
# Baris: const ADMIN_EMAIL = 'admin@ambangunan.com';

# File 4
code ~/Projects/am-bangunan/app/stok/page.js
# Baris: const ADMIN_EMAIL = 'admin@ambangunan.com';

# File 5
code ~/Projects/am-bangunan/app/laporan/page.js
# Baris: const ADMIN_EMAIL = 'admin@ambangunan.com';
```

---

## 5. Bagian C — Konfigurasi & Jalankan

### C1. Jalankan Server Development

```bash
cd ~/Projects/am-bangunan
npm run dev
```

Tunggu hingga muncul: `✓ Ready on http://localhost:3000`

### C2. Buka di Browser

- **Login admin:** buka `localhost:3000/admin-login`
  - Masukkan email & password admin dari B3
  - Anda akan diarahkan ke `/admin`

### C3. Setup Awal Data

Setelah login sebagai admin, lakukan langkah-langkah ini secara berurutan:

**Langkah 1 — Tambah Kategori**
- Masuk ke `/admin` → tab **Kategori**
- Tambah kategori seperti: Semen, Cat, Pipa, Besi, Kayu, Keramik, dll.

**Langkah 2 — Tambah Produk**
- Tab **Produk & Stok**
- Isi: Nama, Kode (atau klik ⟳ untuk auto-generate), Kategori, Satuan, **Harga Beli (HPP)**, **Harga Jual**, Stok Awal
- Margin akan dihitung otomatis

**Langkah 3 — Tambah Karyawan (opsional)**
- Tab **Karyawan**
- Isi nama, email, password awal, role (kasir)
- Karyawan bisa langsung login di `/admin-login`

**Langkah 4 — Coba Transaksi**
- Buka `localhost:3000/kasir`
- Klik produk, atur jumlah, selesaikan transaksi

**Langkah 5 — Lihat Laporan**
- Buka `localhost:3000/laporan`
- Filter periode bulan/tahun
- Lihat laporan laba rugi dan analitik

---

## 6. Bagian D — Publikasi ke Internet (Vercel)

### D1. Upload Kode ke GitHub

```bash
cd ~/Projects/am-bangunan
git init
git add .
git commit -m "AM Bangunan v1.0"
```

Di GitHub (https://github.com):
- Klik **+** → **New repository**
- Nama: `am-bangunan`, biarkan **kosong** (jangan centang README)
- Klik **Create repository**
- Salin-tempel perintah yang muncul ke Terminal:

```bash
git remote add origin https://github.com/USERNAME-ANDA/am-bangunan.git
git branch -M main
git push -u origin main
```

### D2. Deploy ke Vercel

1. Buka https://vercel.com → Sign up dengan akun GitHub.
2. **Add New > Project** → pilih repo `am-bangunan` → **Import**.
3. Biarkan semua default → **Deploy**. Tunggu 1–2 menit.
4. Anda mendapat link seperti `https://am-bangunan-xxxx.vercel.app`.

### D3. Izinkan Domain Vercel di Firebase

Di Firebase Console: **Authentication > Settings > Authorized domains**
→ klik **Add domain** → masukkan domain Vercel Anda (mis. `am-bangunan-xxxx.vercel.app`)

### D4. Update Kode di Masa Mendatang

```bash
cd ~/Projects/am-bangunan
git add .
git commit -m "update: deskripsi perubahan"
git push
```

Vercel otomatis deploy ulang dalam ~1 menit.
Menambah produk/transaksi melalui aplikasi tidak perlu push — langsung tersimpan ke Firebase.

---

## 7. Cara Menggunakan Sistem

### 7.1 Halaman Kasir (`/kasir`)

1. **Cari produk** — ketik nama atau kode di kolom pencarian
2. **Filter kategori** — klik tombol kategori di atas grid produk
3. **Klik produk** untuk menambah ke keranjang (angka di kanan atas kartu = qty)
4. **Di keranjang** (kanan):
   - Tombol `−` / `+` atau edit angka untuk ubah qty
   - Admin bisa input harga override di kolom yang tersedia
5. Isi **Nama Pembeli** dan **Diskon** (nominal Rp atau persentase %)
6. Isi **Uang Bayar** → kembalian otomatis dihitung
7. Klik **Selesaikan Transaksi** → struk muncul → klik Tutup untuk transaksi berikutnya

### 7.2 Kode Produk (Pengganti Barcode)

Setiap produk memiliki **Kode Unik 8 karakter** (mis. `ABX3K7MN`).
- Di kasir, ketik kode ini di kolom pencarian untuk menemukan produk dengan cepat
- Kode bisa di-print dan ditempel di rak sebagai label harga
- Format: huruf kapital + angka (tanpa karakter membingungkan seperti 0/O atau 1/I)

### 7.3 Pembelian / Restock (`/admin` → Pembelian Stok)

1. Pilih produk yang dibeli
2. Isi jumlah dan harga beli per satuan
3. Isi nama pemasok
4. Klik **Simpan** → stok otomatis bertambah, HPP tercatat

### 7.4 Laporan Keuangan (`/laporan`)

**Tab Ringkasan Eksekutif:**
- KPI utama: Omzet, HPP, Laba Kotor, Nilai Inventori
- Tren mingguan dalam periode
- Perbandingan dengan bulan sebelumnya
- Laporan Laba Rugi formal
- Insight & rekomendasi otomatis

**Tab Riwayat Transaksi:**
- Daftar semua transaksi periode ini
- Detail item, HPP, dan laba per transaksi

**Tab Analitik Produk:**
- Peringkat produk terlaris
- Kontribusi per produk terhadap omzet
- Peringatan stok menipis/habis

---

## 8. Hak Akses (RBAC)

### Admin (Pemilik)

- Mengakses **semua halaman** tanpa pembatasan
- Bisa **ubah harga** produk kapan saja
- Bisa **override harga** langsung di halaman kasir saat transaksi
- Bisa lihat **Laporan Keuangan** (omzet, HPP, laba)
- Bisa **tambah/nonaktifkan karyawan**
- Bisa catat **pembelian/restock stok**

### Karyawan (Kasir)

- Hanya akses halaman: **Kasir** dan **Stok**
- Bisa **tambah produk baru** (nama, kode, satuan — tanpa harga)
- **TIDAK bisa** melihat Laporan Keuangan
- **TIDAK bisa** mengubah atau melihat harga beli
- **TIDAK bisa** override harga di kasir
- **TIDAK bisa** mengakses halaman Admin

### Cara Menambah Karyawan

1. Login sebagai admin → `/admin` → tab **Karyawan**
2. Isi Nama, Email, Password Awal, Role: Kasir
3. Klik **+ Tambah Karyawan**
4. Karyawan bisa langsung login di `/admin-login` menggunakan email & password yang didaftarkan

### Cara Nonaktifkan Karyawan

Di tab **Karyawan**, klik tombol **Nonaktifkan** di baris karyawan tersebut.
Karyawan yang dinonaktifkan tidak bisa login (akan muncul pesan error).

---

## 9. Struktur Folder

```
am-bangunan/
├── app/
│   ├── layout.js              ← Layout global
│   ├── globals.css            ← CSS dasar
│   ├── page.js                ← Redirect otomatis ke kasir/login
│   ├── admin-login/
│   │   └── page.js            ← Halaman login semua pengguna
│   ├── admin/
│   │   └── page.js            ← Panel admin (produk, karyawan, dll)
│   ├── kasir/
│   │   └── page.js            ← Terminal kasir (POS)
│   ├── stok/
│   │   └── page.js            ← Monitoring stok
│   └── laporan/
│       └── page.js            ← Laporan keuangan (admin only)
├── components/
│   ├── theme.js               ← Token desain, format angka, helper
│   └── Navbar.js              ← Navigasi atas
├── lib/
│   └── firebase.js            ← Konfigurasi Firebase ← EDIT DI SINI
├── firestore.rules            ← Rules keamanan Firestore ← COPY KE FIREBASE
├── next.config.js
├── package.json
└── PANDUAN.md                 ← File ini
```

### Koleksi di Firestore

| Koleksi | Isi | Siapa bisa tulis |
|---|---|---|
| `produk` | Data produk, harga, stok | Admin (buat & edit harga), Karyawan (buat saja) |
| `kategori` | Kategori produk | Admin only |
| `transaksi` | Riwayat penjualan | Semua login (kasir) |
| `pembelian_stok` | Riwayat restock (HPP) | Admin only |
| `karyawan` | Data akun karyawan | Admin only |

---

## 10. Troubleshooting

### Error: "Cannot find module firebase"

```bash
cd ~/Projects/am-bangunan
npm install
```

### Gagal login: "auth/invalid-credential"

- Pastikan email & password sesuai dengan yang didaftarkan di Firebase Authentication
- Cek apakah email admin di kode (`ADMIN_EMAIL`) sama persis dengan yang di Firebase

### Halaman redirect ke login terus

- Pastikan `lib/firebase.js` sudah diisi dengan nilai config yang benar dari Firebase Console
- Buka browser DevTools (F12) → Console, baca pesan error-nya

### Error saat deploy Vercel: "Module not found @/lib/firebase"

- Pastikan file `lib/firebase.js` sudah ada di folder proyek
- Cek `next.config.js` sudah ada

### Produk tidak muncul di kasir

- Pastikan sudah menambah produk dari `/admin` → Produk & Stok
- Produk yang ditambah karyawan (tanpa harga jual) tidak akan bisa diproses di kasir — admin harus isi harga terlebih dahulu

### Stok tidak berkurang setelah transaksi

- Pastikan aturan Firestore Rules sudah di-publish dengan benar
- Cek Console browser untuk pesan error

### Laporan keuangan kosong

- Pastikan Anda login sebagai **Admin** (bukan karyawan)
- Pilih periode bulan & tahun yang benar
- Laporan hanya mengambil data dari koleksi `transaksi` dan `pembelian_stok`

---

## Catatan Biaya Firebase

Aplikasi ini menggunakan **paket Spark (gratis)** Firebase dengan batasan:
- Firestore: 50.000 pembacaan / hari, 20.000 penulisan / hari
- Authentication: tanpa batas
- **TIDAK** menggunakan Firebase Storage (berbayar sejak Feb 2026)

Untuk toko dengan ~100–500 transaksi/hari, paket gratis sudah lebih dari cukup.

---

*Dibuat untuk AM Bangunan — Sistem Kasir v1.0*
