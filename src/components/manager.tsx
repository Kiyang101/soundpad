'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AudioLines, Download, Link2, LogOut, Plus, Upload } from 'lucide-react';
import { adminRequest } from '@/lib/request';
import { formatTime, SOURCE_BUCKET, uploadSpec, type AudioDetails, type Category, type Sound, type UploadTicket } from '@/lib/sound';
import { SoundEditor } from './sound-editor';
import { youtubeVideoUrl } from '@/lib/youtube-url';

type Selected = { sound: Sound; details: AudioDetails };

async function uploadFile(file: File, ticket: UploadTicket, onProgress: (percent: number) => void) {
  const { Upload } = await import('tus-js-client');
  const spec = uploadSpec(file.name, file.size);
  if (!spec) throw new Error('เลือกไฟล์ MP3, WAV หรือ M4A ขนาดไม่เกิน 50 MB');
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: ticket.endpoint,
      headers: { 'x-signature': ticket.token },
      metadata: {
        bucketName: SOURCE_BUCKET, objectName: ticket.path, contentType: spec.mime, cacheControl: '60',
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10_000],
      removeFingerprintOnSuccess: true,
      fingerprint: async () => `soundpad:${ticket.endpoint}:${ticket.path}:${file.name}:${file.size}:${file.lastModified}`,
      onProgress: (sent, total) => onProgress(Math.floor(sent / total * 100)),
      onError: () => reject(new Error('อัปโหลดไม่สำเร็จ เลือกไฟล์เดิมจากรายการร่างเพื่ออัปโหลดต่อ')),
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, () => upload.start());
  });
}

