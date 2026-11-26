import { useSearchParams } from "react-router";
import { sanitizeReturnTo } from "@/lib/return-to";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const safeReturnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-2 rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">登录 XDSEC SSO</h1>
        <p className="text-sm text-muted-foreground">
          使用 XDSEC 账号与密码登录统一身份认证中心
        </p>
        {safeReturnTo && (
          <p className="text-xs text-muted-foreground">
            登录成功后将继续前往：<code>{safeReturnTo}</code>
          </p>
        )}
      </div>
    </main>
  );
}
