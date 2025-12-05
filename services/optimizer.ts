import { DeliveryStop, GeoCoord, RawInputRow, Route, SolverConfig } from '../types';
import { calculateDistanceKm, geocodeAddress } from '../utils/geo';

const ROUTE_COLORS = [
  "#3B82F6", // blue-500
  "#EF4444", // red-500
  "#10B981", // green-500
  "#8B5CF6", // violet-500
  "#F59E0B", // amber-500
  "#EC4899", // pink-500
  "#6366F1", // indigo-500
  "#14B8A6", // teal-500
  "#84cc16", // lime-500
  "#0ea5e9", // sky-500
];

interface CostMatrix {
  // key: "lat,lng-lat,lng" -> { time: minutes, dist: km }
  get(from: GeoCoord, to: GeoCoord): { time: number; dist: number };
}

// Helper to create matrix key
const getKey = (a: GeoCoord, b: GeoCoord) => `${a.lat},${a.lng}-${b.lat},${b.lng}`;

// Fetch Real Road Matrix from HERE API
async function fetchHereMatrix(
  uniquePoints: GeoCoord[],
  apiKey: string,
  onLog: (msg: string) => void
): Promise<CostMatrix | null> {
  if (uniquePoints.length < 2) return null;
  if (uniquePoints.length > 100) {
    onLog(`⚠️ Too many unique points (${uniquePoints.length}) for single Matrix call. Fallback to estimation.`);
    return null;
  }

  onLog(`🌐 Fetching real road data matrix for ${uniquePoints.length} locations...`);

  const url = `https://matrix.router.hereapi.com/v8/matrix?async=false&apiKey=${apiKey}`;
  
  const body = {
    origins: uniquePoints.map(p => ({ lat: p.lat, lng: p.lng })),
    destinations: uniquePoints.map(p => ({ lat: p.lat, lng: p.lng })),
    regionDefinition: { type: "world" },
    matrixAttributes: ["travelTimes", "distances"],
    transportMode: "car"
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errText = await res.text();
        console.warn("Matrix API Error:", errText);
        throw new Error(`HERE API Error: ${res.status}`);
    }

    const data = await res.json();
    const matrix = data.matrix;
    // matrix.travelTimes[i * numDest + j]
    // matrix.distances[i * numDest + j]
    
    const numCols = uniquePoints.length;
    const lookup = new Map<string, { time: number; dist: number }>();

    for (let i = 0; i < uniquePoints.length; i++) {
        for (let j = 0; j < uniquePoints.length; j++) {
            const idx = i * numCols + j;
            const timeSeconds = matrix.travelTimes[idx];
            const distMeters = matrix.distances[idx];
            
            const from = uniquePoints[i];
            const to = uniquePoints[j];
            
            lookup.set(getKey(from, to), {
                time: Number((timeSeconds / 60).toFixed(2)), // Minutes
                dist: Number((distMeters / 1000).toFixed(2)) // KM
            });
        }
    }

    return {
        get: (from, to) => lookup.get(getKey(from, to)) || { time: 9999, dist: 9999 }
    };

  } catch (err: any) {
    onLog(`⚠️ Matrix API failed: ${err.message}. Using Haversine estimation.`);
    return null;
  }
}

// Fallback estimator (Haversine * tortuosity / speed)
const createFallbackMatrix = (): CostMatrix => ({
    get: (a, b) => {
        const straightKm = calculateDistanceKm(a, b);
        const roadKm = straightKm * 1.3; // Estimate road tortuosity
        const speedKmph = 40; // Est average speed
        const timeMin = (roadKm / speedKmph) * 60;
        return {
            dist: Number(roadKm.toFixed(2)),
            time: Number(timeMin.toFixed(2))
        };
    }
});

// Nearest Neighbor sorting helper using TIME (matches Python)
function nearestNeighborSort(
    stops: DeliveryStop[], 
    origin: GeoCoord, 
    matrix: CostMatrix
): DeliveryStop[] {
    const sorted: DeliveryStop[] = [];
    const currentPool = [...stops];
    let currentLocation = origin;

    while (currentPool.length > 0) {
        let bestIdx = -1;
        let bestTime = Infinity;

        for (let i = 0; i < currentPool.length; i++) {
            // Python: min(pend, key=lambda x: travel(atual, x)[0]) -> [0] is time
            const cost = matrix.get(currentLocation, currentPool[i].coords);
            if (cost.time < bestTime) {
                bestTime = cost.time;
                bestIdx = i;
            }
        }

        if (bestIdx !== -1) {
            const nextStop = currentPool[bestIdx];
            sorted.push(nextStop);
            currentLocation = nextStop.coords;
            currentPool.splice(bestIdx, 1);
        } else {
            break;
        }
    }
    return sorted;
}

