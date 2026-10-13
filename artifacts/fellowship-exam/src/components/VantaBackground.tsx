import { useEffect, useRef } from "react";
import * as THREE from "three";

// ── Canvas 2D animated wave background (works without WebGL) ─────────────────
function AnimatedWaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    // Wave layers: yFrac = vertical position, amp = height, lighter colors on top
    const layers = [
      { amp: 45, period: 0.007, speed: 0.010, yFrac: 0.52, r: 30,  g: 68,  b: 120, a: 0.55 },
      { amp: 36, period: 0.010, speed: 0.016, yFrac: 0.60, r: 24,  g: 58,  b: 105, a: 0.65 },
      { amp: 28, period: 0.006, speed: 0.008, yFrac: 0.68, r: 18,  g: 48,  b: 90,  a: 0.72 },
      { amp: 22, period: 0.013, speed: 0.022, yFrac: 0.76, r: 13,  g: 40,  b: 76,  a: 0.80 },
      { amp: 16, period: 0.009, speed: 0.014, yFrac: 0.84, r: 10,  g: 33,  b: 64,  a: 0.88 },
      { amp: 10, period: 0.016, speed: 0.028, yFrac: 0.92, r: 8,   g: 28,  b: 55,  a: 0.95 },
    ];

    let t = 0;

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, W, H);

      // Very dark background so waves stand out
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#040d1c");
      bg.addColorStop(1, "#071525");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Draw each wave layer back-to-front
      for (const lyr of layers) {
        const baseY = lyr.yFrac * H;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W + 4; x += 4) {
          const y =
            baseY +
            Math.sin(x * lyr.period + t * lyr.speed * 60) * lyr.amp +
            Math.sin(x * lyr.period * 1.73 + t * lyr.speed * 38) * lyr.amp * 0.38 +
            Math.cos(x * lyr.period * 0.61 + t * lyr.speed * 22) * lyr.amp * 0.22;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();

        const wgrd = ctx.createLinearGradient(0, baseY - lyr.amp, 0, H);
        wgrd.addColorStop(0, `rgba(${lyr.r}, ${lyr.g}, ${lyr.b}, ${lyr.a * 0.5})`);
        wgrd.addColorStop(1, `rgba(${lyr.r}, ${lyr.g}, ${lyr.b}, ${lyr.a})`);
        ctx.fillStyle = wgrd;
        ctx.fill();
      }

      t += 0.016;
      animRef.current = requestAnimationFrame(draw);
    }

    const onResize = () => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0, pointerEvents: "none" }}
    />
  );
}

// ── WebGL detection ───────────────────────────────────────────────────────────
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// ── Vanta WAVES (progressive enhancement when WebGL available) ────────────────
function VantaWaves({
  containerRef, color, shininess, waveHeight, waveSpeed, zoom,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  color: number; shininess: number; waveHeight: number; waveSpeed: number; zoom: number;
}) {
  useEffect(() => {
    let effect: { destroy: () => void } | null = null;
    (async () => {
      try {
        // @ts-ignore
        const mod = await import("vanta/dist/vanta.waves.min");
        const fn = ((mod as { default?: unknown }).default ?? mod) as (o: object) => { destroy: () => void };
        if (!containerRef.current) return;
        effect = fn({ el: containerRef.current, THREE, mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1, color, shininess, waveHeight, waveSpeed, zoom });
      } catch { /* silent */ }
    })();
    return () => { effect?.destroy(); };
  }, [containerRef, color, shininess, waveHeight, waveSpeed, zoom]);
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────
interface Props {
  className?: string;
  color?: number;
  shininess?: number;
  waveHeight?: number;
  waveSpeed?: number;
  zoom?: number;
}

export default function VantaBackground({
  className = "",
  color = 0x0b1f3a,
  shininess = 60,
  waveHeight = 18,
  waveSpeed = 0.8,
  zoom = 0.9,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webgl = hasWebGL();

  return (
    <div ref={containerRef} className={`absolute inset-0 w-full h-full ${className}`} style={{ zIndex: 0 }}>
      {/* Canvas 2D waves — always visible, replaced by Vanta when WebGL is available */}
      <AnimatedWaves />
      {webgl && <VantaWaves containerRef={containerRef} color={color} shininess={shininess} waveHeight={waveHeight} waveSpeed={waveSpeed} zoom={zoom} />}
    </div>
  );
}
