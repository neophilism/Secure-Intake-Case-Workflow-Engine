import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const eventTypePattern = /^[a-z0-9_.:-]+$/i;

function normalizedHostname(value: string) {
  return value
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

export function normalizeWebhookEventTypes(
  values: readonly string[],
) {
  const types = [
    ...new Set(
      values.map((value) => value.trim()).filter(Boolean),
    ),
  ];

  if (types.length < 1 || types.length > 50) {
    throw new Error("Webhook requires 1-50 event types.");
  }
  for (const type of types) {
    if (
      type !== "*" &&
      (type.length > 200 || !eventTypePattern.test(type))
    ) {
      throw new Error("Webhook event type is invalid.");
    }
  }
  return types.sort();
}

export function normalizeWebhookUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Webhook URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Webhook URL must use the standard HTTPS port.");
  }

  const hostname = normalizedHostname(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Webhook URL cannot target a local hostname.");
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("Webhook URL cannot target a private address.");
  }

  url.hash = "";
  return url.toString();
}

export async function assertWebhookDestinationPublic(
  endpointUrl: string,
) {
  const url = new URL(normalizeWebhookUrl(endpointUrl));
  const hostname = normalizedHostname(url.hostname);
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Webhook destination is private.");
    }
    return;
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error("Webhook destination did not resolve.");
  }
  if (resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(
      "Webhook destination resolved to a private or local address.",
    );
  }
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized.includes(":")) {
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff") ||
      /^fe[89ab]/.test(normalized)
    ) {
      return true;
    }
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }

  const parts = normalized.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
