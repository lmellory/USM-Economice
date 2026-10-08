import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Search,
  Crosshair,
  MapPin,
  Bus,
  Layers,
  RefreshCw,
  X,
  Compass,
  Navigation,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import { LiveTrackedVehicle, TransitStop, CommuteOption } from '../lib/plan.js';
import { haversineDistanceMeters } from '@usm/shared';
import { CHISINAU_ROUTES_TRACKS, getRouteTrack } from '../lib/routes-geometry.js';

interface TransitViewProps {
  vehicles: LiveTrackedVehicle[];
  options?: CommuteOption[];
  settings?: any;
  onRefresh?: () => void;
  request?: (path: string, options?: any) => Promise<any>;
  onOpenCommuteSettings?: () => void;
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

const DEFAULT_CENTER = { lat: 46.995, lon: 28.845 }; // Centered between Botanica & Centru

export const TransitView: React.FC<TransitViewProps> = ({
  vehicles,
  options = [],
  settings = {},
  onRefresh,
  request,
  onOpenCommuteSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const satLabelsLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const vehiclesLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // States
  const [mapMode, setMapMode] = useState<'street' | 'satellite'>('street');
  const [showStops, setShowStops] = useState(true);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [stopsList, setStopsList] = useState<TransitStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const theme = settings.theme || 'light';
  const isDark = theme.includes('dark');

  // Track GPS
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
        setGeoError(err.code === 1 ? 'Геолокация отключена' : 'Поиск GPS...');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Fetch stops list from API
  useEffect(() => {
    let isMounted = true;
    const fetchStops = async () => {
      try {
        if (request) {
          const res = await request('/api/transit/stops?all=1');
          if (isMounted && res.stops && Array.isArray(res.stops)) {
            setStopsList(res.stops);
          }
        }
      } catch {
        // Handled silently
      }
    };
    fetchStops();
    return () => {
      isMounted = false;
    };
  }, [request]);

  const [activeVehicles, setActiveVehicles] = useState<LiveTrackedVehicle[]>(vehicles);

  useEffect(() => {
    if (vehicles && vehicles.length > 0) {
      setActiveVehicles(vehicles);
    }
  }, [vehicles]);

  const fetchLiveVehicles = useCallback(async () => {
    if (!request) return;
    try {
      const res = await request('/api/transit/commute?destination=university');
      if (res && res.liveVehicles && Array.isArray(res.liveVehicles)) {
        setActiveVehicles(res.liveVehicles);
      }
    } catch {
      // Handled silently
    }
  }, [request]);

  useEffect(() => {
    fetchLiveVehicles();
    const timer = setInterval(fetchLiveVehicles, 20000);
    return () => clearInterval(timer);
  }, [fetchLiveVehicles]);

  // Available unique routes
  const availableRoutes = useMemo(() => {
    const fromVehicles = activeVehicles.map((v) => v.route_short_name);
    return Array.from(new Set(['2', '17', '4', '22', '10', '24', ...fromVehicles])).filter(Boolean);
  }, [activeVehicles]);

  // Key boarding stop from commute options (e.g., Cuza Vodă / Dacia)
  const boardingStopName = useMemo(() => {
    const primaryOption = options[0];
    const firstLeg = primaryOption?.legs?.[0];
    return firstLeg?.board_stop_name || (firstLeg as any)?.boardStopName || '';
  }, [options]);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const initLat = userLocation?.lat ?? DEFAULT_CENTER.lat;
    const initLon = userLocation?.lon ?? DEFAULT_CENTER.lon;

    const map = L.map(containerRef.current, {
      center: [initLat, initLon],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    // Tile Layers
    const streetTileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const streetLayer = L.tileLayer(streetTileUrl, {
      subdomains: 'abcd',
      maxZoom: 19,
    });
    streetLayerRef.current = streetLayer;

    // High Resolution Esri World Imagery (Satellite)
    const satLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    );
    satLayerRef.current = satLayer;

    // Hybrid Street Names & Boundaries for Satellite
    const satLabelsLayer = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    );
    satLabelsLayerRef.current = satLabelsLayer;

    if (mapMode === 'satellite') {
      satLayer.addTo(map);
      satLabelsLayer.addTo(map);
    } else {
      streetLayer.addTo(map);
    }

    // Layers groups for markers and route track
    routeLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    vehiclesLayerRef.current = L.layerGroup().addTo(map);

    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isDark]);

