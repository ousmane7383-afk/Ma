
export enum ObstacleType {
  HAZARD = 'HAZARD',
  HOLE = 'HOLE',
  VEHICLE = 'VEHICLE',
  CAR = 'CAR',
  STAIRS = 'STAIRS',
  FURNITURE = 'FURNITURE',
  DOOR = 'DOOR',
  WALL = 'WALL',
  HUMAN = 'HUMAN',
  UNKNOWN = 'UNKNOWN'
}

export interface ObstacleInfo {
  type: ObstacleType;
  label: string;
  icon: string;
  color: string;
  severity: 'low' | 'medium' | 'high';
}

export interface VoiceSettings {
  voiceName: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
  rate: number;
  pitch: number;
}

export const OBSTACLE_METADATA: Record<ObstacleType, ObstacleInfo> = {
  [ObstacleType.HAZARD]: { type: ObstacleType.HAZARD, label: 'خطر', icon: 'fa-triangle-exclamation', color: 'bg-red-600', severity: 'high' },
  [ObstacleType.HOLE]: { type: ObstacleType.HOLE, label: 'حفرة', icon: 'fa-circle-dot', color: 'bg-orange-700', severity: 'high' },
  [ObstacleType.VEHICLE]: { type: ObstacleType.VEHICLE, label: 'مركبة', icon: 'fa-car', color: 'bg-blue-600', severity: 'high' },
  [ObstacleType.CAR]: { type: ObstacleType.CAR, label: 'سيارة', icon: 'fa-car-side', color: 'bg-blue-700', severity: 'high' },
  [ObstacleType.STAIRS]: { type: ObstacleType.STAIRS, label: 'سلالم', icon: 'fa-stairs', color: 'bg-yellow-500', severity: 'medium' },
  [ObstacleType.FURNITURE]: { type: ObstacleType.FURNITURE, label: 'أثاث', icon: 'fa-couch', color: 'bg-amber-600', severity: 'low' },
  [ObstacleType.DOOR]: { type: ObstacleType.DOOR, label: 'باب', icon: 'fa-door-open', color: 'bg-emerald-600', severity: 'low' },
  [ObstacleType.WALL]: { type: ObstacleType.WALL, label: 'جدار', icon: 'fa-border-all', color: 'bg-slate-600', severity: 'low' },
  [ObstacleType.HUMAN]: { type: ObstacleType.HUMAN, label: 'شخص', icon: 'fa-person', color: 'bg-purple-600', severity: 'medium' },
  [ObstacleType.UNKNOWN]: { type: ObstacleType.UNKNOWN, label: 'غير معروف', icon: 'fa-question', color: 'bg-indigo-600', severity: 'low' },
};
