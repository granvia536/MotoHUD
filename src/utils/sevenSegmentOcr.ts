export type LcdPolarity = 'auto' | 'dark-on-light' | 'light-on-dark';

export interface DigitDetection {
  digit: number;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrResult {
  value: number | null;
  rawText: string;
  confidence: number;
  digits: DigitDetection[];
  polarityUsed: 'dark-on-light' | 'light-on-dark';
}

// Standard 7-segment masks: [a(top), b(top-right), c(bot-right), d(bot), e(bot-left), f(top-left), g(mid)]
const SEGMENT_TEMPLATES: Array<{ digit: number; mask: number[] }> = [
  { digit: 0, mask: [1, 1, 1, 1, 1, 1, 0] },
  { digit: 1, mask: [0, 1, 1, 0, 0, 0, 0] },
  { digit: 2, mask: [1, 1, 0, 1, 1, 0, 1] },
  { digit: 3, mask: [1, 1, 1, 1, 0, 0, 1] },
  { digit: 4, mask: [0, 1, 1, 0, 0, 1, 1] },
  { digit: 5, mask: [1, 0, 1, 1, 0, 1, 1] },
  { digit: 6, mask: [1, 0, 1, 1, 1, 1, 1] },
  { digit: 7, mask: [1, 1, 1, 0, 0, 0, 0] },
  { digit: 8, mask: [1, 1, 1, 1, 1, 1, 1] },
  { digit: 9, mask: [1, 1, 1, 1, 0, 1, 1] },
];

function computeOtsuThreshold(hist: Int32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVariance) {
      maxVariance = between;
      threshold = t;
    }
  }
  return threshold;
}

function sampleRegionDensity(
  mask: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number
): number {
  const sx0 = Math.max(0, Math.floor(x0 + rx0 * w));
  const sx1 = Math.max(sx0 + 1, Math.ceil(x0 + rx1 * w));
  const sy0 = Math.max(0, Math.floor(y0 + ry0 * h));
  const sy1 = Math.max(sy0 + 1, Math.ceil(y0 + ry1 * h));

  let hits = 0;
  let count = 0;
  for (let y = sy0; y < sy1; y++) {
    const rowOffset = y * imgW;
    for (let x = sx0; x < sx1; x++) {
      if (mask[rowOffset + x] === 1) hits++;
      count++;
    }
  }
  return count > 0 ? hits / count : 0;
}

function classifySevenSegmentDigit(
  mask: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  w: number,
  h: number
): { digit: number; confidence: number } | null {
  const aspect = w / h;

  // Narrow vertical digit is almost always '1' in 7-segment LCDs
  if (aspect < 0.36) {
    const verticalFill = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.15, 0.08, 0.85, 0.92);
    if (verticalFill > 0.32) {
      return { digit: 1, confidence: Math.min(0.96, 0.65 + verticalFill * 0.35) };
    }
    return null;
  }

  // Sample each of the 7 segments
  const a = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.24, 0.00, 0.76, 0.20);
  const b = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.70, 0.10, 1.00, 0.47);
  const c = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.70, 0.53, 1.00, 0.90);
  const d = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.24, 0.80, 0.76, 1.00);
  const e = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.00, 0.53, 0.30, 0.90);
  const f = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.00, 0.10, 0.30, 0.47);
  const g = sampleRegionDensity(mask, imgW, x0, y0, w, h, 0.24, 0.41, 0.76, 0.59);

  const raw = [a, b, c, d, e, f, g];
  const maxSeg = Math.max(...raw);
  if (maxSeg < 0.18) return null;

  // Normalize segment activation relative to strongest segment in this digit
  const norm = raw.map((v) => Math.min(1, v / Math.max(0.32, maxSeg * 0.85)));

  let bestDigit = -1;
  let bestErr = Infinity;
  let secondErr = Infinity;

  for (const tpl of SEGMENT_TEMPLATES) {
    let err = 0;
    for (let i = 0; i < 7; i++) {
      const diff = norm[i] - tpl.mask[i];
      err += diff * diff;
    }
    if (err < bestErr) {
      secondErr = bestErr;
      bestErr = err;
      bestDigit = tpl.digit;
    } else if (err < secondErr) {
      secondErr = err;
    }
  }

  if (bestDigit < 0) return null;

  const rmsErr = Math.sqrt(bestErr / 7);
  const margin = Math.max(0, Math.sqrt(secondErr / 7) - rmsErr);
  const confidence = Math.max(0, Math.min(1, 1 - rmsErr * 1.4 + margin * 0.35));

  if (confidence < 0.42) return null;
  return { digit: bestDigit, confidence };
}

