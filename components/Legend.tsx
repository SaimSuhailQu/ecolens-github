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
    <div className="bg-slate-900/90 backdrop-blur-md p-3 rounded-xl shadow-2xl text-white w-40 border border-slate-700/50">
      <h4 className="text-[10px] md:text-xs font-bold mb-1.5 uppercase tracking-wider text-slate-400">{title}</h4>
      <div className="w-full h-3 rounded-full mb-1" style={{ background: gradient }}></div>
      <div className="flex justify-between text-[10px] font-mono text-slate-300">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
