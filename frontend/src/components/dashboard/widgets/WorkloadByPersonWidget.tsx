import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { WorkloadByPersonEntry } from '../../../types';

interface Props {
  data: WorkloadByPersonEntry[];
}

const FallbackTable: React.FC<{ data: WorkloadByPersonEntry[] }> = ({ data }) => (
  <table className="sr-only" aria-label="Workload by person data">
    <thead>
      <tr><th scope="col">Person</th><th scope="col">Items</th></tr>
    </thead>
    <tbody>
      {data.map(entry => (
        <tr key={entry.userId}>
          <td>{entry.name}</td>
          <td>{entry.count}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const WorkloadByPersonWidget: React.FC<Props> = ({ data }) => {
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <figure aria-label="Workload by person horizontal bar chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            width={120}
          />
          <Tooltip formatter={(value) => [`${value}`, 'Items']} />
          <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <FallbackTable data={sorted} />
    </figure>
  );
};

export default WorkloadByPersonWidget;
