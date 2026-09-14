import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  delete document.execCommand;
  vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
  it("uses the async Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the async API is absent", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when neither path succeeds", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("reports failure when the async API and execCommand both throw", async () => {
    const writeText = vi.fn().mockRejectedValue(new TypeError("clipboard write is not allowed"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error("not implemented");
    });

    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });
});
