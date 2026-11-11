import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Manager } from '@/components/manager';
import { ConsoleHeader } from '@/components/console';
import { soundColumns } from '@/lib/library';
import { createSessionClient, hasAdminSession } from '@/lib/supabase/server';
import type { Category, Sound } from '@/lib/sound';

export const metadata = { title: 'จัดการคลังเสียง | Soundpad' };

export default async function Admin() {
  const client = await createSessionClient();
  if (!await hasAdminSession(client)) redirect('/admin/login');
  const [categories, sounds] = await Promise.all([
    client.from('sound_categories').select('id,name').order('name'),
    client.from('sounds').select(soundColumns).order('created_at', { ascending: false }),
  ]);

  return (
    <main className="shell">
      <ConsoleHeader><Link href="/" className="button button-quiet"><ArrowLeft size={17} /> หน้าเล่น</Link></ConsoleHeader>
      {categories.error || sounds.error ? (
        <section className="panel empty-state"><p>โหลดคลังเสียงไม่ได้</p><a className="button" href="/admin">ลองโหลดใหม่</a></section>
      ) : <Manager initialCategories={categories.data as Category[]} initialSounds={sounds.data as Sound[]} />}
    </main>
  );
}
