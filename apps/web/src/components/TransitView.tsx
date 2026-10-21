import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Search,
  Crosshair,
  MapPin,
  Bus,
  Car,
  Layers,
  RefreshCw,
  X,
  Compass,
  Navigation,
  CheckCircle2,
  Settings2,
  CircleAlert,
  Footprints,
  Clock,
  ArrowRight,
  ArrowDownUp,
} from 'lucide-react';
import { LiveTrackedVehicle, TransitStop, CommuteOption } from '../lib/plan.js';
import {
  haversineDistanceMeters,
  findNearestStop,
  TripPlanResult,
  TripRouteOption,
  TripStep,
  TripTransitStep,
  TripWalkStep,
  TrafficLevel,
} from '@usm/shared';
import { getTrolleyRoute } from '../lib/routes-geometry.js';

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
  }
}

interface TransitViewProps {
  vehicles: LiveTrackedVehicle[];
  options?: CommuteOption[];
  settings?: any;
  onRefresh?: () => void;
  request?: (path: string, options?: any) => Promise<any>;
  onOpenCommuteSettings?: () => void;
  mapsBrowserKey?: string;
}

const escapeMapText = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char
  );
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

let googleMapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-js-sdk');
    if (existing) {
      if (window.google?.maps) {
        return resolve(window.google);
      }
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', (e) => reject(e));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=geometry`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error('Google Maps SDK loaded but google.maps is not available'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function getTrafficBadge(level: TrafficLevel, label?: string) {
  switch (level) {
    case 'free':
      return { text: label || '🟢 Свободно', className: 'traffic-badge free' };
    case 'dense':
      return { text: label || '🟡 Плотно', className: 'traffic-badge dense' };
    case 'jam':
      return { text: label || '🔴 Пробки', className: 'traffic-badge jam' };
    case 'no_data':
    default:
      return { text: label || '⚪ Нет данных', className: 'traffic-badge no_data' };
  }
}

