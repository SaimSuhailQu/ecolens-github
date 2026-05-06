import React from 'react';

interface LegendProps {
  visParams: {
    min: number;
    max: number;
    palette: string[];
  };
  title: string;
}

export const Legend: React.FC<LegendProps> = ({ visParams, title }) => {
  const { min, max, palette } = visParams;
  const gradient = `linear-gradient(to right, ${palette.join(',')})`;

  return (
    <div className="glass-card p-4 rounded-2xl w-48 animate-fade-in-up">
      <h4 className="text-[10px] font-black mb-3 uppercase tracking-[0.2em] text-emerald-400 border-b border-white/5 pb-2">{title}</h4>
      <div className="w-full h-4 rounded-lg mb-2 shadow-inner" style={{ background: gradient }}></div>
      <div className="flex justify-between text-[10px] font-black text-slate-400 font-mono">
        <span className="bg-slate-950/50 px-2 py-0.5 rounded border border-white/5">{min}</span>
        <span className="bg-slate-950/50 px-2 py-0.5 rounded border border-white/5">{max}</span>
      </div>
    </div>
  );
};
