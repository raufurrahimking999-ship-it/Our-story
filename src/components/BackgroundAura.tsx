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
  rotation: number;
  rotSpeed: number; // rotation speed
  scaleVar: number; // scale breathing amplitude
  scalePhase: number; // scale breathing phase
}

interface BubbleParticle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  driftX: number;
  swayFreq: number;
  swayPhase: number;
  swayAmp: number;
  baseOpacity: number;
  opacity: number;
  hue: number;
  glow: number;
  layer: 'back' | 'mid';
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
    // HEART PARTICLES (Perfect Organic Bottom Spawn & Smooth Floating Trajectories)
    // =========================================================================
    const heartCount = 12;
    const heartHues = [225, 235, 250, 265, 335, 345]; // Premium bluish, lavender, violet, subtle pink

    const createHeart = (startOffscreenFar = false): HeartParticle => {
      // 3D Depth effect: larger size = closer, faster, more opaque.
      const size = 7.0 + Math.random() * 9.0; // 7px to 16px
      const depthFactor = (size - 7.0) / 9.0; // 0 to 1

      const x = Math.random() * width;
      // Staggered Y bottom offsets to prevent waves/clumping
      const y = startOffscreenFar
        ? height + 15 + Math.random() * 120
        : Math.random() * height; // Distribute across entire screen on startup

      const speedY = 0.25 + depthFactor * 0.3 + Math.random() * 0.15; // Speed proportional to size
      
      // Some drift left, some right, some travel straight
      const driftX = (Math.random() - 0.5) * 0.25; 
      
      const swayFreq = 0.003 + Math.random() * 0.007;
      const swayPhase = Math.random() * Math.PI * 2;
      const swayAmp = 0.1 + Math.random() * 0.4;

      const maxOpacity = 0.1 + depthFactor * 0.25 + Math.random() * 0.05; // 0.1 to 0.4
      const hue = heartHues[Math.floor(Math.random() * heartHues.length)];
      
      // Gentle initial rotation and slow sway-aligned rotation speed
      const rotation = (Math.random() - 0.5) * 0.5;
      const rotSpeed = (Math.random() - 0.5) * 0.003;

      const scaleVar = 0.04 + Math.random() * 0.08;
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
        rotSpeed,
        scaleVar,
        scalePhase,
      };
    };

    // =========================================================================
    // ROMANTIC TINY BUBBLES / PARTICLES (Layered Depth & Atmos)
    // =========================================================================
    const bubbleCount = 45;
    const bubbleHues = [195, 210, 220, 250, 265, 275, 340]; // Icy blue, soft blue, lavender, violet, subtle pink

    const createBubble = (startOffscreenFar = false): BubbleParticle => {
      // Decouple size into back vs mid layer
      const layer = Math.random() > 0.4 ? 'mid' : 'back';
      
      let size = 1.5;
      if (layer === 'back') {
        size = 1.0 + Math.random() * 1.5; // 1 to 2.5 px
      } else {
        size = 2.5 + Math.random() * 3.5; // 2.5 to 6 px
      }

      const x = Math.random() * width;
      // Start randomly along the bottom & middle-lower area initially,
      // or strictly below screen if respawning
      const y = startOffscreenFar 
        ? height + 10 + Math.random() * 100 
        : Math.random() * height; // Start scattered on screen initially to avoid empty start

      const speedY = layer === 'back' 
        ? 0.12 + Math.random() * 0.18 // Very slow background particles
        : 0.25 + Math.random() * 0.35; // Moderate speed middle layer

      const driftX = (Math.random() - 0.5) * 0.1;
      const swayFreq = 0.005 + Math.random() * 0.008;
      const swayPhase = Math.random() * Math.PI * 2;
      const swayAmp = 0.15 + Math.random() * 0.5;

      const baseOpacity = layer === 'back'
        ? 0.08 + Math.random() * 0.12 // Faint background opacity
        : 0.16 + Math.random() * 0.24; // Soft glowing middle opacity

      const hue = bubbleHues[Math.floor(Math.random() * bubbleHues.length)];
      const glow = layer === 'back' ? 1 : 2 + Math.random() * 3;

      return {
        x,
        y,
        size,
        speedY,
        driftX,
        swayFreq,
        swayPhase,
        swayAmp,
        baseOpacity,
        opacity: baseOpacity,
        hue,
        glow,
        layer,
      };
    };

    // Initialize particles scattered on screen initially to avoid empty startup lag
    const heartParticles: HeartParticle[] = Array.from({ length: heartCount }, () => 
      createHeart(false)
    );

    const bubbles: BubbleParticle[] = Array.from({ length: bubbleCount }, () => 
      createBubble(false)
    );

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

      // 1. Render Layered Bubbles / Particles (Background & Middle Layer)
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        
        // Move upward
        b.y -= b.speedY;

        // Apply gentle horizontal drift and sway
        const swayValue = Math.sin(tick * b.swayFreq + b.swayPhase);
        b.x += b.driftX + swayValue * b.swayAmp;

        // Slow fading breathing/twinkle effect
        b.opacity = b.baseOpacity * (0.7 + 0.3 * Math.sin(tick * 0.025 + b.swayPhase));

        // Reset if it exits through the top edge
        if (b.y < -15) {
          bubbles[i] = createBubble(true);
          continue;
        }

        // Horizontal wrap
        if (b.x < -15) b.x = width + 15;
        else if (b.x > width + 15) b.x = -15;

        // Organic fading at screen boundaries
        let opacityFactor = 1.0;
        const topFadeLimit = height * 0.15;
        const bottomFadeLimit = height * 0.92;

        if (b.y > bottomFadeLimit) {
          opacityFactor = Math.max(0, (height - b.y) / (height - bottomFadeLimit));
        } else if (b.y < topFadeLimit) {
          opacityFactor = Math.max(0, b.y / topFadeLimit);
        }

        const currentOpacity = b.opacity * opacityFactor;

        if (currentOpacity > 0.001) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
          
          if (b.layer === 'mid') {
            // Glowing bubble
            ctx.shadowBlur = b.glow;
            ctx.shadowColor = `hsla(${b.hue}, 90%, 80%, ${currentOpacity * 0.8})`;
            ctx.fillStyle = `hsla(${b.hue}, 95%, 95%, ${currentOpacity})`;
          } else {
            // Background tiny particle
            ctx.shadowBlur = 0;
            ctx.fillStyle = `hsla(${b.hue}, 80%, 90%, ${currentOpacity * 0.75})`;
          }
          
          ctx.fill();
          ctx.shadowBlur = 0; // reset shadow for next draws
        }
      }

      // 2. Render Elegant Heart Particles (Foreground Layer)
      for (let i = 0; i < heartParticles.length; i++) {
        const p = heartParticles[i];

        // Move upward
        p.y -= p.speedY;

        // Apply constant lateral drift + soft sinus sway
        const swayValue = Math.sin(tick * p.swayFreq + p.swayPhase);
        p.x += p.driftX + swayValue * p.swayAmp;

        // Apply gentle rotation drift over time
        p.rotation += p.rotSpeed + Math.cos(tick * p.swayFreq) * 0.0015;

        // Respiratory scale breathing variation
        const currentScale = p.size * (1 + Math.sin(tick * 0.015 + p.scalePhase) * p.scaleVar);

        // Reset if it exits through the top edge
        if (p.y < -35) {
          heartParticles[i] = createHeart(true);
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

      {/* Love particles & starlight canvas (Behind all UI cards) */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Soft Vignette Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,4,10,0.65)_100%)] pointer-events-none" />
    </div>
  );
};
