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
];

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

    if (vol > 0) {
      allStops.push({
        id: `${i}_${stopCounter++}`,
        coords,
        volume: Number(vol.toFixed(2)),
        endereco: row.endereco,
        originalIndex: i
      });
    }

    // Small delay to avoid rate limiting if list is huge
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
  }

  onLog(`✅ Generated ${allStops.length} delivery stops from inputs.`);

  // 3. Clarke & Wright Savings Algorithm
  onLog(`🚛 Running Savings Algorithm...`);

  // Initial Solution: Each stop is its own route
  // Map route ID to route object
  let routes: Route[] = allStops.map((stop, idx) => ({
    id: `route_${idx}`,
    stops: [stop],
    totalVolume: stop.volume,
    totalDistanceKm: calculateDistanceKm(originCoords, stop.coords) * 2,
    color: ROUTE_COLORS[idx % ROUTE_COLORS.length]
  }));

  // Calculate Distances from Origin
  const distOrigin = new Map<string, number>();
  allStops.forEach(stop => {
    distOrigin.set(stop.id, calculateDistanceKm(originCoords, stop.coords));
  });

  // Calculate Savings
  const savings: { i: DeliveryStop; j: DeliveryStop; save: number }[] = [];
  
  for (let i = 0; i < allStops.length; i++) {
    for (let j = i + 1; j < allStops.length; j++) {
      const stopA = allStops[i];
      const stopB = allStops[j];
      
      const distAB = calculateDistanceKm(stopA.coords, stopB.coords);
      const save = (distOrigin.get(stopA.id)! + distOrigin.get(stopB.id)!) - distAB;
      
      if (save > 0) {
        savings.push({ i: stopA, j: stopB, save });
      }
    }
  }

  // Sort savings descending
  savings.sort((a, b) => b.save - a.save);

  onLog(`📊 Analyzed ${savings.length} potential merges.`);

  // Apply Merges
  for (const { i, j } of savings) {
    // Find current routes for stop i and stop j
    const routeIndexI = routes.findIndex(r => r.stops.some(s => s.id === i.id));
    const routeIndexJ = routes.findIndex(r => r.stops.some(s => s.id === j.id));

    if (routeIndexI === -1 || routeIndexJ === -1 || routeIndexI === routeIndexJ) {
      continue;
    }

    const routeI = routes[routeIndexI];
    const routeJ = routes[routeIndexJ];

    // Check Constraints: Interior vs Exterior points
    // Simplified C&W: We merge if i is last of routeI and j is first of routeJ (or reversible)
    // For this lightweight implementation, we'll try to append routeJ to routeI if volume allows
    // Note: A full robust C&W checks endpoints specifically. 
    
    // Check Volume
    if (routeI.totalVolume + routeJ.totalVolume <= config.truckCapacity) {
        // Basic check: Is stop i at an edge of route I? Is stop j at an edge of route J?
        const iIsFirst = routeI.stops[0].id === i.id;
        const iIsLast = routeI.stops[routeI.stops.length - 1].id === i.id;
        const jIsFirst = routeJ.stops[0].id === j.id;
        const jIsLast = routeJ.stops[routeJ.stops.length - 1].id === j.id;

        let newStops: DeliveryStop[] = [];

        if (iIsLast && jIsFirst) {
            newStops = [...routeI.stops, ...routeJ.stops];
        } else if (iIsFirst && jIsLast) {
            newStops = [...routeJ.stops, ...routeI.stops]; // J then I
        } else if (iIsLast && jIsLast) {
             // Reverse J
             newStops = [...routeI.stops, ...[...routeJ.stops].reverse()];
        } else if (iIsFirst && jIsFirst) {
             // Reverse I
             newStops = [...[...routeI.stops].reverse(), ...routeJ.stops];
        } else {
            continue; // Cannot merge interior points
        }

        // Merge successful
        const newVolume = routeI.totalVolume + routeJ.totalVolume;
        
        // Update Route I
        routes[routeIndexI] = {
            ...routeI,
            stops: newStops,
            totalVolume: newVolume,
            // Recalculate color or keep
        };

        // Remove Route J
        routes.splice(routeIndexJ, 1);
    }
  }

  // Recalculate final metrics and re-sort route NN (Nearest Neighbor) is optional but C&W usually handles sequence.
  // We will run a simple cleanup pass to ensure distances are correct
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