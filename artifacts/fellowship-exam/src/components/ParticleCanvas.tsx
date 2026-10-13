import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  baseVx: number; baseVy: number;
  radius: number; opacity: number;
  pulseSpeed: number; pulsePhase: number;
}

interface Props {
  className?: string;
  count?: number;
  color?: string;
  connectionColor?: string;
  maxDistance?: number;
}

export default function ParticleCanvas({
  className = "",
  count = 80,
  color = "255, 122, 0",
  connectionColor = "255, 122, 0",
  maxDistance = 140,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size the canvas
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    let W = canvas.width;
    let H = canvas.height;

    const particles: Particle[] = Array.from({ length: count }, () => {
      const vx = (Math.random() - 0.5) * 0.7;
      const vy = (Math.random() - 0.5) * 0.7;
      return {
        x: Math.random() * W, y: Math.random() * H,
        vx, vy, baseVx: vx, baseVy: vy,
        radius: Math.random() * 2.5 + 1,
        opacity: Math.random() * 0.5 + 0.25,
        pulseSpeed: Math.random() * 0.02 + 0.005,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });

    let frame = 0;
    const REPEL_RADIUS = 120;
    const REPEL_FORCE = 6;

    function draw() {
      if (!canvas || !ctx) return;
      W = canvas.width;
      H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      frame++;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particles) {
        // Repulsion from cursor
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_RADIUS && dist > 0.5) {
          const strength = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
          p.vx += (dx / dist) * strength;
          p.vy += (dy / dist) * strength;
        }

        // Spring back to base drift
        p.vx += (p.baseVx - p.vx) * 0.05;
        p.vy += (p.baseVy - p.vy) * 0.05;

        // Clamp max speed
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (spd > 8) { p.vx = (p.vx / spd) * 8; p.vy = (p.vy / spd) * 8; }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

        const alpha = Math.max(0.05, Math.min(0.9,
          p.opacity + Math.sin(frame * p.pulseSpeed + p.pulsePhase) * 0.15
        ));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fill();
      }

      // Connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]!, b = particles[j]!;
          const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          if (d < maxDistance) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${connectionColor}, ${(1 - d / maxDistance) * 0.3})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    // Track mouse relative to the canvas element itself
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    const onResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    // Attach to window so events fire regardless of which child element is under cursor
    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", onResize);
    // Reset when mouse exits the browser window
    document.addEventListener("mouseleave", onLeave);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [count, color, connectionColor, maxDistance]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ pointerEvents: "none" }}
    />
  );
}
