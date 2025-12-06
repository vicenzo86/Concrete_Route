import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Truck, MapPin, Settings, Upload, Play, AlertCircle, Terminal, Map as MapIcon, Table, Download } from 'lucide-react';
import MapVisualizer from './components/MapVisualizer';
import ResultsTable from './components/ResultsTable';
import { AppState, RawInputRow } from './types';
import { processOptimization } from './services/optimizer';

// Default config values from the Python script
const DEFAULT_API_KEY = "9bzBwwsjHfKmfIrrYpvtir7DbEjTUOj2vFWrAC72c4A";
const DEFAULT_ORIGIN = "R. Geral Hugo de Almeida - Navegantes - SC, Brasil";
const DEFAULT_CAPACITY = 9;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    config: {
      apiKey: DEFAULT_API_KEY,
      originAddress: DEFAULT_ORIGIN,
      truckCapacity: DEFAULT_CAPACITY,
    },
    status: 'idle',
    logs: [],
    routes: [],
    unmappedAddresses: [],
    originCoords: null
  });

  const [activeTab, setActiveTab] = useState<'map' | 'data'>('map');
  const [rawData, setRawData] = useState<RawInputRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    setState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous data
    setRawData([]);
    setState(prev => ({ ...prev, logs: [`📂 Reading file: ${file.name}...`], status: 'idle' }));

    const reader = new FileReader();
    
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error("File is empty");

        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Get data as array of arrays
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (!jsonData || jsonData.length < 2) {
            addLog("❌ Error: File appears to be empty or has no data rows.");
            return;
        }

        // Robust header finding
        const headers = (jsonData[0] as any[]).map(h => String(h || '').toLowerCase().trim());
        addLog(`🔍 Found headers: [${headers.join(", ")}]`);

        // Flexible matching for Volume
        const volIdx = headers.findIndex(h => 
            h.includes('volume') || 
            h.includes('m³') || 
            h.includes('m3') || 
            h.includes('vol') ||
            h.includes('cubagem') ||
            h.includes('qtd') ||
            h.includes('carga') // Added support for 'CARGAS'
        );

        // Flexible matching for Address
        const addrIdx = headers.findIndex(h => 
            h.includes('endereco') || 
            h.includes('endereço') || 
            h.includes('address') || 
            h.includes('local') || 
            h.includes('rua') || 
            h.includes('destino') ||
            h.includes('dest') ||
            h.includes('cliente') ||
            h.includes('obra')
        );

        if (volIdx === -1 || addrIdx === -1) {
            const missing = [];
            if (volIdx === -1) missing.push("Volume (e.g., 'Cargas', 'Volume', 'm³')");
            if (addrIdx === -1) missing.push("Address (e.g., 'Endereço Obra', 'Rua')");
            
            const msg = `❌ Missing columns: ${missing.join(" and ")}.`;
            addLog(msg);
            alert(msg + "\nPlease check the System Logs for details.");
            return;
        }

        const parsed: RawInputRow[] = [];
        let skipped = 0;

        for (let i = 1; i < jsonData.length; i++) {
            const row: any = jsonData[i];
            // Ensure row has data at the expected indices
            if (row[volIdx] !== undefined && row[addrIdx]) {
                const vol = parseFloat(row[volIdx]);
                const addr = String(row[addrIdx]).trim();

                if (!isNaN(vol) && addr.length > 3) {
                    parsed.push({
                        volume: vol,
                        endereco: addr
                    });
                } else {
                    skipped++;
                }
            }
        }
        
        if (parsed.length === 0) {
            addLog("❌ No valid data rows found after parsing.");
            return;
        }

        setRawData(parsed);
        addLog(`✅ Successfully loaded ${parsed.length} rows (${skipped} empty/invalid skipped).`);
        
        // Auto-switch to Data tab to show loaded data
        // setActiveTab('data'); 

      } catch (err: any) {
        console.error(err);
        addLog(`❌ File parse error: ${err.message}`);
        alert("Error parsing Excel file. See logs.");
      }
    };

    reader.onerror = () => {
        addLog("❌ Failed to read file.");
    };

    reader.readAsArrayBuffer(file);
  };

  const handleRun = async () => {
    if (rawData.length === 0) {
        alert("Please upload a spreadsheet first.");
        return;
    }
    if (!state.config.apiKey) {
        alert("Please enter a HERE API Key.");
        return;
    }

    setState(prev => ({ ...prev, status: 'geocoding', logs: [], routes: [] }));

    try {
        const result = await processOptimization(rawData, state.config, addLog);
        setState(prev => ({
            ...prev,
            status: 'complete',
            routes: result.routes,
            unmappedAddresses: result.unmapped,
            originCoords: result.originCoords
        }));
    } catch (err: any) {
        addLog(`❌ Error: ${err.message}`);
        setState(prev => ({ ...prev, status: 'error' }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-md">
            <Truck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">RouteOptimizer <span className="text-blue-600">Pro</span></h1>
            <p className="text-xs text-slate-500 font-medium">VRP Solver powered by Clarke & Wright</p>
          </div>
        </div>
        
        <div className="flex gap-3">
            <a href="https://docs.google.com/spreadsheets/d/18tjFLyzDMzwS0r4jj9FXe5DzB00VqLWpd2bVgSpFtI0/export?format=xlsx&gid=617607591" 
               className="text-xs text-blue-600 hover:underline flex items-center gap-1">
               <Download size={12}/> Sample Sheet
            </a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
          
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-4 flex items-center gap-2">
                <Settings size={14} /> Configuration
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">HERE Maps API Key</label>
                <input 
                  type="password" 
                  value={state.config.apiKey}
                  onChange={e => setState(p => ({...p, config: {...p.config, apiKey: e.target.value}}))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Origin Address</label>
                <div className="relative">
                    <MapPin className="absolute left-2.5 top-2.5 text-slate-400 w-4 h-4" />
                    <input 
                    type="text" 
                    value={state.config.originAddress}
                    onChange={e => setState(p => ({...p, config: {...p.config, originAddress: e.target.value}}))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Truck Capacity (m³)</label>
                <input 
                  type="number" 
                  value={state.config.truckCapacity}
                  onChange={e => setState(p => ({...p, config: {...p.config, truckCapacity: parseFloat(e.target.value)}}))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
             <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-4 flex items-center gap-2">
                <Upload size={14} /> Data Input
            </h2>
            
            <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept=".xlsx, .xls"
                onChange={handleFileChange} 
            />
            
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all group cursor-pointer"
            >
                <Table className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-semibold">{rawData.length ? `${rawData.length} Rows Loaded` : "Upload Excel File"}</span>
            </button>
            
            {rawData.length > 0 && (
                 <button 
                 onClick={handleRun}
                 disabled={state.status === 'geocoding' || state.status === 'solving'}
                 className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-lg shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
               >
                 {state.status === 'geocoding' || state.status === 'solving' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                 ) : (
                    <Play size={18} fill="currentColor" />
                 )}
                 Generate Routes
               </button>
            )}
          </div>

          <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <h2 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-2 flex items-center gap-2">
                <Terminal size={14} /> System Logs
            </h2>
            <div className="flex-1 bg-slate-900 rounded-lg p-3 overflow-y-auto font-mono text-xs text-green-400">
                {state.logs.length === 0 ? (
                    <span className="text-slate-600">Waiting for input...</span>
                ) : (
                    state.logs.map((log, i) => (
                        <div key={i} className="mb-1 border-b border-slate-800 pb-1 last:border-0">
                            <span className="text-slate-500 mr-2">[{i+1}]</span>
                            {log}
                        </div>
                    ))
                )}
            </div>
          </div>

        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-4">
                <button 
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'map' ? 'bg-slate-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <MapIcon size={16} /> Map View
                </button>
                <button 
                    onClick={() => setActiveTab('data')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'data' ? 'bg-slate-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Table size={16} /> Data & Export
                </button>

                <div className="ml-auto flex items-center gap-4">
                    {state.status === 'complete' && (
                        <div className="flex gap-4 text-sm font-medium">
                            <div className="flex flex-col items-end leading-none">
                                <span className="text-xs text-slate-400">Routes</span>
                                <span className="text-slate-800">{state.routes.length}</span>
                            </div>
                            <div className="flex flex-col items-end leading-none">
                                <span className="text-xs text-slate-400">Total Dist</span>
                                <span className="text-slate-800">{state.routes.reduce((acc, r) => acc + r.totalDistanceKm, 0).toFixed(1)} km</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-slate-100 p-6 overflow-y-auto relative">
                {state.status === 'error' && (
                    <div className="absolute top-6 left-6 right-6 z-50 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 shadow-sm">
                        <AlertCircle size={20} />
                        <span className="font-medium">An error occurred. Check the logs sidebar for details.</span>
                    </div>
                )}

                {activeTab === 'map' && (
                    <MapVisualizer routes={state.routes} origin={state.originCoords} />
                )}

                {activeTab === 'data' && (
                    <div className="max-w-5xl mx-auto">
                        {state.unmappedAddresses.length > 0 && (
                            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <h4 className="text-amber-800 font-bold text-sm flex items-center gap-2 mb-2">
                                    <AlertCircle size={16}/> {state.unmappedAddresses.length} Addresses Could Not Be Mapped
                                </h4>
                                <ul className="list-disc list-inside text-xs text-amber-700 max-h-32 overflow-y-auto">
                                    {state.unmappedAddresses.map((addr, i) => (
                                        <li key={i}>{addr}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <ResultsTable routes={state.routes} originAddress={state.config.originAddress} />
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;