import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { ConsoleHeader } from '@/components/console';
import { LoginForm } from '@/components/login-form';
import { createSessionClient, hasAdminSession } from '@/lib/supabase/server';

export const metadata = { title: 'เข้าสู่ระบบแอดมิน | Soundpad' };

export default async function Login() {
  if (await hasAdminSession(await createSessionClient())) redirect('/admin');
  return (
    <main className="shell">
      <ConsoleHeader><Link href="/" className="button button-quiet"><ArrowLeft size={17} /> หน้าเล่น</Link></ConsoleHeader>
      <section className="login panel">
        <div className="brand-icon"><LockKeyhole size={22} aria-hidden="true" /></div>
        <h1>เข้าสู่ระบบแอดมิน</h1>
        <LoginForm />
      </section>
    </main>
  );
}
