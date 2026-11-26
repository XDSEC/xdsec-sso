import { describe, expect, it, vi } from "vitest";
import { redirectAfterAuth, sanitizeReturnTo } from "./return-to";

const ORIGIN = "https://account.xdsec.org";

describe("sanitizeReturnTo", () => {
  it("allows valid same-origin backend callback and frontend paths", () => {
    expect(
      sanitizeReturnTo(
        "/authorize?client_id=flarum&redirect_uri=https%3A%2F%2Fbbs.xdsec.org%2Fcallback&state=abc",
        ORIGIN,
      ),
    ).toBe(
      "/authorize?client_id=flarum&redirect_uri=https%3A%2F%2Fbbs.xdsec.org%2Fcallback&state=abc",
    );

    expect(
      sanitizeReturnTo("/api/v1/legacy/weekly/callback?next=%2F", ORIGIN),
    ).toBe("/api/v1/legacy/weekly/callback?next=%2F");

    expect(sanitizeReturnTo("/settings?tab=mfa#totp", ORIGIN)).toBe(
      "/settings?tab=mfa#totp",
    );
    expect(sanitizeReturnTo("/", ORIGIN)).toBe("/");
  });

  it("rejects empty, nullish, or whitespace inputs", () => {
    expect(sanitizeReturnTo(null, ORIGIN)).toBeNull();
    expect(sanitizeReturnTo(undefined, ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("   ", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo(" /settings", ORIGIN)).toBeNull();
  });

  it("rejects absolute URLs and dangerous schemes (XSS / Open Redirect)", () => {
    expect(sanitizeReturnTo("https://evil.com", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("http://evil.com/phish", ORIGIN)).toBeNull();
    expect(
      sanitizeReturnTo("https://account.xdsec.org/settings", ORIGIN),
    ).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(
      sanitizeReturnTo("data:text/html,<script>alert(1)</script>", ORIGIN),
    ).toBeNull();
  });

  it("rejects protocol-relative and backslash bypass tricks", () => {
    expect(sanitizeReturnTo("//evil.com", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("///evil.com", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("/\\evil.com", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("/foo\\bar", ORIGIN)).toBeNull();
  });

  it("rejects /login paths to prevent infinite redirect loops", () => {
    expect(sanitizeReturnTo("/login", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("/login?returnTo=%2Fsettings", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("/login/", ORIGIN)).toBeNull();
    expect(sanitizeReturnTo("/login/mfa", ORIGIN)).toBeNull();
  });
});

describe("redirectAfterAuth", () => {
  it("calls full-page location.assign when returnTo is valid", () => {
    const fallback = vi.fn();
    const assign = vi.fn();

    redirectAfterAuth("/authorize?client_id=weekly", fallback, assign);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/authorize?client_id=weekly");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to SPA navigation when returnTo is missing or unsafe", () => {
    const fallback = vi.fn();
    const assign = vi.fn();

    redirectAfterAuth("//evil.com", fallback, assign);
    expect(assign).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