export const processOptimization = async (
  rawData: RawInputRow[],
  config: SolverConfig,
  onLog: (msg: string) => void
): Promise<{ routes: Route[]; unmapped: string[]; originCoords: GeoCoord }> => {
  
  // 1. Geocode Origin
  onLog(`📍 Geocoding Origin: ${config.originAddress}...`);
  const originCoords = await geocodeAddress(config.originAddress, config.apiKey);
  if (!originCoords) {
    throw new Error("Could not geocode origin address.");
  }

  // 2. Geocode & Split Volumes
  onLog(`📦 Processing inputs...`);
  
  const allStops: DeliveryStop[] = [];
  const unmapped: string[] = [];
  let stopCounter = 0;

  // Use a map to track unique coords to minimize Matrix calls
  const uniqueCoordsMap = new Map<string, GeoCoord>();
  uniqueCoordsMap.set(`${originCoords.lat},${originCoords.lng}`, originCoords);

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    let vol = row.volume;
    
    const coords = await geocodeAddress(row.endereco, config.apiKey);
    
    if (!coords) {
      unmapped.push(row.endereco);
      continue;
    }

    uniqueCoordsMap.set(`${coords.lat},${coords.lng}`, coords);

    while (vol > config.truckCapacity) {
      allStops.push({
        id: `${i}_${stopCounter++}`,
        coords,
        volume: config.truckCapacity,
        endereco: row.endereco,
        originalIndex: i
      });
      vol -= config.truckCapacity;
    }

    if (vol > 0.001) {
      allStops.push({
        id: `${i}_${stopCounter++}`,
        coords,
        volume: Number(vol.toFixed(2)),
        endereco: row.endereco,
        originalIndex: i
      });
    }

    if (i % 5 === 0) await new Promise(r => setTimeout(r, 20));
  }

  onLog(`✅ Generated ${allStops.length} stops.`);

  // 3. Build Cost Matrix
  const uniquePoints = Array.from(uniqueCoordsMap.values());
  let matrix = await fetchHereMatrix(uniquePoints, config.apiKey, onLog);
  
  if (!matrix) {
    matrix = createFallbackMatrix();
  }

  // 4. Clarke & Wright Savings (Time Based)
  onLog(`🚛 Running Savings Algorithm (Time-based)...`);

  // Initial Solution
  let routes: Route[] = allStops.map((stop, idx) => {
    const toOrigin = matrix!.get(stop.coords, originCoords);
    const fromOrigin = matrix!.get(originCoords, stop.coords);
    return {
        id: `route_${idx}`,
        stops: [stop],
        totalVolume: stop.volume,
        totalDistanceKm: Number((fromOrigin.dist + toOrigin.dist).toFixed(2)),
        color: '#000'
    };
  });

  // Calculate Savings
  // Python: save = dist_origem[i] + dist_origem[j] - tij
  // Note: In Python script, 'dist_origem' comes from 'travel(ORIGEM, s)', which returns TIME [0].
  // So we MUST use TIME for savings to match Python behavior.
  
  const savings: { i: string; j: string; save: number }[] = [];
  
  for (let i = 0; i < allStops.length; i++) {
    for (let j = i + 1; j < allStops.length; j++) {
      const stopA = allStops[i];
      const stopB = allStops[j];
      
      const timeOA = matrix.get(originCoords, stopA.coords).time;
      const timeOB = matrix.get(originCoords, stopB.coords).time; // assuming symmetric for origin
      const timeIJ = matrix.get(stopA.coords, stopB.coords).time;
      
      const save = timeOA + timeOB - timeIJ;
      
      if (save > 0) {
        savings.push({ i: stopA.id, j: stopB.id, save });
      }
    }
  }

  // Python: savings.sort(reverse=True)
  savings.sort((a, b) => b.save - a.save);

  onLog(`📊 Analyzed ${savings.length} potential merges.`);

  // Apply Merges
  for (const { i, j } of savings) {
    const routeIndexI = routes.findIndex(r => r.stops.some(s => s.id === i));
    const routeIndexJ = routes.findIndex(r => r.stops.some(s => s.id === j));

    if (routeIndexI === -1 || routeIndexJ === -1 || routeIndexI === routeIndexJ) {
      continue;
    }

    const routeI = routes[routeIndexI];
    const routeJ = routes[routeIndexJ];

    if (routeI.totalVolume + routeJ.totalVolume <= config.truckCapacity + 0.001) {
        
        const combinedStops = [...routeI.stops, ...routeJ.stops];
        // Python: nova = ordenar_nn(...) using travel time
        const reorderedStops = nearestNeighborSort(combinedStops, originCoords, matrix);

        // Update Route I
        routes[routeIndexI] = {
            ...routeI,
            stops: reorderedStops,
            totalVolume: routeI.totalVolume + routeJ.totalVolume,
        };

        // Remove Route J
        routes.splice(routeIndexJ, 1);
    }
  }

  // Final cleanup and formatting
  const finalRoutes = routes.map((r, idx) => {
    let dist = 0;
    let curr = originCoords;
    for (const s of r.stops) {
        const cost = matrix!.get(curr, s.coords);
        dist += cost.dist;
        curr = s.coords;
    }
    const returnCost = matrix!.get(curr, originCoords);
    dist += returnCost.dist;

    return {
        ...r,
        id: `Truck ${idx + 1}`,
        totalDistanceKm: Number(dist.toFixed(2)),
        color: ROUTE_COLORS[idx % ROUTE_COLORS.length]
    };
  });

  onLog(`🏁 Optimization Complete. Generated ${finalRoutes.length} routes.`);
  
  return {
    routes: finalRoutes,
    unmapped,
    originCoords
  };
};