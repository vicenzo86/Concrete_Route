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
}

export interface Route {
  id: string; // usually truck id
  stops: DeliveryStop[];
  totalVolume: number;
  totalDistanceKm: number;
  color: string;
}

export interface SolverConfig {
  apiKey: string;
  originAddress: string;
  truckCapacity: number;
}

export interface AppState {
  config: SolverConfig;
  status: 'idle' | 'parsing' | 'geocoding' | 'solving' | 'complete' | 'error';
  logs: string[];
  routes: Route[];
  unmappedAddresses: string[];
  originCoords: GeoCoord | null;
}