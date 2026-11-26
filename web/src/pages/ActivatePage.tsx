import { useSearchParams } from "react-router";

/**
 * 新成员三步激活页入口（/activate?token=act_...）
 * 注意：页面挂载阶段严禁自动请求后端消费邮件 token，仅在用户提交表单时调用接口。
 */
export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const hasToken = Boolean(searchParams.get("token"));

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-2 rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">
          激活 XDSEC 账号
        </h1>
        <p className="text-sm text-muted-foreground">
          {hasToken
            ? "请按步骤设置初始密码、绑定双因素验证并保存恢复码。"
            : "缺少激活凭证，请从激活邮件中的完整链接打开本页面。"}
        </p>
      </div>
    </main>
  );
}
