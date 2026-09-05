import { describe, expect, it } from "vitest";
import { parseBrowser, parseDeviceType, parseOperatingSystem } from "@/lib/uaParse";

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  chromeDesktopMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

describe("parseBrowser", () => {
  it("distingue Edge de Chrome aunque ambos digan 'Chrome/' en el UA", () => {
    expect(parseBrowser(UA.edgeWindows)).toBe("Edge");
    expect(parseBrowser(UA.chromeDesktopMac)).toBe("Chrome");
  });
  it("reconoce Firefox y Safari", () => {
    expect(parseBrowser(UA.firefoxWindows)).toBe("Firefox");
    expect(parseBrowser(UA.safariIphone)).toBe("Safari");
  });
  it("UA vacío o irreconocible -> null", () => {
    expect(parseBrowser("")).toBeNull();
    expect(parseBrowser("bot/1.0")).toBeNull();
  });
});

describe("parseOperatingSystem", () => {
  it("reconoce Windows, macOS, iOS y Android", () => {
    expect(parseOperatingSystem(UA.firefoxWindows)).toBe("Windows");
    expect(parseOperatingSystem(UA.chromeDesktopMac)).toBe("macOS");
    expect(parseOperatingSystem(UA.safariIphone)).toBe("iOS");
    expect(parseOperatingSystem(UA.chromeAndroid)).toBe("Android");
  });
});

describe("parseDeviceType", () => {
  it("distingue mobile / tablet / desktop", () => {
    expect(parseDeviceType(UA.safariIphone)).toBe("mobile");
    expect(parseDeviceType(UA.chromeAndroid)).toBe("mobile");
    expect(parseDeviceType(UA.ipad)).toBe("tablet");
    expect(parseDeviceType(UA.chromeDesktopMac)).toBe("desktop");
    expect(parseDeviceType(UA.firefoxWindows)).toBe("desktop");
  });
});
