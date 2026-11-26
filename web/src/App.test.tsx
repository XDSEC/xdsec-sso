import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { seedMockSession } from "@/mocks/state";
import { AppRoutes, createAppQueryClient } from "./App";

function renderAtRoute(initialEntry: string) {
  const queryClient = createAppQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes queryClient={queryClient} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing & auth guards", () => {
  it("redirects unauthenticated visitors from protected routes to /login with returnTo", async () => {
    renderAtRoute("/settings?tab=mfa");

    expect(
      await screen.findByRole("heading", { name: "登录 XDSEC SSO" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/settings?tab=mfa")).toBeInTheDocument();
  });

  it("blocks non-admin members from /admin/users with 403 guard", async () => {
    seedMockSession("xiaoming");
    renderAtRoute("/admin/users");

    expect(
      await screen.findByRole("heading", { name: "无权访问管理后台" }),
    ).toBeInTheDocument();
  });

  it("allows admin users to access /admin/users", async () => {
    seedMockSession("admin");
    renderAtRoute("/admin/users");

    expect(
      await screen.findByRole("heading", { name: "用户管理后台" }),
    ).toBeInTheDocument();
  });

  it("does not consume mail token on mount when opening /activate", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAtRoute("/activate?token=act_demo_token");

    expect(
      await screen.findByRole("heading", { name: "激活 XDSEC 账号" }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
