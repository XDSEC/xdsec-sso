import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders XDSEC SSO heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "XDSEC SSO" }),
    ).toBeInTheDocument();
  });
});
