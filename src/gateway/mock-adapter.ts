// Mock 어댑터 — 오프라인 개발용 (한국어 데이터)

import type { GatewayAdapter, AdapterEventHandler, SkillUpdatePatch } from "./adapter";
import type {
  AgentCreateParams,
  AgentCreateResult,
  AgentDeleteParams,
  AgentDeleteResult,
  AgentFileContent,
  AgentFilesListResult,
  AgentFileSetResult,
  AgentUpdateParams,
  AgentUpdateResult,
  ChannelInfo,
  ChatHistoryResult,
  ChatSendParams,
  ConfigPatchResult,
  ConfigSchemaResponse,
  ConfigSnapshot,
  ConfigWriteResult,
  CronTask,
  CronTaskInput,
  ModelCatalogEntry,
  SessionPatchParams,
  SessionInfo,
  SessionPreview,
  SkillInfo,
  SkillInstallResult,
  StatusSummary,
  ToolCatalog,
  UpdateRunResult,
  UsageInfo,
} from "./adapter-types";
import type { AgentsListResponse } from "./types";

const MOCK_CHANNELS: ChannelInfo[] = [
  {
    id: "telegram:bot1",
    type: "telegram",
    name: "텔레그램 봇",
    status: "connected",
    accountId: "bot1",
    configured: true,
    linked: true,
    running: true,
    lastConnectedAt: Date.now() - 60_000,
  },
  {
    id: "discord:srv1",
    type: "discord",
    name: "디스코드 서버",
    status: "connected",
    accountId: "srv1",
    configured: true,
    linked: true,
    running: true,
    lastConnectedAt: Date.now() - 120_000,
  },
  {
    id: "whatsapp:wa1",
    type: "whatsapp",
    name: "WhatsApp",
    status: "disconnected",
    accountId: "wa1",
    configured: true,
    linked: false,
    running: false,
  },
  {
    id: "signal:sig1",
    type: "signal",
    name: "Signal",
    status: "error",
    accountId: "sig1",
    configured: true,
    linked: false,
    running: false,
    error: "세션 만료됨",
  },
];

const MOCK_SKILLS: SkillInfo[] = [
  {
    id: "web-search",
    slug: "web-search",
    name: "웹 검색",
    description: "인터넷을 검색하여 실시간 정보를 가져옵니다",
    enabled: true,
    icon: "🔍",
    version: "1.0.0",
    isCore: true,
    isBundled: true,
    source: "core",
    always: true,
    eligible: true,
    requirements: { bins: ["curl"] },
    missing: { bins: [] },
    configChecks: [{ path: "SEARCH_API_KEY", satisfied: true }],
    primaryEnv: "SEARCH_API_KEY",
  },
  {
    id: "code-runner",
    slug: "code-runner",
    name: "코드 실행기",
    description: "Python/Node.js 코드를 샌드박스에서 실행합니다",
    enabled: true,
    icon: "⚙️",
    version: "2.1.0",
    isCore: false,
    isBundled: true,
    source: "bundled",
    eligible: true,
    requirements: { bins: ["node", "python3"] },
    missing: { bins: [] },
  },
  {
    id: "notion",
    slug: "notion",
    name: "Notion 통합",
    description: "Notion 페이지 및 데이터베이스를 관리합니다",
    enabled: false,
    icon: "📝",
    version: "1.2.0",
    isCore: false,
    isBundled: false,
    source: "clawhub",
    eligible: false,
    primaryEnv: "NOTION_TOKEN",
    configChecks: [{ path: "NOTION_TOKEN", satisfied: false }],
  },
];

