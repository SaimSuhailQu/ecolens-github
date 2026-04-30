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
    <div className="absolute bottom-16 right-4 md:bottom-10 md:right-4 bg-slate-800/80 backdrop-blur-md p-2 md:p-3 rounded-lg shadow-lg text-white w-32 md:w-40 z-[1000] border border-slate-700/50">
      <h4 className="text-[10px] md:text-xs font-bold mb-1.5">{title}</h4>
      <div className="w-full h-3 rounded" style={{ background: gradient }}></div>
      <div className="flex justify-between text-[10px] md:text-xs mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
