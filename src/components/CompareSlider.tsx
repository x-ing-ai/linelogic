import { useEffect, useRef, useState } from 'react';
import type { Img } from '../lib/types';
import { drawInto, type Overlays } from './ImageView';

/** Before/after with a draggable divider. Left = photo, right = simulation. */
export function CompareSlider(props: { before: Img; after: Img; afterOverlays: Overlays; labels: [string, string] }) {
  const a = useRef<HTMLCanvasElement>(null);
  const b = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);

  useEffect(() => { if (a.current) drawInto(a.current, props.before); }, [props.before]);
  useEffect(() => { if (b.current) drawInto(b.current, props.after, props.afterOverlays); }, [props.after, props.afterOverlays]);

  const move = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      className="compare"
      ref={wrap}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
    >
      <canvas ref={a} className="compare-base" />
      <canvas ref={b} className="compare-top" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className="compare-handle" style={{ left: `${pos}%` }} aria-hidden>
        <span />
      </div>
      <span className="compare-label left">{props.labels[0]}</span>
      <span className="compare-label right">{props.labels[1]}</span>
      <input
        className="compare-range"
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare photo and simulation"
      />
    </div>
  );
}
