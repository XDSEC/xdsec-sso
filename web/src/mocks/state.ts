import type { User } from "@/api/types";

export interface MockChallengeRecord {
  userId: string;
  expiresAt: number;
}

export interface MockActivationRecord {
  userId: string;
  mailToken: string;
  password: string;
  pendingTotpSecret: string | null;
  expiresAt: number;
}

export interface MockUserAccount {
  user: User;
  password: string;
  totpSecret: string | null;
  recoveryCodes: Set<string>;
  previousStatusBeforeSuspension: "pendingActivation" | "active";
}

export interface MockSessionState {
  userId: string;
  csrfToken: string;
  expiresAt: string;
  sudoExpiresAt: number | null;
}

interface MockDatabase {
  users: Map<string, MockUserAccount>;
  activationMailTokens: Map<string, string>; // token -> userId
  resetMailTokens: Map<string, string>; // token -> userId
  loginChallenges: Map<string, MockChallengeRecord>;
  activationChallenges: Map<string, MockActivationRecord>;
  pendingMeTotpSecrets: Map<string, string>; // userId -> secret
  currentSession: MockSessionState | null;
}

export const MOCK_VALID_TOTP_CODE = "123456";

function createInitialDatabase(): MockDatabase {
  const adminUser: User = {
    id: "01950000-0000-7000-8000-000000000001",
    username: "admin",
    nickname: "系统管理员",
    email: "admin@xdsec.org",
    emailVerified: true,
    avatarUrl: null,
    status: "active",
    role: "admin",
    mfaMethods: ["totp"],
  };

  const legacyMember: User = {
    id: "01950000-0000-7000-8000-000000000002",
    username: "xiaoming",
    nickname: "小明",
    email: "xiaoming@xdsec.org",
    emailVerified: true,
    avatarUrl: null,
    status: "active",
    role: "member",
    mfaMethods: [],
  };

  const pendingUser: User = {
    id: "01950000-0000-7000-8000-000000000003",
    username: "newbie",
    nickname: "新成员",
    email: "newbie@xdsec.org",
    emailVerified: false,
    avatarUrl: null,
    status: "pendingActivation",
    role: "member",
    mfaMethods: [],
  };

  const suspendedUser: User = {
    id: "01950000-0000-7000-8000-000000000004",
    username: "suspended_demo",
    nickname: "已封禁成员",
    email: "suspended@xdsec.org",
    emailVerified: true,
    avatarUrl: null,
    status: "suspended",
    role: "member",
    mfaMethods: ["totp"],
  };

  const users = new Map<string, MockUserAccount>([
    [
      adminUser.id,
      {
        user: adminUser,
        password: "Admin123456!",
        totpSecret: "JBSWY3DPEHPK3PXP",
        recoveryCodes: new Set(["recov-00001", "recov-00002"]),
        previousStatusBeforeSuspension: "active",
      },
    ],
    [
      legacyMember.id,
      {
        user: legacyMember,
        password: "Member123456!",
        totpSecret: null,
        recoveryCodes: new Set(),
        previousStatusBeforeSuspension: "active",
      },
    ],
    [
      pendingUser.id,
      {
        user: pendingUser,
        password: "",
        totpSecret: null,
        recoveryCodes: new Set(),
        previousStatusBeforeSuspension: "pendingActivation",
      },
    ],
    [
      suspendedUser.id,
      {
        user: suspendedUser,
        password: "Banned123456!",
        totpSecret: "JBSWY3DPEHPK3PXQ",
        recoveryCodes: new Set(["recov-99999"]),
        previousStatusBeforeSuspension: "active",
      },
    ],
  ]);

  return {
    users,
    activationMailTokens: new Map([["act_demo_token", pendingUser.id]]),
    resetMailTokens: new Map([["rst_demo_token", legacyMember.id]]),
    loginChallenges: new Map(),
    activationChallenges: new Map(),
    pendingMeTotpSecrets: new Map(),
    currentSession: null,
  };
}

let db: MockDatabase = createInitialDatabase();

export function getMockDb(): MockDatabase {
  return db;
}

export function resetMockState(): void {
  db = createInitialDatabase();
}

/**
 * 供单元测试快速预置指定登录态与可选 Sudo 窗口
 */
export function seedMockSession(
  username: "admin" | "xiaoming",
  options?: { sudoActive?: boolean; csrfToken?: string },
): MockSessionState {
  const account = Array.from(db.users.values()).find(
    (item) => item.user.username === username,
  );
  if (!account) {
    throw new Error(`Mock user ${username} not found`);
  }
  const now = Date.now();
  const session: MockSessionState = {
    userId: account.user.id,
    csrfToken: options?.csrfToken ?? "csrf_mock_token_001",
    expiresAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    sudoExpiresAt: options?.sudoActive ? now + 5 * 60 * 1000 : null,
  };
  db.currentSession = session;
  return session;
}
