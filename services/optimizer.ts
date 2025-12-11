import { DeliveryStop, GeoCoord, RawInputRow, Route, SolverConfig } from '../types';
import { calculateDistanceKm, geocodeAddress } from '../utils/geo';

const ROUTE_COLORS = ["#F59E0B", "#3B82F6", "#EF4444", "#10B981", "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6", "#84cc16", "#0ea5e9"];

interface CostMatrix {
  get(from: GeoCoord, to: GeoCoord): { time: number; dist: number };
}

const getKey = (a: GeoCoord, b: GeoCoord) => `${a.lat},${a.lng}-${b.lat},${b.lng}`;

// Helper: Add minutes to HH:mm string
function addMinutes(timeStr: string, minutes: number): string {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + Math.round(minutes), 0);
    return date.toTimeString().substring(0, 5);
}

async function fetchHereMatrix(uniquePoints: GeoCoord[], apiKey: string, onLog: (msg: string) => void): Promise<CostMatrix | null> {
  if (uniquePoints.length < 2) return null;
  const url = `https://matrix.router.hereapi.com/v8/matrix?async=false&apiKey=${apiKey}`;
  const body = {
    origins: uniquePoints.map(p => ({ lat: p.lat, lng: p.lng })),
    destinations: uniquePoints.map(p => ({ lat: p.lat, lng: p.lng })),
    regionDefinition: { type: "world" },
    matrixAttributes: ["travelTimes", "distances"],
    transportMode: "car"
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HERE API Error: ${res.status}`);
    const data = await res.json();
    const lookup = new Map<string, { time: number; dist: number }>();
    const numCols = uniquePoints.length;
    for (let i = 0; i < uniquePoints.length; i++) {
        for (let j = 0; j < uniquePoints.length; j++) {
            const idx = i * numCols + j;
            lookup.set(getKey(uniquePoints[i], uniquePoints[j]), { time: data.matrix.travelTimes[idx] / 60, dist: data.matrix.distances[idx] / 1000 });
        }
    }
    return { get: (from, to) => lookup.get(getKey(from, to)) || { time: 999, dist: 999 } };
  } catch (err: any) { onLog(`⚠️ Usando estimativa local: ${err.message}`); return null; }
}

const createFallbackMatrix = (): CostMatrix => ({
    get: (a, b) => {
        const d = calculateDistanceKm(a, b);
        return { dist: d * 1.3, time: (d * 1.3 / 40) * 60 };
    }
});

function nearestNeighborSort(stops: DeliveryStop[], origin: GeoCoord, matrix: CostMatrix): DeliveryStop[] {
    const sorted: DeliveryStop[] = [];
    const pool = [...stops];
    let curr = origin;
    while (pool.length > 0) {
        let bestIdx = -1, bestT = Infinity;
        pool.forEach((s, i) => { const t = matrix.get(curr, s.coords).time; if (t < bestT) { bestT = t; bestIdx = i; } });
        const next = pool.splice(bestIdx, 1)[0];
        sorted.push(next);
        curr = next.coords;
    }
    return sorted;
}

export const processOptimization = async (rawData: RawInputRow[], config: SolverConfig, onLog: (msg: string) => void) => {
  onLog(`📍 Geocodificando Origem...`);
  const origin = await geocodeAddress(config.originAddress, config.apiKey);
  if (!origin) throw new Error("Origem inválida.");

  const allStops: DeliveryStop[] = [];
  const unmapped: string[] = [];
  const coordsMap = new Map<string, GeoCoord>();
  coordsMap.set(`${origin.lat},${origin.lng}`, origin);

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const coords = await geocodeAddress(row.endereco, config.apiKey);
    if (!coords) { unmapped.push(row.endereco); continue; }
    coordsMap.set(`${coords.lat},${coords.lng}`, coords);
    let v = row.volume;
    while (v > config.truckCapacity) { 
        allStops.push({ id: `s${i}_${v}`, coords, volume: config.truckCapacity, endereco: row.endereco, originalIndex: i }); 
        v -= config.truckCapacity; 
    }
    if (v > 0.01) allStops.push({ id: `s${i}_final`, coords, volume: Number(v.toFixed(2)), endereco: row.endereco, originalIndex: i });
  }

  const matrix = await fetchHereMatrix(Array.from(coordsMap.values()), config.apiKey, onLog) || createFallbackMatrix();

  // Simple VRP with Clarke & Wright
  let routes: Route[] = allStops.map((s, idx) => ({ id: `R${idx}`, stops: [s], totalVolume: s.volume, totalDistanceKm: 0, color: '#000' }));
  const savings: any[] = [];
  for (let i = 0; i < allStops.length; i++) {
    for (let j = i + 1; j < allStops.length; j++) {
      const s = matrix.get(origin, allStops[i].coords).time + matrix.get(origin, allStops[j].coords).time - matrix.get(allStops[i].coords, allStops[j].coords).time;
      if (s > 0) savings.push({ i: allStops[i].id, j: allStops[j].id, s });
    }
  }
  savings.sort((a, b) => b.s - a.s);

  for (const sv of savings) {
    const ri = routes.findIndex(r => r.stops.some(s => s.id === sv.i));
    const rj = routes.findIndex(r => r.stops.some(s => s.id === sv.j));
    if (ri !== -1 && rj !== -1 && ri !== rj && routes[ri].totalVolume + routes[rj].totalVolume <= config.truckCapacity + 0.01) {
        routes[ri].stops = nearestNeighborSort([...routes[ri].stops, ...routes[rj].stops], origin, matrix);
        routes[ri].totalVolume += routes[rj].totalVolume;
        routes.splice(rj, 1);
    }
  }

  // Calculate Timestamps for Cycle
  const finalRoutes = routes.map((r, idx) => {
    let currTime = addMinutes(config.startTime, config.loadingTimeMin);
    let dist = 0;
    let currPos = origin;
    
    const timedStops = r.stops.map(s => {
        const travel = matrix.get(currPos, s.coords);
        dist += travel.dist;
        const arrival = addMinutes(currTime, travel.time);
        const duration = s.volume * config.unloadingMinPerM3;
        const departure = addMinutes(arrival, duration);
        currTime = departure;
        currPos = s.coords;
        return { ...s, arrivalTime: arrival, unloadingDurationMin: duration, departureTime: departure };
    });

    const returnTravel = matrix.get(currPos, origin);
    dist += returnTravel.dist;
    const finalTime = addMinutes(currTime, returnTravel.time);

    return {
        ...r,
        id: `Caminhão ${idx + 1}`,
        stops: timedStops,
        totalDistanceKm: Number(dist.toFixed(2)),
        color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        startTime: config.startTime,
        returnToDepotTime: finalTime
    };
  });

  onLog(`🏁 Otimização Finalizada: ${finalRoutes.length} caminhões em rota.`);
  return { routes: finalRoutes, unmapped, originCoords: origin };
};