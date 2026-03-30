import { describe, it, expect } from "vitest";
import { mockContainers, mockImages, mockVolumes, mockNetworks, mockSystemInfo } from "@/lib/mock-data";

describe("Mock Data", () => {
  it("has containers with required fields", () => {
    expect(mockContainers.length).toBeGreaterThan(0);
    mockContainers.forEach(c => {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.image).toBeTruthy();
      expect(["running", "stopped", "paused", "restarting"]).toContain(c.status);
    });
  });

  it("has images with required fields", () => {
    expect(mockImages.length).toBeGreaterThan(0);
    mockImages.forEach(img => {
      expect(img.repository).toBeTruthy();
      expect(img.tag).toBeTruthy();
      expect(img.size).toBeTruthy();
    });
  });

  it("has volumes", () => {
    expect(mockVolumes.length).toBeGreaterThan(0);
  });

  it("has networks", () => {
    expect(mockNetworks.length).toBeGreaterThan(0);
  });

  it("has system info", () => {
    expect(mockSystemInfo.dockerVersion).toBeTruthy();
    expect(mockSystemInfo.cpus).toBeGreaterThan(0);
  });
});