const MOCK_CRON_TASKS: CronTask[] = [
  {
    id: "cron-daily-summary",
    name: "일일 요약 보고",
    description: "매일 오전 9시에 에이전트 활동 요약을 전송합니다",
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Seoul" },
    enabled: true,
    createdAtMs: Date.now() - 7 * 24 * 3600_000,
    updatedAtMs: Date.now() - 3600_000,
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "오늘의 활동을 요약해서 보고해줘" },
    state: {
      nextRunAtMs: Date.now() + 3600_000,
      lastRunAtMs: Date.now() - 20 * 3600_000,
      lastRunStatus: "ok",
    },
  },
  {
    id: "cron-health-check",
    name: "헬스 체크",
    description: "30분마다 시스템 상태를 확인합니다",
    schedule: { kind: "every", everyMs: 30 * 60_000 },
    enabled: true,
    createdAtMs: Date.now() - 3 * 24 * 3600_000,
    updatedAtMs: Date.now() - 3600_000,
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: { kind: "systemEvent", text: "health.check" },
    state: {
      nextRunAtMs: Date.now() + 15 * 60_000,
      lastRunAtMs: Date.now() - 15 * 60_000,
      lastRunStatus: "ok",
    },
  },
];

const MOCK_SESSIONS: SessionInfo[] = [
  {
    key: "agent:main:main",
    agentId: "main",
    label: "메인 세션",
    createdAt: Date.now() - 3600_000,
    lastActiveAt: Date.now() - 5 * 60_000,
    messageCount: 12,
    kind: "main",
    totalTokens: 4500,
    totalTokensFresh: true,
    model: "anthropic/claude-opus-4-6",
  },
  {
    key: "agent:kent:main",
    agentId: "kent",
    label: "켄트 세션",
    createdAt: Date.now() - 2400_000,
    lastActiveAt: Date.now() - 10 * 60_000,
    messageCount: 8,
    kind: "main",
    totalTokens: 3200,
    totalTokensFresh: true,
    model: "anthropic/claude-opus-4-6",
  },
  {
    key: "agent:loca:main",
    agentId: "loca",
    label: "로카 세션",
    createdAt: Date.now() - 1800_000,
    lastActiveAt: Date.now() - 15 * 60_000,
    messageCount: 5,
    kind: "main",
    totalTokens: 1800,
    totalTokensFresh: true,
    model: "anthropic/claude-sonnet-4-6",
  },
  {
    key: "agent:researcher:main",
    agentId: "researcher",
    label: "리서처 세션",
    createdAt: Date.now() - 1200_000,
    lastActiveAt: Date.now() - 20 * 60_000,
    messageCount: 3,
    kind: "main",
    totalTokens: 900,
    totalTokensFresh: true,
    model: "openai/gpt-4o",
  },
];

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextCronId = 100;

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

class SubAgentSimulator {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private activeSubAgents = new Set<string>();
  private subCounter = 0;
  private running = false;

  constructor(
    private emit: (event: string, payload: unknown) => void,
    private maxConcurrent: number = 3,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextSpawn(5000);
    this.scheduleAgentToAgentComm(20_000);
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.activeSubAgents.clear();
  }

  private schedule(fn: () => void, ms: number): void {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
  }

  private scheduleNextSpawn(delayMs: number): void {
    this.schedule(() => {
      if (!this.running) return;
      if (this.activeSubAgents.size < this.maxConcurrent) {
        this.spawnSubAgent();
      }
      this.scheduleNextSpawn(randRange(3000, 8000));
    }, delayMs);
  }

