/**
 * Security Middleware
 *
 * Adds security headers and rate limiting for production hardening.
 */

import type { Context, Next } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('security');

/**
 * Security headers middleware using Hono's secure-headers
 */
export const securityHeaders = secureHeaders({
  // Prevent clickjacking
  xFrameOptions: 'DENY',

  // Prevent MIME type sniffing
  xContentTypeOptions: 'nosniff',

  // Control referrer information
  referrerPolicy: 'strict-origin-when-cross-origin',

  // Content Security Policy
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline for dashboard
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", 'wss:', 'ws:'], // Allow WebSocket
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
  },

  // Strict Transport Security (HTTPS only)
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',

  // Permissions Policy
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
});

/**
 * Simple in-memory rate limiter
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Custom key generator (default: IP address) */
  keyGenerator?: (c: Context) => string;
  /** Skip rate limiting for certain requests */
  skip?: (c: Context) => boolean;
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const { max, windowMs, keyGenerator, skip } = config;

  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    // Check if we should skip
    if (skip?.(c)) {
      return next();
    }

    // Get client identifier
    const key = keyGenerator?.(c) ?? getClientIp(c);
    const now = Date.now();

    // Get or create entry
    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    // Increment count
    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, max - entry.count);
    const resetTime = Math.ceil(entry.resetAt / 1000);

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetTime.toString());

    // Check if over limit
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', retryAfter.toString());

      log.warn({ key, count: entry.count, max }, 'Rate limit exceeded');

      return c.json(
        {
          error: 'Too many requests',
          retryAfter,
        },
        429
      );
    }

    return next();
  };
}

/**
 * Get client IP address from request
 */
export function getClientIp(c: Context): string {
  // Check common proxy headers
  const xForwardedFor = c.req.header('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP (original client)
    return xForwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  const xRealIp = c.req.header('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  // Try CF-Connecting-IP (Cloudflare)
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // For local development, use a unique identifier per browser session
  // by combining user-agent hash with a timestamp bucket
  const userAgent = c.req.header('user-agent') || 'unknown';
  const hash = userAgent.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  return `local-${Math.abs(hash)}`;
}

/**
 * Pre-configured rate limiter for auth endpoints
 * 20 requests per minute per IP
 */
export const authRateLimit = rateLimit({
  max: 20,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Pre-configured rate limiter for general API
 * 100 requests per minute per IP
 */
export const apiRateLimit = rateLimit({
  max: 100,
  windowMs: 60 * 1000, // 1 minute
  skip: (c) => {
    // Skip rate limiting for health checks
    return c.req.path.startsWith('/health');
  },
});
