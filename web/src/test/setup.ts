import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { clearCsrfToken, resetApiInterceptors } from "@/api/client";
import { server } from "@/mocks/server";
import { resetMockState } from "@/mocks/state";

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
  resetMockState();
  clearCsrfToken();
  resetApiInterceptors();
  cleanup();
});

afterAll(() => {
  server.close();
});