export function recognizeSevenSegmentSpeed(
  imageData: ImageData,
  polarity: LcdPolarity = 'auto'
): OcrResult {
  const { width: w, height: h, data } = imageData;
  const total = w * h;
  const gray = new Uint8Array(total);
  const hist = new Int32Array(256);

  let borderSum = 0;
  let borderCount = 0;
  let centerSum = 0;
  let centerCount = 0;

  for (let y = 0; y < h; y++) {
    const isBorderY = y < h * 0.14 || y > h * 0.86;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const lum = Math.round(
        0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
      );
      gray[idx] = lum;
      hist[lum]++;

      if (isBorderY || x < w * 0.1 || x > w * 0.9) {
        borderSum += lum;
        borderCount++;
      } else {
        centerSum += lum;
        centerCount++;
      }
    }
  }

  // Check contrast span (p5 to p95) so blank surfaces return empty
  let acc = 0;
  let p5 = 0;
  let p95 = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * 0.05 && p5 === 0) p5 = i;
    if (acc >= total * 0.95) {
      p95 = i;
      break;
    }
  }

  const borderMean = borderCount > 0 ? borderSum / borderCount : 128;
  const centerMean = centerCount > 0 ? centerSum / centerCount : 128;
  const polarityUsed: 'dark-on-light' | 'light-on-dark' =
    polarity === 'auto'
      ? borderMean >= 95 || borderMean > centerMean + 3
        ? 'dark-on-light'
        : 'light-on-dark'
      : polarity;

  if (p95 - p5 < 22) {
    return {
      value: null,
      rawText: '',
      confidence: 0,
      digits: [],
      polarityUsed,
    };
  }

  const threshold = computeOtsuThreshold(hist, total);
  const binary = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    binary[i] =
      polarityUsed === 'dark-on-light'
        ? gray[i] < threshold - 4
          ? 1
          : 0
        : gray[i] > threshold + 4
        ? 1
        : 0;
  }

  // Slight 1px dilation merges separated 7-segment strokes inside a single digit
  const dilated = new Uint8Array(total);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      if (
        binary[idx] ||
        binary[idx - 1] ||
        binary[idx + 1] ||
        binary[idx - w] ||
        binary[idx + w]
      ) {
        dilated[idx] = 1;
      }
    }
  }

  // Connected-component labeling (BFS) on dilated mask
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const rawBoxes: Array<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    area: number;
  }> = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const start = y * w + x;
      if (!dilated[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const curr = queue[head++];
        const cx = curr % w;
        const cy = (curr / w) | 0;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [curr - 1, curr + 1, curr - w, curr + w];
        for (let k = 0; k < 4; k++) {
          const nb = neighbors[k];
          if (nb >= 0 && nb < total && dilated[nb] && !visited[nb]) {
            visited[nb] = 1;
            queue[tail++] = nb;
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const aspect = bw / bh;
      const fill = area / (bw * bh);

      if (
        bh >= Math.max(16, h * 0.3) &&
        bh <= h * 0.96 &&
        bw >= 4 &&
        aspect >= 0.12 &&
        aspect <= 0.96 &&
        fill >= 0.14 &&
        fill <= 0.95
      ) {
        rawBoxes.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, area });
      }
    }
  }

  if (rawBoxes.length === 0) {
    return {
      value: null,
      rawText: '',
      confidence: 0,
      digits: [],
      polarityUsed,
    };
  }

  // Keep only components similar in height to the main speed digits (excludes small "km/h" labels)
  const maxBoxH = Math.max(...rawBoxes.map((b) => b.y1 - b.y0 + 1));
  const digitCandidates = rawBoxes
    .filter((b) => b.y1 - b.y0 + 1 >= maxBoxH * 0.62)
    .sort((a, b) => a.x0 - b.x0);

  const detected: DigitDetection[] = [];
  for (const box of digitCandidates) {
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    const cls = classifySevenSegmentDigit(binary, w, box.x0, box.y0, bw, bh);
    if (cls) {
      detected.push({
        digit: cls.digit,
        confidence: cls.confidence,
        x: box.x0 / w,
        y: box.y0 / h,
        w: bw / w,
        h: bh / h,
      });
    }
  }

  if (detected.length === 0) {
    return {
      value: null,
      rawText: '',
      confidence: 0,
      digits: [],
      polarityUsed,
    };
  }

  // Keep up to 3 digits (motorcycle speed 0..150)
  const usedDigits = detected.slice(-3);
  const rawText = usedDigits.map((d) => String(d.digit)).join('');
  const parsed = Number.parseInt(rawText, 10);

  if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) {
    return {
      value: null,
      rawText,
      confidence: 0,
      digits: usedDigits,
      polarityUsed,
    };
  }

  const avgConfidence =
    usedDigits.reduce((accConf, d) => accConf + d.confidence, 0) /
    usedDigits.length;

  return {
    value: parsed,
    rawText,
    confidence: avgConfidence,
    digits: usedDigits,
    polarityUsed,
  };
}
