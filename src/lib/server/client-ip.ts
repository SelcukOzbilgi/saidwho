import { isIP } from "node:net";

// Who a run is counted against, for the per-visitor limits in rate-limit.ts.
//
// On Vercel, the platform sets x-vercel-forwarded-for to the address the request
// came from and overwrites whatever the client sent, so it can't be faked.
// x-forwarded-for carries the same address, but Vercel's docs say another proxy
// in front of Vercel could overwrite it. x-real-ip is the same again and is the
// fallback.
// Off Vercel nothing sets these headers but the client, so none is trusted there
// and every visitor shares one count.

export const UNKNOWN_VISITOR = "unknown";

export function clientIp(headers: Headers, onVercel: boolean): string | null {
  if (!onVercel) return null;
  for (const name of ["x-vercel-forwarded-for", "x-real-ip"]) {
    const first = headers.get(name)?.split(",")[0]?.trim();
    if (first && isIP(first)) return first;
  }
  return null;
}

// One home or office usually gets a whole IPv6 /64 and can pick any address in
// it, so an IPv6 address counts as its /64. An IPv4 address written as IPv6
// (::ffff:1.2.3.4) counts as the IPv4 address.
export function visitorKey(ip: string | null): string {
  if (!ip) return UNKNOWN_VISITOR;
  if (isIP(ip) === 4) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return UNKNOWN_VISITOR;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

// The eight 16-bit groups of an IPv6 address, with :: filled in.
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  if (isIP(text) !== 6) return null;
  // A trailing dotted IPv4 part becomes two groups.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const [a, b, c, d] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array<string>(8 - front.length - back.length).fill("0");
  const groups = [...front, ...fill, ...back].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}
