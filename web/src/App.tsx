import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { configureApiInterceptors } from "@/api/client";
import { sessionQueryKey, useSession } from "@/features/auth/session";
import ActivatePage from "@/pages/ActivatePage";
import AdminUsersPage from "@/pages/AdminUsersPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import SettingsPage from "@/pages/SettingsPage";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  });
}

function RequireAuth() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        正在校验登录状态...
      </div>
    );
  }

  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const search = new URLSearchParams({ returnTo }).toString();
    return <Navigate to={`/login?${search}`} replace />;
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <span className="font-semibold tracking-tight">XDSEC SSO</span>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                to="/settings"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                个人中心
              </Link>
              {session.user.role === "admin" && (
                <Link
                  to="/admin/users"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  用户管理
                </Link>
              )}
            </nav>
          </div>
          <div className="text-sm text-muted-foreground">
            {session.user.nickname}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}

function RequireAdmin() {
  const { data: session } = useSession();

  if (session?.user.role !== "admin") {
    return (
      <section className="space-y-3 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">无权访问管理后台</h1>
        <p className="text-sm text-muted-foreground">
          当前账号非管理员角色，无法访问用户管理功能。
        </p>
        <Link
          to="/settings"
          className="inline-block text-sm font-medium underline underline-offset-4"
        >
          返回个人中心
        </Link>
      </section>
    );
  }

  return <Outlet />;
}

export function AppRoutes({ queryClient }: { queryClient: QueryClient }) {
  const navigate = useNavigate();

  useEffect(() => {
    configureApiInterceptors({
      onAuthenticationRequired: () => {
        queryClient.setQueryData(sessionQueryKey, null);
        navigate("/login", { replace: true });
      },
    });
  }, [navigate, queryClient]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Navigate to="/settings" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}

export default function App() {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes queryClient={queryClient} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
