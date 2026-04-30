import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface LandCoverItem {
  name: string;
  percentage: number;
  color: string;
}

interface Props {
  data: LandCoverItem[];
}

export const LandCoverDonut: React.FC<Props> = ({ data }) => {
  return (
    <div className="w-full h-64">
       <h3 className="text-sm font-semibold text-slate-400 mb-2">Estimated Land Cover</h3>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="percentage"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip 
             contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
          />
          <Legend 
             layout="vertical" 
             verticalAlign="middle" 
             align="right"
             iconType="circle"
             iconSize={8}
             wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};