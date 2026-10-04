import React, { useEffect, useRef } from 'react';

interface LoveParticle {
  x: number;
  y: number;
  scale: number;
  speedY: number;
  swayFreq: number;
  swayPhase: number;
  swayAmp: number;
  maxOpacity: number;
  hue: number;
  rotation: number;
}

interface StarParticle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  hue: number;
  phase: number;
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
    // ORGANIC FLOATING HEART PARTICLES (Perfect Bottom Spawn & Straight Upward Flow)
    // =========================================================================
    const loveParticleCount = 14; 
    const hues = [225, 235, 248, 260, 335, 345, 352];

    const createHeart = (idx: number, startOffscreenFar = false): LoveParticle => {
      // Slightly larger scale (+15-20%)
      const scale = Math.random() * 10 + 8.5; 
      const depthFactor = (scale - 8.5) / 10; 

      // DOMINANT VERTICAL UPWARD MOVEMENT (Slightly faster for more clean flow)
      const speedY = 0.35 + depthFactor * 0.35 + Math.random() * 0.12; 
      
      // VERY SUBTLE HORIZONTAL DRIFT (Extremely small sway amplitude)
      const swayAmp = 0.03 + depthFactor * 0.04 + Math.random() * 0.02; 
      
      const maxOpacity = 0.12 + depthFactor * 0.16 + Math.random() * 0.04; 
      
      const swayFreq = 0.006 + Math.random() * 0.005;
      const swayPhase = Math.random() * Math.PI * 2;
      const hue = hues[Math.floor(Math.random() * hues.length)];

      // Staggered bottom starting offsets to prevent clumped waves
      // Guaranteed to start completely off-screen below the bottom edge (height + offset)
      const initialOffset = startOffscreenFar ? 30 : 40 + (idx * 85);
      const y = height + initialOffset + Math.random() * 40;

      // Stratified Even Grid distribution across screen columns to prevent clustering/clumping
      const colWidth = width / loveParticleCount;
      const x = colWidth * (idx % loveParticleCount) + Math.random() * (colWidth * 0.4) + colWidth * 0.3;

      return {
        x,
        y,
        scale,
        speedY,
        swayFreq,
        swayPhase,
        swayAmp,
        maxOpacity,
        hue,
        rotation: 0,
      };
    };

    // Initialize ALL hearts strictly below the viewport bottom (never in the middle or upper area)
    const loveParticles: LoveParticle[] = Array.from({ length: loveParticleCount }, (_, idx) => 
      createHeart(idx, false)
    );

    // Subtle background stars
    const starCount = 16;
    const starParticles: StarParticle[] = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.1 + 0.5,
      speedY: Math.random() * 0.1 + 0.03,
      speedX: (Math.random() - 0.5) * 0.05,
      opacity: Math.random() * 0.2 + 0.06,
      hue: Math.random() > 0.5 ? 230 : 255,
      phase: Math.random() * Math.PI * 2,
    }));

    // Draw perfectly symmetric, unwarped geometric vector heart (Classic 1:1 ratio) with glossy glass highlight and glowing edges
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
      ctx.shadowColor = `hsla(${hue}, 90%, 75%, ${opacity * 0.8})`;

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

      // Delicate bright glowing edge stroke (matching blue-lavender theme)
      ctx.shadowBlur = 0; // Disable shadow for stroke to keep it sharp and clean
      ctx.strokeStyle = `hsla(${hue}, 95%, 90%, ${opacity * 0.7})`;
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

      // Update and render each heart
      for (let i = 0; i < loveParticles.length; i++) {
        const p = loveParticles[i];

        // Move primarily STRAIGHT UP
        p.y -= p.speedY;

        // Extremely slow and subtle left/right drift
        const swayValue = Math.sin(tick * p.swayFreq + p.swayPhase);
        p.x += swayValue * p.swayAmp;

        // Extremely subtle natural tilt aligned with lateral drift direction (no excessive spinning)
        p.rotation = swayValue * 0.06; 

        // Continues rising until they completely leave through the TOP edge of the screen
        if (p.y < -35) {
          loveParticles[i] = createHeart(i, true);
          continue;
        }

        // Horizontal wrap constraint (recycles if somehow pushed extremely wide)
        if (p.x < -35 || p.x > width + 35) {
          loveParticles[i] = createHeart(i, true);
          continue;
        }

        // Organic Fading:
        // - Gradually fade in as it enters from the absolute bottom edge of screen
        // - Fades out slowly as it leaves through the TOP edge
        let opacityFactor = 1.0;
        const topFadeLimit = height * 0.2;
        const bottomFadeLimit = height * 0.88;

        if (p.y > bottomFadeLimit) {
          opacityFactor = Math.max(0, (height - p.y) / (height - bottomFadeLimit));
        } else if (p.y < topFadeLimit) {
          // Fade out smoothly only near the top edge
          opacityFactor = Math.max(0, p.y / topFadeLimit);
        }

        // Absolutely invisible if still completely below viewport bottom
        if (p.y > height) {
          opacityFactor = 0;
        }

        const currentOpacity = p.maxOpacity * opacityFactor;
        drawSoftHeart(p.x, p.y, p.scale, currentOpacity, p.hue, p.rotation);
      }

      // Render starry background
      for (let i = 0; i < starParticles.length; i++) {
        const s = starParticles[i];
        s.y -= s.speedY;
        s.x += Math.sin(tick * 0.01 + s.phase) * 0.06 + s.speedX;

        if (s.y < -15) {
          s.y = height + 15;
          s.x = Math.random() * width;
        }
        if (s.x < -15) s.x = width + 15;
        if (s.x > width + 15) s.x = -15;

        const starOpacity = s.opacity * (0.65 + 0.35 * Math.sin(tick * 0.018 + s.phase));

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 80%, 85%, ${starOpacity})`;
        ctx.shadowBlur = 3;
        ctx.shadowColor = `hsla(${s.hue}, 90%, 75%, ${starOpacity})`;
        ctx.fill();
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

      {/* Love particles & starlight canvas (Behind all UI cards) */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Soft Vignette Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,4,10,0.65)_100%)] pointer-events-none" />
    </div>
  );
};
