import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Compliance Management System',
  description: 'Track and validate device compliance submissions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
