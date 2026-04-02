// 이동 애니메이션 경로 계산

import { ZONES, CORRIDOR_CENTER, CORRIDOR_ENTRANCE } from "./constants";
import type { AgentZone } from "@/gateway/types";

const WALK_SPEED_PX_PER_MS = 0.15;
const MIN_DURATION_MS = 500;

function zoneCenter(zone: AgentZone): { x: number; y: number } {
  if (zone === "corridor") return { ...CORRIDOR_ENTRANCE };
  const z = ZONES[zone as keyof typeof ZONES];
  return {
    x: Math.round(z.x + z.width / 2),
    y: Math.round(z.y + z.height / 2),
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function planWalkPath(
  from: { x: number; y: number },
  toZone: AgentZone,
  targetPos?: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const dest = targetPos ?? zoneCenter(toZone);

  // 복도 중심을 경유하는 단순 경로
  const viaCenter = CORRIDOR_CENTER;
  const dDirect = distance(from, dest);
  const dVia = distance(from, viaCenter) + distance(viaCenter, dest);

  // 직접 경로가 경유보다 짧으면 직선
  if (dDirect <= dVia * 0.8) {
    return [from, dest];
  }
  return [from, viaCenter, dest];
}

export function calculateWalkDuration(path: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distance(path[i - 1]!, path[i]!);
  }
  return Math.max(MIN_DURATION_MS, total / WALK_SPEED_PX_PER_MS);
}

export function interpolatePathPosition(
  path: Array<{ x: number; y: number }>,
  progress: number,
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0]!;
  if (progress <= 0) return path[0]!;
  if (progress >= 1) return path[path.length - 1]!;

  // 전체 경로 길이 계산
  const segments: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distance(path[i - 1]!, path[i]!);
    segments.push(d);
    totalLen += d;
  }

  if (totalLen === 0) return path[0]!;

  const targetLen = progress * totalLen;
  let accumulated = 0;

  for (let i = 0; i < segments.length; i++) {
    const segLen = segments[i]!;
    if (accumulated + segLen >= targetLen) {
      const t = (targetLen - accumulated) / segLen;
      const a = path[i]!;
      const b = path[i + 1]!;
      return {
        x: Math.round(a.x + (b.x - a.x) * t),
        y: Math.round(a.y + (b.y - a.y) * t),
      };
    }
    accumulated += segLen;
  }

  return path[path.length - 1]!;
}
