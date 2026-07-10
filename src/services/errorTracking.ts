/**
 * Centralized Error Tracking Service
 *
 * Provides a unified interface for error tracking across the application.
 * Integrates with Sentry when VITE_SENTRY_DSN is configured.
 * Falls back to console-only logging when DSN is not set.
 *
 * Usage:
 * ```ts
 * import { errorTracking } from '@/services/errorTracking';
 *
 * try {
 *   // risky operation
 * } catch (error) {
 *   errorTracking.captureException(error, {
 *     context: 'PaymentFlow',
 *     userId: user.id
 *   });
 * }
 * ```
 */
// Type-only import — erased at build time. The SDK itself is dynamically
// imported in init() so @sentry/react stays out of the App critical path
// (it was statically pulled in by App.tsx and useAuth.tsx).
import type * as SentryTypes from '@sentry/react';

type SentryModule = typeof SentryTypes;

// Errors thrown before the Sentry chunk resolves are buffered (bounded) and
// flushed in order once it loads, so early boot failures are not lost.
const MAX_PENDING_EVENTS = 20;

// Redact PII before events leave the browser (CWE-359 — exposure to a subprocessor).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const redactPii = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(EMAIL_RE, '[redacted-email]') : value;

/**
 * Sentry `beforeSend` scrubber. Restricts user context to a non-PII id, redacts
 * email-like substrings in messages/exceptions, and strips cookies/auth headers.
 * Typed as `any` because @sentry/react is a type-only import here and the Event
 * shape is broad; scrubbing is best-effort and must never throw (that would drop
 * the event entirely).
 */
function scrubSentryEvent(event: any): any {
  try {
    if (event?.user) {
      event.user = event.user.id ? { id: event.user.id } : undefined;
    }
    if (typeof event?.message === 'string') {
      event.message = redactPii(event.message);
    }
    const values = event?.exception?.values;
    if (Array.isArray(values)) {
      for (const v of values) {
        if (v && typeof v.value === 'string') v.value = redactPii(v.value);
      }
    }
    if (event?.request) {
      delete event.request.cookies;
      const headers = event.request.headers;
      if (headers) {
        for (const k of ['Authorization', 'authorization', 'Cookie', 'cookie']) {
          delete headers[k];
        }
      }
    }
  } catch {
    // never let scrubbing throw
  }
  return event;
}

export interface ErrorContext {
  userId?: string;
  tripId?: string;
  organizationId?: string;
  context?: string;
  additionalData?: Record<string, unknown>;
}

export interface BreadcrumbData {
  category: 'navigation' | 'user-action' | 'api-call' | 'state-change' | 'error';
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

class ErrorTrackingService {
  private breadcrumbs: BreadcrumbData[] = [];
  private maxBreadcrumbs = 50;
  private initialized = false;
  /** DSN configured — Sentry chunk is loading or loaded; buffer until `sentry` is set. */
  private sentryEnabled = false;
  /** Loaded SDK module; null while the dynamic import is in flight. */
  private sentry: SentryModule | null = null;
  private userId: string | null = null;
  /**
   * Operations issued before the Sentry chunk resolved, replayed in original
   * order on load (single bounded queue — setUser/capture/etc. all share it).
   */
  private pendingOps: Array<(sentry: SentryModule) => void> = [];

  /**
   * Initialize error tracking service.
   * Sentry is activated only when VITE_SENTRY_DSN is set (no-op otherwise).
   */
  init(config?: { userId?: string; environment?: string }) {
    if (this.initialized) return;
    this.initialized = true;

    if (config?.userId) {
      this.userId = config.userId;
    }

    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return;

    this.sentryEnabled = true;
    const environment = config?.environment || import.meta.env.MODE || 'production';

    void import('@sentry/react')
      .then(Sentry => {
        Sentry.init({
          dsn,
          environment,
          // Do not attach IP/cookies/headers automatically, and scrub PII from every
          // event before it is sent (privacy — CWE-359).
          sendDefaultPii: false,
          beforeSend: scrubSentryEvent,
          // Sample 100% of errors, 20% of transactions in production
          tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
          // Only send errors in production/staging
          enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_FORCE_ENABLE === 'true',
          integrations: [Sentry.browserTracingIntegration()],
        });
        this.sentry = Sentry;
        this.flushPending();
      })
      .catch(err => {
        this.sentryEnabled = false;
        this.pendingOps = [];
        console.warn('[ErrorTracking] Failed to load Sentry SDK:', err);
      });
  }

