import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import type { LiveBusEvent } from "./contracts.js";

export class RealtimeEventBus {
  private readonly emitter = new EventEmitter();
  private readonly history: LiveBusEvent[] = [];
  private readonly maxHistory = 100;

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  emitEvent(event: Omit<LiveBusEvent, "id" | "timestamp"> & { id?: string; timestamp?: string }): LiveBusEvent {
    const fullEvent: LiveBusEvent = {
      id: event.id ?? `ev_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      timestamp:
        event.timestamp ??
        new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }) + " IST",
      ...event,
    };
    this.history.unshift(fullEvent);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }
    this.emitter.emit("live_event", fullEvent);
    return fullEvent;
  }

  subscribe(listener: (ev: LiveBusEvent) => void): () => void {
    this.emitter.on("live_event", listener);
    return () => {
      this.emitter.off("live_event", listener);
    };
  }

  getRecentEvents(limit = 30): LiveBusEvent[] {
    return this.history.slice(0, limit);
  }

  /**
   * Signs an outbound webhook payload using HMAC-SHA256 (`X-DevHouse-Signature-256`).
   */
  static signWebhookPayload(payloadJson: string, secret: string): string {
    const digest = crypto.createHmac("sha256", secret).update(payloadJson, "utf8").digest("hex");
    return `sha256=${digest}`;
  }
}

export const globalEventBus = new RealtimeEventBus();
