import { RealtimeEventBus } from "./eventBus.js";
import type { Approval, LiveBusEvent } from "./contracts.js";

const NOTIFIER_TIMEOUT_MS = 8_000;
const DEFAULT_WEBHOOK_SECRET = "whsec_devhouse_hmac_sha256_key";

export interface NotificationDispatchResult {
  webhook: boolean;
  telegram: boolean;
  slack: boolean;
}

export interface ApprovalNotification {
  id: string;
  contentId: string;
  contentTitle: string;
  runId: string;
  brandComplianceScore: number;
  authorAgent?: string;
}

export interface ProviderFallbackNotification {
  runId: string;
  agentId: string;
  fromModelId: string;
  toModelId: string;
  providerId: string;
  reason?: string;
}

/**
 * Dispatches signed webhooks + Telegram/Slack alerts for operator-critical events:
 * Human Approval Gate staging, LLM provider failover, and the global Kill Switch.
 *
 * Every send is best-effort: failures are swallowed so notifications can never break
 * the orchestration pipeline.
 */
export class OutboundNotifierService {
  private get webhookSecret(): string {
    return process.env.WEBHOOK_SIGNING_SECRET ?? DEFAULT_WEBHOOK_SECRET;
  }

  private get webhookUrl(): string | undefined {
    return process.env.OUTBOUND_WEBHOOK_URL ?? process.env.WEBHOOK_URL;
  }

  static buildTelegramPayload(chatId: string, summary: string): Record<string, unknown> {
    return {
      chat_id: chatId,
      text: summary,
      disable_web_page_preview: true,
    };
  }

  static buildSlackPayload(summary: string): Record<string, unknown> {
    return {
      text: summary,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: summary },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Dev House · Agent Orchestration" }],
        },
      ],
    };
  }

  /** Serializes + HMAC-signs the event, then POSTs with `X-DevHouse-Signature-256`. */
  async sendSignedWebhook(url: string, event: LiveBusEvent): Promise<boolean> {
    try {
      const payloadJson = JSON.stringify(event);
      const signature = RealtimeEventBus.signWebhookPayload(payloadJson, this.webhookSecret);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-DevHouse-Signature-256": signature,
        },
        body: payloadJson,
        signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async sendTelegramAlert(summary: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(OutboundNotifierService.buildTelegramPayload(chatId, summary)),
        signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async sendSlackAlert(summary: string): Promise<boolean> {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(OutboundNotifierService.buildSlackPayload(summary)),
        signal: AbortSignal.timeout(NOTIFIER_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildEvent(params: {
    type: LiveBusEvent["type"];
    runId: string;
    summary: string;
    nodeId?: string;
    agentId?: string;
    status?: LiveBusEvent["status"];
  }): LiveBusEvent {
    return {
      id: `notif_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      timestamp:
        new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }) + " IST",
      type: params.type,
      runId: params.runId,
      summary: params.summary,
      nodeId: params.nodeId,
      agentId: params.agentId,
      status: params.status,
    };
  }

  /** Fans a single operator summary out to webhook + Telegram + Slack. */
  async dispatch(event: LiveBusEvent): Promise<NotificationDispatchResult> {
    const [webhook, telegram, slack] = await Promise.all([
      this.webhookUrl ? this.sendSignedWebhook(this.webhookUrl, event) : Promise.resolve(false),
      this.sendTelegramAlert(event.summary),
      this.sendSlackAlert(event.summary),
    ]);
    return { webhook, telegram, slack };
  }

  async notifyApprovalStaged(approval: Approval | ApprovalNotification): Promise<NotificationDispatchResult> {
    const event = this.buildEvent({
      type: "run.status",
      runId: approval.runId,
      nodeId: "gate_approval",
      status: "waiting",
      summary: `Approval staged: “${approval.contentTitle}” is waiting at the Human Approval Gate (${approval.id}, brand ${approval.brandComplianceScore}/100)`,
    });
    return this.dispatch(event);
  }

  async notifyProviderFallback(params: ProviderFallbackNotification): Promise<NotificationDispatchResult> {
    const event = this.buildEvent({
      type: "provider.fallback",
      runId: params.runId,
      agentId: params.agentId,
      nodeId: "prv_cf_gw",
      status: "degraded",
      summary: `Provider fallback: ${params.agentId} rerouted ${params.fromModelId} → ${params.toModelId} (${params.providerId})${params.reason ? ` — ${params.reason}` : ""}`,
    });
    return this.dispatch(event);
  }

  async notifyKillSwitchEngaged(params: {
    runId?: string;
    actor?: string;
    workspaceId: string;
  }): Promise<NotificationDispatchResult> {
    const event = this.buildEvent({
      type: "node.status",
      runId: params.runId ?? "run_kill_switch",
      nodeId: "gate_approval",
      status: "failed",
      summary: `Emergency kill switch engaged on ${params.workspaceId}${params.actor ? ` by ${params.actor}` : ""} — all outbound publishing halted`,
    });
    return this.dispatch(event);
  }
}

export const outboundNotifier = new OutboundNotifierService();
