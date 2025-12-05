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
const createTruckIcon = (number: number, color: string) => L.divIcon({
    html: `
      <div style="
        background-color: ${color}; 
        width: 28px; 
        height: 28px; 
        border-radius: 50%; 
        color: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-weight: bold; 
        font-size: 14px; 
        border: 2px solid white; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        ${number}
      </div>`,
    className: 'custom-truck-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14], // Center the icon
    popupAnchor: [0, -14]
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

// Logic to calculate offset coordinates so markers don't overlap exactly
const getOffsetCoords = (coord: GeoCoord, routeIndex: number): L.LatLngTuple => {
    // Increased scale slightly to make sure icons don't touch if they are at same address
    const scale = 0.00015; 
    const shift = (routeIndex + 1) * scale;
    // Shift both lat and lng to create a diagonal separation line for different trucks at same spot
    return [coord.lat + shift, coord.lng + shift];
};

const MapVisualizer: React.FC<MapProps> = ({ routes, origin }) => {
  
  // Flatten all stops into a single array of markers
  // This ensures that if Truck 1 and Truck 2 go to the same address, 
  // we render TWO separate markers.
  const allMarkers = useMemo(() => {
    const markers: any[] = [];

    routes.forEach((route, rIdx) => {
        route.stops.forEach((stop, sIdx) => {
            // Apply offset based on truck index
            // This physically separates markers at the same address based on who is delivering
            const [lat, lng] = getOffsetCoords(stop.coords, rIdx);

            markers.push({
                uniqueId: `${route.id}-${sIdx}`,
                lat,
                lng,
                truckId: route.id,
                truckNumber: rIdx + 1, // Assumes routes are ordered Truck 1, Truck 2...
                color: route.color,
                stopIndex: sIdx + 1,
                volume: stop.volume,
                address: stop.endereco
            });
        });
    });
    return markers;
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

        {/* Routes Polylines */}
        {routes.map((route, rIdx) => {
            // Build polyline points including origin start/end
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
                    opacity={0.6} // Slightly lower opacity to let markers pop
                    dashArray="8, 6" 
                />
            );
        })}

        {/* Individual Stop Markers */}
        {allMarkers.map((m) => (
             <Marker 
                key={m.uniqueId} 
                position={[m.lat, m.lng]} 
                icon={createTruckIcon(m.truckNumber, m.color)}
             >
                <Popup>
                    <div className="min-w-[180px] font-sans">
                        <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2 text-sm leading-tight">
                            {m.address}
                        </h3>
                        <div className="text-xs text-slate-700">
                            <div className="grid grid-cols-[60px_1fr] gap-1">
                                <span className="font-semibold text-slate-500">Route:</span>
                                <span className="font-medium flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{background: m.color}}></span>
                                    {m.truckId}
                                </span>
                                
                                <span className="font-semibold text-slate-500">Stop:</span>
                                <span>{m.stopIndex}</span>
                                
                                <span className="font-semibold text-slate-500">Volume:</span>
                                <span className="font-bold text-slate-900">{m.volume} m³</span>
                            </div>
                        </div>
                    </div>
                </Popup>
             </Marker>
        ))}

      </MapContainer>
    </div>
  );
};

export default MapVisualizer;