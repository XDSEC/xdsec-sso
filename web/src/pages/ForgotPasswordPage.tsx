export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-2 rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">找回密码</h1>
        <p className="text-sm text-muted-foreground">
          输入账号绑定邮箱以接收重置密码或重新激活邮件
        </p>
      </div>
    </main>
  );
}
