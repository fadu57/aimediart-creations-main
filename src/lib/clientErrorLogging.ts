import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { getOrCreateVisitorUuid, getVisitorLocaleMetadata } from "@/lib/visitorIdentity";

export type ErrorLogAudience = "visitor" | "organizer";

export type ClientErrorSource =
  | "window.error"
  | "unhandledrejection"
  | "react.error_boundary"
  | "toast.error"
  | "qr.invalid"
  | "qr.unreadable"
  | "qr.camera"
  | "qr.scanner_unavailable"
  | "qr.torch"
  | "visitor.app"
  | "organizer.app";

type LogPayload = {
  audience: ErrorLogAudience;
  action: "session_start" | "session_end" | "error";
  session_id: string;
  visitor_client_id?: string | null;
  auth_user_id?: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
  error_message?: string;
  error_stack?: string | null;
  error_source?: string;
  page_url?: string;
  user_agent?: string;
  locale?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown>;
};

type CaptureOptions = {
  authUserId?: string | null;
  agencyId?: string | null;
};

type AudienceConfig = {
  audience: ErrorLogAudience;
  sessionKey: string;
  endedKey: string;
  reportedKey: string;
  handlersFlag: "visitor" | "organizer";
  toastHookFlag: "visitor" | "organizer";
};

const AUDIENCE_CONFIG: Record<ErrorLogAudience, AudienceConfig> = {
  visitor: {
    audience: "visitor",
    sessionKey: "aimediart_visitor_error_session_id",
    endedKey: "aimediart_visitor_error_session_ended",
    reportedKey: "aimediart_visitor_error_session_reported",
    handlersFlag: "visitor",
    toastHookFlag: "visitor",
  },
  organizer: {
    audience: "organizer",
    sessionKey: "aimediart_organizer_error_session_id",
    endedKey: "aimediart_organizer_error_session_ended",
    reportedKey: "aimediart_organizer_error_session_reported",
    handlersFlag: "organizer",
    toastHookFlag: "organizer",
  },
};

let visitorHandlersInstalled = false;
let organizerHandlersInstalled = false;
let globalToastHookInstalled = false;
const activeToastAudiences = new Set<ErrorLogAudience>();
const originalToastError = toast.error.bind(toast);
/** Désactivé après échec réseau (fonction non déployée, CORS, etc.). */
let remoteLoggingAvailable: boolean | null = null;
let lastErrorFingerprint = "";
let lastErrorAt = 0;

function cfg(audience: ErrorLogAudience): AudienceConfig {
  return AUDIENCE_CONFIG[audience];
}

function readSessionId(audience: ErrorLogAudience): string | null {
  if (typeof window === "undefined") return null;
  const id = window.sessionStorage.getItem(cfg(audience).sessionKey)?.trim();
  return id || null;
}

function writeSessionId(audience: ErrorLogAudience, id: string): void {
  const c = cfg(audience);
  window.sessionStorage.setItem(c.sessionKey, id);
  window.sessionStorage.removeItem(c.endedKey);
  window.sessionStorage.removeItem(c.reportedKey);
}

function markSessionEnded(audience: ErrorLogAudience): void {
  const c = cfg(audience);
  window.sessionStorage.setItem(c.endedKey, "1");
  window.sessionStorage.removeItem(c.reportedKey);
}

function isSessionMarkedEnded(audience: ErrorLogAudience): boolean {
  return window.sessionStorage.getItem(cfg(audience).endedKey) === "1";
}

function isSessionReported(audience: ErrorLogAudience, sessionId: string): boolean {
  return window.sessionStorage.getItem(cfg(audience).reportedKey) === sessionId;
}

function markSessionReported(audience: ErrorLogAudience, sessionId: string): void {
  window.sessionStorage.setItem(cfg(audience).reportedKey, sessionId);
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function currentPageUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function readExpoIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("expo_id")?.trim() || null;
}

function isClientErrorLoggingEnabled(): boolean {
  const flag = import.meta.env.VITE_CLIENT_ERROR_LOGGING as string | undefined;
  if (flag === "0" || flag === "false") return false;
  return remoteLoggingAvailable !== false;
}

