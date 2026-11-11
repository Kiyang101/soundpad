'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminRequest } from '@/lib/request';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await adminRequest('login', { username: values.get('username'), password: values.get('password') });
      router.replace('/admin');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'เข้าสู่ระบบไม่สำเร็จ');
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" method="post" action="/api/admin/login" onSubmit={submit}>
      <label>ชื่อผู้ใช้<input name="username" autoComplete="username" required maxLength={80} autoCapitalize="none" /></label>
      <label>รหัสผ่าน<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
    </form>
  );
}