export function Manager({ initialCategories, initialSounds }: { initialCategories: Category[]; initialSounds: Sound[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [sounds, setSounds] = useState(initialSounds);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [categoryEdit, setCategoryEdit] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const resume = useRef<Sound | null>(null);

  function upsert(sound: Sound) {
    setSounds((current) => current.some((item) => item.id === sound.id)
      ? current.map((item) => item.id === sound.id ? sound : item) : [sound, ...current]);
  }

  async function run(operation: string, work: () => Promise<void>) {
    setBusy(operation);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function openSound(sound: Sound) {
    if (sound.source_duration_ms !== null) {
      setSelected({ sound, details: await adminRequest<AudioDetails>('library', { action: 'sounds.details', id: sound.id }) });
    } else {
      const analyzed = await adminRequest<Selected>('audio', { action: 'analyze', id: sound.id });
      upsert(analyzed.sound);
      setSelected(analyzed);
    }
    requestAnimationFrame(() => document.getElementById('sound-editor')?.scrollIntoView({ block: 'start' }));
  }

  function chooseFile(sound: Sound | null = null) {
    resume.current = sound;
    fileInput.current?.click();
  }

  async function processFile(file: File) {
    const draft = resume.current;
    resume.current = null;
    await run('upload', async () => {
      if (!uploadSpec(file.name, file.size)) throw new Error('เลือกไฟล์ MP3, WAV หรือ M4A ขนาดไม่เกิน 50 MB');
      const ticket = await adminRequest<UploadTicket>('library', {
        action: 'sounds.upload', id: draft?.id, fileName: file.name, bytes: file.size,
      });
      upsert(ticket.sound);
      setProgress(0);
      try {
        await uploadFile(file, ticket, setProgress);
      } finally {
        setProgress(null);
      }
      setBusy('analyze');
      await openSound(ticket.sound);
    });
  }

  function importYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = youtubeVideoUrl(youtubeUrl);
    if (!url) { setError('วางลิงก์วิดีโอ YouTube หรือ youtu.be ที่ถูกต้อง'); return; }
    void run('youtube', async () => {
      try {
        const imported = await adminRequest<Selected>('youtube', { url });
        upsert(imported.sound);
        setSelected(imported);
        setYoutubeUrl('');
        requestAnimationFrame(() => document.getElementById('sound-editor')?.scrollIntoView({ block: 'start' }));
      } catch (failure) {
        const fresh = await adminRequest<Sound[]>('library', { action: 'sounds.list' }).catch(() => null);
        if (fresh) setSounds(fresh);
        throw failure;
      }
    });
  }

  function save(name: string, categoryId: string, startMs: number, endMs: number, asNew = false) {
    if (!selected) return;
    void run('save', async () => {
      let { sound, details } = selected;
      if (asNew && sound.status === 'ready') {
        const copied = await adminRequest<Selected>('library', { action: 'sounds.copy', id: sound.id, revision: sound.revision });
        sound = copied.sound;
        details = copied.details;
        upsert(sound);
        setSelected({ sound: { ...sound, name, category_id: categoryId, trim_start_ms: startMs, trim_end_ms: endMs }, details });
      }
      const meta = { id: sound.id, revision: sound.revision, name, categoryId };
      const saved = sound.status === 'ready' && sound.trim_start_ms === startMs && sound.trim_end_ms === endMs
        ? await adminRequest<Sound>('library', { action: 'sounds.rename', ...meta })
        : await adminRequest<Sound>('audio', { action: 'save', ...meta, startMs, endMs });
      upsert(saved);
      setSelected({ sound: saved, details });
      setMessage(asNew ? 'บันทึกเป็นเสียงใหม่แล้ว' : 'บันทึกเสียงแล้ว');
    });
  }

  function removeSound(sound: Sound) {
    void run('delete', async () => {
      setConfirm('');
      try {
        await adminRequest('library', { action: 'sounds.delete', id: sound.id, revision: sound.revision });
      } catch (failure) {
        const fresh = await adminRequest<Sound[]>('library', { action: 'sounds.list' }).catch(() => null);
        if (fresh) setSounds(fresh);
        if (selected?.sound.id === sound.id && fresh?.find((item) => item.id === sound.id)?.status === 'deleting') setSelected(null);
        throw failure;
      }
      setSounds((items) => items.filter((item) => item.id !== sound.id));
      if (selected?.sound.id === sound.id) setSelected(null);
      setMessage('ลบเสียงแล้ว');
    });
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('category', async () => {
      const category = await adminRequest<Category>('library', {
        action: categoryEdit ? 'categories.rename' : 'categories.add', id: categoryEdit?.id, name: categoryName,
      });
      setCategories((items) => [...items.filter((item) => item.id !== category.id), category]
        .sort((a, b) => a.name.localeCompare(b.name, 'th')));
      setCategoryName('');
      setCategoryEdit(null);
      setMessage('บันทึกหมวดหมู่แล้ว');
    });
  }

  function removeCategory(category: Category) {
    void run('category', async () => {
      setConfirm('');
      await adminRequest('library', { action: 'categories.delete', id: category.id });
      setCategories((items) => items.filter((item) => item.id !== category.id));
      if (categoryEdit?.id === category.id) { setCategoryEdit(null); setCategoryName(''); }
      setMessage('ลบหมวดหมู่แล้ว');
    });
  }

  const locked = Boolean(busy);
  return (
    <>
      <div className="admin-title">
        <h1>จัดการคลังเสียง</h1>
        <button className="button button-quiet" disabled={locked} onClick={() => void run('logout', async () => {
          await adminRequest('login', {}, 'DELETE');
          router.replace('/admin/login');
          router.refresh();
        })}><LogOut size={16} /> ออกจากระบบ</button>
      </div>

      <div className="admin-grid">
        <div className="admin-main">
          <section className="panel" aria-labelledby="youtube-title" aria-busy={busy === 'youtube'}>
            <div className="panel-heading"><div><h2 id="youtube-title">นำเข้าเสียงจาก YouTube</h2>
              <p>วางลิงก์วิดีโอสาธารณะไม่เกิน 30 นาที แล้วฟังและเลือกช่วงก่อนบันทึก</p></div></div>
            <form className="youtube-form" onSubmit={importYoutube}>
              <label>ลิงก์ YouTube<input type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=…" maxLength={2048} required disabled={locked} /></label>
              <button className="button button-primary" type="submit" disabled={locked || !youtubeUrl.trim()}>
                <Link2 size={17} /> {busy === 'youtube' ? 'กำลังนำเข้า…' : 'นำเข้าเสียง'}
              </button>
            </form>
            {busy === 'youtube' && <p className="hint import-status" role="status">กำลังดึงและเตรียมเสียงจาก YouTube อาจใช้เวลาสักครู่ กรุณาเปิดหน้านี้ไว้</p>}
          </section>
          <section className="panel">
            <div className="panel-heading"><div><h2>อัปโหลดเสียง</h2><p>MP3, WAV หรือ M4A · ไม่เกิน 50 MB และ 30 นาที</p></div></div>
            <input ref={fileInput} hidden type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void processFile(file);
              }} />
            <button className="button button-primary" type="button" onClick={() => chooseFile()} disabled={locked}>
              <Upload size={17} /> เลือกไฟล์เสียง
            </button>
            {progress !== null && <div className="upload-progress" role="status">
              <label htmlFor="upload-progress">กำลังอัปโหลด {progress}%</label><progress id="upload-progress" value={progress} max={100} />
            </div>}
            {(busy === 'analyze' || (busy === 'upload' && progress === null)) && <p className="hint" role="status">{busy === 'analyze' ? 'กำลังสร้าง waveform…' : 'กำลังเตรียมอัปโหลด…'}</p>}
          </section>

          {error && <p className="notice form-error" role="alert">{error}</p>}
          {message && <p className="notice" role="status">{message}</p>}

          {selected && <SoundEditor key={selected.sound.id + selected.sound.revision}
            sound={selected.sound} details={selected.details} categories={categories} busy={locked}
            save={save} close={() => setSelected(null)} reloadAudio={() => void run('details', () => openSound(selected.sound))} />}

          <section className="panel" aria-labelledby="library-title">
            <div className="panel-heading"><h2 id="library-title">เสียงในคลัง</h2><span className="hint">{sounds.length} รายการ</span></div>
            {!sounds.length ? <p className="hint">เลือกไฟล์เสียงเพื่อเพิ่มแพดแรก</p> : <ul className="admin-list">
              {sounds.map((sound) => (
                <li key={sound.id}>
                  <div className="list-row">
                    <span className="list-icon"><AudioLines size={20} aria-hidden="true" /></span>
                    <div className="list-copy"><strong>{sound.name}</strong>
                      <span>{sound.status === 'deleting' ? 'รอลบไฟล์' : sound.status === 'draft' ? 'แบบร่าง' :
                        `${categories.find((category) => category.id === sound.category_id)?.name ?? ''} · ${formatTime(sound.duration_ms ?? 0)}`}</span>
                    </div>
                    <div className="row-actions">
                      {sound.status === 'ready' && <a className="button button-quiet icon-button"
                        href={`/api/admin/download?id=${sound.id}`} aria-label={`ดาวน์โหลด ${sound.name}`}><Download size={16} /></a>}
                      {sound.status !== 'deleting' && <button className="button button-quiet" disabled={locked}
                        onClick={() => void run(sound.source_duration_ms ? 'details' : 'analyze', () => openSound(sound))}>
                        {sound.source_duration_ms ? 'แก้ไข' : 'วิเคราะห์ไฟล์'}
                      </button>}
                      <button className="button button-quiet danger-text" disabled={locked}
                        aria-label={`${sound.status === 'deleting' ? 'ลองลบไฟล์อีกครั้ง' : 'ลบ'} ${sound.name}`}
                        onClick={() => sound.status === 'deleting' ? removeSound(sound) : setConfirm(sound.id)}>
                        {sound.status === 'deleting' ? 'ลองลบอีกครั้ง' : 'ลบ'}
                      </button>
                    </div>
                  </div>
                  {sound.status === 'draft' && !sound.source_duration_ms &&
                    <button type="button" className="text-button draft-resume" disabled={locked} onClick={() => chooseFile(sound)}>เลือกไฟล์เดิมเพื่ออัปโหลดต่อ</button>}
                  {confirm === sound.id && <div className="confirm">
                    <span>ลบเสียงและต้นฉบับนี้หรือไม่</span>
                    <button className="button" disabled={locked} onClick={() => setConfirm('')}>ยกเลิก</button>
                    <button className="button button-danger" disabled={locked} onClick={() => removeSound(sound)}>ยืนยันการลบ</button>
                  </div>}
                </li>
              ))}
            </ul>}
          </section>
        </div>

        <section className="panel category-panel" id="categories" aria-labelledby="categories-title">
          <div className="panel-heading"><h2 id="categories-title">หมวดหมู่</h2></div>
          <form className="category-form" onSubmit={saveCategory}>
            <label>{categoryEdit ? 'เปลี่ยนชื่อหมวด' : 'ชื่อหมวดใหม่'}
              <input id="category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={60}
                required disabled={locked} /></label>
            <button className="button" type="submit" disabled={locked || !categoryName.trim()}>
              {!categoryEdit && <Plus size={16} />} {categoryEdit ? 'บันทึก' : 'เพิ่ม'}
            </button>
            {categoryEdit && <button className="button button-quiet" type="button" disabled={locked}
              onClick={() => { setCategoryEdit(null); setCategoryName(''); }}>ยกเลิก</button>}
          </form>
          {categories.length > 0 && <ul className="admin-list category-list">
            {categories.map((category) => (
              <li key={category.id}>
                <div className="list-row">
                  <strong>{category.name}</strong>
                  <div className="row-actions">
                    <button className="button button-quiet" type="button" disabled={locked}
                      onClick={() => { setCategoryEdit(category); setCategoryName(category.name); document.getElementById('category-name')?.focus(); }}>
                      เปลี่ยนชื่อ
                    </button>
                    <button className="button button-quiet danger-text" type="button" disabled={locked} aria-label={`ลบหมวด ${category.name}`}
                      onClick={() => setConfirm(category.id)}>ลบ</button>
                  </div>
                </div>
                {confirm === category.id && <div className="confirm">
                  <button className="button" onClick={() => setConfirm('')} disabled={locked}>ยกเลิก</button>
                  <button className="button button-danger" onClick={() => removeCategory(category)} disabled={locked}>ยืนยันลบหมวด</button>
                </div>}
              </li>
            ))}
          </ul>}
        </section>
      </div>
    </>
  );
}
