import { apiRequest, clearCsrfToken, setCsrfToken } from "./client";
import type {
  ActivationSetPasswordRequest,
  ActivationSetPasswordResponse,
  ActivationTotpSetupRequest,
  ActivationTotpVerifyRequest,
  ActivationTotpVerifyResponse,
  AdminCreateUserRequest,
  AdminResetMfaRequest,
  AdminSuspendUserRequest,
  AdminUsersQuery,
  ChangePasswordRequest,
  LoginAuthenticatedResponse,
  LoginMfaRequest,
  LoginRequest,
  LoginResponse,
  MeTotpSetupRequest,
  MeTotpVerifyRequest,
  MeTotpVerifyResponse,
  PaginatedUsersResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequestPayload,
  PasswordResetRequestResponse,
  RegenerateRecoveryCodesResponse,
  SessionResponse,
  SudoRequest,
  SudoResponse,
  TotpSetupResponse,
  UpdateProfileRequest,
  User,
} from "./types";

export const authApi = {
  login(payload: LoginRequest) {
    return apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: payload,
      skipAuthInterceptors: true,
    });
  },

  verifyLoginMfa(payload: LoginMfaRequest) {
    return apiRequest<LoginAuthenticatedResponse>("/auth/login/mfa", {
      method: "POST",
      body: payload,
      skipAuthInterceptors: true,
    });
  },

  async getSession(options?: { skipAuthInterceptors?: boolean }) {
    const session = await apiRequest<SessionResponse>("/session", {
      method: "GET",
      skipAuthInterceptors: options?.skipAuthInterceptors ?? true,
    });
    setCsrfToken(session.csrfToken);
    return session;
  },

  async logout() {
    await apiRequest<void>("/auth/logout", {
      method: "POST",
    });
    clearCsrfToken();
  },

  verifySudo(payload: SudoRequest) {
    return apiRequest<SudoResponse>("/auth/sudo", {
      method: "POST",
      body: payload,
      skipAuthInterceptors: true,
    });
  },
};

export const activationApi = {
  setInitialPassword(payload: ActivationSetPasswordRequest) {
    return apiRequest<ActivationSetPasswordResponse>(
      "/auth/activations/password",
      {
        method: "POST",
        body: payload,
        skipAuthInterceptors: true,
      },
    );
  },

  setupTotp(payload: ActivationTotpSetupRequest) {
    return apiRequest<TotpSetupResponse>("/auth/activations/totp/setup", {
      method: "POST",
      body: payload,
      skipAuthInterceptors: true,
    });
  },

  verifyTotp(payload: ActivationTotpVerifyRequest) {
    return apiRequest<ActivationTotpVerifyResponse>(
      "/auth/activations/totp/verify",
      {
        method: "POST",
        body: payload,
        skipAuthInterceptors: true,
      },
    );
  },
};

export const passwordResetApi = {
  requestReset(payload: PasswordResetRequestPayload) {
    return apiRequest<PasswordResetRequestResponse>(
      "/auth/password-reset-requests",
      {
        method: "POST",
        body: payload,
        skipAuthInterceptors: true,
      },
    );
  },

  confirmReset(payload: PasswordResetConfirmRequest) {
    return apiRequest<void>("/auth/password-resets", {
      method: "POST",
      body: payload,
      skipAuthInterceptors: true,
    });
  },
};

export const meApi = {
  getProfile() {
    return apiRequest<User>("/me", { method: "GET" });
  },

  updateProfile(payload: UpdateProfileRequest) {
    return apiRequest<User>("/me", {
      method: "PATCH",
      body: payload,
    });
  },

  async changePassword(payload: ChangePasswordRequest) {
    await apiRequest<void>("/me/password-changes", {
      method: "POST",
      body: payload,
    });
    clearCsrfToken();
  },

  setupTotp(payload: MeTotpSetupRequest = {}) {
    return apiRequest<TotpSetupResponse>("/me/mfa/totp/setup", {
      method: "POST",
      body: payload,
    });
  },

  verifyTotp(payload: MeTotpVerifyRequest) {
    return apiRequest<MeTotpVerifyResponse>("/me/mfa/totp/verify", {
      method: "POST",
      body: payload,
    });
  },

  removeTotp() {
    return apiRequest<void>("/me/mfa/totp", {
      method: "DELETE",
    });
  },

  regenerateRecoveryCodes() {
    return apiRequest<RegenerateRecoveryCodesResponse>(
      "/me/mfa/recovery-codes",
      {
        method: "POST",
        body: {},
      },
    );
  },
};

export const adminApi = {
  listUsers(query: AdminUsersQuery = {}) {
    return apiRequest<PaginatedUsersResponse>("/admin/users", {
      method: "GET",
      query: {
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        keyword: query.keyword,
      },
    });
  },

  createUser(payload: AdminCreateUserRequest) {
    return apiRequest<User>("/admin/users", {
      method: "POST",
      body: payload,
    });
  },

  suspendUser(userId: string, payload: AdminSuspendUserRequest) {
    return apiRequest<void>(
      `/admin/users/${encodeURIComponent(userId)}/suspension`,
      {
        method: "PUT",
        body: payload,
      },
    );
  },

  unsuspendUser(userId: string) {
    return apiRequest<void>(
      `/admin/users/${encodeURIComponent(userId)}/suspension`,
      {
        method: "DELETE",
      },
    );
  },

  resetUserMfa(userId: string, payload: AdminResetMfaRequest = {}) {
    return apiRequest<void>(`/admin/users/${encodeURIComponent(userId)}/mfa`, {
      method: "DELETE",
      body: payload,
    });
  },
};
