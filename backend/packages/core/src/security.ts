import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "169.254.169.254",
  "0.0.0.0",
  "ip6-localhost",
  "ip6-loopback",
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT RFC 6598
    (a === 169 && b === 254) || // Link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) || // RFC 1918
    (a === 198 && (b === 18 || b === 19)) || // Benchmarking
    a >= 224 // Multicast & reserved
  );
}

/**
 * Validates remote video pull URLs to prevent Server-Side Request Forgery (SSRF).
 * Rejects non-HTTP/HTTPS schemes, embedded credentials, loopback, link-local,
 * RFC1918 private IPv4/IPv6 ranges, IPv4-mapped IPv6 addresses, and cloud metadata IPs.
 */
export function validateSafeExternalUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL syntax");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Disallowed protocol ${parsed.protocol}; only HTTP/HTTPS allowed`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("SSRF Guard: Embedded URL credentials are not allowed");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host.endsWith(".lan")
  ) {
    throw new Error(`SSRF Guard: Blocked internal/loopback hostname '${host}'`);
  }

  // Reject numeric/octal/hex single-integer IPv4 obfuscation (e.g. http://2130706433 or http://0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    throw new Error(`SSRF Guard: Blocked numeric IP representation '${host}'`);
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    if (isPrivateOrReservedIpv4(host)) {
      throw new Error(`SSRF Guard: Blocked private/reserved IPv4 address '${host}'`);
    }
  } else if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized === "0:0:0:0:0:0:0:1" ||
      normalized === "0:0:0:0:0:0:0:0" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:")
    ) {
      throw new Error(`SSRF Guard: Blocked private/loopback/mapped IPv6 address '${host}'`);
    }
  }

  return parsed;
}

/**
 * Wraps untrusted video transcripts, scraped comments, or external captions inside a strict
 * non-executable data envelope and neutralizes instruction-override injection patterns.
 */
export function isolateUntrustedContent(rawText: string, label = "UNTRUSTED_TRANSCRIPT"): string {
  const safeLabel = label.replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
  const sanitized = rawText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\/?UNTRUSTED_[A-Z0-9_]+>/gi, "[REDACTED_TAG]")
    .replace(/ignore\s+(all\s+)?(previous|prior|above|system|developer)\s+instructions/gi, "[filtered-directive]")
    .replace(/(system|developer)\s*prompt\s*:/gi, "[filtered-label]:");
  return `<${safeLabel}>\n${sanitized}\n</${safeLabel}>`;
}
