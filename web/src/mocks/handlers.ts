import { HttpResponse, http } from "msw";
import type {
  ActivationSetPasswordRequest,
  ActivationTotpSetupRequest,
  ActivationTotpVerifyRequest,
  AdminCreateUserRequest,
  AdminSuspendUserRequest,
  ApiErrorCode,
  ChangePasswordRequest,
  LoginMfaRequest,
  LoginRequest,
  MeTotpSetupRequest,
  MeTotpVerifyRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequestPayload,
  ProblemDetails,
  SudoRequest,
  UpdateProfileRequest,
  User,
  UserStatus,
} from "@/api/types";
import { getMockDb, MOCK_VALID_TOTP_CODE, type MockUserAccount } from "./state";

function problem(
  status: number,
  code: ApiErrorCode,
  title: string,
  detail: string,
  extraHeaders?: Record<string, string>,
) {
  const body: ProblemDetails = {
    type: "about:blank",
    title,
    status,
    code,
    detail,
  };
  return HttpResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      ...extraHeaders,
    },
  });
}

function generateSampleRecoveryCodes(): string[] {
  return [
    "a1b2c-3d4e5",
    "f6g7h-8j9k0",
    "m2n3p-4q5r6",
    "s7t8u-9v0w1",
    "x2y3z-4a5b6",
    "c7d8e-9f0g1",
    "h2j3k-4m5n6",
    "p7q8r-9s0t1",
  ];
}

