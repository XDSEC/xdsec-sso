/**
 * 校验并规范化登录回跳参数 returnTo（严格对齐 api_v1.md §6.3）
 *
 * 必须同时满足以下三条才允许使用，否则返回 null：
 * 1. 以单个正斜杠 `/` 开头（拦截 http:/https:/javascript:/data: 等协议）；
 * 2. 第 2 个字符不得为 `/` 或 `\`（拦截 //evil.com、/\evil.com 等协议相对绕过）；
 * 3. 经 new URL 解析后严格同源，路径不含反斜杠，且不指向 /login 自身（防循环跳转）。
 */
export function sanitizeReturnTo(
  rawReturnTo: string | null | undefined,
  currentOrigin: string = window.location.origin,
): string | null {
  if (!rawReturnTo) {
    return null;
  }

  // 不做 trim 放行前导空白，任何非 `/` 开头的输入直接拒绝
  if (!rawReturnTo.startsWith("/")) {
    return null;
  }

  const secondChar = rawReturnTo[1];
  if (secondChar === "/" || secondChar === "\\") {
    return null;
  }

  // 防御浏览器将路径中的反斜杠归一化为斜杠导致的跨源解析差异
  if (rawReturnTo.includes("\\")) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawReturnTo, currentOrigin);
  } catch {
    return null;
  }

  if (parsed.origin !== currentOrigin) {
    return null;
  }

  if (parsed.pathname === "/login" || parsed.pathname.startsWith("/login/")) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * 登录与 MFA 全部通过后的统一跳转入口（对齐 api_v1.md §6.3）
 *
 * - 存在合法同源 returnTo 时，必须调用 window.location.assign 触发整页 HTTP 导航交还后端，
 *   确保浏览器携带 __Host-sso_session Cookie 请求 OIDC /authorize 或旧系统回调入口；
 * - 无 returnTo 或校验不合法时，走前端 SPA 默认回退回调（进入个人中心）。
 */
export function redirectAfterAuth(
  rawReturnTo: string | null | undefined,
  navigateFallback: () => void,
  assignLocation: (url: string) => void = (url) => {
    window.location.assign(url);
  },
): void {
  const safeReturnTo = sanitizeReturnTo(rawReturnTo);
  if (safeReturnTo) {
    assignLocation(safeReturnTo);
    return;
  }
  navigateFallback();
}
