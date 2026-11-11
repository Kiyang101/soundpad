'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, Download, Play, Square, X } from 'lucide-react';
import { audioRange, formatTime, MAX_CLIP_MS, type AudioDetails, type Category, type Sound } from '@/lib/sound';
import { Waveform } from './waveform';

export function SoundEditor({ sound, details, categories, busy, save, close, reloadAudio }: {
  sound: Sound;
  details: AudioDetails;
  categories: Category[];
  busy: boolean;
  save: (name: string, categoryId: string, startMs: number, endMs: number, asNew?: boolean) => void;
  close: () => void;
  reloadAudio: () => void;
}) {
  const [name, setName] = useState(sound.name);
  const [categoryId, setCategoryId] = useState(sound.category_id ?? '');
  const [start, setStart] = useState(String((sound.trim_start_ms ?? 0) / 1000));
  const [end, setEnd] = useState(String((sound.trim_end_ms ?? Math.min(details.durationMs, MAX_CLIP_MS)) / 1000));
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef(0);
  const playback = useRef(0);
  const startMs = start === '' ? -1 : Math.round(Number(start) * 1000);
  const endMs = end === '' ? -1 : Math.round(Number(end) * 1000);
  const valid = audioRange(startMs, endMs, details.durationMs);

  const stop = useCallback(() => {
    playback.current++;
    cancelAnimationFrame(frame.current);
    audio.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    const player = audio.current;
    function visibility() { if (document.hidden) stop(); }
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      stop();
      player?.pause();
    };
  }, [stop]);

  function preview() {
    if (playing) return stop();
    if (!valid || !audio.current) return;
    const player = audio.current;
    const id = ++playback.current;
    setError(false);
    setPlaying(true);
    try {
      player.currentTime = startMs / 1000;
      void player.play().then(() => {
        function monitor() {
          if (id !== playback.current) return;
          if (player.currentTime >= endMs / 1000 || player.ended) stop();
          else frame.current = requestAnimationFrame(monitor);
        }
        monitor();
      }, () => { if (id === playback.current) { stop(); setError(true); } });
    } catch {
      stop();
      setError(true);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !name.trim() || !categoryId) return;
    stop();
    const asNew = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'new';
    save(name.trim(), categoryId, startMs, endMs, asNew);
  }

  return (
    <section className="panel editor" id="sound-editor" aria-labelledby="editor-heading">
      <div className="panel-heading"><div><h2 id="editor-heading">ตัดเสียง</h2><p>{sound.source_name}</p></div>
        <button className="button button-quiet icon-button" aria-label="ปิดตัวตัดเสียง" type="button" onClick={() => { stop(); close(); }} disabled={busy}><X size={19} /></button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <div className="fields">
          <label>ชื่อเสียง<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} /></label>
          <label>หมวดหมู่<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required disabled={busy}>
            <option value="">เลือกหมวดหมู่</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
        </div>
        {!categories.length && <p className="hint"><a href="#categories">เพิ่มหมวดหมู่</a> ก่อนบันทึกเสียง</p>}
        <div>
          <div className="wave-label"><span>ต้นฉบับ</span><span className="time">0:00 — {formatTime(details.durationMs)}</span></div>
          <Waveform durationMs={details.durationMs} peaks={details.peaks} range={{ startMs, endMs }} disabled={busy}
            onChange={(range) => { stop(); setStart(String(range.startMs / 1000)); setEnd(String(range.endMs / 1000)); }} />
          <p className="hint">ลากหัวท้าย หรือแตะ waveform เพื่อย้ายช่วงที่เลือก</p>
        </div>
        <div className="fields">
          <label>เริ่ม (วินาที)<input type="number" inputMode="decimal" min={0} step={0.001} max={details.durationMs / 1000}
            value={start} onChange={(event) => { stop(); setStart(event.target.value); }} required disabled={busy} /></label>
          <label>จบ (วินาที)<input type="number" inputMode="decimal" min={0} step={0.001} max={details.durationMs / 1000}
            value={end} onChange={(event) => { stop(); setEnd(event.target.value); }} required disabled={busy} /></label>
        </div>
        <audio key={details.sourceUrl} ref={audio} src={details.sourceUrl} preload="metadata" onEnded={stop}
          onTimeUpdate={(event) => { if (playing && event.currentTarget.currentTime >= endMs / 1000) stop(); }} />
        {valid ? <p className="hint">ช่วงที่เลือก <span className="time">{((endMs - startMs) / 1000).toFixed(3)}</span> วินาที</p> :
          <p className="form-error" role="status">เลือกช่วง 0.25 วินาทีถึง 2 นาทีภายในต้นฉบับ</p>}
        {error && <p className="form-error" role="alert">ฟังต้นฉบับไม่ได้ <button type="button" className="text-button" onClick={() => { setError(false); reloadAudio(); }}>โหลดต้นฉบับใหม่</button></p>}
        <div className="editor-actions">
          {sound.status === 'ready' && <a className="button" href={`/api/admin/download?id=${sound.id}`}>
            <Download size={16} /> ดาวน์โหลดคลิปที่บันทึก</a>}
          <button className="button" type="button" disabled={!valid || busy} onClick={preview}>
            {playing ? <Square size={16} /> : <Play size={16} />} {playing ? 'หยุดพรีวิว' : 'ฟังช่วงที่เลือก'}
          </button>
          <button className="button button-primary" type="submit" disabled={!valid || !categoryId || busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกเสียง'}
          </button>
          {sound.status === 'ready' && <button className="button" type="submit" value="new" disabled={!valid || !categoryId || busy}>
            <Copy size={16} /> บันทึกเป็นเสียงใหม่
          </button>}
        </div>
        {sound.status === 'ready' && <p className="hint">เลือกช่วงอื่นแล้วกด “บันทึกเป็นเสียงใหม่” เพื่อเก็บคลิปเดิมไว้ หรือ “บันทึกเสียง” เพื่อแก้ไขคลิปนี้</p>}
      </form>
    </section>
  );
}
