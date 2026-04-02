import type { CollaborationLink, VisualAgent } from "@/gateway/types";
import { ZONES } from "@/lib/constants";
import { allocateMeetingPositions } from "@/lib/position-allocator";

const STRENGTH_THRESHOLD = 0.3;
const MAX_CONCURRENT_MEETINGS = 3;

export interface MeetingGroup {
  sessionKey: string;
  agentIds: string[];
}

/** Multiple meeting table center positions (up to 3 groups) */
const MEETING_TABLE_CENTERS = [
  { x: ZONES.meeting.x + ZONES.meeting.width / 2, y: ZONES.meeting.y + ZONES.meeting.height / 2 },
  {
    x: ZONES.meeting.x + ZONES.meeting.width * 0.25,
    y: ZONES.meeting.y + ZONES.meeting.height * 0.3,
  },
  {
    x: ZONES.meeting.x + ZONES.meeting.width * 0.75,
    y: ZONES.meeting.y + ZONES.meeting.height * 0.7,
  },
];

/**
 * Detect collaboration groups that should trigger meeting zone gathering.
 */
export function detectMeetingGroups(
  links: CollaborationLink[],
  agents: Map<string, VisualAgent>,
  allowList?: string[],
): MeetingGroup[] {
  const allowSet = allowList && allowList.length > 0 ? new Set(allowList) : null;
  const sessionAgents = new Map<string, Set<string>>();

  for (const link of links) {
    if (link.strength < STRENGTH_THRESHOLD) continue;

    const sourceAgent = agents.get(link.sourceId);
    const targetAgent = agents.get(link.targetId);
    if (!sourceAgent || !targetAgent) continue;

    // Sub-agents don't go to meeting room
    if (sourceAgent.isSubAgent || targetAgent.isSubAgent) continue;

    if (allowSet && (!allowSet.has(link.sourceId) || !allowSet.has(link.targetId))) continue;

    let set = sessionAgents.get(link.sessionKey);
    if (!set) {
      set = new Set();
      sessionAgents.set(link.sessionKey, set);
    }
    set.add(link.sourceId);
    set.add(link.targetId);
  }

  const groups: MeetingGroup[] = [];
  for (const [sessionKey, agentSet] of sessionAgents) {
    if (agentSet.size >= 2) {
      groups.push({ sessionKey, agentIds: Array.from(agentSet) });
    }
    if (groups.length >= MAX_CONCURRENT_MEETINGS) break;
  }

  return groups;
}

/**
 * Calculate seat positions for a meeting group.
 */
export function calculateMeetingSeats(
  group: MeetingGroup,
  tableIndex: number,
): Map<string, { x: number; y: number }> {
  const center = MEETING_TABLE_CENTERS[tableIndex % MEETING_TABLE_CENTERS.length];
  const positions = allocateMeetingPositions(group.agentIds, center, 80);
  const result = new Map<string, { x: number; y: number }>();

  group.agentIds.forEach((id, i) => {
    const pos = positions[i];
    if (pos) result.set(id, pos);
  });

  return result;
}

/**
 * Apply meeting gathering: move agents to meeting positions.
 */
export function applyMeetingGathering(
  agents: Map<string, VisualAgent>,
  groups: MeetingGroup[],
  moveToMeeting: (agentId: string, pos: { x: number; y: number }) => void,
  returnFromMeeting: (agentId: string) => void,
): void {
  const inMeeting = new Set<string>();

  groups.forEach((group, tableIndex) => {
    const seats = calculateMeetingSeats(group, tableIndex);
    for (const [agentId, pos] of seats) {
      const agent = agents.get(agentId);
      if (agent && agent.zone !== "meeting") {
        moveToMeeting(agentId, pos);
      }
      inMeeting.add(agentId);
    }
  });

  // Return agents no longer in any meeting
  for (const agent of agents.values()) {
    if (agent.zone === "meeting" && !inMeeting.has(agent.id) && !agent.manualMeeting) {
      returnFromMeeting(agent.id);
    }
  }
}
