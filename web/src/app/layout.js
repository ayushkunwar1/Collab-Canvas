import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata = {
  title: 'CollabCanvas — Think together. Build together.',
  description: 'A persistent, real-time collaborative idea workspace.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