  private spawnSubAgent(): void {
    this.subCounter++;
    const subId = `mock-sub-${this.subCounter}`;
    const runId = `mock-run-sub-${this.subCounter}`;
    const sessionKey = `mock-session-sub-${this.subCounter}`;

    this.activeSubAgents.add(subId);

    this.emit("agent", {
      runId,
      seq: 1,
      stream: "lifecycle",
      ts: Date.now(),
      data: { phase: "start", agentId: subId, parentAgentId: "main" },
      sessionKey,
    });

    this.schedule(() => {
      if (!this.running) return;
      this.emit("agent", {
        runId,
        seq: 2,
        stream: "assistant",
        ts: Date.now(),
        data: { text: `서브에이전트 ${subId} 작업 분석 중...` },
        sessionKey,
      });
    }, randRange(1000, 2000));

    this.schedule(() => {
      if (!this.running) return;
      const tools = ["web_search", "code_exec", "file_read", "analyze_data"];
      const tool = tools[Math.floor(Math.random() * tools.length)];
      this.emit("agent", {
        runId,
        seq: 3,
        stream: "tool",
        ts: Date.now(),
        data: { name: tool, phase: "start" },
        sessionKey,
      });
    }, randRange(3000, 5000));

    this.schedule(() => {
      if (!this.running) return;
      this.emit("agent", {
        runId,
        seq: 4,
        stream: "assistant",
        ts: Date.now(),
        data: { text: `서브에이전트 ${subId} 작업 완료.` },
        sessionKey,
      });
    }, randRange(6000, 9000));

    const endDelay = randRange(8000, 15_000);
    this.schedule(() => {
      if (!this.running) return;
      this.emit("agent", {
        runId,
        seq: 5,
        stream: "lifecycle",
        ts: Date.now(),
        data: { phase: "end", agentId: subId },
        sessionKey,
      });
      this.activeSubAgents.delete(subId);
    }, endDelay);
  }

  private scheduleAgentToAgentComm(delayMs: number): void {
    this.schedule(() => {
      if (!this.running) return;
      const agents = ["main", "kent", "loca", "researcher"];
      const a = agents[Math.floor(Math.random() * agents.length)];
      let b = a;
      while (b === a) b = agents[Math.floor(Math.random() * agents.length)];

      const sessionKeyA = `agent:${a}:main`;
      const sessionKeyB = `agent:${b}:main`;
      const sharedSessionKey = `a2a-${Date.now()}`;
      const runIdA = `a2a-run-${a}-${Date.now()}`;
      const runIdB = `a2a-run-${b}-${Date.now()}`;

      this.emit("agent", {
        runId: runIdA,
        seq: 1,
        stream: "lifecycle",
        ts: Date.now(),
        data: { phase: "start", agentId: a },
        sessionKey: sessionKeyA,
      });

      this.schedule(() => {
        if (!this.running) return;
        this.emit("agent", {
          runId: runIdA,
          seq: 2,
          stream: "tool",
          ts: Date.now(),
          data: {
            phase: "start",
            name: "sessions_send",
            input: {
              sessionKey: sessionKeyB,
              message: `${a}이(가) 작업을 위임합니다`,
            },
          },
          sessionKey: sessionKeyA,
        });

        this.emit("agent", {
          runId: runIdA,
          seq: 3,
          stream: "lifecycle",
          ts: Date.now(),
          data: { phase: "thinking", agentId: a },
          sessionKey: sharedSessionKey,
        });
      }, 800);

      this.schedule(() => {
        if (!this.running) return;
        this.emit("agent", {
          runId: runIdB,
          seq: 1,
          stream: "lifecycle",
          ts: Date.now(),
          data: { phase: "start", agentId: b },
          sessionKey: sessionKeyB,
        });
        this.emit("agent", {
          runId: runIdB,
          seq: 2,
          stream: "lifecycle",
          ts: Date.now(),
          data: { phase: "thinking", agentId: b },
          sessionKey: sharedSessionKey,
        });
      }, 1500);

      const commDuration = randRange(12_000, 22_000);
      this.schedule(() => {
        if (!this.running) return;
        this.emit("agent", {
          runId: runIdA,
          seq: 4,
          stream: "lifecycle",
          ts: Date.now(),
          data: { phase: "end", agentId: a },
          sessionKey: sessionKeyA,
        });
        this.emit("agent", {
          runId: runIdB,
          seq: 3,
          stream: "lifecycle",
          ts: Date.now(),
          data: { phase: "end", agentId: b },
          sessionKey: sessionKeyB,
        });
      }, commDuration);

      this.scheduleAgentToAgentComm(randRange(15_000, 30_000));
    }, delayMs);
  }
}

