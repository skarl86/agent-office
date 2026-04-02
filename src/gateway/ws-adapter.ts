// 실제 WebSocket 어댑터 구현

import { uuid } from "@/lib/uuid";
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
  ChannelType,
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
import type { GatewayRpcClient } from "./rpc-client";
import type { AgentsListResponse } from "./types";
import type { GatewayWsClient } from "./ws-client";

const WATCHED_EVENTS = ["agent", "chat", "presence", "health", "heartbeat", "cron", "shutdown"] as const;

export class WsAdapter implements GatewayAdapter {
  private handlers: Set<AdapterEventHandler> = new Set();
  private unsubscribers: Array<() => void> = [];

  constructor(
    private wsClient: GatewayWsClient,
    private rpcClient: GatewayRpcClient,
  ) {}

  async connect(): Promise<void> {
    for (const eventName of WATCHED_EVENTS) {
      const unsub = this.wsClient.onEvent(eventName, (frame) => {
        for (const h of this.handlers) {
          h(eventName, frame.payload);
        }
      });
      this.unsubscribers.push(unsub);
    }
  }

  disconnect(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.handlers.clear();
  }

  onEvent(handler: AdapterEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async chatHistory(sessionKey?: string): Promise<ChatHistoryResult> {
    const result = await this.rpcClient.request<
      | ChatHistoryResult
      | { messages?: ChatHistoryResult["messages"]; thinkingLevel?: string | null }
      | ChatHistoryResult["messages"]
    >("chat.history", sessionKey ? { sessionKey } : {});
    if (Array.isArray(result)) {
      return { messages: result };
    }
    return {
      messages: Array.isArray(result?.messages) ? result.messages : [],
      thinkingLevel: result?.thinkingLevel ?? null,
    };
  }

  async chatSend(params: ChatSendParams): Promise<void> {
    const attachments = params.attachments
      ?.map((att) => {
        const dataUrl = att.dataUrl?.trim() ?? "";
        const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
        if (!match && !att.content) return null;
        return {
          type: att.mimeType.startsWith("image/") ? "image" : "file",
          mimeType: att.mimeType,
          content: att.content ?? match?.[2] ?? "",
          name: att.name,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    await this.rpcClient.request("chat.send", {
      sessionKey: params.sessionKey,
      message: params.text,
      deliver: false,
      idempotencyKey: uuid(),
      attachments,
    });
  }

  async chatAbort(sessionKeyOrRunId: string): Promise<void> {
    await this.rpcClient.request("chat.abort", { sessionKey: sessionKeyOrRunId });
  }

  async chatInject(sessionKey: string, content: string): Promise<void> {
    await this.rpcClient.request("chat.inject", { sessionKey, content });
  }

  async sessionsList(): Promise<SessionInfo[]> {
    const result = await this.rpcClient.request<{ sessions?: SessionInfo[] }>("sessions.list");
    return Array.isArray(result) ? result : (result?.sessions ?? []);
  }

  async sessionsPreview(sessionKey: string): Promise<SessionPreview> {
    return this.rpcClient.request<SessionPreview>("sessions.preview", { sessionKey });
  }

  async sessionsDelete(sessionKey: string, options?: { deleteTranscript?: boolean }): Promise<void> {
    await this.rpcClient.request("sessions.delete", {
      key: sessionKey,
      ...(options?.deleteTranscript != null ? { deleteTranscript: options.deleteTranscript } : {}),
    });
  }

  async sessionsPatch(sessionKey: string, patch: SessionPatchParams): Promise<void> {
    await this.rpcClient.request("sessions.patch", { key: sessionKey, ...patch });
  }

  async sessionsReset(sessionKey: string): Promise<void> {
    await this.rpcClient.request("sessions.reset", { key: sessionKey });
  }

  async sessionsCompact(sessionKey: string): Promise<void> {
    await this.rpcClient.request("sessions.compact", { key: sessionKey });
  }

  async channelsStatus(): Promise<ChannelInfo[]> {
    const result = await this.rpcClient.request<{ channels?: ChannelInfo[] }>("channels.status");
    return Array.isArray(result) ? result : (result?.channels ?? []);
  }

  async channelsLogout(channel: string, accountId?: string): Promise<{ cleared: boolean }> {
    return this.rpcClient.request<{ cleared: boolean }>("channels.logout", {
      channel,
      ...(accountId ? { accountId } : {}),
    });
  }

  async webLoginStart(force?: boolean): Promise<{ qrDataUrl?: string; message: string }> {
    return this.rpcClient.request("web.login.start", force ? { force } : {});
  }

  async webLoginWait(): Promise<{ connected: boolean; message: string }> {
    return this.rpcClient.request("web.login.wait", {}, 30_000);
  }

  async skillsStatus(agentId?: string): Promise<SkillInfo[]> {
    const result = await this.rpcClient.request<{ skills?: SkillInfo[] }>(
      "skills.status",
      agentId ? { agentId } : {},
    );
    return Array.isArray(result) ? result : (result?.skills ?? []);
  }

  async skillsInstall(name: string, installId: string): Promise<SkillInstallResult> {
    return this.rpcClient.request<SkillInstallResult>("skills.install", { name, installId }, 60_000);
  }

  async skillsUpdate(skillKey: string, patch: SkillUpdatePatch): Promise<{ ok: boolean }> {
    return this.rpcClient.request<{ ok: boolean }>("skills.update", { skillKey, ...patch });
  }

  async cronList(): Promise<CronTask[]> {
    const result = await this.rpcClient.request<{ tasks?: CronTask[] }>("cron.list");
    return Array.isArray(result) ? result : (result?.tasks ?? []);
  }

  async cronAdd(input: CronTaskInput): Promise<CronTask> {
    return this.rpcClient.request<CronTask>("cron.add", input as unknown as Record<string, unknown>);
  }

  async cronUpdate(id: string, patch: Partial<CronTaskInput>): Promise<CronTask> {
    return this.rpcClient.request<CronTask>("cron.update", {
      id,
      ...(patch as unknown as Record<string, unknown>),
    });
  }

  async cronRemove(id: string): Promise<void> {
    await this.rpcClient.request("cron.remove", { id });
  }

  async cronRun(id: string): Promise<void> {
    await this.rpcClient.request("cron.run", { id });
  }

  async agentsList(): Promise<AgentsListResponse> {
    return this.rpcClient.request<AgentsListResponse>("agents.list");
  }

  async agentsCreate(params: AgentCreateParams): Promise<AgentCreateResult> {
    return this.rpcClient.request<AgentCreateResult>(
      "agents.create",
      params as unknown as Record<string, unknown>,
    );
  }

  async agentsUpdate(params: AgentUpdateParams): Promise<AgentUpdateResult> {
    return this.rpcClient.request<AgentUpdateResult>(
      "agents.update",
      params as unknown as Record<string, unknown>,
    );
  }

  async agentsDelete(params: AgentDeleteParams): Promise<AgentDeleteResult> {
    return this.rpcClient.request<AgentDeleteResult>(
      "agents.delete",
      params as unknown as Record<string, unknown>,
    );
  }

  async agentsFilesList(agentId: string): Promise<AgentFilesListResult> {
    return this.rpcClient.request<AgentFilesListResult>("agents.files.list", { agentId });
  }

  async agentsFilesGet(agentId: string, name: string): Promise<AgentFileContent> {
    return this.rpcClient.request<AgentFileContent>("agents.files.get", { agentId, name });
  }

  async agentsFilesSet(agentId: string, name: string, content: string): Promise<AgentFileSetResult> {
    return this.rpcClient.request<AgentFileSetResult>("agents.files.set", { agentId, name, content });
  }

  async toolsCatalog(agentId?: string): Promise<ToolCatalog> {
    return this.rpcClient.request<ToolCatalog>("tools.catalog", agentId ? { agentId } : {});
  }

  async usageStatus(): Promise<UsageInfo> {
    return this.rpcClient.request<UsageInfo>("usage.status");
  }

  async modelsList(): Promise<ModelCatalogEntry[]> {
    const result = await this.rpcClient.request<{ models?: ModelCatalogEntry[] }>("models.list");
    return Array.isArray(result) ? result : (result?.models ?? []);
  }

  async configGet(): Promise<ConfigSnapshot> {
    return this.rpcClient.request<ConfigSnapshot>("config.get");
  }

  async configSet(raw: string, baseHash?: string): Promise<ConfigWriteResult> {
    return this.rpcClient.request<ConfigWriteResult>("config.set", {
      raw,
      ...(baseHash ? { baseHash } : {}),
    });
  }

  async configApply(
    raw: string,
    baseHash?: string,
    params?: { sessionKey?: string; note?: string; restartDelayMs?: number },
  ): Promise<ConfigWriteResult> {
    return this.rpcClient.request<ConfigWriteResult>("config.apply", {
      raw,
      ...(baseHash ? { baseHash } : {}),
      ...params,
    });
  }

  async configPatch(raw: string, baseHash?: string): Promise<ConfigPatchResult> {
    return this.rpcClient.request<ConfigPatchResult>("config.patch", {
      raw,
      ...(baseHash ? { baseHash } : {}),
    });
  }

  async configSchema(): Promise<ConfigSchemaResponse> {
    return this.rpcClient.request<ConfigSchemaResponse>("config.schema");
  }

  async statusSummary(): Promise<StatusSummary> {
    return this.rpcClient.request<StatusSummary>("status.summary");
  }

  async updateRun(params?: { restartDelayMs?: number }): Promise<UpdateRunResult> {
    return this.rpcClient.request<UpdateRunResult>(
      "update.run",
      params ? (params as Record<string, unknown>) : {},
      120_000,
    );
  }

  // 미지원 채널 타입 처리를 위한 내부 헬퍼
  protected normalizeChannelType(raw: string): ChannelType {
    const known: ChannelType[] = [
      "whatsapp", "telegram", "discord", "signal", "feishu",
      "imessage", "matrix", "line", "msteams", "googlechat", "mattermost",
    ];
    return known.includes(raw as ChannelType) ? (raw as ChannelType) : "telegram";
  }
}
