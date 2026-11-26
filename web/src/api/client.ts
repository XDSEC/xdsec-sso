import type { ApiErrorCode, ProblemDetails } from "./types";

const API_BASE_PREFIX = "/api/v1";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF Token 仅保存在模块内存变量中，严禁写入 localStorage / sessionStorage / Cookie。
 */
let csrfTokenInMemory: string | null = null;

export function getCsrfToken(): string | null {
  return csrfTokenInMemory;
}

export function setCsrfToken(token: string | null): void {
  csrfTokenInMemory = token;
}

export function clearCsrfToken(): void {
  csrfTokenInMemory = null;
}

/**
 * 全局认证与 Sudo 拦截回调，由顶层 Provider 注册
 */
export interface ApiClientInterceptors {
  /** 遇到 401 authentication_required 时触发（清理会话并跳登录） */
  onAuthenticationRequired?: () => void;
  /**
   * 遇到 403 reauthentication_required 时触发（唤起全局 Sudo 验证弹窗）：
   * - 返回 true 表示用户已完成 Sudo 验证，客户端将自动重发一次原请求；
   * - 返回 false 表示用户取消验证，客户端原样抛出 ApiClientError。
   */
  onSudoRequired?: () => Promise<boolean>;
  /** 遇到 403 mfa_required 时触发（引导未绑 MFA 的老成员前往补绑） */
  onMfaRequired?: () => void;
}

let interceptors: ApiClientInterceptors = {};

export function configureApiInterceptors(next: ApiClientInterceptors): void {
  interceptors = next;
}

export function resetApiInterceptors(): void {
  interceptors = {};
}

export interface ApiClientErrorInit {
  status: number;
  code: ApiErrorCode;
  title: string;
  detail: string;
  retryAfterSeconds?: number | null;
}

/**
 * 统一封装的接口错误对象（对齐 RFC 9457 ProblemDetails 与 429 Retry-After）
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiClientErrorInit) {
    super(init.detail);
    this.name = "ApiClientError";
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const parsed = Number.parseInt(headerValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function isProblemDetails(payload: unknown): payload is ProblemDetails {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.detail === "string";
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** 针对登录前无需会话或特殊不触发拦截器的请求可关闭自动拦截 */
  skipAuthInterceptors?: boolean;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${API_BASE_PREFIX}${normalizedPath}`;
  if (!query) {
    return fullPath;
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `${fullPath}?${qs}` : fullPath;
}

async function executeRequest<T>(
  path: string,
  options: ApiRequestOptions,
  allowSudoRetry: boolean,
): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({
    Accept: "application/json, application/problem+json",
  });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  // 所有写请求在内存中持有 csrfToken 时自动注入 X-CSRF-Token
  if (MUTATING_METHODS.has(method) && csrfTokenInMemory) {
    headers.set("X-CSRF-Token", csrfTokenInMemory);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: "same-origin",
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: "network_error",
      title: "Network Error",
      detail: "网络连接异常，请检查网络后重试",
    });
  }

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("Retry-After"),
  );

  let parsedBody: unknown = null;
  try {
    const rawText = await response.text();
    if (rawText) {
      parsedBody = JSON.parse(rawText) as unknown;
    }
  } catch {
    parsedBody = null;
  }

  const error = isProblemDetails(parsedBody)
    ? new ApiClientError({
        status: parsedBody.status || response.status,
        code: parsedBody.code,
        title: parsedBody.title || response.statusText || "Request Failed",
        detail: parsedBody.detail,
        retryAfterSeconds,
      })
    : new ApiClientError({
        status: response.status,
        code: "unexpected_error",
        title: response.statusText || "Unexpected Error",
        detail: `请求失败（HTTP ${response.status}），请稍后重试`,
        retryAfterSeconds,
      });

  if (!options.skipAuthInterceptors) {
    if (error.status === 401 && error.code === "authentication_required") {
      clearCsrfToken();
      interceptors.onAuthenticationRequired?.();
    } else if (
      error.status === 403 &&
      error.code === "reauthentication_required" &&
      allowSudoRetry &&
      interceptors.onSudoRequired
    ) {
      const sudoVerified = await interceptors.onSudoRequired();
      if (sudoVerified) {
        return executeRequest<T>(path, options, false);
      }
    } else if (error.status === 403 && error.code === "mfa_required") {
      interceptors.onMfaRequired?.();
    }
  }

  throw error;
}

/**
 * 唯一后端接口请求入口（业务层禁止直接调用原生 fetch）
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return executeRequest<T>(path, options, true);
}
