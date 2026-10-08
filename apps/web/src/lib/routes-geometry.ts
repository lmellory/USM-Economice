import trolleyRoutesRaw from '../data/trolleybus-routes.json';

export interface TrolleyRouteData {
  routeNumber: string;
  name: string;
  color: string;
  tracks: [number, number][][] | number[][][];
}

export const CHISINAU_TROLLEYBUS_ROUTES: Record<string, TrolleyRouteData> =
  trolleyRoutesRaw as unknown as Record<string, TrolleyRouteData>;

export function getTrolleyRoute(routeNumber: string): TrolleyRouteData | undefined {
  return CHISINAU_TROLLEYBUS_ROUTES[routeNumber];
}