async function postLog(payload: LogPayload, preferKeepalive = false): Promise<void> {
  if (!isClientErrorLoggingEnabled()) return;

  if (preferKeepalive && typeof fetch !== "undefined") {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (supabaseUrl && anonKey) {
      const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/log-client-error`;
      void fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        remoteLoggingAvailable = false;
      });
      return;
    }
  }

  try {
    const { error } = await supabase.functions.invoke("log-client-error", { body: payload });
    if (error) {
      remoteLoggingAvailable = false;
      if (import.meta.env.DEV) {
        console.warn("[clientErrorLogging] journalisation désactivée (Edge Function indisponible).");
      }
    } else {
      remoteLoggingAvailable = true;
    }
  } catch {
    remoteLoggingAvailable = false;
  }
}

function normalizeUnknownError(reason: unknown): { message: string; stack: string | null } {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name || "Error", stack: reason.stack ?? null };
  }
  if (typeof reason === "string") return { message: reason, stack: null };
  try {
    return { message: JSON.stringify(reason), stack: null };
  } catch {
    return { message: String(reason), stack: null };
  }
}

function shouldSkipDuplicate(message: string, source: string): boolean {
  const fp = `${source}::${message.slice(0, 200)}`;
  const now = Date.now();
  if (fp === lastErrorFingerprint && now - lastErrorAt < 3000) return true;
  lastErrorFingerprint = fp;
  lastErrorAt = now;
  return false;
}

function resolveClientId(audience: ErrorLogAudience): string | null {
  if (audience === "visitor") return getOrCreateVisitorUuid();
  return null;
}

function defaultAppSource(audience: ErrorLogAudience): ClientErrorSource {
  return audience === "visitor" ? "visitor.app" : "organizer.app";
}

export async function ensureClientErrorSession(
  audience: ErrorLogAudience,
  options?: CaptureOptions & { forceNew?: boolean },
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  if (options?.forceNew || isSessionMarkedEnded(audience)) {
    writeSessionId(audience, createSessionId());
  }

  let sessionId = readSessionId(audience);
  if (!sessionId) {
    sessionId = createSessionId();
    writeSessionId(audience, sessionId);
  }

  if (isSessionReported(audience, sessionId)) {
    return sessionId;
  }

  const { language, timezone } = getVisitorLocaleMetadata();
  void postLog({
    audience,
    action: "session_start",
    session_id: sessionId,
    visitor_client_id: resolveClientId(audience),
    auth_user_id: options?.authUserId ?? null,
    agency_id: options?.agencyId ?? null,
    expo_id: readExpoIdFromUrl(),
    page_url: currentPageUrl(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    locale: language,
    timezone,
  });
  markSessionReported(audience, sessionId);

  return sessionId;
}

export async function endClientErrorSession(
  audience: ErrorLogAudience,
  preferKeepalive = false,
): Promise<void> {
  const sessionId = readSessionId(audience);
  if (!sessionId || isSessionMarkedEnded(audience)) return;

  markSessionEnded(audience);
  void postLog(
    {
      audience,
      action: "session_end",
      session_id: sessionId,
      visitor_client_id: resolveClientId(audience),
      auth_user_id: null,
      page_url: currentPageUrl(),
    },
    preferKeepalive,
  );
}

export async function logClientError(
  audience: ErrorLogAudience,
  input: {
    message: string;
    stack?: string | null;
    source: ClientErrorSource;
    authUserId?: string | null;
    agencyId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const sessionId = await ensureClientErrorSession(audience, {
    authUserId: input.authUserId,
    agencyId: input.agencyId,
  });
  if (!sessionId) return;

  const message = input.message.trim();
  if (!message || shouldSkipDuplicate(message, input.source)) return;

  const { language, timezone } = getVisitorLocaleMetadata();
  void postLog({
    audience,
    action: "error",
    session_id: sessionId,
    visitor_client_id: resolveClientId(audience),
    auth_user_id: input.authUserId ?? null,
    agency_id: input.agencyId ?? null,
    expo_id: readExpoIdFromUrl(),
    error_message: message,
    error_stack: input.stack ?? null,
    error_source: input.source,
    page_url: currentPageUrl(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    locale: language,
    timezone,
    metadata: input.metadata,
  });
}

export function reportClientError(
  audience: ErrorLogAudience,
  input: {
    message: string;
    source?: ClientErrorSource;
    stack?: string | null;
    authUserId?: string | null;
    agencyId?: string | null;
    metadata?: Record<string, unknown>;
  },
): void {
  void logClientError(audience, {
    message: input.message,
    source: input.source ?? defaultAppSource(audience),
    stack: input.stack,
    authUserId: input.authUserId,
    agencyId: input.agencyId,
    metadata: input.metadata,
  });
}

function toastMessageToString(message: unknown): string {
  if (typeof message === "string") return message.trim();
  if (message instanceof Error) return message.message.trim();
  if (message == null) return "Erreur";
  return String(message).trim();
}

function syncGlobalToastHook(): void {
  if (activeToastAudiences.size === 0) {
    if (globalToastHookInstalled) {
      toast.error = originalToastError as typeof toast.error;
      globalToastHookInstalled = false;
    }
    return;
  }

  if (globalToastHookInstalled) return;

  toast.error = ((message: unknown, data?: unknown) => {
    const msg = toastMessageToString(message);
    if (msg) {
      for (const audience of activeToastAudiences) {
        reportClientError(audience, {
          message: msg,
          source: "toast.error",
          metadata: typeof data === "object" && data ? (data as Record<string, unknown>) : undefined,
        });
      }
    }
    return originalToastError(message as Parameters<typeof toast.error>[0], data as Parameters<typeof toast.error>[1]);
  }) as typeof toast.error;
  globalToastHookInstalled = true;
}

function installToastErrorCapture(audience: ErrorLogAudience): void {
  activeToastAudiences.add(audience);
  syncGlobalToastHook();
}

function uninstallToastErrorCapture(audience: ErrorLogAudience): void {
  activeToastAudiences.delete(audience);
  syncGlobalToastHook();
}

export function installClientErrorLogCapture(
  audience: ErrorLogAudience,
  options: CaptureOptions,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const c = cfg(audience);
  if (c.handlersFlag === "visitor" && visitorHandlersInstalled) return () => undefined;
  if (c.handlersFlag === "organizer" && organizerHandlersInstalled) return () => undefined;

  if (c.handlersFlag === "visitor") visitorHandlersInstalled = true;
  else organizerHandlersInstalled = true;

  void ensureClientErrorSession(audience, options);
  installToastErrorCapture(audience);

  const onWindowError = (event: ErrorEvent) => {
    const message = event.message?.trim() || "Erreur JavaScript";
    const stack = event.error instanceof Error ? event.error.stack ?? null : null;
    void logClientError(audience, {
      message,
      stack,
      source: "window.error",
      authUserId: options.authUserId,
      agencyId: options.agencyId,
      metadata: {
        filename: event.filename || null,
        lineno: event.lineno ?? null,
        colno: event.colno ?? null,
      },
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const normalized = normalizeUnknownError(event.reason);
    void logClientError(audience, {
      message: normalized.message,
      stack: normalized.stack,
      source: "unhandledrejection",
      authUserId: options.authUserId,
      agencyId: options.agencyId,
    });
  };

  const onPageHide = () => {
    void endClientErrorSession(audience, true);
  };

  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("pagehide", onPageHide);

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      void endClientErrorSession(audience, true);
    }
    if (event === "SIGNED_IN") {
      void ensureClientErrorSession(audience, {
        authUserId: session?.user?.id ?? null,
        agencyId: options.agencyId ?? null,
        forceNew: true,
      });
    }
  });

  return () => {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("pagehide", onPageHide);
    authListener.subscription.unsubscribe();
    uninstallToastErrorCapture(audience);
    if (c.handlersFlag === "visitor") visitorHandlersInstalled = false;
    else organizerHandlersInstalled = false;
  };
}

// --- Raccourcis visiteur (compatibilité) ---

export type VisitorErrorSource = Extract<
  ClientErrorSource,
  | "window.error"
  | "unhandledrejection"
  | "react.error_boundary"
  | "toast.error"
  | "qr.invalid"
  | "qr.unreadable"
  | "qr.camera"
  | "qr.scanner_unavailable"
  | "qr.torch"
  | "visitor.app"
>;

export { isVisitorFacingPath, isOrganizerFacingPath } from "@/lib/clientErrorPaths";

export async function ensureVisitorErrorSession(options?: CaptureOptions & { forceNew?: boolean }) {
  return ensureClientErrorSession("visitor", options);
}

export async function endVisitorErrorSession(preferKeepalive = false) {
  return endClientErrorSession("visitor", preferKeepalive);
}

export async function logVisitorClientError(input: {
  message: string;
  stack?: string | null;
  source: VisitorErrorSource;
  authUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return logClientError("visitor", input);
}

export function reportVisitorError(input: {
  message: string;
  source: VisitorErrorSource;
  stack?: string | null;
  authUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  reportClientError("visitor", input);
}

export function installVisitorErrorLogCapture(options: CaptureOptions) {
  return installClientErrorLogCapture("visitor", options);
}

// --- Raccourcis organisateur ---

export function reportOrganizerError(input: {
  message: string;
  source?: ClientErrorSource;
  stack?: string | null;
  authUserId?: string | null;
  agencyId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  reportClientError("organizer", input);
}

export function installOrganizerErrorLogCapture(options: CaptureOptions) {
  return installClientErrorLogCapture("organizer", options);
}

export async function endOrganizerErrorSession(preferKeepalive = false) {
  return endClientErrorSession("organizer", preferKeepalive);
}
