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

// Nearest Neighbor sorting helper (matches Python 'ordenar_nn')
function nearestNeighborSort(stops: DeliveryStop[], origin: GeoCoord): DeliveryStop[] {
    const sorted: DeliveryStop[] = [];
    const currentPool = [...stops];
    let currentLocation = origin;

    while (currentPool.length > 0) {
        // Find closest to currentLocation
        let bestIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < currentPool.length; i++) {
            const d = calculateDistanceKm(currentLocation, currentPool[i].coords);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        if (bestIdx !== -1) {
            const nextStop = currentPool[bestIdx];
            sorted.push(nextStop);
            currentLocation = nextStop.coords;
            currentPool.splice(bestIdx, 1);
        } else {
            break; // Should not happen
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

  // 2. Geocode & Split Volumes (Pre-processing)
  onLog(`📦 Processing ${rawData.length} rows and checking capacity...`);
  
  const allStops: DeliveryStop[] = [];
  const unmapped: string[] = [];
  let stopCounter = 0;

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    let vol = row.volume;
    
    // Geocode once per address
    const coords = await geocodeAddress(row.endereco, config.apiKey);
    
    if (!coords) {
      unmapped.push(row.endereco);
      continue;
    }

    // Split logic (Python: while vol > CAPACIDADE_CAMINHAO)
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

    if (vol > 0.001) { // Floating point safety
      allStops.push({
        id: `${i}_${stopCounter++}`,
        coords,
        volume: Number(vol.toFixed(2)),
        endereco: row.endereco,
        originalIndex: i
      });
    }

    // Small delay to avoid rate limiting if list is huge
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 20));
  }

  onLog(`✅ Generated ${allStops.length} delivery stops from inputs.`);

  // 3. Clarke & Wright Savings Algorithm (Python Logic: Merge & Re-sort)
  onLog(`🚛 Running Savings Algorithm...`);

  // Initial Solution: Each stop is its own route
  let routes: Route[] = allStops.map((stop, idx) => ({
    id: `route_${idx}`, // Temporary ID
    stops: [stop],
    totalVolume: stop.volume,
    totalDistanceKm: calculateDistanceKm(originCoords, stop.coords) * 2,
    color: '#000' // assigned later
  }));

  // Calculate Distances from Origin
  // Note: Python uses matrix API. Here we use Haversine to avoid 2500+ API calls in browser.
  // This may cause slight deviations from Python if road distance differs significantly from air distance,
  // but the logic structure is now identical.
  const distOrigin = new Map<string, number>();
  allStops.forEach(stop => {
    distOrigin.set(stop.id, calculateDistanceKm(originCoords, stop.coords));
  });

  // Calculate Savings
  const savings: { i: string; j: string; save: number }[] = [];
  
  for (let i = 0; i < allStops.length; i++) {
    for (let j = i + 1; j < allStops.length; j++) {
      const stopA = allStops[i];
      const stopB = allStops[j];
      
      const distAB = calculateDistanceKm(stopA.coords, stopB.coords);
      const distOA = distOrigin.get(stopA.id)!;
      const distOB = distOrigin.get(stopB.id)!;
      
      const save = distOA + distOB - distAB;
      
      if (save > 0) {
        savings.push({ i: stopA.id, j: stopB.id, save });
      }
    }
  }

  // Sort savings descending
  savings.sort((a, b) => b.save - a.save);

  onLog(`📊 Analyzed ${savings.length} potential merges.`);

  // Apply Merges (Python Logic)
  for (const { i, j } of savings) {
    // Find current routes for stop i and stop j
    // We look for which route currently contains stop ID i
    const routeIndexI = routes.findIndex(r => r.stops.some(s => s.id === i));
    const routeIndexJ = routes.findIndex(r => r.stops.some(s => s.id === j));

    if (routeIndexI === -1 || routeIndexJ === -1 || routeIndexI === routeIndexJ) {
      continue;
    }

    const routeI = routes[routeIndexI];
    const routeJ = routes[routeIndexJ];

    // Python logic: If combined volume fits, merge and re-sort (NN)
    // No strict endpoint check (interior merges allowed via reshuffling)
    if (routeI.totalVolume + routeJ.totalVolume <= config.truckCapacity + 0.001) { // tolerance
        
        const combinedStops = [...routeI.stops, ...routeJ.stops];
        const reorderedStops = nearestNeighborSort(combinedStops, originCoords);

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
        dist += calculateDistanceKm(curr, s.coords);
        curr = s.coords;
    }
    dist += calculateDistanceKm(curr, originCoords); // Return to depot

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