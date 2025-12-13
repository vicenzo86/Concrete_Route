
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Truck, MapPin, Settings, Terminal, Map as MapIcon, Table, Download, Clock, Zap, Sun, Moon, Calendar, Key, LogOut, User } from 'lucide-react';
import MapVisualizer from './components/MapVisualizer';
import ResultsTable from './components/ResultsTable';
import Auth from './components/Auth';
import { AppState, RawInputRow, Shift, ShiftState } from './types';
import { processOptimization } from './services/optimizer';
import { supabase } from './lib/supabase';

const DEFAULT_API_KEY = "9bzBwwsjHfKmfIrrYpvtir7DbEjTUOj2vFWrAC72c4A";
const DEFAULT_ORIGIN = "R. Geral Hugo de Almeida - Navegantes - SC, Brasil";

const initialShiftState: ShiftState = {
  rawData: [],
  routes: [],
  status: 'idle',
  unmappedAddresses: [],
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [state, setState] = useState<AppState>({
    config: {
      apiKey: DEFAULT_API_KEY,
      originAddress: DEFAULT_ORIGIN,
      truckCapacity: 9,
      startTime: "05:00",
      loadingTimeMin: 30,
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isAuthLoading) return (
    <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
    </div>
  );

  if (!session) return <Auth onSession={setSession} />;

  const activeShift = state.shifts[state.currentShift];
  const isProcessing = state.shifts.morning.status === 'geocoding' || state.shifts.afternoon.status === 'geocoding';

  const addLog = (msg: string) => {
    setState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
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
        const newShifts = { morning: { ...initialShiftState }, afternoon: { ...initialShiftState } };

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
            addLog(`✅ Turno MANHÃ: ${parsed.length} pedidos detectados.`);
          } else if (nameUpper.includes("TARDE")) {
            newShifts.afternoon.rawData = parsed;
            addLog(`✅ Turno TARDE: ${parsed.length} pedidos detectados.`);
          }
        });
        setState(prev => ({ ...prev, shifts: newShifts }));
      } catch (err: any) { addLog(`❌ Erro ao ler planilha: ${err.message}`); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRun = async () => {
    const hasMorning = state.shifts.morning.rawData.length > 0;
    const hasAfternoon = state.shifts.afternoon.rawData.length > 0;

    if (!hasMorning && !hasAfternoon) {
        return alert("Não há dados carregados para nenhum turno. Importe a planilha com as abas MANHÃ e TARDE.");
    }

    setState(prev => ({
      ...prev,
      shifts: {
          morning: { ...prev.shifts.morning, status: hasMorning ? 'geocoding' : 'idle' },
          afternoon: { ...prev.shifts.afternoon, status: hasAfternoon ? 'geocoding' : 'idle' }
      },
      logs: []
    }));

    try {
        let morningRes = null;
        let afternoonRes = null;
        let finalOrigin = state.originCoords;

        if (hasMorning) {
            addLog(`🚀 [MANHÃ] Iniciando Geocodificação e Otimização...`);
            morningRes = await processOptimization(state.shifts.morning.rawData, state.config, (msg) => addLog(`[MANHÃ] ${msg}`));
            finalOrigin = morningRes.originCoords;
        }

        if (hasAfternoon) {
            addLog(`🚀 [TARDE] Iniciando Geocodificação e Otimização...`);
            afternoonRes = await processOptimization(state.shifts.afternoon.rawData, state.config, (msg) => addLog(`[TARDE] ${msg}`));
            if (!finalOrigin) finalOrigin = afternoonRes.originCoords;
        }

        setState(prev => ({
            ...prev,
            originCoords: finalOrigin,
            shifts: {
              morning: morningRes ? { ...prev.shifts.morning, status: 'complete', routes: morningRes.routes, unmappedAddresses: morningRes.unmapped } : prev.shifts.morning,
              afternoon: afternoonRes ? { ...prev.shifts.afternoon, status: 'complete', routes: afternoonRes.routes, unmappedAddresses: afternoonRes.unmapped } : prev.shifts.afternoon
            }
        }));
        
        addLog(`✨ Processamento Completo para todos os turnos ativos.`);
    } catch (err: any) {
        addLog(`❌ Erro Crítico: ${err.message}`);
        setState(prev => ({ 
            ...prev, 
            shifts: { 
                morning: { ...prev.shifts.morning, status: prev.shifts.morning.status === 'geocoding' ? 'error' : prev.shifts.morning.status },
                afternoon: { ...prev.shifts.afternoon, status: prev.shifts.afternoon.status === 'geocoding' ? 'error' : prev.shifts.afternoon.status }
            } 
        }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between shadow-lg z-10 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg shadow-md">
            <Truck className="text-slate-900 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Arga Router</h1>
            <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em]">Logística de Argamassa</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="flex bg-slate-800 rounded-full p-1 border border-slate-700 shadow-inner">
                <button onClick={() => setState(p => ({...p, currentShift: 'morning'}))} className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all ${state.currentShift === 'morning' ? 'bg-amber-500 text-slate-900 shadow-md scale-105' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Sun size={14} /> MANHÃ {state.shifts.morning.rawData.length > 0 && `(${state.shifts.morning.rawData.length})`}
                </button>
                <button onClick={() => setState(p => ({...p, currentShift: 'afternoon'}))} className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all ${state.currentShift === 'afternoon' ? 'bg-amber-500 text-slate-900 shadow-md scale-105' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Moon size={14} /> TARDE {state.shifts.afternoon.rawData.length > 0 && `(${state.shifts.afternoon.rawData.length})`}
                </button>
            </div>
            <div className="flex items-center gap-4 border-l border-slate-700 pl-6">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><User size={10}/> {session.user.email.split('@')[0]}</span>
                    <button onClick={handleLogout} className="text-[9px] text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1 uppercase tracking-tighter">
                        Sair <LogOut size={10} />
                    </button>
                </div>
            </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* API Config */}
            <div className="space-y-4">
               <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">HERE API Key</label>
                <div className="relative">
                    <Key className="absolute left-3 top-2.5 text-slate-600 w-4 h-4" />
                    <input type="password" value={state.config.apiKey}
                      onChange={e => setState(p => ({...p, config: {...p.config, apiKey: e.target.value}}))}
                      className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none transition-all"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Endereço da Filial</label>
                <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 text-slate-600 w-4 h-4" />
                    <input type="text" value={state.config.originAddress}
                      onChange={e => setState(p => ({...p, config: {...p.config, originAddress: e.target.value}}))}
                      className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none"/>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-800 w-full" />

            {/* Global Params */}
            <div>
                <h2 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 flex items-center gap-2">
                    <Settings size={14} /> Parâmetros Globais
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Total Bombas</label>
                    <input type="number" defaultValue={4} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-300"/>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Total Frota</label>
                    <input type="number" defaultValue={30} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-300"/>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Carga (min)</label>
                    <input type="number" value={state.config.loadingTimeMin}
                      onChange={e => setState(p => ({...p, config: {...p.config, loadingTimeMin: parseInt(e.target.value)}}))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-300"/>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Descarga (min/m³)</label>
                    <input type="number" value={state.config.unloadingMinPerM3}
                      onChange={e => setState(p => ({...p, config: {...p.config, unloadingMinPerM3: parseInt(e.target.value)}}))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-300"/>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Data</label>
                    <div className="relative">
                        <Calendar className="absolute right-2 top-2.5 text-slate-600 w-3 h-3" />
                        <input type="text" defaultValue="11/12/2025" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-[10px] text-slate-300 uppercase"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Início</label>
                    <div className="relative">
                        <Clock className="absolute right-2 top-2.5 text-slate-600 w-3 h-3" />
                        <input type="time" value={state.config.startTime}
                            onChange={e => setState(p => ({...p, config: {...p.config, startTime: e.target.value}}))}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-[10px] text-slate-300 uppercase"/>
                    </div>
                  </div>
                </div>
            </div>

            <button onClick={handleRun} disabled={isProcessing}
                 className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-slate-900 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-amber-500/20 active:scale-[0.98]">
                 {isProcessing ? <div className="animate-spin rounded-full h-5 w-5 border-3 border-slate-900 border-t-transparent"></div> : <Zap size={20} fill="currentColor" />}
                 Otimizar Tudo (M+T)
            </button>

            <div className="flex-1 min-h-[150px] bg-black/40 rounded-xl border border-slate-800 p-4 font-mono text-[9px] text-green-400 overflow-y-auto scrollbar-hide">
                <div className="flex items-center gap-2 mb-2 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-800 pb-2"><Terminal size={12}/> Console de Operações</div>
                {state.logs.map((log, i) => <div key={i} className="mb-1 leading-relaxed"> {log}</div>)}
                {state.logs.length === 0 && <span className="text-slate-700 italic">Aguardando importação ou otimização...</span>}
            </div>

            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 text-amber-500 hover:text-amber-400 font-bold text-xs uppercase tracking-tight">
                    <Table size={16} /> Carregar Nova Planilha
                </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-8 py-3 flex items-center gap-4">
                <button onClick={() => setActiveTab('data')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'data' ? 'bg-amber-50 text-amber-600 border border-amber-100 shadow-sm' : 'text-slate-500 hover:bg-slate-100 border border-transparent'}`}>
                    <Table size={14} /> Dashboard BI
                </button>
                <button onClick={() => setActiveTab('map')} className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'map' ? 'bg-amber-50 text-amber-600 border border-amber-100 shadow-sm' : 'text-slate-500 hover:bg-slate-100 border border-transparent'}`}>
                    <MapIcon size={14} /> Mapa de Rotas
                </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
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
