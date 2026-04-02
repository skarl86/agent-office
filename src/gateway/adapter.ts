// Gateway 어댑터 인터페이스 — mock/ws 양쪽을 통일한 추상 계층

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

export type AdapterEventHandler = (event: string, payload: unknown) => void;

export interface SkillUpdatePatch {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
}

export interface GatewayAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  onEvent(handler: AdapterEventHandler): () => void;

  // 채팅
  chatHistory(sessionKey?: string): Promise<ChatHistoryResult>;
  chatSend(params: ChatSendParams): Promise<void>;
  chatAbort(sessionKeyOrRunId: string): Promise<void>;
  chatInject(sessionKey: string, content: string): Promise<void>;

  // 세션
  sessionsList(): Promise<SessionInfo[]>;
  sessionsPreview(sessionKey: string): Promise<SessionPreview>;
  sessionsDelete(sessionKey: string, options?: { deleteTranscript?: boolean }): Promise<void>;
  sessionsPatch(sessionKey: string, patch: SessionPatchParams): Promise<void>;
  sessionsReset(sessionKey: string): Promise<void>;
  sessionsCompact(sessionKey: string): Promise<void>;

  // 채널
  channelsStatus(): Promise<ChannelInfo[]>;
  channelsLogout(channel: string, accountId?: string): Promise<{ cleared: boolean }>;
  webLoginStart(force?: boolean): Promise<{ qrDataUrl?: string; message: string }>;
  webLoginWait(): Promise<{ connected: boolean; message: string }>;

  // 스킬
  skillsStatus(agentId?: string): Promise<SkillInfo[]>;
  skillsInstall(name: string, installId: string): Promise<SkillInstallResult>;
  skillsUpdate(skillKey: string, patch: SkillUpdatePatch): Promise<{ ok: boolean }>;

  // 크론
  cronList(): Promise<CronTask[]>;
  cronAdd(input: CronTaskInput): Promise<CronTask>;
  cronUpdate(id: string, patch: Partial<CronTaskInput>): Promise<CronTask>;
  cronRemove(id: string): Promise<void>;
  cronRun(id: string): Promise<void>;

  // 에이전트 & 도구
  agentsList(): Promise<AgentsListResponse>;
  agentsCreate(params: AgentCreateParams): Promise<AgentCreateResult>;
  agentsUpdate(params: AgentUpdateParams): Promise<AgentUpdateResult>;
  agentsDelete(params: AgentDeleteParams): Promise<AgentDeleteResult>;
  agentsFilesList(agentId: string): Promise<AgentFilesListResult>;
  agentsFilesGet(agentId: string, name: string): Promise<AgentFileContent>;
  agentsFilesSet(agentId: string, name: string, content: string): Promise<AgentFileSetResult>;
  toolsCatalog(agentId?: string): Promise<ToolCatalog>;
  usageStatus(): Promise<UsageInfo>;

  // 모델 카탈로그
  modelsList(): Promise<ModelCatalogEntry[]>;

  // 설정 / 상태 / 업데이트
  configGet(): Promise<ConfigSnapshot>;
  configSet(raw: string, baseHash?: string): Promise<ConfigWriteResult>;
  configApply(
    raw: string,
    baseHash?: string,
    params?: { sessionKey?: string; note?: string; restartDelayMs?: number },
  ): Promise<ConfigWriteResult>;
  configPatch(raw: string, baseHash?: string): Promise<ConfigPatchResult>;
  configSchema(): Promise<ConfigSchemaResponse>;
  statusSummary(): Promise<StatusSummary>;
  updateRun(params?: { restartDelayMs?: number }): Promise<UpdateRunResult>;
}
