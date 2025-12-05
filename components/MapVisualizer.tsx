import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GeoCoord, Route } from '../types';

// Fix for default Leaflet markers in React
const ICON_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: ICON_URL,
    shadowUrl: SHADOW_URL,
    iconSize: [25, 41],
    iconAnchor: [12, 41], // Bottom-center to point exactly at location
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const originIcon = L.divIcon({
  html: `<div class="bg-black w-6 h-6 rounded-sm border-2 border-white shadow-lg"></div>`,
  className: 'custom-div-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
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

// Logic to calculate offset coordinates
const getOffsetCoords = (coord: GeoCoord, routeIndex: number): L.LatLngTuple => {
    const scale = 0.00012;
    // Route index 0 gets shift 1*scale, index 1 gets 2*scale... matches Python logic roughly
    // Python: shift = i * scale (where i is 1-based index)
    const shift = (routeIndex + 1) * scale;
    return [coord.lat + shift, coord.lng + shift];
};

interface MarkerInfo {
    truckId: string;
    stopIndex: number;
    volume: number;
}

const MapVisualizer: React.FC<MapProps> = ({ routes, origin }) => {
  
  // Aggregate markers logic (matches Python "AGG_MARKERS")
  // We want ONE marker per unique address, positioned at the average of all offsets that visit it
  const aggregatedMarkers = useMemo(() => {
    const markers: Record<string, { 
        latSum: number, 
        lngSum: number, 
        count: number, 
        infos: MarkerInfo[] 
    }> = {};

    routes.forEach((route, rIdx) => {
        route.stops.forEach((stop, sIdx) => {
            const key = stop.endereco;
            if (!markers[key]) {
                markers[key] = { latSum: 0, lngSum: 0, count: 0, infos: [] };
            }
            
            // Calculate where the line node is for this stop (the offset position)
            const [offLat, offLng] = getOffsetCoords(stop.coords, rIdx);
            
            markers[key].latSum += offLat;
            markers[key].lngSum += offLng;
            markers[key].count += 1;
            markers[key].infos.push({
                truckId: route.id,
                stopIndex: sIdx + 1,
                volume: stop.volume
            });
        });
    });

    return Object.entries(markers).map(([address, data]) => ({
        address,
        lat: data.latSum / data.count,
        lng: data.lngSum / data.count,
        infos: data.infos
    }));
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
                    opacity={0.8} 
                    dashArray="8, 6" // Matches the Python script style closer
                />
            );
        })}

        {/* Aggregated Markers */}
        {aggregatedMarkers.map((m, idx) => (
             <Marker 
                key={idx} 
                position={[m.lat, m.lng]} 
                // We use default icon which has the correct anchor [12, 41] defined above
             >
                <Popup>
                    <div className="min-w-[180px] font-sans">
                        <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2 text-sm leading-tight">
                            {m.address}
                        </h3>
                        {m.infos.map((info, i) => (
                            <div key={i} className={`text-xs text-slate-700 ${i > 0 ? 'mt-3 pt-3 border-t border-slate-100' : ''}`}>
                                <div className="grid grid-cols-[60px_1fr] gap-1">
                                    <span className="font-semibold text-slate-500">Route:</span>
                                    <span className="font-medium">{info.truckId}</span>
                                    
                                    <span className="font-semibold text-slate-500">Stop:</span>
                                    <span>{info.stopIndex}</span>
                                    
                                    <span className="font-semibold text-slate-500">Volume:</span>
                                    <span className="font-bold text-slate-900">{info.volume} m³</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Popup>
             </Marker>
        ))}

      </MapContainer>
    </div>
  );
};

export default MapVisualizer;