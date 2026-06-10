import './globals.css';

export const metadata = {
  title: 'AM Bangunan — Sistem Kasir',
  description: 'Sistem Kasir & Manajemen Stok Toko Bahan Bangunan AM Bangunan',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
