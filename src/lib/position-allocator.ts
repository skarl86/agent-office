// 에이전트 위치 할당

import {
  ZONES,
  DESK_GRID_COLS,
  DESK_GRID_ROWS,
  DESK_MAX_AGENTS,
  HOT_DESK_GRID_COLS,
  HOT_DESK_GRID_ROWS,
  CORRIDOR_ENTRANCE,
  DESK_UNIT,
  MIN_DESK_WIDTH,
} from "./constants";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

function gridPositions(
  zone: { x: number; y: number; width: number; height: number },
  cols: number,
  rows: number,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const cellW = zone.width / (cols + 1);
  const cellH = zone.height / (rows + 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        x: Math.round(zone.x + cellW * (col + 1)),
        y: Math.round(zone.y + cellH * (row + 1)),
      });
    }
  }
  return positions;
}

const deskPositions = gridPositions(ZONES.desk, DESK_GRID_COLS, DESK_GRID_ROWS);
const hotDeskPositions = gridPositions(ZONES.hotDesk, HOT_DESK_GRID_COLS, HOT_DESK_GRID_ROWS);
const HOT_DESK_MAX_AGENTS = HOT_DESK_GRID_COLS * HOT_DESK_GRID_ROWS;

function posKey(pos: { x: number; y: number }): string {
  return `${pos.x},${pos.y}`;
}

export function allocatePosition(
  agentId: string,
  isSubAgent: boolean,
  occupied: Set<string>,
): { x: number; y: number } {
  if (!isSubAgent) {
    const hash = hashString(agentId);
    const startIdx = hash % DESK_MAX_AGENTS;

    for (let i = 0; i < DESK_MAX_AGENTS; i++) {
      const idx = (startIdx + i) % DESK_MAX_AGENTS;
      const pos = deskPositions[idx];
      if (!pos) continue;
      const key = posKey(pos);
      if (!occupied.has(key)) {
        occupied.add(key);
        return pos;
      }
    }
    // 자리가 없으면 복도 입구
    return { ...CORRIDOR_ENTRANCE };
  } else {
    const hash = hashString(agentId);
    const startIdx = hash % HOT_DESK_MAX_AGENTS;

    for (let i = 0; i < HOT_DESK_MAX_AGENTS; i++) {
      const idx = (startIdx + i) % HOT_DESK_MAX_AGENTS;
      const pos = hotDeskPositions[idx];
      if (!pos) continue;
      const key = posKey(pos);
      if (!occupied.has(key)) {
        occupied.add(key);
        return pos;
      }
    }
    return { ...CORRIDOR_ENTRANCE };
  }
}

export function calculateLoungePositions(count: number): Array<{ x: number; y: number }> {
  const { x, y, width, height } = ZONES.lounge;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const positions: Array<{ x: number; y: number }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= count) break;
      positions.push({
        x: Math.round(x + (width / (cols + 1)) * (c + 1)),
        y: Math.round(y + (height / (rows + 1)) * (r + 1)),
      });
    }
  }
  return positions;
}

/** Allocate equi-angular positions around a meeting table center */
export function allocateMeetingPositions(
  agentIds: string[],
  tableCenter: { x: number; y: number },
  seatRadius = 80,
): Array<{ x: number; y: number }> {
  const count = agentIds.length;
  if (count === 0) return [];

  return agentIds.map((_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: Math.round(tableCenter.x + Math.cos(angle) * seatRadius),
      y: Math.round(tableCenter.y + Math.sin(angle) * seatRadius),
    };
  });
}

export interface DeskSlot {
  unitX: number;
  unitY: number;
}

function adaptiveCols(zoneWidth: number, slotCount: number, padX = 40): number {
  const availW = zoneWidth - padX * 2;
  const maxCols = Math.max(1, Math.floor(availW / MIN_DESK_WIDTH));
  return Math.min(maxCols, Math.max(slotCount, 4));
}

/**
 * Calculate desk-unit positions inside a zone.
 */
export function calculateDeskSlots(
  zone: { x: number; y: number; width: number; height: number },
  agentCount: number,
  slotCount?: number,
): DeskSlot[] {
  const total = slotCount ?? agentCount;
  if (total === 0) return [];

  const padX = 40;
  const padY = 50;
  const cols = adaptiveCols(zone.width, total, padX);
  const rows = Math.ceil(total / cols);
  const availW = zone.width - padX * 2;
  const availH = zone.height - padY * 2;
  const cellW = Math.min(DESK_UNIT.width, availW / cols);
  const cellH = Math.min(DESK_UNIT.height, availH / Math.max(rows, 1));

  const slots: DeskSlot[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      unitX: Math.round(zone.x + padX + cellW * (col + 0.5)),
      unitY: Math.round(zone.y + padY + cellH * (row + 0.5)),
    });
  }
  return slots;
}
