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
import { MonthlyDataPoint } from '../types';

interface ChartProps {
  data: MonthlyDataPoint[];
}

export const VegetationChart: React.FC<ChartProps> = ({ data }) => {
  return (
    <div className="w-full h-64">
      <h3 className="text-sm font-semibold text-slate-400 mb-2">Remote Sensing Indices</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={10} domain={[-1, 1]} tickLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Legend />
          <Line type="monotone" dataKey="ndvi" stroke="#4ade80" strokeWidth={2} dot={false} name="NDVI" />
          <Line type="monotone" dataKey="evi" stroke="#22d3ee" strokeWidth={2} dot={false} name="EVI" />
          <Line type="monotone" dataKey="ndwi" stroke="#3b82f6" strokeWidth={2} dot={false} name="NDWI" />
          <Line type="monotone" dataKey="ndbi" stroke="#f97316" strokeWidth={2} dot={false} name="NDBI" />
          <Line type="monotone" dataKey="savi" stroke="#a855f7" strokeWidth={2} dot={false} name="SAVI" />
          <Line type="monotone" dataKey="msavi" stroke="#fbbf24" strokeWidth={2} dot={false} name="MSAVI" />
          <Line type="monotone" dataKey="ndsi" stroke="#f87171" strokeWidth={2} dot={false} name="NDSI" />
          <Line type="monotone" dataKey="ui" stroke="#e879f9" strokeWidth={2} dot={false} name="UI" />
          <Line type="monotone" dataKey="bsi" stroke="#8b5cf6" strokeWidth={2} dot={false} name="BSI" />
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