export function toAsciiVietnamese(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function buildFtsPrefixQuery(query: string): string {
  const ascii = toAsciiVietnamese(query);
  return ascii
    .replace(/["*():^]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(' ');
}
