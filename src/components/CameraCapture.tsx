import { useEffect, useRef, useState } from 'react';

/** Full-screen live camera with an oval guide. The saved photo is not mirrored. */
export function CameraCapture(props: { title: string; prompt: string; onCapture: (b: Blob) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
      } catch (e) {
        setError(`Camera unavailable (${(e as Error).name}). Use “Upload photo” instead.`);
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && props.onCapture(b), 'image/jpeg', 0.95);
  };

  const startTimer = () => {
    let n = 3;
    setCountdown(n);
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); setCountdown(null); snap(); } else setCountdown(n);
    }, 1000);
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="camera-top">
        <div>
          <strong>{props.title}</strong>
          <p>{props.prompt}</p>
        </div>
        <button type="button" className="btn ghost light" onClick={props.onClose}>Close</button>
      </div>
      <div className="camera-stage">
        {error ? (
          <p className="camera-error">{error}</p>
        ) : (
          <>
            <video ref={video} playsInline muted className={facing === 'user' ? 'mirror' : ''} />
            <div className="camera-oval" aria-hidden />
            {countdown != null && <div className="camera-count">{countdown}</div>}
          </>
        )}
      </div>
      <div className="camera-bar">
        <button type="button" className="btn ghost light" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
          Switch camera
        </button>
        <button type="button" className="shutter" onClick={snap} disabled={!!error} aria-label="Take photo" />
        <button type="button" className="btn ghost light" onClick={startTimer} disabled={!!error || countdown != null}>
          3 s timer
        </button>
      </div>
      <p className="camera-hint">Even light from the front · eyes level with the lens · hair off the forehead</p>
    </div>
  );
}
