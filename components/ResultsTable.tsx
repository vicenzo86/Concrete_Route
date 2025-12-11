import React from 'react';
import { Route } from '../types';
import { Download, Clock, MapPin, Package } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  routes: Route[];
  originAddress: string;
}

const ResultsTable: React.FC<Props> = ({ routes, originAddress }) => {

  const handleExport = () => {
    const data: any[] = [];
    routes.forEach(r => {
      r.stops.forEach((s, idx) => {
        data.push({
          "Veículo": r.id,
          "Seq": idx + 1,
          "Obra": s.endereco,
          "Volume (m³)": s.volume,
          "Chegada": s.arrivalTime,
          "Descarga (min)": s.unloadingDurationMin,
          "Saída": s.departureTime,
          "Distância Acumulada": r.totalDistanceKm
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de Rotas");
    XLSX.writeFile(wb, "Roteirizacao_Plaster.xlsx");
  };

  if (routes.length === 0) return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <Package className="mx-auto w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-slate-500 font-medium">Nenhuma rota gerada ainda. Carregue os dados e clique em "Otimizar".</h3>
      </div>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
          <div>
              <h2 className="text-xl font-bold text-slate-800">Programação de Viagens</h2>
              <p className="text-sm text-slate-500">Horários calculados considerando carga e taxa de descarga.</p>
          </div>
          <button onClick={handleExport} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-lg hover:bg-slate-800 transition-all font-bold text-sm shadow-md">
            <Download size={16} /> Exportar Excel
          </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {routes.map((route) => (
          <div key={route.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: route.color}}></div>
                    <span className="font-bold text-slate-800 text-lg uppercase tracking-tight">{route.id}</span>
                </div>
                <div className="flex gap-6 text-xs font-bold text-slate-500 uppercase tracking-tighter">
                    <div className="flex flex-col items-end">
                        <span>Distância</span>
                        <span className="text-slate-800">{route.totalDistanceKm} km</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span>Carga Total</span>
                        <span className="text-slate-800">{route.totalVolume.toFixed(2)} m³</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span>Retorno Base</span>
                        <span className="text-amber-600">{route.returnToDepotTime}</span>
                    </div>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3 text-left">Sequência</th>
                            <th className="px-6 py-3 text-left">Obra / Endereço</th>
                            <th className="px-6 py-3 text-center">Volume</th>
                            <th className="px-6 py-3 text-center">Chegada</th>
                            <th className="px-6 py-3 text-center">Descarga</th>
                            <th className="px-6 py-3 text-center">Saída</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {route.stops.map((stop, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-400">#{i+1}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <MapPin size={14} className="text-slate-300" />
                                        <span className="text-slate-700 font-medium">{stop.endereco}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center font-bold text-slate-800">{stop.volume} m³</td>
                                <td className="px-6 py-4 text-center">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold text-xs">{stop.arrivalTime}</span>
                                </td>
                                <td className="px-6 py-4 text-center text-slate-500 font-medium">{Math.round(stop.unloadingDurationMin || 0)} min</td>
                                <td className="px-6 py-4 text-center">
                                    <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold text-xs">{stop.departureTime}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResultsTable;