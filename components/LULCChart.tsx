import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface LULCChartProps {
  data: { name: string; percentage: number; color: string }[];
}

export const LULCChart: React.FC<LULCChartProps> = ({ data }) => {
  return (
    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Land Use / Land Cover</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="percentage"
              nameKey="name"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};