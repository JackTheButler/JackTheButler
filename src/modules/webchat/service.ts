import type { MessageDTO } from '@janetheoperator/shared';
import { AppError } from '@/core/errors.js';
import { getApp } from '@/modules/apps/service.js';
import {
  getPublicHistory,
  ingestInboundMessage,
} from '@/modules/conversations/service.js';

/**
 * Public webchat gateway logic. Transport-agnostic (no hono). The widget app
 * must be configured + enabled (status `active`) or the public surface is
 * inert. Every public request is checked against the configured allowlist.
 */

const CHANNEL = 'webchat';

interface ActiveWebchat {
  title: string;
  welcomeMessage: string;
  accentColor: string;
  position: string;
  allowedDomains: string;
}

function activeConfig(): ActiveWebchat {
  let detail;
  try {
    detail = getApp(CHANNEL);
  } catch {
    throw new AppError('webchat_unavailable', 404);
  }
  if (detail.status !== 'active') throw new AppError('webchat_unavailable', 404);
  return detail.config as unknown as ActiveWebchat;
}

function hostOf(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Reduce an allowlist entry to a bare hostname so `example.com`,
 *  `example.com:8080`, and `https://example.com/x` all work. */
function normalizeDomain(entry: string): string {
  const d = entry.trim().toLowerCase();
  if (!d) return '';
  try {
    if (d.includes('://')) return new URL(d).hostname;
  } catch {
    /* fall through to manual strip */
  }
  return d.split('/')[0].split(':')[0]; // drop any path, then any port
}

function assertAllowedOrigin(origin: string | null, allowedDomains: string): void {
  const host = hostOf(origin);
  if (!host) throw new AppError('forbidden_origin', 403);
  const allowed = allowedDomains
    .split(/[\s,]+/)
    .map(normalizeDomain)
    .filter(Boolean);
  const ok = allowed.some((d) => host === d || host.endsWith(`.${d}`));
  if (!ok) throw new AppError('forbidden_origin', 403);
}

export interface PublicWidgetConfig {
  title: string;
  welcomeMessage: string;
  accentColor: string;
  position: string;
}

/** Appearance config the widget renders. Origin-checked.
 *  Theme is loader-resolved, not server-driven — see channel-webchat
 *  manifest for the precedence chain. */
export function getPublicWidgetConfig(origin: string | null): PublicWidgetConfig {
  const cfg = activeConfig();
  assertAllowedOrigin(origin, cfg.allowedDomains);
  return {
    title: cfg.title,
    welcomeMessage: cfg.welcomeMessage,
    accentColor: cfg.accentColor,
    position: cfg.position,
  };
}

/** Throws unless the widget app is active AND the origin is allowed.
 *  Used by the WebSocket handshake guard. */
export function assertWidgetAccess(origin: string | null): void {
  const cfg = activeConfig();
  assertAllowedOrigin(origin, cfg.allowedDomains);
}

/** Customer-visible history for a visitor. Origin-checked. */
export function getWidgetHistory(origin: string | null, visitorId: string): MessageDTO[] {
  const cfg = activeConfig();
  assertAllowedOrigin(origin, cfg.allowedDomains);
  return getPublicHistory('webchat', visitorId);
}

/** Inbound customer message from the widget. Origin-checked → ingest. */
export function receiveWidgetMessage(
  origin: string | null,
  visitorId: string,
  content: string,
): { conversationId: string } {
  const cfg = activeConfig();
  assertAllowedOrigin(origin, cfg.allowedDomains);
  const { conversationId } = ingestInboundMessage({
    channel: CHANNEL,
    externalId: visitorId,
    content,
  });
  return { conversationId };
}
