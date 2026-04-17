import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ItemsByBoardEntry } from '../../../types';

interface Props {
  data: ItemsByBoardEntry[];
}

const FallbackTable: React.FC<{ data: ItemsByBoardEntry[] }> = ({ data }) => (
  <table className="sr-only" aria-label="Items by board data">
    <thead>
      <tr><th scope="col">Board</th><th scope="col">Count</th></tr>
    </thead>
    <tbody>
      {data.map(entry => (
        <tr key={entry.boardId}>
          <td>{entry.name}</td>
          <td>{entry.count}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const ItemsByBoardWidget: React.FC<Props> = ({ data }) => (
  <figure aria-label="Items by board bar chart">
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip formatter={(value) => [`${value}`, 'Items']} />
        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
    <FallbackTable data={data} />
  </figure>
);

export default ItemsByBoardWidget;
