// Gateway WebSocket 프로토콜 타입 정의
// OpenClaw Gateway 소스 기준 (protocol v3) 호환

// --- 요청/응답 프레임 ---

export interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface GatewayResponseOk<T = unknown> {
  type: "res";
  id: string;
  ok: true;
  payload: T;
}

export interface GatewayResponseError {
  type: "res";
  id: string;
  ok: false;
  error: ErrorShape;
}

export type GatewayResponseFrame<T = unknown> = GatewayResponseOk<T> | GatewayResponseError;

export interface GatewayEventFrame<T = unknown> {
  type: "event";
  event: string;
  payload: T;
}

export type GatewayFrame = GatewayRequest | GatewayResponseFrame | GatewayEventFrame;

// --- 인증 ---

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  role?: string;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  caps: string[];
  scopes?: string[];
  auth?: {
    token?: string;
    deviceToken?: string;
  };
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
  userAgent?: string;
  locale?: string;
}

export interface HealthAgentInfo {
  agentId: string;
  isDefault?: boolean;
  heartbeat?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
}

export interface HealthSnapshot {
  ok: boolean;
  ts: number;
  agents?: HealthAgentInfo[];
  defaultAgentId?: string;
  channels?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
}

export interface HelloOk {
  type: "hello-ok";
  protocol: number;
  server: {
    version: string;
    connId?: string;
  };
  features?: Record<string, unknown>;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  snapshot?: {
    presence?: unknown;
    health?: HealthSnapshot;
    sessionDefaults?: unknown;
    uptimeMs?: number;
    configPath?: string;
    stateDir?: string;
    authMode?: string;
  };
  policy?: Record<string, unknown>;
}

// --- Agent 이벤트 ---

export type AgentStream = "lifecycle" | "tool" | "assistant" | "error";

export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: AgentStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
}

// --- 시각화 상태 ---

export type AgentVisualStatus =
  | "idle"
  | "thinking"
  | "tool_calling"
  | "speaking"
  | "spawning"
  | "error"
  | "offline";

export interface ToolInfo {
  name: string;
  args?: Record<string, unknown>;
  startedAt: number;
}

export interface SpeechBubble {
  text: string;
  timestamp: number;
}

export type AgentZone = "desk" | "meeting" | "hotDesk" | "lounge" | "corridor";

export interface MovementState {
  path: Array<{ x: number; y: number }>;
  progress: number;
  duration: number;
  startTime: number;
  fromZone: AgentZone;
  toZone: AgentZone;
}

export interface ToolCallRecord {
  name: string;
  timestamp: number;
}

export interface VisualAgent {
  id: string;
  name: string;
  status: AgentVisualStatus;
  position: { x: number; y: number };
  currentTool: ToolInfo | null;
  speechBubble: SpeechBubble | null;
  lastActiveAt: number;
  toolCallCount: number;
  toolCallHistory: ToolCallRecord[];
  runId: string | null;
  isSubAgent: boolean;
  isPlaceholder: boolean;
  parentAgentId: string | null;
  childAgentIds: string[];
  zone: AgentZone;
  originalPosition: { x: number; y: number } | null;
  movement: MovementState | null;
  confirmed: boolean;
  arrivedAtHotDeskAt: number | null;
  pendingRetire: boolean;
  arrivedAtMeetingAt: number | null;
  manualMeeting: boolean;
}

export interface CollaborationLink {
  sourceId: string;
  targetId: string;
  sessionKey: string;
  strength: number;
  lastActivityAt: number;
  isPeer?: boolean;
}

export interface EventHistoryItem {
  timestamp: number;
  agentId: string;
  agentName: string;
  stream: AgentStream;
  summary: string;
}

// --- 서브에이전트 폴링 ---

export interface SubAgentInfo {
  sessionKey: string;
  agentId: string;
  label: string;
  task: string;
  requesterSessionKey: string;
  startedAt: number;
}

export interface SessionSnapshot {
  sessions: SubAgentInfo[];
  fetchedAt: number;
}

// --- 글로벌 메트릭 ---

export interface GlobalMetrics {
  activeAgents: number;
  totalAgents: number;
  totalTokens: number;
  tokenRate: number;
  collaborationHeat: number;
}

// --- 연결 상태 ---

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

// --- 설정 ---

export interface AgentToAgentConfig {
  enabled: boolean;
  allow: string[];
}

// --- Store ---

export type ThemeMode = "light" | "dark";
export type PageId =
  | "office"
  | "chat"
  | "dashboard"
  | "agents"
  | "channels"
  | "skills"
  | "cron"
  | "settings";

export interface TokenSnapshot {
  timestamp: number;
  total: number;
  byAgent: Record<string, number>;
}

export interface AgentSummary {
  id: string;
  name: string;
  default?: boolean;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
}

export interface AgentsListResponse {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: AgentSummary[];
}

export interface OfficeStore {
  agents: Map<string, VisualAgent>;
  links: CollaborationLink[];
  globalMetrics: GlobalMetrics;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  selectedAgentId: string | null;
  eventHistory: EventHistoryItem[];
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  lastSessionsSnapshot: SessionSnapshot | null;
  theme: ThemeMode;
  operatorScopes: string[];
  tokenHistory: TokenSnapshot[];
  agentCosts: Record<string, number>;
  currentPage: PageId;
  chatDockHeight: number;
  maxSubAgents: number;
  agentToAgentConfig: AgentToAgentConfig;
  runIdMap: Map<string, string>;
  sessionKeyMap: Map<string, string[]>;

  // Agent CRUD
  addAgent: (agent: VisualAgent) => void;
  updateAgent: (id: string, patch: Partial<VisualAgent>) => void;
  removeAgent: (id: string) => void;
  initAgents: (agents: AgentSummary[]) => void;
  syncMainAgents: (agents: AgentSummary[]) => void;

  // 서브에이전트 관리
  addSubAgent: (parentId: string, info: SubAgentInfo) => void;
  removeSubAgent: (subAgentId: string) => void;
  retireSubAgent: (subAgentId: string) => void;

  // 세션 폴링
  setSessionsSnapshot: (snapshot: SessionSnapshot) => void;

  // 이벤트 처리
  processAgentEvent: (event: AgentEventPayload) => void;
  initEventHistory: () => Promise<void>;

  // UI 액션
  selectAgent: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMobileOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setCurrentPage: (page: PageId) => void;
  setChatDockHeight: (height: number) => void;

  // 설정
  setMaxSubAgents: (n: number) => void;
  setAgentToAgentConfig: (config: AgentToAgentConfig) => void;
  setOperatorScopes: (scopes: string[]) => void;

  // 메트릭
  pushTokenSnapshot: (snapshot: TokenSnapshot) => void;
  setAgentCosts: (costs: Record<string, number>) => void;
  updateMetrics: () => void;
}

// --- 에러 ---

export interface ErrorShape {
  code: string;
  message: string;
  retryable?: boolean;
  retryAfterMs?: number;
}
