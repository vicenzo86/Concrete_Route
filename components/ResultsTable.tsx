import React from 'react';
import { Route } from '../types';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  routes: Route[];
  originAddress: string;
}

const ResultsTable: React.FC<Props> = ({ routes, originAddress }) => {

  const handleExport = () => {
    const data: any[] = [];
    
    routes.forEach(r => {
      const rowBase = {
        "Truck ID": r.id,
        "Total Volume (m³)": r.totalVolume,
        "Total Dist (km)": r.totalDistanceKm,
        "Stop Count": r.stops.length,
        "Origin": originAddress
      };

      // Add a summary row
      data.push({
        ...rowBase,
        "Stop Seq": "SUMMARY",
        "Address": "---",
        "Stop Vol": "---"
      });

      // Add stop rows
      r.stops.forEach((s, idx) => {
        data.push({
          "Truck ID": r.id,
          "Total Volume (m³)": "",
          "Total Dist (km)": "",
          "Stop Count": "",
          "Origin": "",
          "Stop Seq": idx + 1,
          "Address": s.endereco,
          "Stop Vol": s.volume
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Routes");
    XLSX.writeFile(wb, "Optimized_Routes.xlsx");
  };

  if (routes.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 mt-6">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
        <h3 className="font-semibold text-slate-700">Detailed Route Breakdown</h3>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors shadow-sm"
        >
          <Download size={16} />
          Export Excel
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-medium">
            <tr>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Capacity Use</th>
              <th className="px-4 py-3">Distance</th>
              <th className="px-4 py-3">Stops</th>
              <th className="px-4 py-3">Itinerary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {routes.map((route) => (
              <tr key={route.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: route.color }}></div>
                        {route.id}
                    </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-800">{route.totalVolume}</span> m³
                </td>
                <td className="px-4 py-3 text-slate-600">{route.totalDistanceKm} km</td>
                <td className="px-4 py-3 text-slate-600">{route.stops.length}</td>
                <td className="px-4 py-3 max-w-md">
                    <div className="flex flex-wrap gap-1">
                        {route.stops.map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                {i + 1}. {s.endereco.split('-')[0].substring(0, 15)}...
                            </span>
                        ))}
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;