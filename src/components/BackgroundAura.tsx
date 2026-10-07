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
  rotation: number; // base slight tilt
  scaleVar: number; // scale breathing amplitude
  scalePhase: number; // scale breathing phase
}

export const BackgroundAura: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isRunning = true;

    // Detect Device Pixel Ratio (clamped to min 2 for razor-sharp Retina/OLED rendering without blur or jagged edges)
    let dpr = Math.max(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setupCanvasResolution = () => {
      if (!canvas) return;
      dpr = Math.max(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      // High-Definition Backing Store Size
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Set clean transform matrix and configure high quality vector rendering
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };

    setupCanvasResolution();

    const handleResize = () => {
      setupCanvasResolution();
    };
    window.addEventListener('resize', handleResize);

    // =========================================================================
    // PRESERVED ROMANTIC BLUISH HEARTS (High Quality, Symmetrical & Premium)
    // =========================================================================
    const heartCount = 18;
    // Original romantic bluish & lavender/violet theme
    const heartHues = [222, 232, 245, 258, 270, 335];

    // Stratified lane tracking to ensure uniform full-width distribution across left, center, right
    let currentLane = Math.floor(Math.random() * 5);
    const getDistributedX = (screenWidth: number): number => {
      const numLanes = 5;
      const laneWidth = screenWidth / numLanes;
      const padding = 18;
      
      const lane = currentLane % numLanes;
      currentLane = (currentLane + 1 + Math.floor(Math.random() * 2)) % numLanes;

      const minX = lane * laneWidth + padding;
      const maxX = (lane + 1) * laneWidth - padding;
      return minX + Math.random() * Math.max(10, maxX - minX);
    };

    // Five distinct random size categories as specified:
    // - খুব ছোট (Very small)
    // - ছোট (Small)
    // - medium (Medium)
    // - একটু বড় (Slightly large)
    // - মাঝে মাঝে বড় (Occasionally large - rare, non-cluttering)
    const getRandomSize = (): number => {
      const roll = Math.random();
      if (roll < 0.28) {
        // খুব ছোট: 5.5px - 7.5px
        return 5.5 + Math.random() * 2.0;
      } else if (roll < 0.62) {
        // ছোট: 8px - 10.5px
        return 8.0 + Math.random() * 2.5;
      } else if (roll < 0.86) {
        // medium: 11.5px - 14.5px
        return 11.5 + Math.random() * 3.0;
      } else if (roll < 0.96) {
        // একটু বড়: 15.5px - 18px
        return 15.5 + Math.random() * 2.5;
      } else {
        // মাঝে মাঝে বড়: 19.5px - 23px (occasional, preserves clean uncluttered atmosphere)
        return 19.5 + Math.random() * 3.5;
      }
    };

    const createHeart = (initialSpawnIndex?: number): HeartParticle => {
      const size = getRandomSize();
      // Relative size weight (0 for smallest, 1 for largest)
      const sizeRatio = (size - 5.5) / (23 - 5.5);

      const x = getDistributedX(width);

      // Y positioning:
      // - Initial mount: staggered below screen bottom so NO hearts start already on-screen,
      //   and they naturally rise from the bottom one after another in random sequence.
      // - Respawn during runtime: spawns just below the bottom edge.
      let y: number;
      if (typeof initialSpawnIndex === 'number') {
        // Staggered below screen so they rise gradually from the bottom
        y = height + 18 + (initialSpawnIndex * (height * 0.9) / heartCount) + Math.random() * 35;
      } else {
        // Spawns just below screen bottom
        y = height + size * 1.6 + Math.random() * 25;
      }

      // Smooth floating speed: varying speeds, smaller float lighter, larger have calm presence
      const speedY = 0.42 + (1 - sizeRatio * 0.3) * 0.28 + Math.random() * 0.18;

      // Subtle lateral drift
      const driftX = (Math.random() - 0.5) * 0.18;

      // Gentle floating sway curve
      const swayFreq = 0.005 + Math.random() * 0.005;
      const swayPhase = Math.random() * Math.PI * 2;
      const swayAmp = 0.22 + Math.random() * 0.32;

      // Luminous max opacity (0.16 to 0.46)
      const maxOpacity = 0.18 + sizeRatio * 0.24 + Math.random() * 0.06;
      const hue = heartHues[Math.floor(Math.random() * heartHues.length)];

      // Subtle organic tilt (+/- 7 degrees)
      const rotation = (Math.random() - 0.5) * 0.12;

      // Gentle scale breathing
      const scaleVar = 0.025 + Math.random() * 0.035;
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

    // Initialize particles: all starting below screen bottom so initial screen load has no hearts already filled
    const heartParticles: HeartParticle[] = Array.from({ length: heartCount }, (_, i) =>
      createHeart(i)
    );

    // Draw pristine, razor-sharp vector heart preserving original design, shape, and romantic bluish gradient
    const drawSoftHeart = (
      x: number,
      y: number,
      size: number,
      opacity: number,
      hue: number,
      rotation: number
    ) => {
      if (opacity <= 0.002 || size <= 0) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      // Subtle, clean romantic bluish outer aura
      ctx.shadowBlur = Math.round(size * 0.85);
      ctx.shadowColor = `hsla(${hue}, 95%, 75%, ${opacity * 0.65})`;

      // Premium glossy linear gradient fill (preserved translucent glass effect)
      const gradient = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.7);
      gradient.addColorStop(0, `hsla(${hue}, 95%, 93%, ${opacity * 0.95})`);
      gradient.addColorStop(0.35, `hsla(${hue}, 88%, 84%, ${opacity * 0.82})`);
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

      // Sharp, clean glowing edge stroke (zero blur on stroke to prevent jagged/blurry edges)
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `hsla(${hue}, 95%, 92%, ${opacity * 0.85})`;
      ctx.lineWidth = Math.max(0.75, size * 0.058);
      ctx.stroke();

      // Soft Specular Highlight: crisp 3D curved glass sheen at top-left lobe
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
      ctx.fillStyle = `hsla(${hue}, 100%, 100%, ${opacity * 0.85})`;
      ctx.fill();

      ctx.restore();
    };

    let tick = 0;
    let lastTime = performance.now();

    const render = (currentTime: number) => {
      if (!isRunning) return;

      const elapsed = currentTime - lastTime;
      lastTime = currentTime;

      // Delta time factor normalized to 60 FPS (16.67ms per frame)
      // Clamped to avoid large leaps when switching tabs
      const dt = Math.min(Math.max(elapsed / 16.667, 0.4), 2.0);
      tick += dt;

      ctx.clearRect(0, 0, width, height);

      // Render Elegant Heart Particles (Foreground Layer)
      for (let i = 0; i < heartParticles.length; i++) {
        const p = heartParticles[i];

        // Move upward smoothly from bottom
        p.y -= p.speedY * dt;

        // Natural movement: subtle left/right drift + gentle harmonic curve sway
        const primarySway = Math.sin(tick * p.swayFreq + p.swayPhase);
        const secondarySway = Math.cos(tick * p.swayFreq * 0.65 + p.swayPhase) * 0.28;
        p.x += (p.driftX + (primarySway + secondarySway) * p.swayAmp) * dt;

        // Subtle tilt sway in sync with horizontal movement
        const currentTilt = p.rotation + primarySway * 0.035;

        // Gentle scale breathing
        const currentScale = p.size * (1 + Math.sin(tick * 0.016 + p.scalePhase) * p.scaleVar);

        // Reset when exiting smoothly past top edge
        if (p.y < -35) {
          heartParticles[i] = createHeart();
          continue;
        }

        // Horizontal soft wrapping
        if (p.x < -30) p.x = width + 30;
        else if (p.x > width + 30) p.x = -30;

        // =======================================================================
        // Flow & Fade: Bottom -> Middle -> Upper screen -> Top -> Fade out
        // - Clearly visible when rising from bottom
        // - Softly alive in middle screen
        // - Gradually fades as it reaches upper screen, disappearing near top
        // =======================================================================
        let opacityFactor = 1.0;

        if (p.y > height) {
          // Off-screen at bottom: invisible until entering
          opacityFactor = 0;
        } else if (p.y > height - 45) {
          // Smooth quick entry right at bottom edge to full clarity
          opacityFactor = Math.max(0, (height - p.y) / 45);
        } else if (p.y >= height * 0.62) {
          // Bottom to lower-middle: clearly visible and vibrant
          opacityFactor = 1.0;
        } else if (p.y >= height * 0.22) {
          // Middle to upper screen: gradual gentle fade
          const fadeRatio = (p.y - height * 0.22) / (height * 0.62 - height * 0.22);
          opacityFactor = 0.58 + 0.42 * fadeRatio;
        } else {
          // Upper screen towards top: smoothly dissolves into thin air
          const topFade = (p.y + 25) / (height * 0.22 + 25);
          opacityFactor = Math.max(0, 0.58 * topFade);
        }

        const currentOpacity = p.maxOpacity * opacityFactor;
        drawSoftHeart(p.x, p.y, currentScale, currentOpacity, p.hue, currentTilt);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
      } else {
        if (!isRunning) {
          isRunning = true;
          lastTime = performance.now();
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
