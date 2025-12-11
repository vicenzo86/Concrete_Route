import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Truck, MapPin, Settings, Upload, Play, AlertCircle, Terminal, Map as MapIcon, Table, Download, Clock, Zap, Sun, Moon } from 'lucide-react';
import MapVisualizer from './components/MapVisualizer';
import ResultsTable from './components/ResultsTable';
import { AppState, RawInputRow, Shift, ShiftState } from './types';
import { processOptimization } from './services/optimizer';

const DEFAULT_API_KEY = "9bzBwwsjHfKmfIrrYpvtir7DbEjTUOj2vFWrAC72c4A";
const DEFAULT_ORIGIN = "R. Geral Hugo de Almeida - Navegantes - SC, Brasil";
const DEFAULT_CAPACITY = 9;

const initialShiftState: ShiftState = {
  rawData: [],
  routes: [],
  status: 'idle',
  unmappedAddresses: [],
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    config: {
      apiKey: DEFAULT_API_KEY,
      originAddress: DEFAULT_ORIGIN,
      truckCapacity: DEFAULT_CAPACITY,
      startTime: "07:00",
      loadingTimeMin: 20,
      unloadingMinPerM3: 10,
    },
    currentShift: 'morning',
    shifts: {
      morning: { ...initialShiftState },
      afternoon: { ...initialShiftState },
    },
    logs: [],
    originCoords: null
  });

  const [activeTab, setActiveTab] = useState<'map' | 'data'>('map');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeShift = state.shifts[state.currentShift];

  const addLog = (msg: string) => {
    setState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addLog(`📂 Lendo arquivo: ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error("Arquivo vazio");
        const wb = XLSX.read(data, { type: 'array' });
        
        const newShifts = {
          morning: { ...initialShiftState },
          afternoon: { ...initialShiftState },
        };

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (!jsonData || jsonData.length < 2) return;

          const headers = (jsonData[0] as any[]).map(h => String(h || '').toLowerCase().trim());
          const volIdx = headers.findIndex(h => h.includes('m³') || h.includes('volume') || h.includes('carga'));
          const addrIdx = headers.findIndex(h => h.includes('endereco') || h.includes('endereço') || h.includes('local') || h.includes('obra'));

          if (volIdx === -1 || addrIdx === -1) return;

          const parsed: RawInputRow[] = jsonData.slice(1).map((row: any) => ({
            volume: parseFloat(row[volIdx]),
            endereco: String(row[addrIdx] || '').trim()
          })).filter(r => !isNaN(r.volume) && r.endereco.length > 3);

          const nameUpper = sheetName.toUpperCase();
          if (nameUpper.includes("MANHÃ") || nameUpper.includes("MANHA")) {
            newShifts.morning.rawData = parsed;
            addLog(`✅ Turno MANHÃ: ${parsed.length} pedidos carregados.`);
          } else if (nameUpper.includes("TARDE")) {
            newShifts.afternoon.rawData = parsed;
            addLog(`✅ Turno TARDE: ${parsed.length} pedidos carregados.`);
          }
        });

        setState(prev => ({ ...prev, shifts: newShifts }));
      } catch (err: any) { 
        addLog(`❌ Erro no arquivo: ${err.message}`); 
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRun = async () => {
    if (activeShift.rawData.length === 0) return alert("Não há dados para este turno.");
    
    // Set status for current shift
    setState(prev => ({
      ...prev,
      shifts: {
        ...prev.shifts,
        [prev.currentShift]: { ...prev.shifts[prev.currentShift], status: 'geocoding' }
      },
      logs: []
    }));

    try {
        const result = await processOptimization(activeShift.rawData, state.config, addLog);
        setState(prev => ({
            ...prev,
            originCoords: result.originCoords,
            shifts: {
              ...prev.shifts,
              [prev.currentShift]: {
                ...prev.shifts[prev.currentShift],
                status: 'complete',
                routes: result.routes,
                unmappedAddresses: result.unmapped
              }
            }
        }));
    } catch (err: any) {
        addLog(`❌ Erro: ${err.message}`);
        setState(prev => ({
          ...prev,
          shifts: {
            ...prev.shifts,
            [prev.currentShift]: { ...prev.shifts[prev.currentShift], status: 'error' }
          }
        }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between shadow-lg z-10 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg shadow-md">
            <Truck className="text-slate-900 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Plaster Router</h1>
            <p className="text-xs text-amber-500 font-medium uppercase tracking-widest">Controle de Turnos e Frota</p>
          </div>
        </div>
        
        <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button 
                onClick={() => setState(p => ({...p, currentShift: 'morning'}))}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${state.currentShift === 'morning' ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                <Sun size={14} /> MANHÃ
            </button>
            <button 
                onClick={() => setState(p => ({...p, currentShift: 'afternoon'}))}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${state.currentShift === 'afternoon' ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                <Moon size={14} /> TARDE
            </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span>Pedidos Ativos</span>
                <span className="text-white font-bold">{activeShift.rawData.length}</span>
            </div>
            <Download size={16} className="cursor-pointer hover:text-white" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col overflow-y-auto text-slate-300">
          <div className="p-5 border-b border-slate-700">
            <h2 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-4 flex items-center gap-2">
                <Settings size={14} /> Configuração Operacional
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Início do Turno</label>
                <div className="relative">
                    <Clock className="absolute left-2.5 top-2.5 text-slate-500 w-4 h-4" />
                    <input type="time" value={state.config.startTime}
                      onChange={e => setState(p => ({...p, config: {...p.config, startTime: e.target.value}}))}
                      className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm focus:ring-1 focus:ring-amber-500 outline-none"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Carga (min)</label>
                    <input type="number" value={state.config.loadingTimeMin}
                      onChange={e => setState(p => ({...p, config: {...p.config, loadingTimeMin: parseInt(e.target.value)}}))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm focus:ring-1 focus:ring-amber-500 outline-none"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descarga (min/m³)</label>
                    <input type="number" value={state.config.unloadingMinPerM3}
                      onChange={e => setState(p => ({...p, config: {...p.config, unloadingMinPerM3: parseInt(e.target.value)}}))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm focus:ring-1 focus:ring-amber-500 outline-none"/>
                  </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Capacidade Caminhão (m³)</label>
                <input type="number" value={state.config.truckCapacity}
                  onChange={e => setState(p => ({...p, config: {...p.config, truckCapacity: parseFloat(e.target.value)}}))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm focus:ring-1 focus:ring-amber-500 outline-none"/>
              </div>
            </div>
          </div>

          <div className="p-5 border-b border-slate-700 bg-slate-900/20">
            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-700 rounded-lg p-5 flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-500 transition-all cursor-pointer">
                <Table className="w-6 h-6 mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Carregar Planilha Bi-Turno</span>
                <span className="text-[9px] text-slate-600 mt-1">Abas: MANHÃ / TARDE</span>
            </button>
            {activeShift.rawData.length > 0 && (
                 <button onClick={handleRun} disabled={activeShift.status === 'geocoding' || activeShift.status === 'solving'}
                 className="mt-4 w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-slate-900 font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
                 {activeShift.status === 'geocoding' ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent"></div> : <Zap size={18} fill="currentColor" />}
                 Otimizar {state.currentShift === 'morning' ? 'Manhã' : 'Tarde'}
               </button>
            )}
          </div>

          <div className="flex-1 p-5 overflow-hidden flex flex-col">
            <h2 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-2">
                <Terminal size={14} /> Console de Operação
            </h2>
            <div className="flex-1 bg-black rounded-lg p-3 overflow-y-auto font-mono text-[10px] text-green-500 scrollbar-hide">
                {state.logs.map((log, i) => <div key={i} className="mb-1 border-b border-slate-900 pb-1">{log}</div>)}
                {state.logs.length === 0 && <span className="text-slate-800">Aguardando dados...</span>}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2">
                <button onClick={() => setActiveTab('map')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase rounded-md transition-colors ${activeTab === 'map' ? 'bg-slate-100 text-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <MapIcon size={14} /> Visualização Geográfica
                </button>
                <button onClick={() => setActiveTab('data')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase rounded-md transition-colors ${activeTab === 'data' ? 'bg-slate-100 text-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Table size={14} /> Cronograma Detalhado
                </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'map' ? (
                    <MapVisualizer routes={activeShift.routes} origin={state.originCoords} />
                ) : (
                    <ResultsTable routes={activeShift.routes} originAddress={state.config.originAddress} />
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;