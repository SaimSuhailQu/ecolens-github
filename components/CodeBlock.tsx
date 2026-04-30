import React from 'react';
import { Copy } from 'lucide-react';

interface Props {
  code: string;
}

export const CodeBlock: React.FC<Props> = ({ code }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="relative group mt-4">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={handleCopy}
          className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
          title="Copy Code"
        >
          <Copy size={14} />
        </button>
      </div>
      <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-xs font-mono text-green-400 border border-slate-800">
        <code>{code}</code>
      </pre>
    </div>
  );
};