  // Render Selected Route Track Polyline (like magenta line in screenshot)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    if (selectedRouteFilter === 'all') {
      return;
    }

    const track = getRouteTrack(selectedRouteFilter, activeVehicles);
    if (!track || !track.waypoints || track.waypoints.length === 0) {
      return;
    }

    // Outer neon glow
    const outerGlow = L.polyline(track.waypoints, {
      color: track.color,
      weight: 10,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    });

    // Core vivid line
    const coreLine = L.polyline(track.waypoints, {
      color: track.color,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    const routeVehiclesCount = activeVehicles.filter(
      (v) => v.route_short_name === selectedRouteFilter
    ).length;

    coreLine.bindPopup(
      `<div class="map-trolley-popup">
        <div class="popup-head" style="background: ${track.color}">
          <strong>${track.routeName}</strong>
          <span>${routeVehiclesCount} ${routeVehiclesCount === 1 ? 'машина' : routeVehiclesCount < 5 ? 'машины' : 'машин'}</span>
        </div>
        <div class="popup-body">
          <small>${track.description}</small>
        </div>
      </div>`,
      { offset: [0, -4] }
    );

    outerGlow.addTo(routeLayer);
    coreLine.addTo(routeLayer);

    // Zoom and pan smoothly to the whole route extent
    try {
      const bounds = coreLine.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
      }
    } catch {
      // Handled silently
    }
  }, [selectedRouteFilter, activeVehicles]);

  // Handle Map Mode Toggle (Street / Satellite)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const street = streetLayerRef.current;
    const sat = satLayerRef.current;
    const satLabels = satLabelsLayerRef.current;
    if (!map || !street || !sat || !satLabels) return;

    if (mapMode === 'satellite') {
      map.removeLayer(street);
      map.addLayer(sat);
      map.addLayer(satLabels);
    } else {
      map.removeLayer(sat);
      map.removeLayer(satLabels);
      map.addLayer(street);
    }
  }, [mapMode]);

  // Render User Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

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
        .addTo(map);

      userMarkerRef.current = uMarker;
    }
  }, [userLocation]);

  // Render All Stops
  useEffect(() => {
    const layer = stopsLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    if (!showStops) return;

    stopsList.forEach((stop) => {
      const isBoarding =
        stop.stop_name.toLowerCase().includes('cuza vodă') ||
        stop.stop_name.toLowerCase().includes('dacia') ||
        stop.stop_name.toLowerCase() === boardingStopName.toLowerCase();

      const isUni =
        stop.stop_name.toLowerCase().includes('usm') ||
        stop.stop_name.toLowerCase().includes('stat');

      const isSports =
        stop.stop_name.toLowerCase().includes('sport') ||
        stop.stop_name.toLowerCase().includes('ismail 1');

      let stopPinClass = 'stop-dot-regular';
      let stopIconHtml = `<div class="map-stop-pin ${stopPinClass}"><span class="stop-dot"></span></div>`;

      if (isBoarding) {
        stopPinClass = 'stop-dot-boarding';
        stopIconHtml = `
          <div class="map-stop-pin ${stopPinClass}">
            <span class="stop-star-badge">🚏 Посадка</span>
          </div>
        `;
      } else if (isUni || isSports) {
        stopPinClass = 'stop-dot-dest';
        stopIconHtml = `
          <div class="map-stop-pin ${stopPinClass}">
            <span class="stop-dest-badge">${isUni ? '🎓 USM' : '🏅 Спорт'}</span>
          </div>
        `;
      }

      const icon = L.divIcon({
        className: 'custom-stop-marker-item',
        html: stopIconHtml,
        iconSize: isBoarding || isUni || isSports ? [70, 22] : [14, 14],
        iconAnchor: isBoarding || isUni || isSports ? [35, 11] : [7, 7],
      });

      let distMeters: number | null = null;
      if (userLocation) {
        distMeters = Math.round(
          haversineDistanceMeters(userLocation.lat, userLocation.lon, stop.stop_lat, stop.stop_lon)
        );
      }

      const marker = L.marker([stop.stop_lat, stop.stop_lon], { icon }).addTo(layer);

      const popupHtml = `
        <div class="map-stop-popup-card">
          <div class="stop-popup-head">
            <b>🚏 ${stop.stop_name}</b>
            ${stop.stop_desc ? `<small>${stop.stop_desc}</small>` : ''}
          </div>
          <div class="stop-popup-body">
            ${
              distMeters != null
                ? `<div class="stop-popup-row">
                    <span>Расстояние от тебя:</span>
                    <b>${distMeters} м (~${Math.max(1, Math.round(distMeters / 75))} мин пешком)</b>
                  </div>`
                : ''
            }
            <div class="stop-popup-row">
              <span>Координаты:</span>
              <span>${stop.stop_lat.toFixed(4)}, ${stop.stop_lon.toFixed(4)}</span>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { offset: [0, -6] });
      marker.on('click', () => setSelectedStop(stop));
    });
  }, [stopsList, showStops, userLocation, boardingStopName]);

  // Render Trolleybuses
  useEffect(() => {
    const layer = vehiclesLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    const filtered = activeVehicles.filter((v) => {
      if (selectedRouteFilter !== 'all' && v.route_short_name !== selectedRouteFilter) {
        return false;
      }
      return true;
    });

    filtered.forEach((veh) => {
      const color = ROUTE_COLORS[veh.route_short_name] || '#2563eb';
      const speedKmH = Math.round(veh.speed);

      let distToUserMeters: number | null = null;
      if (userLocation) {
        distToUserMeters = Math.round(
          haversineDistanceMeters(userLocation.lat, userLocation.lon, veh.latitude, veh.longitude)
        );
      }

      const routeVehiclesCount = activeVehicles.filter(
        (v) => v.route_short_name === veh.route_short_name
      ).length;

      const trolleyHtml = `
        <div class="map-trolley-pin" style="--route-color: ${color}">
          <span class="trolley-nav-arrow" aria-hidden="true">➤</span>
          <span class="trolley-pin-num">${veh.route_short_name}</span>
          ${speedKmH > 2 ? `<span class="trolley-speed-tag">${speedKmH}</span>` : ''}
        </div>
      `;

      const tIcon = L.divIcon({
        className: 'custom-trolley-marker',
        html: trolleyHtml,
        iconSize: [44, 26],
        iconAnchor: [22, 13],
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
            ${
              distToUserMeters != null
                ? `<div class="popup-row">
                    <span>До тебя:</span>
                    <b>${distToUserMeters} м (~${Math.max(1, Math.round(distToUserMeters / 300))} мин)</b>
                  </div>`
                : ''
            }
            <div class="popup-row">
              <span>Скорость:</span>
              <b>${speedKmH} км/ч</b>
            </div>
            <div class="popup-row">
              <span>GPS обновление:</span>
              <small>${new Date(veh.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>
            </div>
          </div>
        </div>
      `;

      const trolleyMarker = L.marker([veh.latitude, veh.longitude], { icon: tIcon })
        .bindPopup(popupHtml, { closeButton: false, offset: [0, -10] })
        .addTo(layer);

      trolleyMarker.on('click', () => {
        setSelectedRouteFilter(veh.route_short_name);
      });
    });
  }, [activeVehicles, selectedRouteFilter, userLocation]);

  // Center on User GPS
  const handleLocateUser = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lon], 15, { duration: 0.8 });
    } else {
      map.flyTo([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 14, { duration: 0.8 });
    }
  }, [userLocation]);

  // Center on Selected Stop
  const handleSelectSearchedStop = (stop: TransitStop) => {
    setSearchQuery('');
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([stop.stop_lat, stop.stop_lon], 16, { duration: 0.8 });
    setSelectedStop(stop);
  };

  // Filtered stops for search suggestions
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return stopsList
      .filter((s) => s.stop_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchQuery, stopsList]);

  const handleRefreshClick = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const selectedTrack = selectedRouteFilter !== 'all' ? getRouteTrack(selectedRouteFilter, activeVehicles) : null;
  const vehiclesOnSelectedRoute = selectedRouteFilter !== 'all'
    ? activeVehicles.filter((v) => v.route_short_name === selectedRouteFilter)
    : activeVehicles;

  return (
    <div className="transit-view-page">
      {/* Search Header Overlay */}
      <div className="transit-view-topbar">
        <div className="transit-search-bar">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Поиск остановки в Кишинёве…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="transit-search-dropdown">
            {searchResults.map((stop) => (
              <button
                key={stop.stop_id}
                type="button"
                className="search-drop-item"
                onClick={() => handleSelectSearchedStop(stop)}
              >
                <MapPin size={14} />
                <div>
                  <strong>{stop.stop_name}</strong>
                  {stop.stop_desc && <small>{stop.stop_desc}</small>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Main Canvas */}
      <div className="transit-map-fullscreen-container">
        <div ref={containerRef} className="transit-map-fullcanvas" />

        {/* Map Top HUD Controls */}
        <div className="transit-map-controls-hud">
          {/* Layer Mode Switcher: Street / Satellite */}
          <div className="map-mode-toggle-group">
            <button
              type="button"
              className={`mode-btn ${mapMode === 'street' ? 'active' : ''}`}
              onClick={() => setMapMode('street')}
              title="Обычная схема"
            >
              <Layers size={13} />
              <span>Схема</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${mapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setMapMode('satellite')}
              title="Спутниковые снимки"
            >
              <GlobeIcon />
              <span>Спутник</span>
            </button>
          </div>

          {/* Route Dropdown Selector (Matching user screenshot) */}
          <div className="map-route-dropdown-wrap">
            <select
              value={selectedRouteFilter}
              onChange={(e) => setSelectedRouteFilter(e.target.value)}
              className="map-route-select"
              title="Выбор маршрута"
            >
              <option value="all">Все машины ({activeVehicles.length})</option>
              {availableRoutes.map((rt) => {
                const count = activeVehicles.filter((v) => v.route_short_name === rt).length;
                return (
                  <option key={rt} value={rt}>
                    Маршрут №{rt} ({count} на линии)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Stops Toggle */}
          <button
            type="button"
            className={`map-hud-toggle-btn ${showStops ? 'active' : ''}`}
            onClick={() => setShowStops(!showStops)}
            title="Показать/скрыть остановки"
          >
            <span>🚏 Остановки</span>
            {stopsList.length > 0 ? (
              <small>{stopsList.length}</small>
            ) : (
              <small style={{ opacity: 0.6 }}>не загружены</small>
            )}
          </button>

          {/* Actions: Commute settings, Locate GPS & Refresh */}
          <div className="map-hud-actions-cluster">
            {onOpenCommuteSettings && (
              <button
                type="button"
                className="map-action-round-btn"
                onClick={onOpenCommuteSettings}
                title="Настройка дороги"
                aria-label="Настройка дороги"
              >
                <Settings2 size={16} />
              </button>
            )}
            <button
              type="button"
              className="map-action-round-btn"
              onClick={handleLocateUser}
              title="Где я"
              aria-label="Найти меня"
            >
              <Crosshair size={16} />
            </button>
            <button
              type="button"
              className={`map-action-round-btn ${isRefreshing ? 'spin' : ''}`}
              onClick={handleRefreshClick}
              title="Обновить"
              aria-label="Обновить троллейбусы"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Filter Chips Scrollable */}
        <div className="transit-routes-filter-row">
          <button
            type="button"
            className={`route-chip ${selectedRouteFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedRouteFilter('all')}
          >
            Все ({activeVehicles.length})
          </button>
          {availableRoutes.map((rt) => {
            const count = activeVehicles.filter((v) => v.route_short_name === rt).length;
            const color = ROUTE_COLORS[rt] || '#2563eb';
            return (
              <button
                key={rt}
                type="button"
                className={`route-chip ${selectedRouteFilter === rt ? 'active' : ''}`}
                style={{
                  borderLeftColor: color,
                  borderLeftWidth: '3.5px',
                }}
                onClick={() => setSelectedRouteFilter(rt)}
              >
                №{rt} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Floating Active Route Card with Trolley Count */}
        {selectedRouteFilter !== 'all' && (
          <div className="active-route-hud-card">
            <div
              className="active-route-badge"
              style={{ background: selectedTrack?.color || '#d946ef' }}
            >
              <span>№{selectedRouteFilter}</span>
            </div>
            <div className="active-route-meta">
              <div className="active-route-header-text">
                <strong className="active-route-title">
                  {selectedTrack?.routeName || `Маршрут №${selectedRouteFilter}`}
                </strong>
                <span className="active-route-count-pill">
                  {vehiclesOnSelectedRoute.length} {vehiclesOnSelectedRoute.length === 1 ? 'машина' : vehiclesOnSelectedRoute.length < 5 ? 'машины' : 'машин'} на рейсе
                </span>
              </div>
              <small className="active-route-desc">
                {selectedTrack?.description || 'Траектория движения'}
              </small>
            </div>
            <button
              type="button"
              className="active-route-close-btn"
              onClick={() => setSelectedRouteFilter('all')}
              title="Показать все машины"
              aria-label="Сбросить выбранный маршрут"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Floating Bottom Status Pill */}
        <div className="transit-view-bottom-pill">
          <div className="pill-live-status">
            <span className="live-radar-dot" />
            <span className="live-stat-text">
              {activeVehicles.length > 0
                ? `${activeVehicles.length} машин онлайн · GPS RTEC`
                : 'Поиск троллейбусов на линии…'}
            </span>
          </div>
          <div className="pill-gps-status">
            {userLocation ? (
              <span className="gps-ok">
                <CheckCircle2 size={12} /> GPS активен
              </span>
            ) : (
              <span className="gps-warn">{geoError || 'Остановка Cuza Vodă'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
