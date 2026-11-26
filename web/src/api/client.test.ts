import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { seedMockSession } from "@/mocks/state";
import {
  ApiClientError,
  apiRequest,
  configureApiInterceptors,
  getCsrfToken,
} from "./client";
import { authApi, meApi } from "./endpoints";

describe("apiRequest & endpoints", () => {
  it("stores csrfToken strictly in memory after GET /session and attaches X-CSRF-Token on mutating requests", async () => {
    seedMockSession("xiaoming", { csrfToken: "csrf_secret_in_mem" });

    const session = await authApi.getSession();
    expect(session.csrfToken).toBe("csrf_secret_in_mem");
    expect(getCsrfToken()).toBe("csrf_secret_in_mem");

    // 确认未向持久化存储泄漏任何敏感凭据
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    const updated = await meApi.updateProfile({ nickname: "大明" });
    expect(updated.nickname).toBe("大明");

    await authApi.logout();
    expect(getCsrfToken()).toBeNull();
  });

  it("throws ApiClientError with csrf_check_failed when mutating request lacks valid CSRF token", async () => {
    seedMockSession("xiaoming", { csrfToken: "csrf_expected" });
    // 故意不先调 getSession 同步 csrfToken
    await expect(
      meApi.updateProfile({ nickname: "黑客" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "csrf_check_failed",
    });
  });

  it("parses 429 rate_limited and Retry-After header seconds", async () => {
    server.use(
      http.post("/api/v1/auth/login", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Too Many Requests",
            status: 429,
            code: "rate_limited",
            detail: "请求太频繁，请稍后再试",
          },
          {
            status: 429,
            headers: {
              "Content-Type": "application/problem+json",
              "Retry-After": "45",
            },
          },
        ),
      ),
    );

    try {
      await authApi.login({ identifier: "admin", password: "wrong" });
      expect.unreachable("should have thrown ApiClientError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe("rate_limited");
      expect(apiErr.retryAfterSeconds).toBe(45);
    }
  });

  it("clears memory csrfToken and triggers onAuthenticationRequired on 401 authentication_required", async () => {
    const onAuthRequired = vi.fn();
    configureApiInterceptors({ onAuthenticationRequired: onAuthRequired });

    await expect(apiRequest("/me")).rejects.toMatchObject({
      status: 401,
      code: "authentication_required",
    });
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(getCsrfToken()).toBeNull();
  });

  it("triggers onSudoRequired on 403 reauthentication_required and retries request once after Sudo succeeds", async () => {
    seedMockSession("admin", { sudoActive: false });
    await authApi.getSession();

    const onSudoRequired = vi.fn(async () => {
      await authApi.verifySudo({ method: "totp", code: "123456" });
      return true;
    });
    configureApiInterceptors({ onSudoRequired });

    const res = await meApi.regenerateRecoveryCodes();
    expect(onSudoRequired).toHaveBeenCalledTimes(1);
    expect(res.recoveryCodes.length).toBeGreaterThan(0);
  });

  it("does not retry when user cancels Sudo verification (onSudoRequired returns false)", async () => {
    seedMockSession("admin", { sudoActive: false });
    await authApi.getSession();

    const onSudoRequired = vi.fn(async () => false);
    configureApiInterceptors({ onSudoRequired });

    await expect(meApi.regenerateRecoveryCodes()).rejects.toMatchObject({
      status: 403,
      code: "reauthentication_required",
    });
    expect(onSudoRequired).toHaveBeenCalledTimes(1);
  });

  it("triggers onMfaRequired when legacy user without MFA calls Sudo-protected endpoint", async () => {
    seedMockSession("xiaoming");
    await authApi.getSession();

    const onMfaRequired = vi.fn();
    configureApiInterceptors({ onMfaRequired });

    await expect(meApi.regenerateRecoveryCodes()).rejects.toMatchObject({
      status: 403,
      code: "mfa_required",
    });
    expect(onMfaRequired).toHaveBeenCalledTimes(1);
  });
});
