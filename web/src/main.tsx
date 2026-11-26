import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

async function enableMockingIfNeeded() {
  // 本地开发默认启用 MSW 假后端；联调真实后端时在 .env.local 设置 VITE_ENABLE_MSW=false 即可关闭
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW !== "false") {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledFrame: "bypass",
    });
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

enableMockingIfNeeded().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