function createSessionForUser(userId: string) {
  const db = getMockDb();
  db.currentSession = {
    userId,
    csrfToken: `csrf_${crypto.randomUUID().slice(0, 12)}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    sudoExpiresAt: null,
  };
}

function verifyAuthenticated(
  request: Request,
  options: {
    requireCsrf?: boolean;
    requireSudo?: boolean;
    requireAdmin?: boolean;
  } = {},
): { account: MockUserAccount } | { errorResponse: Response } {
  const db = getMockDb();
  const session = db.currentSession;
  if (!session) {
    return {
      errorResponse: problem(
        401,
        "authentication_required",
        "Unauthorized",
        "登录已过期或尚未登录，请重新登录",
      ),
    };
  }

  const account = db.users.get(session.userId);
  if (account?.user.status !== "active") {
    db.currentSession = null;
    return {
      errorResponse: problem(
        401,
        "authentication_required",
        "Unauthorized",
        "当前会话已失效，请重新登录",
      ),
    };
  }

  if (options.requireCsrf) {
    const csrfHeader = request.headers.get("X-CSRF-Token");
    if (!csrfHeader || csrfHeader !== session.csrfToken) {
      return {
        errorResponse: problem(
          403,
          "csrf_check_failed",
          "Forbidden",
          "CSRF 校验未通过，请刷新页面后重试",
        ),
      };
    }
  }

  if (options.requireAdmin && account.user.role !== "admin") {
    return {
      errorResponse: problem(
        403,
        "forbidden",
        "Forbidden",
        "无访问管理员接口的权限",
      ),
    };
  }

  if (options.requireSudo) {
    if (account.user.mfaMethods.length === 0) {
      return {
        errorResponse: problem(
          403,
          "mfa_required",
          "MFA Required",
          "当前账号尚未绑定任何 MFA，请先完成绑定后再执行敏感操作",
        ),
      };
    }
    const now = Date.now();
    if (!session.sudoExpiresAt || session.sudoExpiresAt <= now) {
      session.sudoExpiresAt = null;
      return {
        errorResponse: problem(
          403,
          "reauthentication_required",
          "Reauthentication Required",
          "执行敏感操作前需重新验证身份",
        ),
      };
    }
  }

  return { account };
}

function verifySecondFactorCode(
  account: MockUserAccount,
  method: "totp" | "recoveryCode",
  code: string,
): boolean {
  if (method === "totp") {
    return Boolean(account.totpSecret) && code.trim() === MOCK_VALID_TOTP_CODE;
  }
  const normalized = code.trim();
  if (account.recoveryCodes.has(normalized)) {
    account.recoveryCodes.delete(normalized);
    return true;
  }
  return false;
}

export const handlers = [
  // ─── 3.1 登录与会话 ─────────────────────────────────────────────────
  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = (await request.json()) as LoginRequest;
    const identifier = body.identifier?.trim().toLowerCase();
    const db = getMockDb();

    const account = Array.from(db.users.values()).find(
      (item) =>
        item.user.username === identifier || item.user.email === identifier,
    );

    if (
      account?.user.status !== "active" ||
      account.password !== body.password
    ) {
      return problem(
        401,
        "invalid_credentials",
        "Unauthorized",
        "账号或密码错误，或当前账号无法登录",
      );
    }

    if (account.user.mfaMethods.length === 0) {
      createSessionForUser(account.user.id);
      return HttpResponse.json(
        { status: "authenticated" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const challengeId = `chg_${crypto.randomUUID().slice(0, 12)}`;
    db.loginChallenges.set(challengeId, {
      userId: account.user.id,
      expiresAt: Date.now() + 300 * 1000,
    });

    return HttpResponse.json(
      {
        status: "mfaRequired",
        challengeId,
        methods: ["totp", "recoveryCode"],
        expiresIn: 300,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  http.post("/api/v1/auth/login/mfa", async ({ request }) => {
    const body = (await request.json()) as LoginMfaRequest;
    const db = getMockDb();
    const challenge = db.loginChallenges.get(body.challengeId);

    if (!challenge || challenge.expiresAt <= Date.now()) {
      db.loginChallenges.delete(body.challengeId);
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "验证会话已过期或无效，请重新登录",
      );
    }

    const account = db.users.get(challenge.userId);
    if (account?.user.status !== "active") {
      db.loginChallenges.delete(body.challengeId);
      return problem(
        401,
        "invalid_credentials",
        "Unauthorized",
        "账号无法登录",
      );
    }

    if (!verifySecondFactorCode(account, body.method, body.code)) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "动态验证码或恢复码不正确",
      );
    }

    db.loginChallenges.delete(body.challengeId);
    createSessionForUser(account.user.id);
    return HttpResponse.json(
      { status: "authenticated" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  http.get("/api/v1/session", ({ request }) => {
    const check = verifyAuthenticated(request);
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const session = getMockDb().currentSession;
    if (!session) {
      return problem(
        401,
        "authentication_required",
        "Unauthorized",
        "尚未登录",
      );
    }
    const sudoActive =
      session.sudoExpiresAt && session.sudoExpiresAt > Date.now()
        ? new Date(session.sudoExpiresAt).toISOString()
        : null;

    return HttpResponse.json(
      {
        user: check.account.user,
        expiresAt: session.expiresAt,
        sudoExpiresAt: sudoActive,
        csrfToken: session.csrfToken,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  http.post("/api/v1/auth/logout", ({ request }) => {
    const check = verifyAuthenticated(request, { requireCsrf: true });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    getMockDb().currentSession = null;
    return new HttpResponse(null, { status: 204 });
  }),

  // ─── 3.2 Sudo 敏感操作认证 ──────────────────────────────────────────
  http.post("/api/v1/auth/sudo", async ({ request }) => {
    const check = verifyAuthenticated(request, { requireCsrf: true });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    if (check.account.user.mfaMethods.length === 0) {
      return problem(
        403,
        "mfa_required",
        "MFA Required",
        "尚未绑定任何 MFA，无法开启 Sudo 模式",
      );
    }
    const body = (await request.json()) as SudoRequest;
    if (!verifySecondFactorCode(check.account, body.method, body.code)) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "验证码或恢复码不正确",
      );
    }
    const sudoExpiresAtMs = Date.now() + 5 * 60 * 1000;
    const session = getMockDb().currentSession;
    if (session) {
      session.sudoExpiresAt = sudoExpiresAtMs;
    }
    return HttpResponse.json({
      sudoExpiresAt: new Date(sudoExpiresAtMs).toISOString(),
    });
  }),

  // ─── 4.1 新成员激活与密码找回 ───────────────────────────────────────
  http.post("/api/v1/auth/activations/password", async ({ request }) => {
    const body = (await request.json()) as ActivationSetPasswordRequest;
    const db = getMockDb();
    const userId = db.activationMailTokens.get(body.token);
    if (!userId) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "激活链接无效、已过期或已使用",
      );
    }
    const account = db.users.get(userId);
    if (account?.user.status !== "pendingActivation") {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "当前账号状态不可激活",
      );
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return problem(
        400,
        "invalid_request",
        "Bad Request",
        "密码长度至少需要 8 位",
      );
    }
    const activationToken = `act_chg_${crypto.randomUUID().slice(0, 12)}`;
    db.activationChallenges.set(activationToken, {
      userId,
      mailToken: body.token,
      password: body.newPassword,
      pendingTotpSecret: null,
      expiresAt: Date.now() + 1800 * 1000,
    });
    return HttpResponse.json({
      activationToken,
      expiresIn: 1800,
    });
  }),

  http.post("/api/v1/auth/activations/totp/setup", async ({ request }) => {
    const body = (await request.json()) as ActivationTotpSetupRequest;
    const db = getMockDb();
    const record = db.activationChallenges.get(body.activationToken);
    if (!record || record.expiresAt <= Date.now()) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "激活会话已过期，请重新点击邮件链接开始",
      );
    }
    const account = db.users.get(record.userId);
    if (account?.user.status !== "pendingActivation") {
      return problem(400, "invalid_challenge", "Bad Request", "激活状态无效");
    }
    const secret = "JBSWY3DPEHPK3PXP";
    record.pendingTotpSecret = secret;
    return HttpResponse.json({
      secret,
      otpauthUri: `otpauth://totp/XDSEC:${account.user.username}?secret=${secret}&issuer=XDSEC&algorithm=SHA1&digits=6&period=30`,
    });
  }),

  http.post("/api/v1/auth/activations/totp/verify", async ({ request }) => {
    const body = (await request.json()) as ActivationTotpVerifyRequest;
    const db = getMockDb();
    const record = db.activationChallenges.get(body.activationToken);
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      !record.pendingTotpSecret
    ) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "激活挑战无效或已过期",
      );
    }
    if (body.code.trim() !== MOCK_VALID_TOTP_CODE) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "6 位动态验证码不正确",
      );
    }
    const account = db.users.get(record.userId);
    if (
      account?.user.status !== "pendingActivation" ||
      !db.activationMailTokens.has(record.mailToken)
    ) {
      return problem(400, "invalid_challenge", "Bad Request", "激活链接已失效");
    }

    const recoveryCodes = generateSampleRecoveryCodes();
    db.activationMailTokens.delete(record.mailToken);
    db.activationChallenges.delete(body.activationToken);
    account.password = record.password;
    account.totpSecret = record.pendingTotpSecret;
    account.recoveryCodes = new Set(recoveryCodes);
    account.user = {
      ...account.user,
      emailVerified: true,
      status: "active",
      mfaMethods: ["totp"],
    };
    account.previousStatusBeforeSuspension = "active";

    createSessionForUser(account.user.id);
    return HttpResponse.json(
      { recoveryCodes },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  http.post("/api/v1/auth/password-reset-requests", async ({ request }) => {
    const body = (await request.json()) as PasswordResetRequestPayload;
    if (!body.email?.includes("@")) {
      return problem(
        400,
        "invalid_request",
        "Bad Request",
        "请输入有效的邮箱地址",
      );
    }
    return HttpResponse.json({ status: "accepted" }, { status: 202 });
  }),

  http.post("/api/v1/auth/password-resets", async ({ request }) => {
    const body = (await request.json()) as PasswordResetConfirmRequest;
    const db = getMockDb();
    const userId = db.resetMailTokens.get(body.token);
    if (!userId) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "重置链接无效、已过期或已使用",
      );
    }
    const account = db.users.get(userId);
    if (account?.user.status !== "active") {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "当前账号不可重置密码",
      );
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return problem(
        400,
        "invalid_request",
        "Bad Request",
        "密码长度至少需要 8 位",
      );
    }
    db.resetMailTokens.delete(body.token);
    account.password = body.newPassword;
    if (db.currentSession?.userId === userId) {
      db.currentSession = null;
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // ─── 4.2 个人中心与 MFA 管理 ────────────────────────────────────────
  http.get("/api/v1/me", ({ request }) => {
    const check = verifyAuthenticated(request);
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    return HttpResponse.json(check.account.user, {
      headers: { "Cache-Control": "no-store" },
    });
  }),

  http.patch("/api/v1/me", async ({ request }) => {
    const check = verifyAuthenticated(request, { requireCsrf: true });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const body = (await request.json()) as UpdateProfileRequest;
    const nickname = body.nickname?.trim();
    if (!nickname) {
      return problem(400, "invalid_request", "Bad Request", "昵称不能为空");
    }
    check.account.user = { ...check.account.user, nickname };
    return HttpResponse.json(check.account.user);
  }),

  http.post("/api/v1/me/password-changes", async ({ request }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireSudo: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const body = (await request.json()) as ChangePasswordRequest;
    if (!body.newPassword || body.newPassword.length < 8) {
      return problem(
        400,
        "invalid_request",
        "Bad Request",
        "新密码长度至少需要 8 位",
      );
    }
    check.account.password = body.newPassword;
    getMockDb().currentSession = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/v1/me/mfa/totp/setup", async ({ request }) => {
    const baseCheck = verifyAuthenticated(request, { requireCsrf: true });
    if ("errorResponse" in baseCheck) {
      return baseCheck.errorResponse;
    }

    const { account } = baseCheck;
    if (account.user.mfaMethods.length === 0) {
      // 老成员首次补绑：不走 Sudo，必须当场验当前密码
      const body = (await request.json()) as MeTotpSetupRequest;
      if (!body.currentPassword) {
        return problem(
          400,
          "invalid_request",
          "Bad Request",
          "首次绑定 MFA 需输入当前登录密码",
        );
      }
      if (body.currentPassword !== account.password) {
        return problem(
          401,
          "invalid_credentials",
          "Unauthorized",
          "当前密码不正确",
        );
      }
    } else {
      const sudoCheck = verifyAuthenticated(request, {
        requireCsrf: true,
        requireSudo: true,
      });
      if ("errorResponse" in sudoCheck) {
        return sudoCheck.errorResponse;
      }
    }

    const secret = "NB2W45DFOIZA====";
    getMockDb().pendingMeTotpSecrets.set(account.user.id, secret);
    return HttpResponse.json({
      secret,
      otpauthUri: `otpauth://totp/XDSEC:${account.user.username}?secret=${secret}&issuer=XDSEC&algorithm=SHA1&digits=6&period=30`,
    });
  }),

  http.post("/api/v1/me/mfa/totp/verify", async ({ request }) => {
    const check = verifyAuthenticated(request, { requireCsrf: true });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const db = getMockDb();
    const pendingSecret = db.pendingMeTotpSecrets.get(check.account.user.id);
    if (!pendingSecret) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "绑定会话不存在或已过期，请重新发起绑定",
      );
    }
    const body = (await request.json()) as MeTotpVerifyRequest;
    if (body.code.trim() !== MOCK_VALID_TOTP_CODE) {
      return problem(
        400,
        "invalid_challenge",
        "Bad Request",
        "6 位动态验证码不正确",
      );
    }

    db.pendingMeTotpSecrets.delete(check.account.user.id);
    const wasZeroMfa = check.account.user.mfaMethods.length === 0;
    check.account.totpSecret = pendingSecret;
    if (!check.account.user.mfaMethods.includes("totp")) {
      check.account.user = {
        ...check.account.user,
        mfaMethods: [...check.account.user.mfaMethods, "totp"],
      };
    }

    if (wasZeroMfa) {
      const recoveryCodes = generateSampleRecoveryCodes();
      check.account.recoveryCodes = new Set(recoveryCodes);
      return HttpResponse.json({ recoveryCodes });
    }
    return HttpResponse.json({ recoveryCodes: null });
  }),

  http.delete("/api/v1/me/mfa/totp", ({ request }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireSudo: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    if (!check.account.user.mfaMethods.includes("totp")) {
      return problem(
        409,
        "invalid_user_state",
        "Conflict",
        "当前账号尚未绑定 TOTP",
      );
    }
    if (check.account.user.mfaMethods.length <= 1) {
      return problem(
        409,
        "invalid_user_state",
        "Conflict",
        "严禁解绑最后一个 MFA 方式；更换设备请直接使用覆盖换绑",
      );
    }
    check.account.totpSecret = null;
    check.account.user = {
      ...check.account.user,
      mfaMethods: check.account.user.mfaMethods.filter((m) => m !== "totp"),
    };
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/v1/me/mfa/recovery-codes", ({ request }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireSudo: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const recoveryCodes = generateSampleRecoveryCodes();
    check.account.recoveryCodes = new Set(recoveryCodes);
    return HttpResponse.json({ recoveryCodes });
  }),

  // ─── 5. 管理员接口 ──────────────────────────────────────────────────
  http.get("/api/v1/admin/users", ({ request }) => {
    const check = verifyAuthenticated(request, { requireAdmin: true });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20),
    );
    const statusFilter = url.searchParams.get("status") as UserStatus | null;
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase() ?? "";

    const allUsers = Array.from(getMockDb().users.values()).map((a) => a.user);
    const filtered = allUsers.filter((u) => {
      if (statusFilter && u.status !== statusFilter) {
        return false;
      }
      if (keyword) {
        return (
          u.username.toLowerCase().includes(keyword) ||
          u.nickname.toLowerCase().includes(keyword) ||
          u.email.toLowerCase().includes(keyword)
        );
      }
      return true;
    });

    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return HttpResponse.json({
      items,
      total: filtered.length,
      page,
      pageSize,
    });
  }),

  http.post("/api/v1/admin/users", async ({ request }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireAdmin: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const body = (await request.json()) as AdminCreateUserRequest;
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase();
    const nickname = body.nickname?.trim();

    if (!username || !email || !nickname) {
      return problem(
        400,
        "invalid_request",
        "Bad Request",
        "用户名、邮箱和昵称均不能为空",
      );
    }

    const db = getMockDb();
    const conflict = Array.from(db.users.values()).some(
      (item) => item.user.username === username || item.user.email === email,
    );
    if (conflict) {
      return problem(409, "user_conflict", "Conflict", "用户名或邮箱已被占用");
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      username,
      nickname,
      email,
      emailVerified: false,
      avatarUrl: null,
      status: "pendingActivation",
      role: "member",
      mfaMethods: [],
    };

    db.users.set(newUser.id, {
      user: newUser,
      password: "",
      totpSecret: null,
      recoveryCodes: new Set(),
      previousStatusBeforeSuspension: "pendingActivation",
    });
    db.activationMailTokens.set(`act_${username}_token`, newUser.id);

    return HttpResponse.json(newUser, { status: 201 });
  }),

  http.put(
    "/api/v1/admin/users/:id/suspension",
    async ({ request, params }) => {
      const check = verifyAuthenticated(request, {
        requireCsrf: true,
        requireAdmin: true,
        requireSudo: true,
      });
      if ("errorResponse" in check) {
        return check.errorResponse;
      }
      const targetId = String(params.id);
      const db = getMockDb();
      const target = db.users.get(targetId);
      if (!target) {
        return problem(404, "not_found", "Not Found", "目标用户不存在");
      }
      if (target.user.status === "suspended") {
        return problem(
          409,
          "invalid_user_state",
          "Conflict",
          "该账号已处于封禁状态",
        );
      }
      const body = (await request.json()) as AdminSuspendUserRequest;
      if (!body.reason?.trim()) {
        return problem(400, "invalid_request", "Bad Request", "请填写封禁原因");
      }

      target.previousStatusBeforeSuspension = target.user.status;
      target.user = { ...target.user, status: "suspended" };
      if (db.currentSession?.userId === targetId) {
        db.currentSession = null;
      }
      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.delete("/api/v1/admin/users/:id/suspension", ({ request, params }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireAdmin: true,
      requireSudo: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const targetId = String(params.id);
    const target = getMockDb().users.get(targetId);
    if (!target) {
      return problem(404, "not_found", "Not Found", "目标用户不存在");
    }
    if (target.user.status !== "suspended") {
      return problem(
        409,
        "invalid_user_state",
        "Conflict",
        "该账号当前未被封禁",
      );
    }
    target.user = {
      ...target.user,
      status: target.previousStatusBeforeSuspension,
    };
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete("/api/v1/admin/users/:id/mfa", ({ request, params }) => {
    const check = verifyAuthenticated(request, {
      requireCsrf: true,
      requireAdmin: true,
      requireSudo: true,
    });
    if ("errorResponse" in check) {
      return check.errorResponse;
    }
    const targetId = String(params.id);
    const db = getMockDb();
    const target = db.users.get(targetId);
    if (!target) {
      return problem(404, "not_found", "Not Found", "目标用户不存在");
    }
    target.totpSecret = null;
    target.recoveryCodes.clear();
    target.user = { ...target.user, mfaMethods: [] };
    if (db.currentSession?.userId === targetId) {
      db.currentSession = null;
    }
    return new HttpResponse(null, { status: 204 });
  }),
];
