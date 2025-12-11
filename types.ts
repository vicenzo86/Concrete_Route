export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface RawInputRow {
  volume: number;
  endereco: string;
}

export interface DeliveryStop {
  id: string;
  coords: GeoCoord;
  volume: number;
  endereco: string;
  originalIndex: number;
  arrivalTime?: string;
  unloadingDurationMin?: number;
  departureTime?: string;
}

export interface Route {
  id: string; 
  stops: DeliveryStop[];
  totalVolume: number;
  totalDistanceKm: number;
  color: string;
  startTime?: string;
  loadingTimeMin?: number;
  returnToDepotTime?: string;
  totalCycleTimeMin?: number;
}

export interface SolverConfig {
  apiKey: string;
  originAddress: string;
  truckCapacity: number;
  startTime: string;        
  loadingTimeMin: number;   
  unloadingMinPerM3: number; 
}

export type Shift = 'morning' | 'afternoon';

export interface ShiftState {
  rawData: RawInputRow[];
  routes: Route[];
  status: 'idle' | 'parsing' | 'geocoding' | 'solving' | 'complete' | 'error';
  unmappedAddresses: string[];
}

export interface AppState {
  config: SolverConfig;
  currentShift: Shift;
  shifts: {
    morning: ShiftState;
    afternoon: ShiftState;
  };
  logs: string[];
  originCoords: GeoCoord | null;
}