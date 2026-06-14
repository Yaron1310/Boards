import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import type { StatusDistributionEntry } from '../../../types';

interface Props {
  data: StatusDistributionEntry[];
}

const PIE_THRESHOLD = 6;

const FallbackTable: React.FC<{ data: StatusDistributionEntry[] }> = ({ data }) => (
  <table className="sr-only" aria-label="Status distribution data">
    <thead>
      <tr><th scope="col">Status</th><th scope="col">Count</th></tr>
    </thead>
    <tbody>
      {data.map(entry => (
        <tr key={entry.statusId}>
          <td>{entry.label}</td>
          <td>{entry.count}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const StatusDistributionWidget: React.FC<Props> = ({ data }) => {
  if (data.length <= PIE_THRESHOLD) {
    return (
      <figure aria-label="Status distribution pie chart">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={90}
            >
              {data.map(entry => (
                <Cell key={entry.statusId} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [`${value}`, 'Items']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <FallbackTable data={data} />
      </figure>
    );
  }

  return (
    <figure aria-label="Status distribution bar chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(value) => [`${value}`, 'Items']} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map(entry => (
              <Cell key={entry.statusId} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <FallbackTable data={data} />
    </figure>
  );
};

export default StatusDistributionWidget;
