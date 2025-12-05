import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GeoCoord, Route } from '../types';

// Fix for default Leaflet markers in React
// Using CDN URLs avoids bundler issues with image assets in this environment
const ICON_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: ICON_URL,
    shadowUrl: SHADOW_URL,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
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

const createTruckIcon = (color: string, label: string) => L.divIcon({
  html: `<div style="background-color: ${color}" class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-bold text-xs">${label}</div>`,
  className: 'custom-div-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
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

const MapVisualizer: React.FC<MapProps> = ({ routes, origin }) => {
  // Offset logic for visualization (similar to the python offset_coord)
  const getOffsetCoords = (coord: GeoCoord, routeIndex: number): [number, number] => {
    const scale = 0.00012;
    const shift = (routeIndex + 1) * scale;
    return [coord.lat + shift, coord.lng + shift];
  };

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
                    <strong>Origin</strong><br/>
                    Depot Location
                </Popup>
            </Marker>
        )}

        {/* Routes */}
        {routes.map((route, rIdx) => {
            // Build polyline points including origin start/end
            const points: [number, number][] = [];
            if (origin) points.push(getOffsetCoords(origin, rIdx));
            route.stops.forEach(s => points.push(getOffsetCoords(s.coords, rIdx)));
            if (origin) points.push(getOffsetCoords(origin, rIdx));

            return (
                <React.Fragment key={route.id}>
                    <Polyline 
                        positions={points} 
                        color={route.color}
                        weight={4}
                        opacity={0.7}
                        dashArray="10, 5"
                    />
                    {route.stops.map((stop, sIdx) => (
                        <Marker 
                            key={stop.id} 
                            position={getOffsetCoords(stop.coords, rIdx)}
                            icon={createTruckIcon(route.color, (sIdx + 1).toString())}
                        >
                            <Popup>
                                <div className="text-sm">
                                    <h3 className="font-bold text-slate-800">{stop.endereco}</h3>
                                    <div className="mt-1 text-slate-600">
                                        Route: {route.id}<br/>
                                        Stop: {sIdx + 1}<br/>
                                        Volume: {stop.volume} m³
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </React.Fragment>
            );
        })}
      </MapContainer>
    </div>
  );
};

export default MapVisualizer;