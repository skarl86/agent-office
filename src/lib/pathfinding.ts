// 존 간 이동 경로 계산 — 복도(corridor)를 경유하는 웨이포인트 생성

import type { AgentZone } from "@/gateway/types";
import { OFFICE, ZONES, CORRIDOR_CENTER } from "./constants";

type Point = { x: number; y: number };

const halfW = (OFFICE.width - OFFICE.corridorWidth) / 2;
const halfH = (OFFICE.height - OFFICE.corridorWidth) / 2;

/**
 * 각 존에서 복도로 나가는 출구 지점 (존 경계와 복도 사이).
 * 존마다 2개 출구가 있지만, 목적지 방향에 가까운 쪽을 선택한다.
 */
function getZoneExits(zone: AgentZone): { horizontal: Point; vertical: Point } {
  const z = ZONES[zone === "corridor" ? "desk" : zone];
  const cx = z.x + z.width / 2;
  const cy = z.y + z.height / 2;

  // 복도 중심 좌표
  const corrCenterX = CORRIDOR_CENTER.x;
  const corrCenterY = CORRIDOR_CENTER.y;

  switch (zone) {
    case "desk": // top-left: exits right and bottom
      return {
        vertical: { x: z.x + z.width + OFFICE.corridorWidth / 2, y: cy },
        horizontal: { x: cx, y: z.y + z.height + OFFICE.corridorWidth / 2 },
      };
    case "meeting": // top-right: exits left and bottom
      return {
        vertical: { x: z.x - OFFICE.corridorWidth / 2, y: cy },
        horizontal: { x: cx, y: z.y + z.height + OFFICE.corridorWidth / 2 },
      };
    case "hotDesk": // bottom-left: exits right and top
      return {
        vertical: { x: z.x + z.width + OFFICE.corridorWidth / 2, y: cy },
        horizontal: { x: cx, y: z.y - OFFICE.corridorWidth / 2 },
      };
    case "lounge": // bottom-right: exits left and top
      return {
        vertical: { x: z.x - OFFICE.corridorWidth / 2, y: cy },
        horizontal: { x: cx, y: z.y - OFFICE.corridorWidth / 2 },
      };
    default: // corridor — return corridor center
      return {
        vertical: { x: corrCenterX, y: corrCenterY },
        horizontal: { x: corrCenterX, y: corrCenterY },
      };
  }
}

/** 두 존이 같은 행(수평 인접)인지 */
function isSameRow(a: AgentZone, b: AgentZone): boolean {
  const topRow: AgentZone[] = ["desk", "meeting"];
  const bottomRow: AgentZone[] = ["hotDesk", "lounge"];
  return (topRow.includes(a) && topRow.includes(b)) ||
    (bottomRow.includes(a) && bottomRow.includes(b));
}

/** 두 존이 같은 열(수직 인접)인지 */
function isSameCol(a: AgentZone, b: AgentZone): boolean {
  const leftCol: AgentZone[] = ["desk", "hotDesk"];
  const rightCol: AgentZone[] = ["meeting", "lounge"];
  return (leftCol.includes(a) && leftCol.includes(b)) ||
    (rightCol.includes(a) && rightCol.includes(b));
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 두 존 사이의 이동 경로(웨이포인트 배열)를 생성한다.
 * 출발 위치에서 → 복도 출구 → (필요시 복도 교차점) → 목적지 복도 입구 → 도착 위치
 */
export function calculatePath(
  from: Point,
  fromZone: AgentZone,
  to: Point,
  toZone: AgentZone,
): Point[] {
  // 같은 존이면 직선
  if (fromZone === toZone) {
    return [from, to];
  }

  const fromExits = getZoneExits(fromZone);
  const toExits = getZoneExits(toZone);
  const center: Point = { x: CORRIDOR_CENTER.x, y: CORRIDOR_CENTER.y };

  if (isSameRow(fromZone, toZone)) {
    // 수평 인접: 수직 복도 출구 사용 (좌우 이동)
    return [from, fromExits.vertical, toExits.vertical, to];
  }

  if (isSameCol(fromZone, toZone)) {
    // 수직 인접: 수평 복도 출구 사용 (상하 이동)
    return [from, fromExits.horizontal, toExits.horizontal, to];
  }

  // 대각선: 복도 교차점(center) 경유
  // 더 가까운 출구 → center → 더 가까운 입구
  const fromVertDist = dist(from, fromExits.vertical);
  const fromHorzDist = dist(from, fromExits.horizontal);
  const fromExit = fromVertDist < fromHorzDist ? fromExits.vertical : fromExits.horizontal;

  const toVertDist = dist(to, toExits.vertical);
  const toHorzDist = dist(to, toExits.horizontal);
  const toExit = toVertDist < toHorzDist ? toExits.vertical : toExits.horizontal;

  return [from, fromExit, center, toExit, to];
}

/**
 * 경로의 총 거리를 계산한다. duration 결정에 사용.
 */
export function pathDistance(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += dist(path[i - 1]!, path[i]!);
  }
  return total;
}

/** 거리 기반 이동 duration (ms). 800~2000ms 범위로 클램프. */
export function calculateDuration(path: Point[]): number {
  const d = pathDistance(path);
  // 기준: 300px 거리 → 1000ms
  const raw = (d / 300) * 1000;
  return Math.round(Math.max(800, Math.min(2000, raw)));
}

/**
 * 경로상의 현재 위치를 progress(0~1)로 보간한다.
 */
export function interpolatePath(path: Point[], progress: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  if (progress <= 0) return path[0]!;
  if (progress >= 1) return path[path.length - 1]!;

  // 각 세그먼트의 길이를 계산
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1]!, path[i]!);
    segLengths.push(d);
    totalLen += d;
  }

  if (totalLen === 0) return path[0]!;

  const targetLen = progress * totalLen;
  let accumulated = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i]!;
    if (accumulated + segLen >= targetLen) {
      const segProgress = segLen === 0 ? 0 : (targetLen - accumulated) / segLen;
      const a = path[i]!;
      const b = path[i + 1]!;
      return {
        x: Math.round(a.x + (b.x - a.x) * segProgress),
        y: Math.round(a.y + (b.y - a.y) * segProgress),
      };
    }
    accumulated += segLen;
  }

  return path[path.length - 1]!;
}
