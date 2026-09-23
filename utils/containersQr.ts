/**
 * utils/containersQr.ts — власний генератор QR-кодів.
 *
 * ДОСЛІВНИЙ ПОРТ flowi-web-app/components/containers/qr-encode.ts: наліпки з
 * двох платформ мусять бути однаковими модуль у модуль (еталонні відбитки
 * матриць звіряються в __tests__/containers-qr.test.ts тими самими числами).
 *
 * Навіщо свій, а не пакет: специфікація (docs/specs/containers.md §6.3) прямо
 * забороняє растрові картинки з чужих API (витік списку коробок назовні) і
 * вимагає роботи без мережі. Наліпці потрібно рівно одне — байтовий режим,
 * рівень корекції M, версії 1–10 (до 213 байт; наш URL — 60–90), тож повний
 * пакет на 20 КБ заради цього не потрібен.
 *
 * Алгоритм — стандартний ISO/IEC 18004 у тому порядку, як його описує
 * Nayuki (Project Nayuki, «QR Code generator library»): дані → Ріда–Соломона
 * по блоках → переплетення → службові візерунки → вибір маски за штрафом.
 */

export interface QrMatrix {
  /** Сторона в модулях (21 для версії 1, +4 на кожну наступну). */
  size: number;
  /** modules[y][x] === true — темний модуль. */
  modules: boolean[][];
}

/** Рівень M: кодових слів корекції на блок, за версією (індекс = версія). */
const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Рівень M: кількість блоків Ріда–Соломона, за версією. */
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
/** Біти рівня корекції у форматному слові: L=01, M=00, Q=11, H=10. */
const ECC_FORMAT_BITS_M = 0;

/** UTF-8 без TextEncoder: у Hermes він є не в кожній збірці. */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return out;
}

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];
}

// ─── GF(256) і Рід–Соломон ───────────────────────────────────────────────────

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

// ─── Кодування даних ─────────────────────────────────────────────────────────

function pickVersion(byteLength: number): number {
  for (let ver = 1; ver <= MAX_VERSION; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    const needBits = 4 + countBits + byteLength * 8;
    if (needBits <= dataCodewords(ver) * 8) return ver;
  }
  throw new Error(`QR: ${byteLength} байт не вміщаються у версію ${MAX_VERSION}-M`);
}

function encodeData(bytes: readonly number[], ver: number): number[] {
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // байтовий режим
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length)); // термінатор
  push(0, (8 - (bits.length % 8)) % 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  for (let pad = 0xec; out.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function addEccAndInterleave(data: readonly number[], ver: number): number[] {
  const numBlocks = BLOCKS_M[ver];
  const blockEccLen = ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ─── Матриця ─────────────────────────────────────────────────────────────────

class Grid {
  readonly version: number;
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  // Без parameter properties: node --test ганяє TS у режимі strip-only.
  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = this.alignmentPositions();
    const last = positions.length - 1;
    positions.forEach((py, i) => {
      positions.forEach((px, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      });
    });

    this.drawFormatBits(0); // резервує місце; справжні біти — після вибору маски
    this.drawVersion();
  }

  drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  drawFormatBits(mask: number) {
    const data = (ECC_FORMAT_BITS_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, bit(i));
    this.setFunction(8, this.size - 8, true);
  }

  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  drawCodewords(data: readonly number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (invert && !this.isFunction[y][x]) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /**
   * Штраф маски (ISO 18004 §7.8.3): довгі однокольорові серії, блоки 2×2,
   * візерунки, схожі на шукач, і перекіс темного/світлого. Будь-яка маска
   * читається — штраф лише обирає ту, що читається НАЙЛЕГШЕ дешевою камерою.
   */
  penalty(): number {
    const n = this.size;
    const m = this.modules;
    let score = 0;
    const line = (get: (i: number) => boolean) => {
      let runColor = get(0);
      let run = 1;
      for (let i = 1; i < n; i++) {
        if (get(i) === runColor) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          runColor = get(i);
          run = 1;
        }
      }
      // 1:1:3:1:1 із чотирма світлими з одного боку.
      for (let i = 0; i + 6 < n; i++) {
        const at = (k: number) => (k >= 0 && k < n ? get(k) : false);
        const core = at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6);
        if (!core) continue;
        const lightBefore = !at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4);
        const lightAfter = !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10);
        if (lightBefore || lightAfter) score += 40;
      }
    };
    for (let y = 0; y < n; y++) line((x) => m[y][x]);
    for (let x = 0; x < n; x++) line((y) => m[y][x]);

    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
      }
    }

    let dark = 0;
    for (const row of m) for (const cell of row) if (cell) dark++;
    const total = n * n;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += Math.max(0, k) * 10;
    return score;
  }
}

/** QR-матриця для тексту (UTF-8, байтовий режим, корекція M). */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length);
  const codewords = addEccAndInterleave(encodeData(bytes, version), version);

  const grid = new Grid(version);
  grid.drawFunctionPatterns();
  grid.drawCodewords(codewords);

  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    const score = grid.penalty();
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    grid.applyMask(mask); // XOR — повторне накладання знімає маску
  }
  grid.applyMask(bestMask);
  grid.drawFormatBits(bestMask);
  return { size: grid.size, modules: grid.modules };
}

/**
 * SVG-шлях темних модулів із «тихою зоною» `border` модулів довкола.
 * Горизонтальні серії склеюються в один прямокутник — у рази коротший рядок,
 * що важливо для аркуша на 65 наліпок.
 */
export function qrSvgPath(qr: QrMatrix, border = 0): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) { x++; continue; }
      const start = x;
      while (x < qr.size && qr.modules[y][x]) x++;
      parts.push(`M${start + border} ${y + border}h${x - start}v1h-${x - start}z`);
    }
  }
  return parts.join("");
}

/** Повний `<svg>` рядком — для друку й HTML наліпок. */
export function qrSvg(text: string, options: { border?: number; color?: string } = {}): string {
  const border = options.border ?? 2;
  const qr = encodeQr(text);
  const side = qr.size + border * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
    `<rect width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${qrSvgPath(qr, border)}" fill="${options.color ?? "#000"}"/></svg>`
  );
}