export const TransitView: React.FC<TransitViewProps> = ({
  vehicles,
  options = [],
  settings = {},
  onRefresh,
  request,
  onOpenCommuteSettings,
  mapsBrowserKey,
}) => {
  // Google Maps references
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const googleMapInstanceRef = useRef<any>(null);
  const trafficLayerRef = useRef<any>(null);
  const googleTrolleyMarkersRef = useRef<any[]>([]);
  const googleStopMarkersRef = useRef<any[]>([]);
  const googleUserMarkerRef = useRef<any>(null);
  const tripPolylineRef = useRef<any>(null);
  const endpointMarkersRef = useRef<{ markerA?: any; markerB?: any }>({});

  // Engine & Loading States
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);

  // Common UI States
  const [currentZoom, setCurrentZoom] = useState<number>(13);
  const activeInfoWindowRef = useRef<any>(null);
  const pickingPointRef = useRef<'A' | 'B' | null>(null);
  const [mapMode, setMapMode] = useState<'street' | 'satellite'>('street');
  const [showStops, setShowStops] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showPlanner, setShowPlanner] = useState(true);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [stopsList, setStopsList] = useState<TransitStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [liveCheckedAt, setLiveCheckedAt] = useState<number | null>(null);
  const [liveClock, setLiveClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setLiveClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Trip Planner States
  const [pickingPoint, setPickingPoint] = useState<'A' | 'B' | null>(null);
  const [pointA, setPointA] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [pointB, setPointB] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [tripPlan, setTripPlan] = useState<TripPlanResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isLoadingPlan, setIsLoadingPlan] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    pickingPointRef.current = pickingPoint;
  }, [pickingPoint]);

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
        setLiveCheckedAt(Date.now());
        setLiveError('');
      } else {
        setLiveError('Не удалось обновить транспорт');
      }
    } catch {
      setLiveError('Нет связи с транспортом');
    }
  }, [request]);

  useEffect(() => {
    let timer: any = null;

    const tick = () => {
      fetchLiveVehicles();
    };

    const start = () => {
      tick();
      if (!timer) timer = setInterval(tick, 60000);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        start();
      }
    };

    if (document.visibilityState !== 'hidden') {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchLiveVehicles]);

  // Load Google Maps SDK if key is provided
  useEffect(() => {
    if (!mapsBrowserKey) return;
    let isMounted = true;

    window.gm_authFailure = () => {
      if (isMounted) {
        setGoogleMapsError('Ошибка авторизации ключа Google Maps');
      }
    };

    loadGoogleMaps(mapsBrowserKey)
      .then(() => {
        if (isMounted) setGoogleMapsLoaded(true);
      })
      .catch((err) => {
        if (isMounted) setGoogleMapsError(err?.message || 'Не удалось загрузить Google Maps SDK');
      });

    return () => {
      isMounted = false;
    };
  }, [mapsBrowserKey]);

  const isGoogleMode = Boolean(mapsBrowserKey && googleMapsLoaded && !googleMapsError);

  // Available unique routes
  const availableRoutes = useMemo(() => {
    const fromVehicles = activeVehicles.map((v) => v.route_short_name);
    return Array.from(new Set(['2', '17', '4', '22', '10', '24', ...fromVehicles])).filter(Boolean);
  }, [activeVehicles]);

  // Key boarding stop from commute options
  const boardingStopName = useMemo(() => {
    const primaryOption = options[0];
    const firstLeg = primaryOption?.legs?.[0];
    return firstLeg?.board_stop_name || (firstLeg as any)?.boardStopName || '';
  }, [options]);

  // Nearest stops for points A and B (snapping within 400m)
  const nearestStopA = useMemo(
    () => (pointA ? findNearestStop(pointA.lat, pointA.lon, stopsList, 400) : null),
    [pointA, stopsList]
  );
  const nearestStopB = useMemo(
    () => (pointB ? findNearestStop(pointB.lat, pointB.lon, stopsList, 400) : null),
    [pointB, stopsList]
  );

  // Handle map click: set A/B point if picking, otherwise close open info windows / cards
  const handleMapClickPoint = useCallback((lat: number, lon: number) => {
    if (pickingPointRef.current === 'A') {
      setPointA({ lat, lon });
      setPickingPoint(null);
    } else if (pickingPointRef.current === 'B') {
      setPointB({ lat, lon });
      setPickingPoint(null);
    } else {
      if (activeInfoWindowRef.current) {
        activeInfoWindowRef.current.close();
        activeInfoWindowRef.current = null;
      }
      setSelectedStop(null);
    }
  }, []);

  // Auto-calculate trip plan when both points are present
  const fetchTripPlan = useCallback(
    async (from: { lat: number; lon: number }, to: { lat: number; lon: number }) => {
      if (!request) return;
      setIsLoadingPlan(true);
      setPlanError(null);
      try {
        const res = await request(
          `/api/trip/plan?fromLat=${from.lat.toFixed(6)}&fromLon=${from.lon.toFixed(
            6
          )}&toLat=${to.lat.toFixed(6)}&toLon=${to.lon.toFixed(6)}`
        );
        if (res && res.routes) {
          setTripPlan(res);
          setSelectedRouteIndex(0);
        } else if (res && res.error) {
          setPlanError(res.error);
        }
      } catch (err: any) {
        setPlanError(err?.message || 'Ошибка планирования поездки');
      } finally {
        setIsLoadingPlan(false);
      }
    },
    [request]
  );

  useEffect(() => {
    if (pointA && pointB) {
      fetchTripPlan(pointA, pointB);
    }
  }, [pointA, pointB, fetchTripPlan]);

  // -------------------------------------------------------------
  // GOOGLE MAPS IMPLEMENTATION
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isGoogleMode || !googleContainerRef.current) return;

    const initLat = userLocation?.lat ?? DEFAULT_CENTER.lat;
    const initLon = userLocation?.lon ?? DEFAULT_CENTER.lon;

    const map = new window.google.maps.Map(googleContainerRef.current, {
      center: { lat: initLat, lng: initLon },
      zoom: 13,
      mapTypeId: mapMode === 'satellite' ? 'hybrid' : 'roadmap',
      gestureHandling: 'greedy',
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      zoomControl: false,
      mapTypeControl: false,
      scaleControl: false,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });
    googleMapInstanceRef.current = map;

    map.addListener('zoom_changed', () => {
      const z = map.getZoom();
      if (typeof z === 'number') {
        setCurrentZoom(z);
      }
    });

    trafficLayerRef.current = new window.google.maps.TrafficLayer();
    if (showTraffic) {
      trafficLayerRef.current.setMap(map);
    }

    map.addListener('click', (e: any) => {
      const lat = e.latLng.lat();
      const lon = e.latLng.lng();
      handleMapClickPoint(lat, lon);
    });

    return () => {
      googleMapInstanceRef.current = null;
    };
  }, [isGoogleMode]);

  // Update Google Maps mode (Street / Satellite)
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current) return;
    googleMapInstanceRef.current.setMapTypeId(mapMode === 'satellite' ? 'hybrid' : 'roadmap');
  }, [isGoogleMode, mapMode]);

  // Update Google Maps Traffic Layer
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current || !trafficLayerRef.current) return;
    trafficLayerRef.current.setMap(showTraffic ? googleMapInstanceRef.current : null);
  }, [isGoogleMode, showTraffic]);

  // Render Trolleybuses on Google Map
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current || !window.google?.maps) return;
    const map = googleMapInstanceRef.current;

    googleTrolleyMarkersRef.current.forEach((m) => m.setMap(null));
    googleTrolleyMarkersRef.current = [];

    const filtered = activeVehicles.filter((v) => {
      if (selectedRouteFilter !== 'all' && v.route_short_name !== selectedRouteFilter) {
        return false;
      }
      return true;
    });

    filtered.forEach((veh) => {
      const color = ROUTE_COLORS[veh.route_short_name] || '#2563eb';
      const speedKmH = Math.round(veh.speed);
      const routeVehiclesCount = activeVehicles.filter(
        (v) => v.route_short_name === veh.route_short_name
      ).length;

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="26" viewBox="0 0 40 26">
          <rect width="40" height="26" rx="13" fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <text x="20" y="17" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">№${escapeMapText(veh.route_short_name)}</text>
        </svg>
      `;

      const marker = new window.google.maps.Marker({
        position: { lat: veh.latitude, lng: veh.longitude },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new window.google.maps.Size(40, 26),
          anchor: new window.google.maps.Point(20, 13),
        },
        title: `Троллейбус №${veh.route_short_name}`,
      });

      const info = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 4px 6px; font-family: sans-serif; color: #111;">
            <strong style="color: ${color}">Троллейбус №${escapeMapText(veh.route_short_name)}</strong> (борт ${escapeMapText(veh.label || '—')})<br/>
            <small>Скорость: ${speedKmH} км/ч · На линии: ${routeVehiclesCount} машин</small>
          </div>
        `,
      });

      marker.addListener('click', () => {
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        info.open(map, marker);
        activeInfoWindowRef.current = info;
        setSelectedRouteFilter(veh.route_short_name);
      });

      googleTrolleyMarkersRef.current.push(marker);
    });
  }, [isGoogleMode, activeVehicles, selectedRouteFilter]);

  // Render Stops on Google Map (visible only at zoom >= 14)
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current || !window.google?.maps) return;
    const map = googleMapInstanceRef.current;

    googleStopMarkersRef.current.forEach((m) => m.setMap(null));
    googleStopMarkersRef.current = [];

    if (!showStops || currentZoom < 14) return;

    stopsList.forEach((stop) => {
      const isSpecial =
        stop.stop_name.toLowerCase().includes('cuza vodă') ||
        stop.stop_name.toLowerCase().includes('usm') ||
        stop.stop_name.toLowerCase().includes('stat');

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${isSpecial ? 22 : 12}" height="${
          isSpecial ? 22 : 12
        }" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="9" fill="${
            isSpecial ? '#7c3aed' : '#64748b'
          }" stroke="#ffffff" stroke-width="2"/>
        </svg>
      `;

      const marker = new window.google.maps.Marker({
        position: { lat: stop.stop_lat, lng: stop.stop_lon },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new window.google.maps.Size(isSpecial ? 22 : 12, isSpecial ? 22 : 12),
          anchor: new window.google.maps.Point(isSpecial ? 11 : 6, isSpecial ? 11 : 6),
        },
        title: stop.stop_name,
      });

      const info = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 4px 6px; font-family: sans-serif; color: #111;">
            <strong>🚏 ${escapeMapText(stop.stop_name)}</strong><br/>
            <small>${escapeMapText(stop.stop_desc || 'Остановка Кишинёва')}</small>
          </div>
        `,
      });

      marker.addListener('click', () => {
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        info.open(map, marker);
        activeInfoWindowRef.current = info;
        setSelectedStop(stop);
      });

      googleStopMarkersRef.current.push(marker);
    });
  }, [isGoogleMode, stopsList, showStops, currentZoom]);

  // Render User Location on Google Map
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current || !window.google?.maps) return;
    const map = googleMapInstanceRef.current;

    if (googleUserMarkerRef.current) {
      googleUserMarkerRef.current.setMap(null);
      googleUserMarkerRef.current = null;
    }

    if (userLocation) {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#2563eb" fill-opacity="0.3" />
          <circle cx="12" cy="12" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="2" />
        </svg>
      `;

      googleUserMarkerRef.current = new window.google.maps.Marker({
        position: { lat: userLocation.lat, lng: userLocation.lon },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new window.google.maps.Size(24, 24),
          anchor: new window.google.maps.Point(12, 12),
        },
        title: 'Ты здесь',
      });
    }
  }, [isGoogleMode, userLocation]);

  // Render Trip Polyline & Endpoints on Google Map
  useEffect(() => {
    if (!isGoogleMode || !googleMapInstanceRef.current || !window.google?.maps) return;
    const map = googleMapInstanceRef.current;

    if (tripPolylineRef.current) {
      tripPolylineRef.current.setMap(null);
      tripPolylineRef.current = null;
    }
    if (endpointMarkersRef.current.markerA) {
      endpointMarkersRef.current.markerA.setMap(null);
      endpointMarkersRef.current.markerA = null;
    }
    if (endpointMarkersRef.current.markerB) {
      endpointMarkersRef.current.markerB.setMap(null);
      endpointMarkersRef.current.markerB = null;
    }

    if (pointA) {
      const svgA = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="12" fill="#16a34a" stroke="#ffffff" stroke-width="2.5" />
          <text x="14" y="18" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">A</text>
        </svg>
      `;
      endpointMarkersRef.current.markerA = new window.google.maps.Marker({
        position: { lat: pointA.lat, lng: pointA.lon },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgA)}`,
          scaledSize: new window.google.maps.Size(28, 28),
          anchor: new window.google.maps.Point(14, 14),
        },
        title: 'Точка А',
      });
    }

    if (pointB) {
      const svgB = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="12" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />
          <text x="14" y="18" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">B</text>
        </svg>
      `;
      endpointMarkersRef.current.markerB = new window.google.maps.Marker({
        position: { lat: pointB.lat, lng: pointB.lon },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgB)}`,
          scaledSize: new window.google.maps.Size(28, 28),
          anchor: new window.google.maps.Point(14, 14),
        },
        title: 'Точка B',
      });
    }

    const activeRoute = tripPlan?.routes?.[selectedRouteIndex];
    if (activeRoute?.encodedPolyline && window.google.maps.geometry?.encoding) {
      try {
        const decodedPath = window.google.maps.geometry.encoding.decodePath(
          activeRoute.encodedPolyline
        );
        const transitStep = activeRoute.steps.find(
          (s): s is TripTransitStep => s.travelMode === 'TRANSIT'
        );
        const strokeColor = transitStep
          ? ROUTE_COLORS[transitStep.lineShortName] || '#7c3aed'
          : '#2563eb';

        const poly = new window.google.maps.Polyline({
          path: decodedPath,
          geodesic: true,
          strokeColor,
          strokeOpacity: 0.9,
          strokeWeight: 6,
          map,
        });
        tripPolylineRef.current = poly;

        const bounds = new window.google.maps.LatLngBounds();
        decodedPath.forEach((pt: any) => bounds.extend(pt));
        map.fitBounds(bounds, { top: 70, bottom: 260, left: 40, right: 40 });
      } catch {
        // Handled silently
      }
    }
  }, [isGoogleMode, pointA, pointB, tripPlan, selectedRouteIndex]);

  // Real OSM Route Polylines for selected trolleybus
  const googleRoutePolylinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!googleMapInstanceRef.current || !window.google?.maps) return;
    const map = googleMapInstanceRef.current;

    // Clear previous polylines
    if (googleRoutePolylinesRef.current.length > 0) {
      googleRoutePolylinesRef.current.forEach((p) => p.setMap(null));
      googleRoutePolylinesRef.current = [];
    }

    if (selectedRouteFilter === 'all') return;

    const routeData = getTrolleyRoute(selectedRouteFilter);
    const bounds = new window.google.maps.LatLngBounds();

    if (routeData && routeData.tracks && routeData.tracks.length > 0) {
      const polylines = routeData.tracks.map((track) => {
        const path = track.map(([lat, lng]) => {
          bounds.extend({ lat, lng });
          return { lat, lng };
        });
        return new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: routeData.color || '#3b82f6',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map,
        });
      });
      googleRoutePolylinesRef.current = polylines;

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 80, bottom: 120, left: 40, right: 40 });
      }
    } else {
      // Fallback: fit bounds to active vehicles on that route
      const routeVehicles = activeVehicles.filter(
        (v) => v.route_short_name === selectedRouteFilter && v.latitude && v.longitude
      );
      if (routeVehicles.length > 0) {
        routeVehicles.forEach((v) => bounds.extend({ lat: v.latitude, lng: v.longitude }));
        map.fitBounds(bounds, { top: 80, bottom: 120, left: 40, right: 40 });
      }
    }

    return () => {
      if (googleRoutePolylinesRef.current.length > 0) {
        googleRoutePolylinesRef.current.forEach((p) => p.setMap(null));
        googleRoutePolylinesRef.current = [];
      }
    };
  }, [selectedRouteFilter]);

  // Center on User GPS
  const handleLocateUser = useCallback(() => {
    const target = userLocation || DEFAULT_CENTER;
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({ lat: target.lat, lng: target.lon });
      googleMapInstanceRef.current.setZoom(15);
    }
  }, [userLocation]);

  // Center on Selected Stop
  const handleSelectSearchedStop = (stop: TransitStop) => {
    setSearchQuery('');
    setSelectedStop(stop);
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({ lat: stop.stop_lat, lng: stop.stop_lon });
      googleMapInstanceRef.current.setZoom(16);
    }
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return stopsList.filter((s) => s.stop_name.toLowerCase().includes(q)).slice(0, 6);
  }, [searchQuery, stopsList]);

  const handleRefreshClick = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  return (
    <div className="transit-view-page">
      {/* Top Toolbar Above Map */}
      <div className="map-toolbar">
        <div className="map-toolbar-primary">
          <div className="map-search-container">
            <Search size={18} className="map-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="map-search-input"
              placeholder="Поиск остановки в Кишинёве…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Поиск остановки"
            />
            {searchQuery && (
              <button
                type="button"
                className="map-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="map-toolbar-actions">
            <button
              type="button"
              className={`map-tb-btn ${mapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setMapMode(mapMode === 'street' ? 'satellite' : 'street')}
              title={mapMode === 'street' ? 'Включить спутник' : 'Включить схему'}
              aria-label="Схема или Спутник"
            >
              {mapMode === 'satellite' ? <Layers size={18} /> : <GlobeIcon />}
              <span className="tb-btn-label">{mapMode === 'satellite' ? 'Спутник' : 'Схема'}</span>
            </button>

            {isGoogleMode && (
              <button
                type="button"
                className={`map-tb-btn ${showTraffic ? 'active-traffic' : ''}`}
                onClick={() => setShowTraffic(!showTraffic)}
                title="Слой пробок"
                aria-label="Пробки"
              >
                <span className="tb-btn-emoji" aria-hidden="true">
                  🚦
                </span>
                <span className="tb-btn-label">Пробки</span>
              </button>
            )}

            <button
              type="button"
              className="map-tb-btn"
              onClick={handleLocateUser}
              title="Найти меня на карте"
              aria-label="Где я"
            >
              <Crosshair size={18} />
              <span className="tb-btn-label">Где я</span>
            </button>

            <button
              type="button"
              className={`map-tb-btn icon-only ${isRefreshing ? 'spin' : ''}`}
              onClick={handleRefreshClick}
              title="Обновить троллейбусы"
              aria-label="Обновить"
            >
              <RefreshCw size={18} />
            </button>

            {onOpenCommuteSettings && (
              <button
                type="button"
                className="map-tb-btn icon-only"
                onClick={onOpenCommuteSettings}
                title="Настройка дороги"
                aria-label="Настройка дороги"
              >
                <Settings2 size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="map-search-dropdown">
            {searchResults.map((stop) => (
              <button
                key={stop.stop_id}
                type="button"
                className="map-search-dropdown-item"
                onClick={() => handleSelectSearchedStop(stop)}
              >
                <MapPin size={18} className="map-drop-pin" />
                <div className="map-stop-text">
                  <strong>{stop.stop_name}</strong>
                  {stop.stop_desc && <small>{stop.stop_desc}</small>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Fast Route Filter Chips Ribbon */}
        <div className="map-quick-filters" role="tablist" aria-label="Фильтры маршрутов">
          <button
            type="button"
            className={`map-chip ${selectedRouteFilter === 'all' ? 'active' : ''}`}
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
                className={`map-chip ${selectedRouteFilter === rt ? 'active' : ''}`}
                style={{
                  borderLeftColor: color,
                  borderLeftWidth: '3.5px',
                }}
                onClick={() => setSelectedRouteFilter(selectedRouteFilter === rt ? 'all' : rt)}
              >
                №{rt} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}

          <button
            type="button"
            className={`map-chip toggle-chip ${showStops ? 'active' : ''}`}
            onClick={() => setShowStops(!showStops)}
            title="Показать/скрыть остановки"
          >
            🚏 Остановки {stopsList.length > 0 ? `(${stopsList.length})` : ''}
          </button>

          {isGoogleMode && (
            <button
              type="button"
              className={`map-chip toggle-chip ${showPlanner ? 'active' : ''}`}
              onClick={() => setShowPlanner(!showPlanner)}
              title="Планировщик маршрута"
            >
              🧭 Маршрут
            </button>
          )}
        </div>
      </div>

      {/* Map Main Canvas */}
      <div className="transit-map-fullscreen-container">
        <div ref={googleContainerRef} className="google-map-fullcanvas" />
        {!isGoogleMode && (
          <div className="map-fallback-overlay">
            <div className="map-fallback-card">
              {googleMapsError ? (
                <>
                  <CircleAlert size={28} color="#ef4444" />
                  <strong>Ошибка загрузки карты</strong>
                  <p>Не удалось загрузить карту. Попробуй открыть её позже.</p>
                </>
              ) : !mapsBrowserKey ? (
                <>
                  <CircleAlert size={28} color="#f59e0b" />
                  <strong>Карта временно недоступна</strong>
                  <p>Можно открыть маршрут в приложении карт.</p>
                  <a
                    href="https://www.google.com/maps/dir/?api=1&amp;destination=Universitatea+de+Stat+din+Moldova+Chisinau"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть карты
                  </a>
                </>
              ) : (
                <>
                  <div className="map-loading-spinner" />
                  <p>Загрузка Google Maps…</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Floating Bottom Status Pill */}
        <div className="transit-view-bottom-pill">
          <div className="pill-live-status">
            <span className="live-radar-dot" />
            <span className="live-stat-text">
              {liveError ||
                (liveCheckedAt && liveClock - liveCheckedAt > 90000
                  ? 'Данные транспорта устарели'
                  : liveCheckedAt
                    ? activeVehicles.length > 0
                      ? `${activeVehicles.length} машин · обновлено ${new Date(liveCheckedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                      : 'На выбранных маршрутах машин нет'
                    : 'Загружаем транспорт…')}
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

        {/* Interactive Trip Planner Drawer (Google Maps Mode) */}
        {isGoogleMode && showPlanner && (
          <div className="trip-planner-panel">
            <div className="trip-planner-header">
              <div className="trip-planner-title">
                <Compass size={15} color="#7c3aed" />
                <span>Планировщик поездки A → B</span>
              </div>
              <button
                type="button"
                className="active-route-close-btn"
                onClick={() => setShowPlanner(false)}
                title="Свернуть"
              >
                <X size={14} />
              </button>
            </div>

            <div className="trip-planner-content">
              {/* Point Selection Box */}
              <div className="trip-points-box">
                {/* Quick Presets */}
                <div className="trip-quick-presets">
                  <button
                    type="button"
                    className="trip-preset-chip"
                    onClick={() => {
                      if (userLocation) {
                        setPointA({
                          lat: userLocation.lat,
                          lon: userLocation.lon,
                          name: 'Моё местоположение',
                        });
                      }
                      setPointB({
                        lat: 47.0186,
                        lon: 28.8242,
                        name: 'USM (Центральный корпус)',
                      });
                      setPickingPoint(null);
                    }}
                  >
                    🏛️ На пары в USM
                  </button>
                  <button
                    type="button"
                    className="trip-preset-chip"
                    onClick={() => {
                      setPointA({
                        lat: 47.0186,
                        lon: 28.8242,
                        name: 'USM (Центральный корпус)',
                      });
                      if (userLocation) {
                        setPointB({
                          lat: userLocation.lat,
                          lon: userLocation.lon,
                          name: 'Моё местоположение',
                        });
                      }
                      setPickingPoint(null);
                    }}
                  >
                    🏠 С пар домой
                  </button>
                </div>

                {/* Point A */}
                <div
                  className={`trip-point-row ${pickingPoint === 'A' ? 'active' : ''}`}
                  onClick={() => setPickingPoint(pickingPoint === 'A' ? null : 'A')}
                >
                  <div className="trip-point-info">
                    <div className="trip-point-label a">
                      <MapPin size={12} />
                      <span>Точка А (Откуда)</span>
                    </div>
                    <div
                      className={`trip-point-stop ${
                        nearestStopA ? 'has-stop' : pointA ? 'no-stop' : ''
                      }`}
                    >
                      {pointA
                        ? nearestStopA
                          ? `🚏 ${nearestStopA.stop.stop_name} (${Math.round(
                              nearestStopA.distanceMeters
                            )} м)`
                          : pointA.name || 'Точка на карте'
                        : 'Выбери откуда ехать'}
                    </div>
                  </div>
                  <div className="trip-point-actions" onClick={(e) => e.stopPropagation()}>
                    {userLocation && (
                      <button
                        type="button"
                        className="trip-point-action-btn"
                        onClick={() =>
                          setPointA({
                            lat: userLocation.lat,
                            lon: userLocation.lon,
                            name: 'Моё местоположение',
                          })
                        }
                      >
                        📍 Где я
                      </button>
                    )}
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() =>
                        setPointA({
                          lat: 47.0186,
                          lon: 28.8242,
                          name: 'USM (Центральный корпус)',
                        })
                      }
                    >
                      🎓 USM
                    </button>
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() =>
                        setPointA({
                          lat: 47.0125,
                          lon: 28.8471,
                          name: 'Спорткомплекс USM',
                        })
                      }
                    >
                      🏅 Спорт
                    </button>
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() => setPickingPoint(pickingPoint === 'A' ? null : 'A')}
                    >
                      {pickingPoint === 'A' ? 'Клик…' : 'Карта'}
                    </button>
                  </div>
                </div>

                {/* Swap A ⇄ B Button */}
                <div className="trip-swap-row">
                  <button
                    type="button"
                    className="trip-swap-btn"
                    title="Поменять точки местами (Реверс)"
                    aria-label="Поменять местами точки маршрута"
                    onClick={() => {
                      setPointA(pointB);
                      setPointB(pointA);
                      setPickingPoint(null);
                    }}
                  >
                    <ArrowDownUp size={13} />
                  </button>
                </div>

                {/* Point B */}
                <div
                  className={`trip-point-row ${pickingPoint === 'B' ? 'active' : ''}`}
                  onClick={() => setPickingPoint(pickingPoint === 'B' ? null : 'B')}
                >
                  <div className="trip-point-info">
                    <div className="trip-point-label b">
                      <Navigation size={12} />
                      <span>Точка B (Куда)</span>
                    </div>
                    <div
                      className={`trip-point-stop ${
                        nearestStopB ? 'has-stop' : pointB ? 'no-stop' : ''
                      }`}
                    >
                      {pointB
                        ? nearestStopB
                          ? `🚏 ${nearestStopB.stop.stop_name} (${Math.round(
                              nearestStopB.distanceMeters
                            )} м)`
                          : pointB.name || 'Точка на карте'
                        : 'Выбери куда ехать'}
                    </div>
                  </div>
                  <div className="trip-point-actions" onClick={(e) => e.stopPropagation()}>
                    {userLocation && (
                      <button
                        type="button"
                        className="trip-point-action-btn"
                        onClick={() =>
                          setPointB({
                            lat: userLocation.lat,
                            lon: userLocation.lon,
                            name: 'Моё местоположение',
                          })
                        }
                      >
                        📍 Где я
                      </button>
                    )}
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() =>
                        setPointB({
                          lat: 47.0186,
                          lon: 28.8242,
                          name: 'USM (Центральный корпус)',
                        })
                      }
                    >
                      🎓 USM
                    </button>
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() =>
                        setPointB({
                          lat: 47.0125,
                          lon: 28.8471,
                          name: 'Спорткомплекс USM',
                        })
                      }
                    >
                      🏅 Спорт
                    </button>
                    <button
                      type="button"
                      className="trip-point-action-btn"
                      onClick={() => setPickingPoint(pickingPoint === 'B' ? null : 'B')}
                    >
                      {pickingPoint === 'B' ? 'Клик…' : 'Карта'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status / Hint / Error Banners */}
              {pickingPoint && (
                <div className="trip-notice-banner">
                  <Compass size={13} />
                  <span>
                    Нажмите на любое место на карте, чтобы установить точку {pickingPoint}
                  </span>
                </div>
              )}

              {planError && (
                <div
                  className="trip-notice-banner"
                  style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }}
                >
                  <CircleAlert size={13} />
                  <span>{planError}</span>
                </div>
              )}

              {isLoadingPlan && (
                <div className="trip-loading-indicator">
                  <RefreshCw size={15} className="spin" />
                  <span>Расчёт маршрута с учётом пробок и троллейбусов…</span>
                </div>
              )}

              {/* Calculated Routes List */}
              {tripPlan && tripPlan.routes && tripPlan.routes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tripPlan.notice && (
                    <div className="trip-notice-banner">
                      <CircleAlert size={13} />
                      <span>{tripPlan.notice}</span>
                    </div>
                  )}

                  {tripPlan.routes.map((opt: TripRouteOption, idx: number) => {
                    const isSelected = selectedRouteIndex === idx;
                    const trafficBadge = getTrafficBadge(opt.traffic.level, opt.traffic.label);
                    const transitStep = opt.steps.find(
                      (s): s is TripTransitStep => s.travelMode === 'TRANSIT'
                    );

                    return (
                      <div
                        key={opt.id || idx}
                        className={`trip-route-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedRouteIndex(idx)}
                      >
                        <div className="trip-route-card-head">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            {transitStep ? (
                              <Bus size={16} color="#7c3aed" />
                            ) : (
                              <Car size={16} color="#2563eb" />
                            )}
                            <span className="trip-route-duration">
                              {opt.totalDurationFormatted ||
                                `${Math.round(opt.totalDurationSeconds / 60)} мин`}
                            </span>
                            {transitStep?.nextVehicleEtaMinutes != null && (
                              <span className="trip-next-vehicle-pill">
                                🚎 №{transitStep.lineShortName} через{' '}
                                {transitStep.nextVehicleEtaMinutes} мин
                              </span>
                            )}
                          </div>
                          <span className={trafficBadge.className}>{trafficBadge.text}</span>
                        </div>

                        {/* Steps summary row */}
                        <div className="trip-steps-summary">
                          {opt.steps.map((st: TripStep, sIdx: number) => {
                            if (st.travelMode === 'WALK') {
                              const walkMin = Math.max(1, Math.round(st.durationSeconds / 60));
                              return (
                                <span
                                  key={sIdx}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    color: '#6b7280',
                                  }}
                                >
                                  <Footprints size={12} />
                                  <span>{walkMin}м</span>
                                  {sIdx < opt.steps.length - 1 && (
                                    <ArrowRight size={10} style={{ opacity: 0.5 }} />
                                  )}
                                </span>
                              );
                            }
                            if (st.travelMode === 'TRANSIT') {
                              return (
                                <span
                                  key={sIdx}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <span className="trip-step-line-chip">
                                    🚎 №{st.lineShortName}
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#6b7280' }}>
                                    ({st.departureStopName} → {st.arrivalStopName})
                                  </span>
                                  {sIdx < opt.steps.length - 1 && (
                                    <ArrowRight size={10} style={{ opacity: 0.5 }} />
                                  )}
                                </span>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function GlobeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default TransitView;
