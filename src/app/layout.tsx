import type { Metadata } from 'next';

import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Root layout. The application shell and its session provider live in the
 * `(app)` route group; the root only supplies global styles and the toast
 * surface so feedback works on the login screen too.
 */
export const metadata: Metadata = {
  title: {
    default: 'SAMJONA · School Management System',
    template: '%s · SAMJONA',
  },
  description:
    'School administration, payroll, fees and finance for small schools in Sierra Leone.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}