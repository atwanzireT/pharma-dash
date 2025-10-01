'use client';

import AuthGate from '@/components/AuthGate';
import Navbar from '@/components/Navbar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate
      // loginPath="/login" // optional: customize
      // requireAnyRole={['inspector','owner','admin']} // optional: role gating
    >
      <Navbar />
      {children}
    </AuthGate>
  );
}
