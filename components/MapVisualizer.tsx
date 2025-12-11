import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GeoCoord, Route } from '../types';

// Origin Icon (Black Square)
const originIcon = L.divIcon({
  html: `<div class="bg-black w-6 h-6 rounded-sm border-2 border-white shadow-lg flex items-center justify-center"><span class="text-white text-[10px] font-bold">DP</span></div>`,
  className: 'custom-origin-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Function to create numbered truck icon
const createTruckIcon = (number: number, color: string, count: number) => L.divIcon({
    html: `
      <div style="position: relative;">
        <div style="
          background-color: ${color}; 
          width: 30px; 
          height: 30px; 
          border-radius: 50%; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-weight: bold; 
          font-size: 14px; 
          border: 2px solid white; 
          box-shadow: 0 3px 6px rgba(0,0,0,0.4);
        ">
          ${number}
        </div>
        ${count > 1 ? `
        <div style="
          position: absolute;
          top: -5px;
          right: -5px;
          background-color: #ef4444;
          color: white;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid white;
          font-weight: bold;
        ">${count}</div>` : ''}
      </div>`,
    className: 'custom-truck-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
});

interface MapProps {
    routes: Route[];
    origin: GeoCoord | null;
}

// Helper to fit bounds
const BoundsController: React.FC<{ routes: Route[], origin: GeoCoord | null }> = ({ routes, origin }) => {
    const map = useMap();
    useEffect(() => {
        if (!origin && routes.length === 0) return;

        const bounds = L.latLngBounds([]);
        if (origin) bounds.extend([origin.lat, origin.lng]);
        
        routes.forEach(r => {
            r.stops.forEach(s => bounds.extend([s.coords.lat, s.coords.lng]));
        });

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [routes, origin, map]);
    return null;
};

// Logic to calculate offset coordinates for POLYLINES only (to prevent overlap)
const getOffsetCoords = (coord: GeoCoord, routeIndex: number): L.LatLngTuple => {
    const scale = 0.00015; 
    const shift = (routeIndex + 1) * scale;
    return [coord.lat + shift, coord.lng + shift];
};

interface GroupedLocation {
    id: string; // lat,lng
    coords: GeoCoord;
    address: string;
    totalVolume: number;
    deliveries: Array<{
        truckId: string;
        truckNumber: number;
        color: string;
        volume: number;
        stopIndex: number;
    }>;
}

const MapVisualizer: React.FC<MapProps> = ({ routes, origin }) => {
  
  // Group stops by location (coordinate) to create a single marker per address
  const groupedLocations = useMemo(() => {
    const map = new Map<string, GroupedLocation>();

    routes.forEach((route, rIdx) => {
        route.stops.forEach((stop, sIdx) => {
            const key = `${stop.coords.lat},${stop.coords.lng}`;
            
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    coords: stop.coords,
                    address: stop.endereco,
                    totalVolume: 0,
                    deliveries: []
                });
            }

            const loc = map.get(key)!;
            loc.totalVolume += stop.volume;
            loc.deliveries.push({
                truckId: route.id,
                truckNumber: rIdx + 1,
                color: route.color,
                volume: stop.volume,
                stopIndex: sIdx + 1
            });
        });
    });
    return Array.from(map.values());
  }, [routes]);

  return (
    <div className="h-full w-full min-h-[500px] rounded-lg overflow-hidden border border-slate-200 shadow-inner">
      <MapContainer center={origin || { lat: -26.89, lng: -48.65 }} zoom={13} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <BoundsController routes={routes} origin={origin} />

        {/* Origin Marker */}
        {origin && (
            <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
                <Popup>
                    <div className="font-sans text-sm">
                        <strong>ORIGIN</strong><br/>
                        Depot Location
                    </div>
                </Popup>
            </Marker>
        )}

        {/* Routes Polylines (Still separate to show paths) */}
        {routes.map((route, rIdx) => {
            const points: L.LatLngTuple[] = [];
            if (origin) points.push(getOffsetCoords(origin, rIdx));
            route.stops.forEach(s => points.push(getOffsetCoords(s.coords, rIdx)));
            if (origin) points.push(getOffsetCoords(origin, rIdx));

            return (
                <Polyline 
                    key={route.id}
                    positions={points} 
                    color={route.color}
                    weight={4}
                    opacity={0.6}
                    dashArray="8, 6" 
                />
            );
        })}

        {/* Grouped Location Markers */}
        {groupedLocations.map((loc) => {
             // Use the color of the first delivery for the pin
             const firstDelivery = loc.deliveries[0];
             
             return (
                 <Marker 
                    key={loc.id} 
                    position={[loc.coords.lat, loc.coords.lng]} 
                    icon={createTruckIcon(firstDelivery.truckNumber, firstDelivery.color, loc.deliveries.length)}
                 >
                    <Popup maxWidth={300}>
                        <div className="font-sans">
                            {/* Header */}
                            <div className="border-b border-slate-200 pb-2 mb-2">
                                <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">
                                    {loc.address}
                                </h3>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500 font-semibold uppercase">Total Volume</span>
                                    <span className="text-base font-bold text-blue-700">{loc.totalVolume.toFixed(2)} m³</span>
                                </div>
                            </div>

                            {/* Deliveries List */}
                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                {loc.deliveries.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span 
                                                className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                                                style={{backgroundColor: d.color}}
                                            >
                                                {d.truckNumber}
                                            </span>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700">{d.truckId}</span>
                                                <span className="text-[10px] text-slate-400">Stop #{d.stopIndex}</span>
                                            </div>
                                        </div>
                                        <span className="font-bold text-slate-800">{d.volume} m³</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Popup>
                 </Marker>
             );
        })}

      </MapContainer>
    </div>
  );
};

export default MapVisualizer;