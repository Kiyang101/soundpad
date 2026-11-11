'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { MAX_CLIP_MS, MIN_CLIP_MS } from '@/lib/sound';

type Range = { startMs: number; endMs: number };
type Handle = 'startMs' | 'endMs';

export function Waveform({ peaks, durationMs, range, onChange, disabled }: {
  peaks: number[];
  durationMs: number;
  range: Range;
  onChange: (range: Range) => void;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; value: number } | null>(null);
  const length = range.endMs - range.startMs;
  const startPercent = Math.max(0, Math.min(100, range.startMs / durationMs * 100));
  const endPercent = Math.max(startPercent, Math.min(100, range.endMs / durationMs * 100));

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const max = Math.max(0.12, ...peaks);
    function draw() {
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const scale = window.devicePixelRatio || 1;
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
      const ctx = element.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#8795a5';
      const bars = Math.min(peaks.length, Math.floor(width / 3));
      for (let i = 0; i < bars; i++) {
        const from = Math.floor(i * peaks.length / bars);
        const to = Math.floor((i + 1) * peaks.length / bars);
        const peak = Math.max(...peaks.slice(from, to));
        const size = Math.max(2, peak / max * (height - 22));
        ctx.fillRect(i * width / bars, (height - size) / 2, Math.max(1, width / bars - 1.5), size);
      }
    }
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [peaks]);

  function bounds(handle: Handle) {
    if (handle === 'startMs') {
      return [Math.max(0, range.endMs - MAX_CLIP_MS), Math.max(0, range.endMs - MIN_CLIP_MS)];
    }
    return [Math.min(durationMs, range.startMs + MIN_CLIP_MS), Math.min(durationMs, range.startMs + MAX_CLIP_MS)];
  }

  function move(handle: Handle, value: number) {
    const [low, high] = bounds(handle);
    onChange({ ...range, [handle]: Math.min(high, Math.max(low, Math.round(value))) });
  }

  function key(event: KeyboardEvent<HTMLButtonElement>, handle: Handle) {
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 :
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : 0;
    const [low, high] = bounds(handle);
    if (direction) move(handle, range[handle] + direction * (event.shiftKey ? 1000 : 100));
    else if (event.key === 'Home') move(handle, low);
    else if (event.key === 'End') move(handle, high);
    else return;
    event.preventDefault();
  }

  function movePointer(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId) || !track.current) return;
    move(handle, drag.current.value + (event.clientX - drag.current.x) / track.current.clientWidth * durationMs);
  }

  return (
    <div className="wave-frame">
      <div className="wave-track" ref={track}>
        <canvas ref={canvas} className="wave-canvas" aria-hidden="true" />
        <div className="wave-selection" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }} aria-hidden="true" />
        <button type="button" className="wave-jump" aria-label="ย้ายช่วงเสียงไปยังตำแหน่งที่แตะ"
          tabIndex={-1} disabled={disabled} onClick={(event) => {
            if (!event.detail || length < MIN_CLIP_MS || length > durationMs) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const at = Math.round((event.clientX - rect.left) / rect.width * durationMs);
            const startMs = Math.max(0, Math.min(durationMs - length, at - Math.round(length / 2)));
            onChange({ startMs, endMs: startMs + length });
          }} />
        {(['startMs', 'endMs'] as const).map((handle) => {
          const [low, high] = bounds(handle);
          const isStart = handle === 'startMs';
          return (
            <button type="button" key={handle} role="slider" disabled={disabled}
              className={`wave-handle ${isStart ? 'wave-start' : 'wave-end'}`}
              style={{ left: `${isStart ? startPercent : endPercent}%` }}
              aria-label={isStart ? 'จุดเริ่ม' : 'จุดจบ'} aria-valuemin={low} aria-valuemax={Math.max(low, high)}
              aria-valuenow={Math.max(low, Math.min(high, range[handle]))}
              aria-valuetext={`${(range[handle] / 1000).toFixed(3)} วินาที`}
              onKeyDown={(event) => key(event, handle)}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                drag.current = { x: event.clientX, value: range[handle] };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => movePointer(event, handle)}
              onLostPointerCapture={() => { drag.current = null; }}
            ><span aria-hidden="true" /></button>
          );
        })}
      </div>
    </div>
  );
}
