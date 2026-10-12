import { describe, expect, it } from "vitest";

import { clientIp, UNKNOWN_VISITOR, visitorKey } from "./client-ip";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientIp", () => {
  it("reads Vercel's own header first on Vercel", () => {
    const h = headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1", "x-forwarded-for": "192.0.2.9" });
    expect(clientIp(h, true)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, and never reads x-forwarded-for", () => {
    expect(clientIp(headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "192.0.2.9" }), true)).toBe("198.51.100.1");
    expect(clientIp(headers({ "x-forwarded-for": "192.0.2.9" }), true)).toBeNull();
  });

  it("takes the last address of a list, since the ones before it could come from the client", () => {
    expect(clientIp(headers({ "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2 , 203.0.113.7 " }), true)).toBe("203.0.113.7");
    // A client writing a fresh address in front each time still counts as one visitor.
    const spoofed = ["192.0.2.1", "192.0.2.2"].map((fake) =>
      clientIp(headers({ "x-vercel-forwarded-for": `${fake}, 203.0.113.7` }), true),
    );
    expect(spoofed).toEqual(["203.0.113.7", "203.0.113.7"]);
  });

  it("skips a value that isn't an address", () => {
    expect(clientIp(headers({ "x-vercel-forwarded-for": "not-an-ip", "x-real-ip": "2001:db8::1" }), true)).toBe("2001:db8::1");
    expect(clientIp(headers({ "x-vercel-forwarded-for": "1.2.3.4:5678" }), true)).toBeNull();
  });

  it("trusts no header off Vercel, where the client can set any of them", () => {
    const h = headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.1", "x-forwarded-for": "192.0.2.9" });
    expect(clientIp(h, false)).toBeNull();
  });
});

describe("visitorKey", () => {
  it("keeps an IPv4 address as it is", () => {
    expect(visitorKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("counts an IPv6 address as its /64, however it is written", () => {
    const key = "2001:db8:abcd:12::/64";
    expect(visitorKey("2001:db8:abcd:12::1")).toBe(key);
    expect(visitorKey("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe(key);
    expect(visitorKey("2001:DB8:ABCD:12:1:2:3:4")).toBe(key);
    expect(visitorKey("2001:db8:abcd:13::1")).not.toBe(key);
    expect(visitorKey("::1")).toBe("0:0:0:0::/64");
    expect(visitorKey("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("counts an IPv4 address written as IPv6 as the IPv4 address", () => {
    expect(visitorKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(visitorKey("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("puts every visitor without an address in one shared count", () => {
    expect(visitorKey(null)).toBe(UNKNOWN_VISITOR);
    expect(visitorKey("nonsense")).toBe(UNKNOWN_VISITOR);
  });
});
