function isPrivateOrReservedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets as [number, number, number, number];
}

function parseIpv6Hextets(rawIp: string): number[] | null {
  const ip = rawIp.split('%')[0].toLowerCase();
  const doubleColonParts = ip.split('::');
  if (doubleColonParts.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const parts = side.split(':');
    const out: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('.')) {
        // Embedded IPv4 must be the last element
        if (i !== parts.length - 1) return null;
        const octets = parseIpv4Octets(part);
        if (!octets) return null;
        out.push((octets[0] << 8) | octets[1]);
        out.push((octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
        out.push(parseInt(part, 16));
      }
    }
    return out;
  };

  if (doubleColonParts.length === 1) {
    const groups = parseSide(doubleColonParts[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const left = parseSide(doubleColonParts[0]);
  const right = parseSide(doubleColonParts[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;

  return [...left, ...new Array(missing).fill(0), ...right];
}

function isPrivateOrReservedIpv6(host: string): boolean {
  const groups = parseIpv6Hextets(host);
  if (!groups) return true; // Fail closed on malformed IPv6 literal

  // Unspecified ::
  if (groups.every((g) => g === 0)) return true;

  // Loopback ::1
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;

  // IPv4-mapped IPv6 ::ffff:0:0/96
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const octets: [number, number, number, number] = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ];
    return isPrivateOrReservedIpv4(octets);
  }

  // Unique Local Address fc00::/7
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  // Link-Local fe80::/10
  if ((groups[0] & 0xffc0) === 0xfe80) return true;

  return false;
}

export function assertSafeExternalUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  let host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (!host) {
    throw new Error('URL hostname is required');
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error(`Disallowed internal hostname: ${host}`);
  }

  const ipv4 = parseIpv4Octets(host);
  if (ipv4) {
    if (isPrivateOrReservedIpv4(ipv4)) {
      throw new Error(`Disallowed private or reserved IPv4 address: ${host}`);
    }
    return parsed;
  }

  if (host.includes(':')) {
    if (isPrivateOrReservedIpv6(host)) {
      throw new Error(`Disallowed private or reserved IPv6 address: ${host}`);
    }
    return parsed;
  }

  return parsed;
}

export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = assertSafeExternalUrl(url).toString();

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    assertSafeExternalUrl(currentUrl);
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { response, finalUrl: currentUrl };
      }
      if (redirects === maxRedirects) {
        throw new Error('Too many redirects');
      }
      currentUrl = assertSafeExternalUrl(new URL(location, currentUrl).toString()).toString();
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects');
}
