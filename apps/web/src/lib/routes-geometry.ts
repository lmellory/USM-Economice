/**
 * Precise route polylines and metadata for Chișinău RTEC trolleybus routes.
 */

export interface TrolleyRouteTrack {
  routeNumber: string;
  routeName: string;
  description: string;
  color: string;
  waypoints: [number, number][]; // [lat, lon] coordinates along Chișinău streets
  keyStopIds?: number[];
}

export const CHISINAU_ROUTES_TRACKS: Record<string, TrolleyRouteTrack> = {
  '2': {
    routeNumber: '2',
    routeName: 'Троллейбус №2',
    description: 'bd. Traian ⇄ USM (Universitatea de Stat) ⇄ Centru',
    color: '#d946ef', // Vibrant Magenta like in screenshot
    waypoints: [
      // Botanica (bd. Traian -> Cuza Voda -> Dacia -> Decebal)
      [46.987, 28.857],
      [46.9845, 28.8585],
      [46.983, 28.864],
      [46.9825, 28.865],
      [46.985, 28.861],
      [46.989, 28.855],
      [46.992, 28.853],
      [46.995, 28.851],
      [46.9985, 28.847],
      [47.001, 28.849],
      [47.005, 28.853],
      // Gara Feroviara -> Negruzzi -> Stefan cel Mare
      [47.0125, 28.859],
      [47.015, 28.852],
      [47.0165, 28.85],
      [47.018, 28.846],
      [47.0195, 28.842],
      [47.021, 28.837],
      [47.023, 28.834],
      // To USM (Banulescu-Bodoni -> 31 August -> Mateevici)
      [47.0225, 28.831],
      [47.0215, 28.8275],
      [47.019, 28.827],
      [47.0185, 28.824], // USM Bloc Central
      [47.018, 28.823],
      // Return loop (Pan Halippa -> Alecsandri -> Grenoble -> Traian)
      [47.015, 28.835],
      [47.01, 28.831],
      [47.004, 28.828],
      [46.992, 28.825],
      [46.9805, 28.845],
      [46.987, 28.857],
    ],
  },

  '17': {
    routeNumber: '17',
    routeName: 'Троллейбус №17',
    description: 'bd. Dacia (Cuza Vodă) ⇄ Telecentru ⇄ Complexul Sportiv USM ⇄ Gara',
    color: '#059669', // Emerald
    waypoints: [
      // Botanica (Dacia / Cuza Voda -> Traian -> Grenoble)
      [46.9825, 28.865],
      [46.983, 28.864],
      [46.987, 28.857],
      [46.9845, 28.8585],
      [46.9805, 28.845],
      [46.9818, 28.8385],
      // Telecentru (Asachi -> Pan Halippa)
      [46.992, 28.825],
      [47.004, 28.828],
      [47.01, 28.831],
      // Ismail -> Complex Sportiv USM
      [47.0115, 28.84],
      [47.012, 28.847], // Complexul Sportiv USM
      [47.011, 28.852],
      // Gara Feroviara -> Decebal -> Dacia
      [47.0125, 28.859],
      [47.005, 28.853],
      [46.995, 28.851],
      [46.989, 28.855],
      [46.9825, 28.865],
    ],
  },

  '22': {
    routeNumber: '22',
    routeName: 'Троллейбус №22',
    description: 'Botanica (Porțile Orașului) ⇄ Centru (PMAN) ⇄ Buiucani (Alba Iulia)',
    color: '#d97706', // Amber
    waypoints: [
      // Botanica (Aeroport corridor -> Dacia)
      [46.971, 28.887],
      [46.974, 28.878],
      [46.9825, 28.865],
      [46.989, 28.856],
      // Viaduct
      [46.998, 28.85],
      [47.004, 28.848],
      [47.013, 28.847],
      // Stefan cel Mare (PMAN, Opera, Universitatea de Medicina)
      [47.018, 28.846],
      [47.021, 28.837],
      [47.023, 28.834],
      [47.027, 28.828],
      [47.032, 28.822],
      // Buiucani (Ion Creanga -> Alba Iulia)
      [47.035, 28.815],
      [47.033, 28.812],
      [47.031, 28.813],
      [47.039, 28.805],
      [47.042, 28.79],
    ],
  },

  '4': {
    routeNumber: '4',
    routeName: 'Троллейбус №4',
    description: 'bd. Dacia (Botanica) ⇄ Gara Feroviară ⇄ Centru ⇄ Buiucani (str. Lupu)',
    color: '#7c3aed', // Violet
    waypoints: [
      // Botanica -> Decebal
      [46.9825, 28.865],
      [46.987, 28.857],
      [46.995, 28.851],
      [47.005, 28.853],
      // Gara -> Negruzzi -> Stefan cel Mare
      [47.0125, 28.859],
      [47.015, 28.852],
      [47.0195, 28.842],
      [47.023, 28.834],
      // Bodoni -> 31 August -> Vasile Lupu
      [47.0255, 28.83],
      [47.022, 28.828],
      [47.026, 28.819],
      [47.03, 28.81],
    ],
  },

  '10': {
    routeNumber: '10',
    routeName: 'Троллейбус №10',
    description: 'bd. Moscova (Râșcani) ⇄ Centru ⇄ USM ⇄ Telecentru (str. Miorița)',
    color: '#0284c7', // Sky Blue
    waypoints: [
      // Rascani
      [47.048, 28.863],
      [47.046, 28.861],
      [47.042, 28.858],
      [47.037, 28.848],
      // Renasterii -> Grigore Vieru
      [47.034, 28.845],
      [47.028, 28.838],
      // Banulescu-Bodoni -> Mateevici (USM)
      [47.0245, 28.8322],
      [47.0225, 28.831],
      [47.0185, 28.824], // USM
      // Telecentru
      [47.01, 28.831],
      [47.004, 28.828],
      [47.0, 28.823],
    ],
  },

  '24': {
    routeNumber: '24',
    routeName: 'Троллейбус №24',
    description: 'bd. Mircea cel Bătrân (Ciocana) ⇄ Râșcani ⇄ Centru ⇄ USM',
    color: '#ea580c', // Orange
    waypoints: [
      // Ciocana
      [47.04, 28.885],
      [47.045, 28.868],
      [47.042, 28.858],
      // Circul -> Grigore Vieru
      [47.037, 28.848],
      [47.028, 28.838],
      // Banulescu-Bodoni -> USM
      [47.0245, 28.8322],
      [47.0225, 28.831],
      [47.019, 28.827],
      [47.0185, 28.824], // USM
    ],
  },

  '1': {
    routeNumber: '1',
    routeName: 'Троллейбус №1',
    description: 'bd. Sarmizegetusa (Botanica) ⇄ bd. Dacia ⇄ bd. Ștefan cel Mare ⇄ Bariera Sculeni',
    color: '#0284c7', // Sky Blue
    waypoints: [
      [46.991, 28.868],
      [46.985, 28.861],
      [46.989, 28.855],
      [46.9985, 28.847],
      [47.005, 28.853],
      [47.0125, 28.859],
      [47.018, 28.846],
      [47.021, 28.837],
      [47.027, 28.828],
      [47.032, 28.822],
      [47.038, 28.808],
      [47.043, 28.795],
    ],
  },

  '3': {
    routeNumber: '3',
    routeName: 'Троллейбус №3',
    description: 'str. Alba Iulia (Buiucani) ⇄ str. Vasile Lupu ⇄ USM ⇄ Pan Halippa ⇄ str. Miorița',
    color: '#10b981', // Emerald Green
    waypoints: [
      [47.042, 28.79],
      [47.039, 28.805],
      [47.035, 28.815],
      [47.03, 28.81],
      [47.026, 28.819],
      [47.022, 28.828],
      [47.0185, 28.824], // USM
      [47.015, 28.835],
      [47.01, 28.831],
      [47.004, 28.828],
      [47.0, 28.823],
    ],
  },

  '8': {
    routeNumber: '8',
    routeName: 'Троллейбус №8',
    description: 'bd. Traian (Botanica) ⇄ bd. Dacia ⇄ Viaduct ⇄ bd. Ștefan cel Mare ⇄ Calea Ieșilor',
    color: '#f59e0b', // Amber
    waypoints: [
      [46.987, 28.857],
      [46.9845, 28.8585],
      [46.9825, 28.865],
      [46.989, 28.856],
      [46.998, 28.85],
      [47.004, 28.848],
      [47.013, 28.847],
      [47.018, 28.846],
      [47.021, 28.837],
      [47.027, 28.828],
      [47.032, 28.822],
      [47.038, 28.808],
    ],
  },

  '12': {
    routeNumber: '12',
    routeName: 'Троллейбус №12',
    description: 'bd. Mircea cel Bătrân (Ciocana) ⇄ bd. Grigore Vieru ⇄ Centru (USM)',
    color: '#8b5cf6', // Purple
    waypoints: [
      [47.04, 28.885],
      [47.045, 28.868],
      [47.042, 28.858],
      [47.037, 28.848],
      [47.028, 28.838],
      [47.0245, 28.8322],
      [47.0215, 28.8275],
      [47.0185, 28.824],
    ],
  },

  '13': {
    routeNumber: '13',
    routeName: 'Троллейбус №13',
    description: 'bd. Mircea cel Bătrân (Ciocana) ⇄ str. Vadul lui Vodă ⇄ str. Ismail ⇄ str. Dokuceaev',
    color: '#06b6d4', // Cyan
    waypoints: [
      [47.04, 28.885],
      [47.038, 28.878],
      [47.031, 28.869],
      [47.025, 28.86],
      [47.017, 28.849],
      [47.0115, 28.84],
      [47.004, 28.828],
    ],
  },

  '20': {
    routeNumber: '20',
    routeName: 'Троллейбус №20',
    description: 'Aeroportul Chișinău ⇄ bd. Dacia ⇄ str. Ismail ⇄ Autogara Nord',
    color: '#ec4899', // Pink
    waypoints: [
      [46.935, 28.932],
      [46.955, 28.91],
      [46.971, 28.887],
      [46.9825, 28.865],
      [47.004, 28.848],
      [47.0115, 28.84],
      [47.018, 28.851],
      [47.024, 28.858],
    ],
  },

  '21': {
    routeNumber: '21',
    routeName: 'Троллейбус №21',
    description: 'str. Meșterul Manole (Ciocana) ⇄ bd. Renașterii ⇄ str. Alba Iulia (Buiucani)',
    color: '#14b8a6', // Teal
    waypoints: [
      [47.03, 28.885],
      [47.034, 28.865],
      [47.037, 28.848],
      [47.034, 28.845],
      [47.032, 28.822],
      [47.035, 28.815],
      [47.039, 28.805],
      [47.042, 28.79],
    ],
  },

  '23': {
    routeNumber: '23',
    routeName: 'Троллейбус №23',
    description: 'bd. Mircea cel Bătrân (Ciocana) ⇄ Viaduct ⇄ bd. Dacia (Botanica)',
    color: '#f43f5e', // Rose
    waypoints: [
      [47.04, 28.885],
      [47.045, 28.868],
      [47.042, 28.858],
      [47.037, 28.848],
      [47.025, 28.86],
      [47.013, 28.847],
      [47.004, 28.848],
      [46.998, 28.85],
      [46.989, 28.856],
      [46.9825, 28.865],
      [46.974, 28.878],
    ],
  },

  '25': {
    routeNumber: '25',
    routeName: 'Троллейбус №25',
    description: 'str. Ceucari (Poșta Veche) ⇄ bd. Renașterii ⇄ Centru (str. 31 August)',
    color: '#6366f1', // Indigo
    waypoints: [
      [47.058, 28.845],
      [47.048, 28.849],
      [47.037, 28.848],
      [47.028, 28.838],
      [47.0245, 28.8322],
      [47.021, 28.837],
    ],
  },

  '28': {
    routeNumber: '28',
    routeName: 'Троллейбус №28',
    description: 'str. Ceucari (Poșta Veche) ⇄ Circul ⇄ str. Ismail ⇄ Gara Feroviară',
    color: '#84cc16', // Lime
    waypoints: [
      [47.058, 28.845],
      [47.048, 28.849],
      [47.037, 28.848],
      [47.025, 28.86],
      [47.017, 28.849],
      [47.0125, 28.859],
    ],
  },

  '30': {
    routeNumber: '30',
    routeName: 'Троллейбус №30',
    description: 'Aeroportul Internațional Chișinău ⇄ Viaduct ⇄ Centru (str. 31 August)',
    color: '#d946ef', // Vivid Magenta (matching user screenshot)
    waypoints: [
      [46.935, 28.932],
      [46.955, 28.91],
      [46.971, 28.887],
      [46.974, 28.878],
      [46.9825, 28.865],
      [46.989, 28.856],
      [47.004, 28.848],
      [47.013, 28.847],
      [47.015, 28.852],
      [47.0195, 28.842],
      [47.021, 28.837],
      [47.022, 28.828],
    ],
  },

  '32': {
    routeNumber: '32',
    routeName: 'Троллейбус №32',
    description: 'str. Vasile Alecsandri (Centru) ⇄ Calea Moșilor ⇄ Stăuceni',
    color: '#0ea5e9', // Sky
    waypoints: [
      [47.019, 28.839],
      [47.025, 28.845],
      [47.037, 28.848],
      [47.055, 28.865],
      [47.075, 28.875],
      [47.085, 28.87],
    ],
  },
};

/**
 * Returns either predefined track or generates dynamic route coordinates from live vehicles.
 */
export function getRouteTrack(
  routeNumber: string,
  vehicles?: { latitude: number; longitude: number; route_short_name: string }[]
): TrolleyRouteTrack {
  if (CHISINAU_ROUTES_TRACKS[routeNumber]) {
    return CHISINAU_ROUTES_TRACKS[routeNumber];
  }

  // Fallback: connect active vehicles on this route if available
  const routeVehicles = vehicles?.filter((v) => v.route_short_name === routeNumber) || [];
  const waypoints: [number, number][] = routeVehicles
    .sort((a, b) => a.latitude - b.latitude)
    .map((v) => [v.latitude, v.longitude]);

  return {
    routeNumber,
    routeName: `Троллейбус №${routeNumber}`,
    description: `Маршрут №${routeNumber} по Кишинёву`,
    color: '#d946ef', // Default vivid magenta
    waypoints,
  };
}
