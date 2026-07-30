import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../server/return-path";

describe("VPS authentication return paths", () => {
  it("keeps local application paths", () => {
    expect(safeReturnPath("/admissions/apply?step=guardian")).toBe(
      "/admissions/apply?step=guardian",
    );
  });

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeReturnPath("https://attacker.example")).toBe("/");
    expect(safeReturnPath("//attacker.example")).toBe("/");
  });

  it("rejects authentication endpoints as return destinations", () => {
    expect(safeReturnPath("/sign-in")).toBe("/");
    expect(safeReturnPath("/api/auth/sign-out")).toBe("/");
  });
});
