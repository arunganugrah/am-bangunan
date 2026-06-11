import PWARegister from '@/components/PWARegister';
import './globals.css';

// ✅ Satu object metadata yang lengkap dan benar
export const metadata = {
  title: 'AM Bangunan — Sistem Kasir',
  description: 'Sistem Kasir & Manajemen Stok Toko Bahan Bangunan AM Bangunan',
  manifest: '/manifest.json',
  themeColor: '#f6c90e',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AM Bangunan',
  },
};

// ✅ Hanya satu RootLayout, PWARegister dipanggil di dalam body
export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#f6c90e" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AM Bangunan" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
        <meta name="msapplication-TileColor" content="#0f1c2b" />
      </head>
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}