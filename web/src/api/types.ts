/**
 * XDSEC SSO API v1 全局接口类型契约（严格对齐根目录 api_v1.md）
 */

// ─── 1.3 RFC 9457 错误返回格式 ───────────────────────────────────────

export type KnownApiErrorCode =
  | "invalid_request"
  | "invalid_challenge"
  | "invalid_credentials"
  | "authentication_required"
  | "forbidden"
  | "csrf_check_failed"
  | "reauthentication_required"
  | "mfa_required"
  | "not_found"
  | "user_conflict"
  | "invalid_user_state"
  | "rate_limited";

export type ApiErrorCode = KnownApiErrorCode | (string & {});

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ApiErrorCode;
  detail: string;
}

// ─── 2.1 用户对象 ───────────────────────────────────────────────────

export type UserStatus = "pendingActivation" | "active" | "suspended";
export type UserRole = "member" | "admin";
export type UserMfaMethod = "totp" | "passkey";
export type ChallengeMfaMethod = "totp" | "recoveryCode";

export interface User {
  id: string;
  username: string;
  nickname: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  status: UserStatus;
  role: UserRole;
  mfaMethods: UserMfaMethod[];
}

// ─── 3. 登录、会话与敏感操作（Sudo） ─────────────────────────────────

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginAuthenticatedResponse {
  status: "authenticated";
}

export interface LoginMfaRequiredResponse {
  status: "mfaRequired";
  challengeId: string;
  methods: ChallengeMfaMethod[];
  expiresIn: number;
}

export type LoginResponse =
  | LoginAuthenticatedResponse
  | LoginMfaRequiredResponse;

export interface LoginMfaRequest {
  challengeId: string;
  method: ChallengeMfaMethod;
  code: string;
}

export interface SessionResponse {
  user: User;
  expiresAt: string;
  sudoExpiresAt: string | null;
  csrfToken: string;
}

export interface SudoRequest {
  method: ChallengeMfaMethod;
  code: string;
}

export interface SudoResponse {
  sudoExpiresAt: string;
}

// ─── 4.1 账号激活与密码重置 ──────────────────────────────────────────

export interface ActivationSetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ActivationSetPasswordResponse {
  activationToken: string;
  expiresIn: number;
}

export interface ActivationTotpSetupRequest {
  activationToken: string;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface ActivationTotpVerifyRequest {
  activationToken: string;
  code: string;
}

export interface ActivationTotpVerifyResponse {
  recoveryCodes: string[];
}

export interface PasswordResetRequestPayload {
  email: string;
}

export interface PasswordResetRequestResponse {
  status: "accepted";
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

// ─── 4.2 个人中心与 MFA 管理 ─────────────────────────────────────────

export interface UpdateProfileRequest {
  nickname: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface MeTotpSetupRequest {
  currentPassword?: string;
}

export interface MeTotpVerifyRequest {
  code: string;
}

export interface MeTotpVerifyResponse {
  recoveryCodes: string[] | null;
}

export interface RegenerateRecoveryCodesResponse {
  recoveryCodes: string[];
}

// ─── 5. 管理员接口 ───────────────────────────────────────────────────

export interface AdminUsersQuery {
  page?: number;
  pageSize?: number;
  status?: UserStatus;
  keyword?: string;
}

export interface PaginatedUsersResponse {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCreateUserRequest {
  username: string;
  email: string;
  nickname: string;
}

export interface AdminSuspendUserRequest {
  reason: string;
}

export interface AdminResetMfaRequest {
  reason?: string;
}
