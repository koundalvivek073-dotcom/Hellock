import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata = {
  title: 'Vault — Your files, indestructible.',
  description: 'Fault-tolerant distributed object storage with effortless consumer simplicity.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V13H5V8.26l7-3.89v8.62z"/></svg>',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07080d] text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
