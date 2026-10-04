import React, { useEffect, useRef } from 'react';

interface HeartParticle {
  x: number;
  y: number;
  size: number; // base scale
  speedY: number;
  driftX: number; // lateral constant drift
  swayFreq: number; // lateral wave frequency
  swayPhase: number; // lateral wave phase
  swayAmp: number; // lateral wave amplitude
  maxOpacity: number;
  hue: number;
  rotation: number; // constant slight tilt
  scaleVar: number; // scale breathing amplitude
  scalePhase: number; // scale breathing phase
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

    // Setup High-Definition Backing Store Size
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const handleResize = () => {
      if (!canvas) return;
      const currentDpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      
      canvas.width = width * currentDpr;
      canvas.height = height * currentDpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      const newCtx = canvas.getContext('2d');
      if (newCtx) {
        newCtx.scale(currentDpr, currentDpr);
      }
    };
    window.addEventListener('resize', handleResize);

    // =========================================================================
    // ELEGANT HEART PARTICLES (Perfect Symmetrical Floating Hearts)
    // =========================================================================
    const heartCount = 15;
    const heartHues = [225, 235, 250, 265, 335, 345]; // Premium bluish, lavender, violet, subtle pink

    const createHeart = (index?: number): HeartParticle => {
      const size = 8.0 + Math.random() * 8.0; // 8px to 16px
      const depthFactor = (size - 8.0) / 8.0; // 0 to 1

      const x = Math.random() * width;
      
      // Staggered Y position so they rise one after another smoothly, with no initial on-screen clutter
      let y = height + 15 + Math.random() * 80;
      if (typeof index === 'number') {
        y = height + 15 + index * (75 + Math.random() * 45);
      }

      const speedY = 0.3 + depthFactor * 0.35 + Math.random() * 0.15; // Smooth floating speed
      const driftX = (Math.random() - 0.5) * 0.12; // Very subtle lateral drift
      
      const swayFreq = 0.004 + Math.random() * 0.006;
      const swayPhase = Math.random() * Math.PI * 2;
      const swayAmp = 0.15 + Math.random() * 0.25;

      const maxOpacity = 0.12 + depthFactor * 0.22 + Math.random() * 0.06; // 0.12 to 0.4
      const hue = heartHues[Math.floor(Math.random() * heartHues.length)];
      
      // Fixed subtle tilt (+/- 8 degrees max) so hearts never look crooked, twisted, or unnatural
      const rotation = (Math.random() - 0.5) * 0.14;

      const scaleVar = 0.03 + Math.random() * 0.05;
      const scalePhase = Math.random() * Math.PI * 2;

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
      };
    };

    // Initialize particles with sequentially staggered offsets below the screen bottom
    const heartParticles: HeartParticle[] = Array.from({ length: heartCount }, (_, i) => 
      createHeart(i)
    );

    // Draw perfectly symmetric, unwarped geometric vector heart (Classic 1:1 ratio) with glossy glass highlight
    const drawSoftHeart = (
      x: number,
      y: number,
      size: number,
      opacity: number,
      hue: number,
      rotation: number
    ) => {
      if (opacity <= 0.001) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      // Delicate blue-lavender outer glow
      ctx.shadowBlur = size * 1.5;
      ctx.shadowColor = `hsla(${hue}, 90%, 75%, ${opacity * 0.85})`;

      // Premium glossy linear gradient fill (translucent glass effect)
      const gradient = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.7);
      gradient.addColorStop(0, `hsla(${hue}, 95%, 92%, ${opacity * 0.95})`);
      gradient.addColorStop(0.35, `hsla(${hue}, 88%, 84%, ${opacity * 0.8})`);
      gradient.addColorStop(1, `hsla(${hue}, 82%, 72%, ${opacity * 0.45})`);
      ctx.fillStyle = gradient;

      ctx.beginPath();
      // Start at top center dip
      ctx.moveTo(0, -size * 0.3);

      // Left lobe
      ctx.bezierCurveTo(
        -size * 0.35, -size * 0.75, // Control point 1
        -size * 0.75, -size * 0.35, // Control point 2
        -size * 0.75, 0             // End point
      );

      // Bottom left curve to tip
      ctx.bezierCurveTo(
        -size * 0.75, size * 0.35,  // Control point 1
        -size * 0.35, size * 0.75,  // Control point 2
        0, size                     // Bottom tip
      );

      // Bottom right curve to tip
      ctx.bezierCurveTo(
        size * 0.35, size * 0.75,
        size * 0.75, size * 0.35,
        size * 0.75, 0
      );

      // Right lobe
      ctx.bezierCurveTo(
        size * 0.75, -size * 0.35,
        size * 0.35, -size * 0.75,
        0, -size * 0.3
      );
      ctx.closePath();
      ctx.fill();

      // Delicate bright glowing edge stroke
      ctx.shadowBlur = 0; // Disable shadow for stroke to keep it sharp and clean
      ctx.strokeStyle = `hsla(${hue}, 95%, 90%, ${opacity * 0.75})`;
      ctx.lineWidth = size * 0.05 + 0.6; // Scale border thickness nicely
      ctx.stroke();

      // Soft Specular Highlights (gorgeous curved 3D glass sheen at top-left lobe)
      ctx.beginPath();
      ctx.ellipse(
        -size * 0.22, 
        -size * 0.22, 
        size * 0.20, 
        size * 0.08, 
        -Math.PI / 4, 
        0, 
        Math.PI * 2
      );
      ctx.fillStyle = `hsla(${hue}, 100%, 100%, ${opacity * 0.8})`;
      ctx.fill();

      ctx.restore();
    };

    let tick = 0;
    const render = () => {
      if (!isRunning) return;

      tick += 1;
      ctx.clearRect(0, 0, width, height);

      // Render Elegant Heart Particles (Foreground Layer)
      for (let i = 0; i < heartParticles.length; i++) {
        const p = heartParticles[i];

        // Move upward smoothly
        p.y -= p.speedY;

        // Apply constant lateral drift + soft sinus sway (symmetrical movement, no twisting)
        const swayValue = Math.sin(tick * p.swayFreq + p.swayPhase);
        p.x += p.driftX + swayValue * p.swayAmp;

        // Respiratory scale breathing variation (uniform 1:1 scaling)
        const currentScale = p.size * (1 + Math.sin(tick * 0.015 + p.scalePhase) * p.scaleVar);

        // Reset if it exits through the top edge
        if (p.y < -35) {
          heartParticles[i] = createHeart();
          continue;
        }

        // Wrap around horizontal boundaries if drifting too far off-screen
        if (p.x < -35) p.x = width + 35;
        else if (p.x > width + 35) p.x = -35;

        // Organic Fading: fade in as it enters bottom, fade out near top
        let opacityFactor = 1.0;
        const topFadeLimit = height * 0.22;
        const bottomFadeLimit = height * 0.88;

        if (p.y > bottomFadeLimit) {
          opacityFactor = Math.max(0, (height - p.y) / (height - bottomFadeLimit));
        } else if (p.y < topFadeLimit) {
          opacityFactor = Math.max(0, p.y / topFadeLimit);
        }

        if (p.y > height) {
          opacityFactor = 0;
        }

        const currentOpacity = p.maxOpacity * opacityFactor;
        drawSoftHeart(p.x, p.y, currentScale, currentOpacity, p.hue, p.rotation);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

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
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen min-h-[100dvh] pointer-events-none overflow-hidden z-0 bg-[#040711]">
      {/* Deep Navy & Midnight Base Gradient */}
      <div 
        className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#060b19] via-[#040712] to-[#02040a]" 
      />

      {/* Dynamic Full-Screen Ambient Light Glow Journeys */}
      <div 
        className="absolute -top-[10%] -left-[10%] w-[420px] h-[420px] sm:w-[540px] sm:h-[540px] rounded-full bg-indigo-500 blur-[140px] sm:blur-[180px] animate-glow-journey-1" 
      />
      <div 
        className="absolute top-[40%] -right-[15%] w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] rounded-full bg-violet-500 blur-[140px] sm:blur-[180px] animate-glow-journey-2" 
      />
      <div 
        className="absolute bottom-[5%] left-[5%] w-[380px] h-[380px] sm:w-[480px] sm:h-[480px] rounded-full bg-blue-600 blur-[130px] sm:blur-[170px] animate-glow-journey-3" 
      />
      <div 
        className="absolute top-[25%] right-[20%] w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-full bg-rose-950 blur-[140px] sm:blur-[180px] animate-glow-journey-4" 
      />

      {/* Symmetrical Floating Hearts Canvas (Behind all UI cards) */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Soft Vignette Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,4,10,0.65)_100%)] pointer-events-none" />
    </div>
  );
};