export class MockAdapter implements GatewayAdapter {
  private handlers: Set<AdapterEventHandler> = new Set();
  private cronTasks: CronTask[] = [...MOCK_CRON_TASKS];
  private subAgentSimulator: SubAgentSimulator | null = null;

  async connect(): Promise<void> {
    await delay(200);
    this.subAgentSimulator = new SubAgentSimulator(
      (event, payload) => this.emit(event, payload),
      3,
    );
    this.subAgentSimulator.start();
  }

  disconnect(): void {
    this.subAgentSimulator?.stop();
    this.subAgentSimulator = null;
    this.handlers.clear();
  }

  onEvent(handler: AdapterEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: string, payload: unknown): void {
    for (const h of this.handlers) {
      h(event, payload);
    }
  }

  async chatHistory(_sessionKey?: string): Promise<ChatHistoryResult> {
    await delay();
    return {
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "안녕하세요! 오늘 할 일 목록을 정리해줘.",
          timestamp: Date.now() - 600_000,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "안녕하세요! 물론이죠. 오늘의 할 일을 정리해드릴게요.",
          timestamp: Date.now() - 599_000,
        },
      ],
    };
  }

  async chatSend(_params: ChatSendParams): Promise<void> {
    await delay(100);
  }

  async chatAbort(_sessionKeyOrRunId: string): Promise<void> {
    await delay(100);
  }

  async chatInject(_sessionKey: string, _content: string): Promise<void> {
    await delay(100);
  }

  async sessionsList(): Promise<SessionInfo[]> {
    await delay();
    return MOCK_SESSIONS;
  }

  async sessionsPreview(sessionKey: string): Promise<SessionPreview> {
    await delay();
    return { key: sessionKey, messages: [] };
  }

  async sessionsDelete(_sessionKey: string): Promise<void> {
    await delay();
  }

  async sessionsPatch(_sessionKey: string, _patch: SessionPatchParams): Promise<void> {
    await delay();
  }

  async sessionsReset(_sessionKey: string): Promise<void> {
    await delay();
  }

  async sessionsCompact(_sessionKey: string): Promise<void> {
    await delay();
  }

  async channelsStatus(): Promise<ChannelInfo[]> {
    await delay();
    return MOCK_CHANNELS;
  }

  async channelsLogout(_channel: string): Promise<{ cleared: boolean }> {
    await delay();
    return { cleared: true };
  }

  async webLoginStart(): Promise<{ qrDataUrl?: string; message: string }> {
    await delay();
    return { message: "QR 코드를 스캔해주세요" };
  }

  async webLoginWait(): Promise<{ connected: boolean; message: string }> {
    await delay(2000);
    return { connected: true, message: "연결 성공" };
  }

  async skillsStatus(_agentId?: string): Promise<SkillInfo[]> {
    await delay();
    return MOCK_SKILLS;
  }

  async skillsInstall(_name: string, _installId: string): Promise<SkillInstallResult> {
    await delay(1000);
    return { ok: true, message: "설치 완료" };
  }

  async skillsUpdate(_skillKey: string, _patch: SkillUpdatePatch): Promise<{ ok: boolean }> {
    await delay();
    return { ok: true };
  }

  async cronList(): Promise<CronTask[]> {
    await delay();
    return this.cronTasks;
  }

  async cronAdd(input: CronTaskInput): Promise<CronTask> {
    await delay();
    const task: CronTask = {
      ...input,
      id: `cron-${++nextCronId}`,
      enabled: input.enabled ?? true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      state: {},
    };
    this.cronTasks.push(task);
    return task;
  }

  async cronUpdate(id: string, patch: Partial<CronTaskInput>): Promise<CronTask> {
    await delay();
    const idx = this.cronTasks.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`크론 작업을 찾을 수 없습니다: ${id}`);
    this.cronTasks[idx] = { ...this.cronTasks[idx], ...patch, updatedAtMs: Date.now() };
    return this.cronTasks[idx];
  }

  async cronRemove(id: string): Promise<void> {
    await delay();
    this.cronTasks = this.cronTasks.filter((t) => t.id !== id);
  }

  async cronRun(_id: string): Promise<void> {
    await delay();
  }

  async agentsList(): Promise<AgentsListResponse> {
    await delay();
    return {
      defaultId: "main",
      mainKey: "agent:main:main",
      scope: "local",
      agents: [
        { id: "main", name: "main", default: true, identity: { name: "기붕이", emoji: "🤖" } },
        { id: "kent", name: "kent", identity: { name: "켄트", emoji: "🧪" } },
        { id: "loca", name: "loca", identity: { name: "로카", emoji: "📍" } },
        { id: "researcher", name: "researcher", identity: { name: "리서처", emoji: "🔬" } },
      ],
    };
  }

  async agentsCreate(_params: AgentCreateParams): Promise<AgentCreateResult> {
    await delay();
    return { ok: true, agentId: `agent-${Date.now()}`, name: _params.name, workspace: _params.workspace };
  }

  async agentsUpdate(_params: AgentUpdateParams): Promise<AgentUpdateResult> {
    await delay();
    return { ok: true, agentId: _params.agentId };
  }

  async agentsDelete(_params: AgentDeleteParams): Promise<AgentDeleteResult> {
    await delay();
    return { ok: true, agentId: _params.agentId };
  }

  async agentsFilesList(agentId: string): Promise<AgentFilesListResult> {
    await delay();
    return { agentId, workspace: "/workspace", files: [] };
  }

  async agentsFilesGet(agentId: string, name: string): Promise<AgentFileContent> {
    await delay();
    return {
      agentId,
      workspace: "/workspace",
      file: { name, content: "", size: 0, modifiedAt: new Date().toISOString() },
    };
  }

  async agentsFilesSet(agentId: string, name: string, content: string): Promise<AgentFileSetResult> {
    await delay();
    return {
      ok: true,
      agentId,
      workspace: "/workspace",
      file: { name, size: content.length, modifiedAt: new Date().toISOString() },
    };
  }

  async toolsCatalog(_agentId?: string): Promise<ToolCatalog> {
    await delay();
    return { tools: [] };
  }

  async usageStatus(): Promise<UsageInfo> {
    await delay();
    return {
      updatedAt: Date.now(),
      providers: [
        {
          provider: "anthropic",
          displayName: "Anthropic",
          plan: "Pro",
          windows: [{ label: "이번 달", usedPercent: 45 }],
        },
      ],
    };
  }

  async modelsList(): Promise<ModelCatalogEntry[]> {
    await delay();
    return [
      { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic" },
    ];
  }

  async configGet(): Promise<ConfigSnapshot> {
    await delay();
    return {
      valid: true,
      config: {
        agents: { defaults: { subagents: { maxConcurrent: 5 } } },
        tools: { agentToAgent: { enabled: true, allow: ["main", "kent", "loca", "researcher"] } },
      },
    };
  }

  async configSet(_raw: string): Promise<ConfigWriteResult> {
    await delay();
    return { ok: true, config: {}, path: "/config.yaml" };
  }

  async configApply(_raw: string): Promise<ConfigWriteResult> {
    await delay();
    return { ok: true, config: {}, path: "/config.yaml" };
  }

  async configPatch(_raw: string): Promise<ConfigPatchResult> {
    await delay();
    return { ok: true, config: {} };
  }

  async configSchema(): Promise<ConfigSchemaResponse> {
    await delay();
    return { schema: {}, uiHints: {}, version: "1" };
  }

  async statusSummary(): Promise<StatusSummary> {
    await delay();
    return { version: "0.1.0", port: 18789, mode: "mock" };
  }

  async updateRun(): Promise<UpdateRunResult> {
    await delay(1000);
    return {
      ok: true,
      result: { status: "noop", mode: "mock", steps: [], durationMs: 0 },
    };
  }
}
