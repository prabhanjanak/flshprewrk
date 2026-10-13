import React, { useEffect, useState } from 'react';

export const InteractiveBackground: React.FC = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden"
      style={{
        background: '#fdfdfd',
      }}
    >
      {/* Dynamic Orange Aura - Dual Layer */}
      <div 
        className="absolute w-[1000px] h-[1000px] rounded-full blur-[150px] opacity-[0.08] transition-transform duration-700 ease-out"
        style={{
          background: 'radial-gradient(circle, #f97316 0%, transparent 70%)',
          left: mousePos.x - 500,
          top: mousePos.y - 500,
        }}
      />
      <div 
        className="absolute w-[300px] h-[300px] rounded-full blur-[80px] opacity-10 transition-transform duration-300 ease-out"
        style={{
          background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)',
          left: mousePos.x - 150,
          top: mousePos.y - 150,
        }}
      />
      
      {/* Floating Glass Orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-100/30 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-orange-100/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Subtle Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
};
