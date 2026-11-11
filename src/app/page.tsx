import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { Board } from '@/components/board';
import { ConsoleHeader } from '@/components/console';
import { CLIP_BUCKET, type Category, type Pad } from '@/lib/sound';
import { createPublicClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function catalog() {
  const client = createPublicClient();
  const [categories, sounds] = await Promise.all([
    client.from('sound_categories').select('id,name').order('name'),
    client.from('sounds').select('id,name,category_id,duration_ms,clip_path').order('created_at', { ascending: false }),
  ]);
  if (categories.error || sounds.error) {
    console.error('Soundpad catalog unavailable', categories.error?.code ?? sounds.error?.code);
    return { categories: [], pads: [], unavailable: true };
  }
  return {
    categories: categories.data as Category[],
    pads: sounds.data.map((sound): Pad => ({
      id: sound.id, name: sound.name, categoryId: sound.category_id, durationMs: sound.duration_ms,
      url: client.storage.from(CLIP_BUCKET).getPublicUrl(sound.clip_path).data.publicUrl,
    })),
    unavailable: false,
  };
}

export default async function Home() {
  const { categories, pads, unavailable } = await catalog();
  return (
    <main className="shell">
      <ConsoleHeader>
        <Link className="button button-quiet" href="/admin"><LockKeyhole size={16} aria-hidden="true" /> แอดมิน</Link>
      </ConsoleHeader>
      <Board categories={categories} pads={pads} unavailable={unavailable} />
    </main>
  );
}
