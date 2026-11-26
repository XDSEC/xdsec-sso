import { useSearchParams } from "react-router";

/**
 * 重置密码页入口（/reset-password?token=rst_...）
 * 注意：页面挂载阶段严禁自动请求后端消费邮件 token，仅在用户提交新密码时调用接口。
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const hasToken = Boolean(searchParams.get("token"));

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-2 rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">重置密码</h1>
        <p className="text-sm text-muted-foreground">
          {hasToken
            ? "请为你的账号设置新密码。"
            : "缺少重置凭证，请从邮件中的完整链接打开本页面。"}
        </p>
      </div>
    </main>
  );
}
