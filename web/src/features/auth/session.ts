import { useQuery } from "@tanstack/react-query";
import { isApiClientError } from "@/api/client";
import { authApi } from "@/api/endpoints";
import type { SessionResponse } from "@/api/types";

export const sessionQueryKey = ["session"] as const;

/**
 * 拉取当前登录会话：
 * - 已登录时返回 SessionResponse（同时自动同步内存 csrfToken）；
 * - 未登录（401 authentication_required）时平缓返回 null，不视为异常报错。
 */
export async function fetchCurrentSession(): Promise<SessionResponse | null> {
  try {
    return await authApi.getSession({ skipAuthInterceptors: true });
  } catch (err) {
    if (isApiClientError(err) && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchCurrentSession,
    retry: false,
    staleTime: 60 * 1000,
  });
}
