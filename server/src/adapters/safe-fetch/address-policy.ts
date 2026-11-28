import { isIP } from 'node:net';

/**
 * Is `ip` a globally routable unicast address? Everything else (loopback,
 * RFC1918, link-local, CGNAT, unspecified, multicast, ULA, documentation,
 * IPv4-mapped private, …) is refused by SafeFetcher.
 */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(parseV4(ip));
  if (family === 6) return isPublicV6(ip);
  return false;
}

function parseV4(ip: string): [number, number, number, number] {
  const p = ip.split('.').map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3]!];
}

function isPublicV4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF + TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

/** Expand an IPv6 literal into eight 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let s = ip.split('%')[0]!;
  const v4tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const [a, b, c, d] = parseV4(v4tail[1]!);
    s = s.slice(0, -v4tail[1]!.length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...(halves.length === 2 ? Array<string>(missing).fill('0') : []), ...tail];
  const nums = groups.map((g) => Number.parseInt(g, 16));
  return nums.length === 8 && nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

function isPublicV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const allZeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroTo(7) && (g7 === 0 || g7 === 1)) return false; // :: and ::1
  // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d): judge the v4 part.
  if ((allZeroTo(5) && g5 === 0xffff) || allZeroTo(6)) {
    return isPublicV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]);
  }
  // NAT64 64:ff9b::/96 embeds a v4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicV4([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]);
  }
  if ((g0 & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  return true;
}
