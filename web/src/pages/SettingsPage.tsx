import { useSession } from "@/features/auth/session";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">个人中心</h1>
      <p className="text-sm text-muted-foreground">
        欢迎回来，{session?.user.nickname}（@{session?.user.username}）
      </p>
    </section>
  );
}
