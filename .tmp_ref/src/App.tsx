import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Play, AlertTriangle, Grid } from 'lucide-react';

// --- Background Component ---
const CyberBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: { x: number; y: number; size: number; speedY: number; opacity: number; color: string }[] = [];
    const particleCount = 60;
    
    // Pink/Purple Palette
    const colors = ['rgba(255, 0, 204, OPACITY)', 'rgba(157, 0, 255, OPACITY)'];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 3 + 1,
        speedY: Math.random() * 0.8 + 0.2,
        opacity: Math.random() * 0.6 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    const draw = () => {
      // Clear with slight trail effect
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(255, 0, 204, 0.08)'; // Pinkish grid
      ctx.lineWidth = 1;
      const gridSize = 50;
      
      // Vertical Lines
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      // Horizontal Lines
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Particles
      particles.forEach((p) => {
        p.y -= p.speedY;
        if (p.y < 0) {
          p.y = height;
          p.x = Math.random() * width;
        }

        ctx.fillStyle = p.color.replace('OPACITY', p.opacity.toString());
        ctx.fillRect(p.x, p.y, p.size, p.size); 
      });

      requestAnimationFrame(draw);
    };

    const animId = requestAnimationFrame(draw);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none mix-blend-screen" />;
};

// --- Glitch Title Component ---
const GlitchTitle = ({ text }: { text: string }) => {
  return (
    <div className="relative mb-12 select-none group">
      <h1 
        className="text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-fuchsia-300 glitch-text"
        data-text={text}
        style={{ fontFamily: '"Rajdhani", sans-serif', fontWeight: 700 }}
      >
        {text}
      </h1>
      <div className="absolute -bottom-4 left-0 w-full flex justify-between items-center text-sm text-neon-pink/90 font-mono tracking-widest">
        <span>SYS.INIT.V.9.0</span>
        <span className="animate-pulse text-neon-purple">STANDBY</span>
      </div>
      <div className="absolute -top-6 -right-6 text-neon-pink/40">
        <Grid size={48} className="animate-spin-slow opacity-30" />
      </div>
    </div>
  );
};

// --- Menu Button Component ---
interface MenuButtonProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
  index: number;
}

const MenuButton = ({ icon, title, subtitle, active, onClick, index }: MenuButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5 + index * 0.1, type: "spring", stiffness: 100 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`
        relative w-full max-w-md group flex items-center p-6 mb-4 text-left transition-all duration-300
        border-l-4 overflow-hidden clip-path-angled backdrop-blur-sm
        ${active || isHovered 
          ? 'bg-neon-pink/10 border-neon-pink shadow-[0_0_15px_rgba(255,0,204,0.3)]' 
          : 'bg-white/5 border-white/20 hover:border-neon-purple hover:bg-white/10'}
      `}
    >
      {/* Glossy PVC Reflection */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none" />

      {/* Background Hover Effect */}
      <div className={`absolute inset-0 bg-gradient-to-r from-neon-pink/20 to-transparent transition-transform duration-300 origin-left ${isHovered ? 'scale-x-100' : 'scale-x-0'}`} />

      {/* Icon Box */}
      <div className={`
        relative z-10 flex items-center justify-center w-12 h-12 mr-6 
        border transition-colors duration-300
        ${active || isHovered ? 'border-neon-pink bg-neon-pink/20 text-neon-pink' : 'border-white/20 bg-black/50 text-gray-400'}
      `}>
        {icon}
        {/* Tactical corners for icon */}
        <div className="absolute top-0 left-0 w-1 h-1 bg-current" />
        <div className="absolute bottom-0 right-0 w-1 h-1 bg-current" />
      </div>

      {/* Text Content */}
      <div className="relative z-10 flex-1">
        <div className="flex items-baseline justify-between">
          <h3 className={`text-xl font-bold tracking-wider uppercase font-mono ${active || isHovered ? 'text-white text-shadow-pink' : 'text-gray-300'}`}>
            {title}
          </h3>
          <span className="text-xs font-mono text-gray-500 opacity-50">0{index + 1}</span>
        </div>
        <p className={`text-xs font-mono mt-1 tracking-wide ${active || isHovered ? 'text-neon-purple' : 'text-gray-500'}`}>
          {subtitle}
        </p>
      </div>

      {/* Hover Decoration */}
      <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <AlertTriangle size={16} className="text-neon-pink animate-pulse" />
      </div>
    </motion.button>
  );
};

