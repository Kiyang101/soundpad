'use client';

import { useRef, useState } from 'react';
import { AudioLines, CircleAlert, Play, Repeat2, Square } from 'lucide-react';
import { formatTime, type Category, type Pad } from '@/lib/sound';

const tones = ['amber', 'cyan', 'lavender', 'green'] as const;
type Playback = { pad: Pad; status: 'loading' | 'playing' | 'error' };

export function Board({ categories, pads, unavailable }: { categories: Category[]; pads: Pad[]; unavailable: boolean }) {
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const [category, setCategory] = useState('');
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [progress, setProgress] = useState(0);
  const [loop, setLoop] = useState(false);
  const visible = category ? pads.filter((pad) => pad.categoryId === category) : pads;
  const categoryById = new Map(categories.map((item, index) => [item.id, { ...item, tone: tones[index % tones.length] }]));
  const isActive = Boolean(playback && playback.status !== 'error');

  function stop() {
    request.current++;
    const audio = player.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlayback(null);
    setProgress(0);
  }

  function play(pad: Pad) {
    const audio = player.current;
    if (!audio) return;
    const id = ++request.current;
    audio.pause();
    setProgress(0);
    setPlayback({ pad, status: 'loading' });
    if (audio.src === pad.url && audio.readyState > 0 && !audio.error) audio.currentTime = 0;
    else audio.src = pad.url;
    void audio.play().then(
      () => { if (request.current === id) setPlayback({ pad, status: 'playing' }); },
      () => { if (request.current === id) setPlayback({ pad, status: 'error' }); },
    );
  }

  return (
    <>
      <audio ref={player} preload="none" loop={loop}
        onEnded={(event) => { if (event.currentTarget.ended) stop(); }}
        onTimeUpdate={(event) => {
          if (playback?.status === 'playing') {
            setProgress(Math.min(1, event.currentTarget.currentTime * 1000 / playback.pad.durationMs));
          }
        }}
        onError={(event) => {
          if (event.currentTarget.error) {
            setPlayback((state) => state && { ...state, status: 'error' });
          }
        }}
      />

      <section className="deck" aria-label="เครื่องเล่นเสียง">
        <div className="deck-info">
          <div className="deck-meter" aria-hidden="true"><AudioLines size={29} strokeWidth={1.65} /></div>
          <div aria-live="polite" className="deck-copy">
            <span className="deck-status">{playback?.status === 'error' ? 'เล่นไม่สำเร็จ' :
              playback?.status === 'loading' ? 'กำลังโหลดเสียง' :
              playback ? (loop ? 'กำลังเล่นวนซ้ำ' : 'กำลังเล่น') : 'พร้อมเล่น'}</span>
            <p>{playback?.pad.name ?? 'แตะแพดเพื่อเล่นเสียง'}</p>
            {playback?.status === 'error' && <button className="text-button" type="button" onClick={() => window.location.reload()}>โหลดคลังใหม่</button>}
          </div>
        </div>
        <div className="deck-controls">
          <button className={`button${loop ? ' button-primary' : ''}`} type="button" aria-pressed={loop}
            onClick={() => setLoop((value) => !value)} title="เล่นเสียงที่เลือกซ้ำจนกดหยุด">
            <Repeat2 size={17} aria-hidden="true" /> วนซ้ำ
          </button>
          <button className="button" type="button" onClick={stop} disabled={!isActive}>
            <Square size={15} fill="currentColor" aria-hidden="true" /> หยุด
          </button>
        </div>
        <div className="deck-progress" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
      </section>

      <section className="pad-section" aria-labelledby="pads-title">
        <div className="section-heading"><h1 id="pads-title">คลังเสียง</h1><span>{visible.length} เสียง</span></div>
        <nav className="category-strip" aria-label="ตัวกรองหมวดหมู่">
          <button type="button" className="filter" aria-pressed={!category} onClick={() => setCategory('')}>ทั้งหมด</button>
          {categories.map((item) => (
            <button key={item.id} type="button" className="filter" aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}>{item.name}</button>
          ))}
        </nav>
        {unavailable ? (
          <div className="empty-state" role="status"><CircleAlert size={30} /><p>โหลดคลังเสียงไม่ได้</p>
            <button className="button" onClick={() => window.location.reload()}>ลองโหลดใหม่</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <AudioLines size={36} aria-hidden="true" /><p>{category ? 'หมวดนี้ยังไม่มีเสียง' : 'ยังไม่มีเสียงในคลัง'}</p>
          </div>
        ) : (
          <div className="pad-grid">
            {visible.map((pad) => {
              const group = categoryById.get(pad.categoryId);
              const status = playback?.pad.id === pad.id ? playback.status : undefined;
              return (
                <button type="button" key={pad.id} className="pad" data-tone={group?.tone ?? 'amber'}
                  data-status={status} onClick={() => play(pad)}>
                  <span className="pad-top"><span className="pad-icon">
                    {status === 'error' ? <CircleAlert size={18} aria-hidden="true" /> :
                      status === 'playing' ? <AudioLines size={19} aria-hidden="true" /> :
                      <Play size={17} fill="currentColor" aria-hidden="true" />}
                  </span><span className="time">{formatTime(pad.durationMs)}</span></span>
                  <span className="pad-name">{pad.name}</span>
                  <span className="pad-category">{group?.name}</span>
                  {status === 'loading' && <span className="sr-only">กำลังโหลด</span>}
                  {status === 'playing' && <span className="sr-only">กำลังเล่น</span>}
                  {status === 'error' && <span className="sr-only">เล่นไม่สำเร็จ แตะเพื่อลองใหม่</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
