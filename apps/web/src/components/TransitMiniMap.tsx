import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2, Minimize2, Bus, MapPin, X, Navigation } from 'lucide-react';
import { LiveTrackedVehicle, TransitStop } from '../lib/plan.js';
import { haversineDistanceMeters } from '@usm/shared';
import { CHISINAU_ROUTES_TRACKS, getRouteTrack } from '../lib/routes-geometry.js';

interface TransitMiniMapProps {
  vehicles: LiveTrackedVehicle[];
  boardStop?: TransitStop;
  theme?: string;
  onRefresh?: () => void;
}

const ROUTE_COLORS: Record<string, string> = {
  '2': '#d946ef', // Magenta
  '17': '#059669', // Emerald (Sports)
  '4': '#7c3aed', // Violet
  '22': '#d97706', // Amber (Dacia Express)
  '10': '#0284c7', // Sky
  '24': '#ea580c', // Orange
  '30': '#ec4899', // Pink
};

export const TransitMiniMap: React.FC<TransitMiniMapProps> = ({
  vehicles,
  boardStop,
  theme = 'light',
  onRefresh,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Available unique routes from vehicles + default set
  const availableRoutes = Array.from(
    new Set(['2', '17', '4', '22', ...vehicles.map((v) => v.route_short_name)])
  ).filter(Boolean);

  // Default center: boardStop or Cuza Voda coordinates
  const defaultCenterLat = boardStop?.stop_lat ?? 46.9825;
  const defaultCenterLon = boardStop?.stop_lon ?? 28.865;

  // Track user location via GPS
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('GPS не поддерживается');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setGeoError(null);
      },
      (err) => {
        // User denied or unavailable
        setGeoError(err.code === 1 ? 'Геолокация отключена' : 'Поиск GPS...');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const initialLat = userLocation?.lat ?? defaultCenterLat;
    const initialLon = userLocation?.lon ?? defaultCenterLon;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLon],
      zoom: 14,
      zoomControl: isFullscreen,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Tile Layer: CartoDB Dark Matter for dark theme, CartoDB Positron for light / pink
    const isDark = theme.includes('dark');
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    const routeGroup = L.layerGroup().addTo(map);
    routeLayerRef.current = routeGroup;

    // Fix map rendering size after mount / fullscreen toggle
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isFullscreen, theme]);

  // Render Selected Route Track Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    if (selectedRouteFilter === 'all') {
      return;
    }

    const track = getRouteTrack(selectedRouteFilter, vehicles);
    if (!track || !track.waypoints || track.waypoints.length === 0) {
      return;
    }

    const outerGlow = L.polyline(track.waypoints, {
      color: track.color,
      weight: 9,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    });

    const coreLine = L.polyline(track.waypoints, {
      color: track.color,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    const countOnLine = vehicles.filter((v) => v.route_short_name === selectedRouteFilter).length;
    coreLine.bindPopup(
      `<div class="map-trolley-popup">
        <div class="popup-head" style="background: ${track.color}">
          <strong>${track.routeName}</strong>
          <span>${countOnLine} ${countOnLine === 1 ? 'машина' : countOnLine < 5 ? 'машины' : 'машин'}</span>
        </div>
        <div class="popup-body">
          <small>${track.description}</small>
        </div>
      </div>`,
      { offset: [0, -4] }
    );

    outerGlow.addTo(routeLayer);
    coreLine.addTo(routeLayer);

    try {
      const bounds = coreLine.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
      }
    } catch {
      // Handled silently
    }
  }, [selectedRouteFilter, vehicles]);

  // Update Markers (User, Stop, Trolleybuses)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // 1. User Location Marker
    if (userLocation) {
      const userHtml = `
        <div class="map-user-pin">
          <div class="user-pulse-ring"></div>
          <div class="user-dot"></div>
        </div>
      `;
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: userHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const uMarker = L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
        .bindPopup(
          `<div class="map-popup-card">
            <b>📍 Ты здесь</b>
            <small>Координаты: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}</small>
          </div>`
        )
        .addTo(layer);

      userMarkerRef.current = uMarker;
    }

    // 2. Boarding Stop Marker
    const stopLat = boardStop?.stop_lat ?? defaultCenterLat;
    const stopLon = boardStop?.stop_lon ?? defaultCenterLon;
    const stopName = boardStop?.stop_name ?? 'Остановка Dacia / Cuza Vodă';

    const stopHtml = `
      <div class="map-stop-pin">
        <span class="stop-pin-icon">📍</span>
      </div>
    `;
    const stopIcon = L.divIcon({
      className: 'custom-stop-marker',
      html: stopHtml,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    L.marker([stopLat, stopLon], { icon: stopIcon })
      .bindPopup(
        `<div class="map-popup-card">
          <b>🚏 ${stopName}</b>
          <span>Твоя остановка посадки</span>
        </div>`
      )
      .addTo(layer);

    // 3. Trolleybus Markers
    const filteredVehicles = vehicles.filter((v) => {
      if (selectedRouteFilter !== 'all' && v.route_short_name !== selectedRouteFilter) {
        return false;
      }
      return true;
    });

    filteredVehicles.forEach((veh) => {
      const color = ROUTE_COLORS[veh.route_short_name] || '#2563eb';
      const speedKmH = Math.round(veh.speed);

      // Distance calculations
      let distToUserMeters: number | null = null;
      if (userLocation) {
        distToUserMeters = Math.round(
          haversineDistanceMeters(userLocation.lat, userLocation.lon, veh.latitude, veh.longitude)
        );
      }

      const distToStopMeters = Math.round(
        haversineDistanceMeters(stopLat, stopLon, veh.latitude, veh.longitude)
      );

      const etaToStopMin = Math.max(1, Math.round(distToStopMeters / 350));

      const routeVehiclesCount = vehicles.filter(
        (v) => v.route_short_name === veh.route_short_name
      ).length;

      const trolleyHtml = `
        <div class="map-trolley-pin" style="--route-color: ${color}">
          <span class="trolley-nav-arrow" aria-hidden="true">➤</span>
          <span class="trolley-pin-num">${veh.route_short_name}</span>
          ${speedKmH > 3 ? `<span class="trolley-speed-tag">${speedKmH}</span>` : ''}
        </div>
      `;

      const tIcon = L.divIcon({
        className: 'custom-trolley-marker',
        html: trolleyHtml,
        iconSize: [42, 26],
        iconAnchor: [21, 13],
      });

      const popupHtml = `
        <div class="map-trolley-popup">
          <div class="popup-head" style="background: ${color}">
            <strong>Троллейбус №${veh.route_short_name}</strong>
            <span>борт ${veh.label || '—'}</span>
          </div>
          <div class="popup-body">
            <div class="popup-row active-route-row-badge">
              <span>На этом маршруте:</span>
              <b>${routeVehiclesCount} ${routeVehiclesCount === 1 ? 'машина' : routeVehiclesCount < 5 ? 'машины' : 'машин'}</b>
            </div>
            <div class="popup-row">
              <span>До остановки:</span>
              <b>${distToStopMeters} м (~${etaToStopMin} мин)</b>
            </div>
            ${
              distToUserMeters != null
                ? `<div class="popup-row">
                    <span>До тебя:</span>
                    <b>${distToUserMeters} м</b>
                  </div>`
                : ''
            }
            <div class="popup-row">
              <span>Скорость:</span>
              <b>${speedKmH} км/ч</b>
            </div>
          </div>
        </div>
      `;

      const tMarker = L.marker([veh.latitude, veh.longitude], { icon: tIcon })
        .bindPopup(popupHtml, { closeButton: false, offset: [0, -10] })
        .addTo(layer);

      tMarker.on('click', () => {
        setSelectedRouteFilter(veh.route_short_name);
      });
    });
  }, [vehicles, selectedRouteFilter, userLocation, boardStop, defaultCenterLat, defaultCenterLon]);

  // Center on User GPS
  const handleLocateUser = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lon], 15, { duration: 0.8 });
    } else {
      map.flyTo([defaultCenterLat, defaultCenterLon], 14, { duration: 0.8 });
    }
  }, [userLocation, defaultCenterLat, defaultCenterLon]);

  const selectedTrack = selectedRouteFilter !== 'all' ? getRouteTrack(selectedRouteFilter, vehicles) : null;
  const vehiclesOnSelectedRoute = selectedRouteFilter !== 'all'
    ? vehicles.filter((v) => v.route_short_name === selectedRouteFilter)
    : vehicles;

  return (
    <div className={`transit-minimap-wrapper ${isFullscreen ? 'fullscreen' : 'compact'}`}>
      {/* Top HUD Controls Overlay */}
      <div className="map-hud-overlay">
        <div className="map-hud-filters">
          <button
            type="button"
            className={`map-filter-chip ${selectedRouteFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedRouteFilter('all')}
          >
            Все ({vehicles.length})
          </button>
          {availableRoutes.map((rt) => {
            const count = vehicles.filter((v) => v.route_short_name === rt).length;
            const color = ROUTE_COLORS[rt] || '#2563eb';
            return (
              <button
                key={rt}
                type="button"
                className={`map-filter-chip ${selectedRouteFilter === rt ? 'active' : ''}`}
                style={{
                  borderLeftColor: color,
                  borderLeftWidth: '3px',
                }}
                onClick={() => setSelectedRouteFilter(rt)}
              >
                №{rt} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        <div className="map-hud-actions">
          <button
            type="button"
            className="map-hud-btn locate"
            onClick={handleLocateUser}
            title="Где я"
            aria-label="Где я"
          >
            <Crosshair size={14} />
          </button>
          <button
            type="button"
            className="map-hud-btn expand"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Свернуть' : 'Развернуть'}
            aria-label={isFullscreen ? 'Свернуть карту' : 'Развернуть во весь экран'}
          >
            {isFullscreen ? <X size={15} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Active Route Strip */}
      {selectedRouteFilter !== 'all' && (
        <div className="minimap-active-route-strip">
          <span className="route-strip-badge" style={{ background: selectedTrack?.color || '#d946ef' }}>
            №{selectedRouteFilter}
          </span>
          <span className="route-strip-count">
            <b>{vehiclesOnSelectedRoute.length}</b> {vehiclesOnSelectedRoute.length === 1 ? 'машина' : vehiclesOnSelectedRoute.length < 5 ? 'машины' : 'машин'} на линии
          </span>
          <button
            type="button"
            className="route-strip-close"
            onClick={() => setSelectedRouteFilter('all')}
            title="Все машины"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Leaflet Map DOM Container */}
      <div ref={containerRef} className="transit-map-canvas" />

      {/* Bottom Status Ribbon */}
      <div className="map-bottom-ribbon">
        <span className="ribbon-live-pulse" />
        <span className="ribbon-info">
          {vehicles.length > 0
            ? `${vehicles.length} машин онлайн · GPS RTEC`
            : 'Поиск троллейбусов на линии…'}
        </span>
        {userLocation ? (
          <span className="ribbon-gps-status">GPS активен</span>
        ) : (
          <span className="ribbon-gps-warn">{geoError || 'Остановка Cuza Vodă'}</span>
        )}
      </div>
    </div>
  );
};
