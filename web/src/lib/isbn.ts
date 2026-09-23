/**
 * ISBN 提取与校验。
 *
 * 为什么值得单独做：中文教材封底一定印 ISBN（条码 + 数字串）。OCR 出来的文字里
 * 只要有一个**校验位正确**的 ISBN，就等于拿到了这本书的唯一标识 ——
 * 比靠书名关键词猜出版社可靠得多，而且校验位能直接挡掉 OCR 的幻觉（错一位就不过）。
 *
 * 参考：ISBN-13 用 1/3 交替加权、模 10 校验；ISBN-10 用 10..1 加权、模 11。
 * 纯本地计算，不查任何在线书库。
 */

/** 去掉连字符与空格，并把常见的 OCR 误读字符换成数字 */
export function normalizeIsbnText(text: string): string {
  return text
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[^\dXx]/g, '');
}

/** ISBN-13 校验（1/3 加权，模 10） */
export function isValidIsbn13(value: string): boolean {
  const digits = normalizeIsbnText(value);
  if (!/^(978|979)\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

/** ISBN-10 校验（10..1 加权，模 11；末位可为 X） */
export function isValidIsbn10(value: string): boolean {
  const cleaned = value.replace(/[^\dXx]/g, '').toUpperCase();
  if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const digit = cleaned[i] === 'X' ? 10 : Number(cleaned[i]);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

export interface IsbnHit {
  isbn: string;
  kind: 'isbn13' | 'isbn10';
  /** 命中的原始片段（便于在界面上回显核对） */
  raw: string;
}

/**
 * 从一段文字里找出所有**校验通过**的 ISBN。
 * 先按连续数字串找 13 位、再找 10 位；命中后掩掉该片段，避免重复计入。
 */
export function extractIsbns(text: string): IsbnHit[] {
  const hits: IsbnHit[] = [];
  const seen = new Set<string>();

  // 13 位：允许中间有连字符/空格（OCR 常把条码数字分开读）
  const pattern13 = /(?:97[89])[\d\s-]{10,17}\d/g;
  for (const match of text.matchAll(pattern13)) {
    const digits = normalizeIsbnText(match[0]);
    if (digits.length !== 13) continue;
    if (!isValidIsbn13(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    hits.push({ isbn: digits, kind: 'isbn13', raw: match[0] });
  }

  // 10 位：必须带连字符或独立成串，否则会把 13 位里的片段误当 10 位
  const pattern10 = /\b\d[\d\s-]{7,12}[\dXx]\b/g;
  for (const match of text.matchAll(pattern10)) {
    const digits = normalizeIsbnText(match[0]);
    if (digits.length !== 10) continue;
    if (seen.has(digits)) continue;
    if (!isValidIsbn10(digits)) continue;
    seen.add(digits);
    hits.push({ isbn: digits, kind: 'isbn10', raw: match[0] });
  }

  return hits;
}

/** 把 ISBN-13 拆成 978-7-04-058123-4 这样的可读形式（前缀 + 组区 + 出版者 + 书名号 + 校验） */
export function formatIsbn13(isbn: string): string {
  const digits = normalizeIsbnText(isbn);
  if (digits.length !== 13) return isbn;
  // 中国大陆出版物组号为 7，其后出版者号长度不定；这里按常见 2~3 位呈现
  const prefix = digits.slice(0, 3);
  const group = digits.slice(3, 4);
  const rest = digits.slice(4, 12);
  const check = digits.slice(12);
  return `${prefix}-${group}-${rest.slice(0, 2)}-${rest.slice(2, 7)}-${check}`;
}
