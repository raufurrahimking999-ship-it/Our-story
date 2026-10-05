import React, { useEffect, useRef } from 'react';

interface HeartParticle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  driftX: number;
  swayFreq: number;
  swayPhase: number;
  swayAmp: number;
  maxOpacity: number;
  hue: number;
  rotation: number;
  scaleVar: number;
  scalePhase: number;
  fadeLimitTop: number; // variable altitude where heart begins fading out
}

interface StardustParticle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  driftX: number;
  pulseSpeed: number;
  pulsePhase: number;
  baseOpacity: number;
  hue: number;
}

export const BackgroundAura: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isRunning = true;

    // Detect Device Pixel Ratio (DPR) for Native/High-Density Crisp Rendering
    let dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setupCanvasSize = () => {
      const currentDpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = currentDpr;

      canvas.width = Math.floor(width * currentDpr);
      canvas.height = Math.floor(height * currentDpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(currentDpr, currentDpr);
    };

    setupCanvasSize();
    window.addEventListener('resize', setupCanvasSize);

    // =========================================================================
    // 1. REFINED FLOATING HEARTS (Varied Scales, Trajectories, & Fades)
    // =========================================================================
    const heartCount = 20;
    // Elegant palette: midnight-blue, icy lavender, soft violet, whisper of rose
    const heartHues = [220, 230, 245, 260, 275, 335, 345];

    const createHeart = (initialSpread = false, index = 0): HeartParticle => {
      // Natural size distribution: smaller distant hearts and occasional larger prominent ones
      const sizeRatio = Math.random();
      const size = sizeRatio < 0.6 
        ? 7.0 + Math.random() * 5.0   // 7px to 12px (subtle background)
        : 12.0 + Math.random() * 7.5; // 12px to 19.5px (intimate foreground)
      
      const depthFactor = (size - 7.0) / 12.5;

      // Distribute evenly across screen width with jitter to prevent clustering
      const sectionWidth = width / heartCount;
      const x = Math.max(16, Math.min(width - 16, index * sectionWidth + (Math.random() - 0.5) * (sectionWidth * 0.9)));

      // Y positioning: staggered across the height initially so screen is populated naturally,
      // then resetting below bottom once ascending
      let y: number;
      if (initialSpread) {
        y = Math.random() * height;
      } else {
        y = height + 15 + Math.random() * 60;
      }

      const speedY = 0.22 + depthFactor * 0.28 + Math.random() * 0.14;
      const driftX = (Math.random() - 0.5) * 0.16;

      const swayFreq = 0.0035 + Math.random() * 0.0055;
      const swayPhase = Math.random() * Math.PI * 2;
      const swayAmp = 0.12 + Math.random() * 0.26;

      const maxOpacity = 0.09 + depthFactor * 0.22 + Math.random() * 0.06;
      const hue = heartHues[Math.floor(Math.random() * heartHues.length)];
      const rotation = (Math.random() - 0.5) * 0.12; // Gentle tilt (+/- 7 deg)

      const scaleVar = 0.03 + Math.random() * 0.04;
      const scalePhase = Math.random() * Math.PI * 2;

      // Some hearts softly disappear mid-way up (30%-65% of screen height) to create visual depth
      const fadeChoice = Math.random();
      const fadeLimitTop = fadeChoice < 0.25 
        ? height * (0.35 + Math.random() * 0.20) // disappears midway
        : height * (0.05 + Math.random() * 0.15); // ascends almost to top

      return {
        x,
        y,
        size,
        speedY,
        driftX,
        swayFreq,
        swayPhase,
        swayAmp,
        maxOpacity,
        hue,
        rotation,
        scaleVar,
        scalePhase,
        fadeLimitTop,
      };
    };

    const heartParticles: HeartParticle[] = Array.from({ length: heartCount }, (_, i) =>
      createHeart(true, i)
    );

    // =========================================================================
    // 2. ETHEREAL STARDUST PARTICLES (Tiny Glowing Luminous Motes)
    // =========================================================================
    const stardustCount = 32;
    const createStardust = (initialSpread = false): StardustParticle => {
      const x = Math.random() * width;
      const y = initialSpread ? Math.random() * height : height + 10 + Math.random() * 40;
      const radius = 0.8 + Math.random() * 1.4; // delicate tiny motes
      const speedY = 0.12 + Math.random() * 0.22;
      const driftX = (Math.random() - 0.5) * 0.10;
      const pulseSpeed = 0.012 + Math.random() * 0.024;
      const pulsePhase = Math.random() * Math.PI * 2;
      const baseOpacity = 0.12 + Math.random() * 0.38;
      const hue = heartHues[Math.floor(Math.random() * heartHues.length)];

      return {
        x,
        y,
        radius,
        speedY,
        driftX,
        pulseSpeed,
        pulsePhase,
        baseOpacity,
        hue,
      };
    };

    const stardustParticles: StardustParticle[] = Array.from({ length: stardustCount }, () =>
      createStardust(true)
    );

    // =========================================================================
    // 3. CANVAS DRAWING ROUTINES
    // =========================================================================
    const drawSoftHeart = (
      x: number,
      y: number,
      size: number,
      opacity: number,
      hue: number,
      rotation: number
    ) => {
      if (opacity <= 0.002) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      // Subtle atmospheric outer glow
      ctx.shadowBlur = size * 1.4;
      ctx.shadowColor = `hsla(${hue}, 85%, 75%, ${opacity * 0.65})`;

      // Translucent liquid gradient fill
      const gradient = ctx.createLinearGradient(0, -size * 0.55, 0, size * 0.7);
      gradient.addColorStop(0, `hsla(${hue}, 92%, 92%, ${opacity * 0.88})`);
      gradient.addColorStop(0.4, `hsla(${hue}, 85%, 82%, ${opacity * 0.72})`);
      gradient.addColorStop(1, `hsla(${hue}, 78%, 68%, ${opacity * 0.38})`);
      ctx.fillStyle = gradient;

      ctx.beginPath();
      // Start at top center dip
      ctx.moveTo(0, -size * 0.32);

      // Left lobe
      ctx.bezierCurveTo(
        -size * 0.36, -size * 0.74,
        -size * 0.75, -size * 0.34,
        -size * 0.75, 0
      );

      // Bottom left curve to tip
      ctx.bezierCurveTo(
        -size * 0.75, size * 0.35,
        -size * 0.35, size * 0.75,
        0, size
      );

      // Bottom right curve to tip
      ctx.bezierCurveTo(
        size * 0.35, size * 0.75,
        size * 0.75, size * 0.35,
        size * 0.75, 0
      );

      // Right lobe
      ctx.bezierCurveTo(
        size * 0.75, -size * 0.34,
        size * 0.36, -size * 0.74,
        0, -size * 0.32
      );
      ctx.closePath();
      ctx.fill();

      // Delicate hairline stroke highlight
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsla(${hue}, 95%, 90%, ${opacity * 0.65})`;
      ctx.lineWidth = Math.max(0.6, size * 0.05);
      ctx.stroke();

      // Soft Specular Highlight on left lobe (intimate glass curve)
      ctx.beginPath();
      ctx.ellipse(
        -size * 0.22,
        -size * 0.22,
        size * 0.18,
        size * 0.07,
        -Math.PI / 4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `hsla(${hue}, 100%, 100%, ${opacity * 0.75})`;
      ctx.fill();

      ctx.restore();
    };

    const drawStardust = (p: StardustParticle, tick: number) => {
      const pulse = Math.sin(tick * p.pulseSpeed + p.pulsePhase);
      const opacity = p.baseOpacity * (0.65 + 0.35 * pulse);
      if (opacity <= 0.01) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

      ctx.shadowBlur = p.radius * 3.5;
      ctx.shadowColor = `hsla(${p.hue}, 90%, 80%, ${opacity * 0.8})`;

      ctx.fillStyle = `hsla(${p.hue}, 95%, 92%, ${opacity})`;
      ctx.fill();
      ctx.restore();
    };

    let tick = 0;
    const render = () => {
      if (!isRunning) return;

      tick += 1;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Stardust Particles (Background Starry Motes)
      for (let i = 0; i < stardustParticles.length; i++) {
        const s = stardustParticles[i];
        s.y -= s.speedY;
        s.x += s.driftX;

        if (s.y < -10) {
          stardustParticles[i] = createStardust(false);
          continue;
        }

        if (s.x < -10) s.x = width + 10;
        else if (s.x > width + 10) s.x = -10;

        drawStardust(s, tick);
      }

      // 2. Draw Floating Hearts (Foreground Ambient Layer)
      for (let i = 0; i < heartParticles.length; i++) {
        const p = heartParticles[i];

        p.y -= p.speedY;

        // Smooth wave trajectory
        const swayValue = Math.sin(tick * p.swayFreq + p.swayPhase);
        p.x += p.driftX + swayValue * p.swayAmp;

        // Subtle breathing scale variation
        const currentScale = p.size * (1 + Math.sin(tick * 0.018 + p.scalePhase) * p.scaleVar);

        // Reset if it passes its custom top fade altitude or screen top
        if (p.y < -30) {
          heartParticles[i] = createHeart(false, i);
          continue;
        }

        // Screen edge wrapping
        if (p.x < -30) p.x = width + 30;
        else if (p.x > width + 30) p.x = -30;

        // Smooth fade-in at bottom and gentle fade-out at top altitude
        let opacityFactor = 1.0;
        const bottomFadeLimit = height * 0.90;

        if (p.y > bottomFadeLimit) {
          opacityFactor = Math.max(0, (height - p.y) / (height - bottomFadeLimit));
        } else if (p.y < p.fadeLimitTop) {
          opacityFactor = Math.max(0, p.y / p.fadeLimitTop);
        }

        if (p.y > height) opacityFactor = 0;

        const currentOpacity = p.maxOpacity * opacityFactor;
        drawSoftHeart(p.x, p.y, currentScale, currentOpacity, p.hue, p.rotation);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Respect tab/app visibility to preserve battery and GPU
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
      } else {
        if (!isRunning) {
          isRunning = true;
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isRunning = false;
      window.removeEventListener('resize', setupCanvasSize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen min-h-[100dvh] pointer-events-none overflow-hidden z-0 bg-[#030611]">
      {/* Deep Midnight Navy & Indigo Base Gradient */}
      <div 
        className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#05091a] via-[#030612] to-[#020308]" 
      />

      {/* Soft Ambient Glow Journeys (Smooth, battery-friendly ambient backlights) */}
      <div 
        className="absolute -top-[12%] -left-[10%] w-[380px] h-[380px] sm:w-[500px] sm:h-[500px] rounded-full bg-indigo-600/12 blur-[120px] sm:blur-[160px] animate-glow-journey-1 pointer-events-none" 
      />
      <div 
        className="absolute top-[38%] -right-[15%] w-[360px] h-[360px] sm:w-[480px] sm:h-[480px] rounded-full bg-violet-600/10 blur-[130px] sm:blur-[170px] animate-glow-journey-2 pointer-events-none" 
      />
      <div 
        className="absolute bottom-[2%] left-[4%] w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] rounded-full bg-blue-600/10 blur-[120px] sm:blur-[160px] animate-glow-journey-3 pointer-events-none" 
      />
      <div 
        className="absolute top-[20%] right-[15%] w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] rounded-full bg-rose-900/10 blur-[130px] sm:blur-[170px] animate-glow-journey-4 pointer-events-none" 
      />

      {/* Dynamic Symmetrical Floating Hearts & Stardust Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Subtle Cinematic Vignette for Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(1,3,8,0.72)_100%)] pointer-events-none" />
    </div>
  );
};
