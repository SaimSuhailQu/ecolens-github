import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { MonthlyDataPoint, AVAILABLE_INDICES } from '../types';

interface ChartProps {
  data: MonthlyDataPoint[];
  category?: string;
  activeIndices?: string[];
}

export const DynamicIndexChart: React.FC<ChartProps> = ({ data, category = 'All', activeIndices = [] }) => {
  const colors = [
    '#4ade80', '#22d3ee', '#3b82f6', '#f97316', '#a855f7', 
    '#fbbf24', '#f87171', '#e879f9', '#8b5cf6', '#6366f1',
    '#ec4899', '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4'
  ];

  // Only render indices that are both in the current category and actively selected by the user
  const chartIndices = AVAILABLE_INDICES.filter(idx => {
    if (['rainfall', 'temperature', 'pdsi', 'spei'].includes(idx.id)) return false;
    if (category !== 'All' && idx.category !== category) return false;
    return activeIndices.includes(idx.id);
  });

  return (
    <div className="w-full h-64">
      <h3 className="text-sm font-semibold text-slate-400 mb-2">
        {category === 'All' ? 'Key Environmental Indices' : `${category} Indices`}
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} tickLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          {chartIndices.map((idx, i) => (
            <Line 
              key={idx.id}
              type="monotone" 
              dataKey={idx.id} 
              stroke={colors[i % colors.length]} 
              strokeWidth={2} 
              dot={false} 
              name={idx.name} 
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ClimateChart: React.FC<ChartProps> = ({ data }) => {
  return (
    <div className="w-full h-64">
      <h3 className="text-sm font-semibold text-slate-400 mb-2">Climate Data (Rainfall & Temp)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <Tooltip 
             contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
          />
          <Legend />
          <Area yAxisId="left" type="monotone" dataKey="rainfall" fill="#3b82f6" stroke="#2563eb" fillOpacity={0.3} name="Rainfall (mm)" />
          <Area yAxisId="right" type="monotone" dataKey="temperature" fill="#f97316" stroke="#ea580c" fillOpacity={0.1} name="Temp (°C)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};