// --- Graffiti / Atmosphere Overlay ---
const GraffitiOverlay = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden mix-blend-overlay opacity-30">
      <div className="absolute top-[-10%] right-[-10%] text-[20rem] font-black text-white/5 rotate-12 select-none font-mono">
        SYSTEM
      </div>
      <div className="absolute bottom-[-10%] left-[-5%] text-[15rem] font-black text-transparent rotate-[-5deg] select-none font-mono" style={{ WebkitTextStroke: '2px rgba(255, 0, 204, 0.3)' }}>
        ERROR
      </div>
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] border-[20px] border-neon-pink/10 rounded-full blur-xl" />
    </div>
  );
};

// --- Decorative Overlay ---
const OverlayUI = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-20">
      {/* Top Left */}
      <div className="absolute top-8 left-8 flex flex-col gap-2">
        <div className="flex items-center gap-2">
           <div className="w-2 h-8 bg-neon-pink" />
           <div className="text-xs font-mono text-white/70 leading-tight">
             <div>OPERATOR: GUEST</div>
             <div>ID: #894-221-X</div>
           </div>
        </div>
      </div>

      {/* Top Right */}
      <div className="absolute top-8 right-8 text-right">
        <div className="text-4xl font-mono font-bold text-white/10">UNKNOWN</div>
        <div className="text-xs font-mono text-neon-pink/80 mt-1">SYSTEM ONLINE</div>
      </div>

      {/* Bottom Left */}
      <div className="absolute bottom-8 left-8">
        <div className="w-64 h-32 border border-white/10 bg-black/40 backdrop-blur-sm p-4 relative">
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-neon-pink" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-neon-pink" />
          <div className="text-[10px] font-mono text-gray-400 mb-2">SYSTEM LOG</div>
          <div className="space-y-1 text-[10px] font-mono text-neon-pink/70">
            <p>{'>'} Initializing UI components...</p>
            <p>{'>'} Loading assets... OK</p>
            <p>{'>'} Connection established.</p>
            <p className="animate-pulse">{'>'} Waiting for user input_</p>
          </div>
        </div>
      </div>

      {/* Bottom Right */}
      <div className="absolute bottom-8 right-8 flex items-end gap-4">
         <div className="flex flex-col items-end gap-1">
            <div className="w-32 h-1 bg-white/20">
              <div className="w-2/3 h-full bg-neon-pink animate-pulse" />
            </div>
            <div className="text-[10px] font-mono text-gray-500">MEMORY USAGE</div>
         </div>
         <div className="w-16 h-16 border-2 border-white/20 rounded-full flex items-center justify-center animate-spin-slow-reverse">
            <div className="w-12 h-12 border border-dashed border-neon-pink rounded-full" />
         </div>
      </div>

      {/* Scanline */}
      <div className="absolute inset-0 scanline z-30 opacity-20" />
      
      {/* Noise Texture (Simulated via CSS) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      {/* Caution Strip */}
      <div className="absolute bottom-0 left-0 w-full h-8 bg-neon-pink/80 flex items-center overflow-hidden rotate-0 z-50 mix-blend-hard-light">
        <div className="flex animate-marquee whitespace-nowrap text-black font-black text-sm tracking-widest font-mono select-none">
          {Array(20).fill("WARNING // UNAUTHORIZED ACCESS PROHIBITED // CAUTION // BIOLOGICAL HAZARD // ").map((t, i) => (
             <span key={i} className="mx-4">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export function App() {
  return (
    <div className="relative min-h-screen w-full bg-dark-bg text-white overflow-hidden selection:bg-neon-purple selection:text-white">
      <CyberBackground />
      <GraffitiOverlay />
      <OverlayUI />

      {/* Main Content Container */}
      <main className="relative z-10 flex h-screen items-center px-12 lg:px-24">
        <div className="flex flex-col items-start w-full max-w-4xl">
          
          {/* Header Animation */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="flex items-center gap-4 mb-4">
              <span className="px-2 py-0.5 bg-neon-purple text-black text-xs font-bold font-mono">BETA BUILD</span>
              <div className="h-[1px] w-24 bg-gradient-to-r from-neon-purple to-transparent" />
            </div>
            <GlitchTitle text="WELCOME" />
          </motion.div>

          {/* Buttons Area */}
          <div className="flex flex-col gap-6 w-full max-w-md mt-12 relative">
            {/* Decoration line connecting buttons */}
            <div className="absolute left-[-20px] top-0 bottom-0 w-[2px] bg-white/10 hidden md:block">
              <div className="absolute top-0 w-full h-1/2 bg-neon-pink/50" />
            </div>

            <MenuButton 
              index={0}
              icon={<Play className="w-6 h-6" />}
              title="新建工程"
              subtitle="Initialize new operational matrix"
              onClick={() => console.log('New Project')}
            />
            
            <MenuButton 
              index={1}
              icon={<Upload className="w-6 h-6" />}
              title="导入工程"
              subtitle="Load existing tactical data"
              onClick={() => console.log('Import Network')}
            />
          </div>

        </div>

        {/* Right Side Decorative Graphic (Holographic Character or Abstract Shape) */}
        <motion.div 
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute right-0 top-0 h-full w-1/3 hidden lg:flex items-center justify-center pointer-events-none"
        >
           {/* Abstract Holographic Element */}
           <div className="relative w-full h-full opacity-60 flex items-center justify-center">
             <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-neon-pink/20 rounded-full blur-[100px] animate-pulse" />
             <div className="absolute bottom-1/4 right-20 w-[400px] h-[400px] bg-neon-purple/20 rounded-full blur-[80px]" />
             
             {/* Complex Geometric Structure (SVG) */}
             <svg className="w-full h-full max-w-[500px]" viewBox="0 0 500 800" fill="none" xmlns="http://www.w3.org/2000/svg">
               <defs>
                 <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                   <stop offset="0%" style={{stopColor:'rgb(255, 0, 204)', stopOpacity:0.5}} />
                   <stop offset="100%" style={{stopColor:'rgb(157, 0, 255)', stopOpacity:0.1}} />
                 </linearGradient>
               </defs>
               
               {/* Main Frame */}
               <path d="M 50 100 L 450 100 L 480 130 L 480 670 L 450 700 L 50 700 L 20 670 L 20 130 Z" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="rgba(0,0,0,0.2)" />
               
               {/* Inner Frame */}
               <path d="M 60 140 L 440 140 L 440 660 L 60 660 Z" stroke="url(#grad1)" strokeWidth="1" strokeDasharray="4 2" />
               
               {/* Center Hexagon Cluster */}
               <g transform="translate(250, 400)">
                  <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25" fill="none" stroke="rgba(255, 0, 204, 0.4)" strokeWidth="2" className="animate-spin-slow" />
                  <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" fill="rgba(157, 0, 255, 0.2)" stroke="none" />
               </g>

               {/* Data Circles */}
               <circle cx="250" cy="400" r="150" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
               <circle cx="250" cy="400" r="180" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="10 20" className="animate-spin-slow-reverse" />
               
               {/* Angled Lines */}
               <line x1="20" y1="200" x2="150" y2="200" stroke="rgba(255, 0, 204, 0.3)" strokeWidth="2" />
               <line x1="20" y1="210" x2="100" y2="210" stroke="rgba(255, 0, 204, 0.3)" strokeWidth="1" />
               
               <line x1="480" y1="600" x2="350" y2="600" stroke="rgba(157, 0, 255, 0.3)" strokeWidth="2" />
               <line x1="480" y1="610" x2="400" y2="610" stroke="rgba(157, 0, 255, 0.3)" strokeWidth="1" />

               {/* Random Text */}
               <text x="70" y="170" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">SYSTEM.READY</text>
               <text x="350" y="650" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace" textAnchor="end">TARGET.LOCK</text>
             </svg>
           </div>
        </motion.div>
      </main>
    </div>
  );
}