  /** Run now if the SDK is loaded, else queue (bounded) for the load flush. */
  private enqueueOrRun(op: (sentry: SentryModule) => void): void {
    if (this.sentry) {
      op(this.sentry);
      return;
    }
    if (this.sentryEnabled && this.pendingOps.length < MAX_PENDING_EVENTS) {
      this.pendingOps.push(op);
    }
  }

  /** Replay everything captured while the SDK chunk was loading, in order. */
  private flushPending(): void {
    if (!this.sentry) return;

    // Breadcrumbs first so buffered exceptions carry their context
    for (const breadcrumb of this.breadcrumbs) {
      this.sentry.addBreadcrumb({
        category: breadcrumb.category,
        message: breadcrumb.message,
        level: breadcrumb.level as SentryTypes.SeverityLevel,
        data: breadcrumb.data,
      });
    }

    for (const op of this.pendingOps.splice(0)) {
      op(this.sentry);
    }
  }

  /**
   * Set user context for error tracking
   */
  setUser(userId: string, userData?: Record<string, unknown>) {
    this.userId = userId;
    this.enqueueOrRun(sentry => sentry.setUser({ id: userId, ...userData }));
  }

  /**
   * Clear user context (on logout)
   */
  clearUser() {
    this.userId = null;
    this.enqueueOrRun(sentry => sentry.setUser(null));
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error | unknown, context?: ErrorContext) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    if (import.meta.env.DEV) {
      console.error('[ErrorTracking] Exception captured:', {
        error: errorObj,
        message: errorObj.message,
        context,
      });
    }

    this.enqueueOrRun(sentry =>
      sentry.captureException(errorObj, {
        contexts: {
          custom: context as Record<string, unknown>,
        },
      }),
    );

    return errorObj;
  }

  /**
   * Capture a message (non-error log)
   */
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: ErrorContext,
  ) {
    this.enqueueOrRun(sentry =>
      sentry.captureMessage(message, {
        level: level as SentryTypes.SeverityLevel,
        contexts: {
          custom: context as Record<string, unknown>,
        },
      }),
    );
  }

  /**
   * Add breadcrumb for debugging context
   */
  addBreadcrumb(breadcrumb: BreadcrumbData) {
    this.breadcrumbs.push({
      ...breadcrumb,
      data: {
        ...breadcrumb.data,
        timestamp: new Date().toISOString(),
      },
    });

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }

    // Pre-load breadcrumbs aren't queued separately: the local ring buffer is
    // replayed into Sentry by flushPending() when the SDK resolves.
    if (this.sentry) {
      this.sentry.addBreadcrumb({
        category: breadcrumb.category,
        message: breadcrumb.message,
        level: breadcrumb.level as SentryTypes.SeverityLevel,
        data: breadcrumb.data,
      });
    }
  }

  /**
   * Get recent breadcrumbs for debugging
   */
  getBreadcrumbs(limit: number = 10): BreadcrumbData[] {
    return this.breadcrumbs.slice(-limit);
  }

  /**
   * Wrap an async function with error tracking
   */
  wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, context: ErrorContext): T {
    return (async (...args: unknown[]) => {
      try {
        this.addBreadcrumb({
          category: 'api-call',
          message: `Executing ${context.context || 'async operation'}`,
          level: 'info',
          data: { args: args.slice(0, 3) }, // Don't log all args for privacy
        });

        const result = await fn(...args);
        return result;
      } catch (error) {
        this.captureException(error, context);
        throw error;
      }
    }) as T;
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();

// Auto-initialize. Wrapped so a Sentry/provider init failure can never throw at
// module-evaluation time — that would reject the lazy App chunk import and black-
// screen the app before any error boundary mounts. App.tsx also calls init() on
// mount, so a failure here is non-fatal.
try {
  errorTracking.init({
    environment: import.meta.env.MODE || 'development',
  });
} catch (err) {
  console.warn('[errorTracking] Deferred init after module-load failure:', err);
}
