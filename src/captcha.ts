import sharp from "sharp";
import { shuffleArray } from "./utils";

export interface CaptchaResult {
  pngBuffer?: Buffer;
  answer: string;
  expression?: string;
  options?: string[]; // 4 shuffled multiple choice options (1 correct + 3 distractors)
}

const WIDTH = 320;
const HEIGHT = 100;

// Generate random integer between min and max inclusive
function getRandomInt(min: number, max: number): number {
  const minInt = Math.ceil(min);
  const maxInt = Math.floor(max);
  return Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;
}

// Generate random RGB color string
function getRandomColor(min = 50, max = 220): string {
  const r = getRandomInt(min, max);
  const g = getRandomInt(min, max);
  const b = getRandomInt(min, max);
  return `rgb(${r},${g},${b})`;
}


/**
 * 1. Math Formula Captcha Generator (Blur background + Top-layer interference lines OVER text)
 */
export async function generateMathCaptcha(): Promise<CaptchaResult> {
  try {
    const ops = ["+", "-", "×"];
    const op = ops[getRandomInt(0, ops.length - 1)];

    let num1 = 0;
    let num2 = 0;
    let answer = 0;

    if (op === "+") {
      num1 = getRandomInt(5, 50);
      num2 = getRandomInt(5, 50);
      answer = num1 + num2;
    } else if (op === "-") {
      num1 = getRandomInt(15, 60);
      num2 = getRandomInt(1, num1 - 1);
      answer = num1 - num2;
    } else {
      num1 = getRandomInt(2, 9);
      num2 = getRandomInt(2, 9);
      answer = num1 * num2;
    }

    const expressionText = `${num1} ${op} ${num2} = ?`;

    // Generate 3 distractor options with max-iteration loop guard
    const distractors = new Set<number>();
    let loopCount = 0;
    while (distractors.size < 3 && loopCount++ < 100) {
      const offset = getRandomInt(-6, 6);
      const fake = answer + offset;
      if (fake !== answer && fake >= 0) {
        distractors.add(fake);
      }
    }
    // Fallback if loop guard triggered
    let fallbackOffset = 1;
    let fallbackTries = 0;
    while (distractors.size < 3 && fallbackTries++ < 50) {
      if (answer + fallbackOffset !== answer) {
        distractors.add(Math.abs(answer + fallbackOffset));
      }
      fallbackOffset++;
    }

    const options = shuffleArray([String(answer), ...Array.from(distractors).map(String)]);

    // Layer A: Background Blur Noise
    const bgCircles: string[] = [];
    for (let i = 0; i < 25; i++) {
      const cx = getRandomInt(0, WIDTH);
      const cy = getRandomInt(0, HEIGHT);
      const r = getRandomInt(12, 35);
      const color = getRandomColor(40, 160);
      bgCircles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.35" filter="url(#bgBlur)"/>`);
    }

    // Layer B: Top Interference Lines OVER text
    const topLines: string[] = [];
    for (let i = 0; i < 14; i++) {
      const x1 = getRandomInt(0, WIDTH);
      const y1 = getRandomInt(0, HEIGHT);
      const x2 = getRandomInt(0, WIDTH);
      const y2 = getRandomInt(0, HEIGHT);
      const color = getRandomColor(120, 255);
      const strokeWidth = getRandomInt(2, 4);
      topLines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" opacity="0.75"/>`);
    }

    // Layer C: Top Curved Paths OVER text
    const topCurves: string[] = [];
    for (let i = 0; i < 3; i++) {
      const x1 = getRandomInt(0, 50);
      const y1 = getRandomInt(10, 90);
      const cx1 = getRandomInt(80, 160);
      const cy1 = getRandomInt(0, HEIGHT);
      const cx2 = getRandomInt(160, 240);
      const cy2 = getRandomInt(0, HEIGHT);
      const x2 = getRandomInt(260, WIDTH);
      const y2 = getRandomInt(10, 90);
      const color = getRandomColor(150, 255);
      topCurves.push(`<path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" stroke="${color}" stroke-width="3" fill="none" opacity="0.8"/>`);
    }

    // Layer D: Top Noise Dots OVER text
    const topDots: string[] = [];
    for (let i = 0; i < 60; i++) {
      const cx = getRandomInt(0, WIDTH);
      const cy = getRandomInt(0, HEIGHT);
      const r = getRandomInt(1, 3);
      const color = getRandomColor(140, 255);
      topDots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.7"/>`);
    }

    const rotateDeg = getRandomInt(-6, 6);
    const textColor = "#ffffff";
    const textStroke = getRandomColor(180, 255);

    const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bgBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6"/>
        </filter>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#141428"/>
          <stop offset="100%" stop-color="#2a1e38"/>
        </linearGradient>
      </defs>
      <!-- Layer 1: Background Base -->
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" rx="10"/>
      ${bgCircles.join("\n")}

      <!-- Layer 2: Text Layer (Middle) -->
      <g transform="translate(160, 52) rotate(${rotateDeg})">
        <text font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="${textColor}" stroke="${textStroke}" stroke-width="1.2" text-anchor="middle" dominant-baseline="central" letter-spacing="3">
          ${expressionText}
        </text>
      </g>

      <!-- Layer 3: OVER-TEXT Lines, Curves & Noise Dots (Top Layer) -->
      ${topLines.join("\n")}
      ${topCurves.join("\n")}
      ${topDots.join("\n")}
    </svg>
    `;

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      pngBuffer,
      answer: String(answer),
      expression: expressionText,
      options,
    };
  } catch (err: any) {
    console.error("Error generating Math Captcha:", err);
    throw err;
  }
}

/**
 * 2. Fixed 6-Character Distorted Text Captcha Generator (Heavy blur + per-char rotation + Top-layer lines OVER text)
 */
export async function generateTextCaptcha(): Promise<CaptchaResult> {
  try {
    const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[getRandomInt(0, chars.length - 1)];
    }

    // Generate 3 distractor options with max-iteration loop guard
    const distractors = new Set<string>();
    let loopCount = 0;
    while (distractors.size < 3 && loopCount++ < 100) {
      const codeArr = code.split("");
      const mutateIdx = getRandomInt(0, 5);
      codeArr[mutateIdx] = chars[getRandomInt(0, chars.length - 1)];
      const fakeCode = codeArr.join("");
      if (fakeCode !== code) {
        distractors.add(fakeCode);
      }
    }
    // Fallback if loop guard triggered
    let fallbackTries = 0;
    while (distractors.size < 3 && fallbackTries++ < 50) {
      let fallbackCode = "";
      for (let i = 0; i < 6; i++) {
        fallbackCode += chars[getRandomInt(0, chars.length - 1)];
      }
      if (fallbackCode !== code) {
        distractors.add(fallbackCode);
      }
    }

    const options = shuffleArray([code, ...Array.from(distractors)]);

    // Layer A: Background Heavy Blur Blobs
    const bgBlobs: string[] = [];
    for (let i = 0; i < 30; i++) {
      const cx = getRandomInt(0, WIDTH);
      const cy = getRandomInt(0, HEIGHT);
      const r = getRandomInt(10, 40);
      const color = getRandomColor(30, 180);
      bgBlobs.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.4" filter="url(#textBgBlur)"/>`);
    }

    // Layer B: Characters Layer (Middle Text Layer)
    const charSvgElements: string[] = [];
    const startX = 35;
    const stepX = 46;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const x = startX + i * stepX;
      const y = getRandomInt(44, 58);
      const rotate = getRandomInt(-28, 28);
      const fontSize = getRandomInt(34, 42);
      const color = getRandomColor(190, 255);
      const stroke = getRandomColor(100, 250);

      charSvgElements.push(`
        <text font-family="'Courier New', Courier, monospace, sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}" stroke="${stroke}" stroke-width="1"
              transform="translate(${x}, ${y}) rotate(${rotate})" text-anchor="middle" dominant-baseline="central">
          ${char}
        </text>
      `);
    }

    // Layer C: Top Lines OVER text
    const topLines: string[] = [];
    for (let i = 0; i < 16; i++) {
      const x1 = getRandomInt(0, WIDTH);
      const y1 = getRandomInt(0, HEIGHT);
      const x2 = getRandomInt(0, WIDTH);
      const y2 = getRandomInt(0, HEIGHT);
      const color = getRandomColor(130, 255);
      const strokeWidth = getRandomInt(2, 4);
      topLines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" opacity="0.75"/>`);
    }

    // Layer D: Top Bezier Curves OVER text
    const topCurves: string[] = [];
    for (let i = 0; i < 4; i++) {
      const x1 = getRandomInt(0, 40);
      const y1 = getRandomInt(10, 90);
      const cx1 = getRandomInt(60, 160);
      const cy1 = getRandomInt(0, HEIGHT);
      const cx2 = getRandomInt(160, 260);
      const cy2 = getRandomInt(0, HEIGHT);
      const x2 = getRandomInt(270, WIDTH);
      const y2 = getRandomInt(10, 90);
      const color = getRandomColor(160, 255);
      topCurves.push(`<path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" stroke="${color}" stroke-width="3.5" fill="none" opacity="0.85"/>`);
    }

    // Layer E: Top Noise Dots OVER text (Fixed float argument Bug: getRandomInt(1, 3))
    const topDots: string[] = [];
    for (let i = 0; i < 70; i++) {
      const cx = getRandomInt(0, WIDTH);
      const cy = getRandomInt(0, HEIGHT);
      const r = getRandomInt(1, 3);
      const color = getRandomColor(150, 255);
      topDots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.75"/>`);
    }

    const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="textBgBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
        <linearGradient id="textBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#121222"/>
          <stop offset="100%" stop-color="#241830"/>
        </linearGradient>
      </defs>
      <!-- Layer 1: Background Base & Heavy Blur Blobs -->
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#textBgGrad)" rx="10"/>
      ${bgBlobs.join("\n")}

      <!-- Layer 2: Characters Layer (Middle) -->
      ${charSvgElements.join("\n")}

      <!-- Layer 3: OVER-TEXT Lines, Wavy Curves & Noise Particles (Top Layer) -->
      ${topLines.join("\n")}
      ${topCurves.join("\n")}
      ${topDots.join("\n")}
    </svg>
    `;

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      pngBuffer,
      answer: code.toUpperCase(),
      options,
    };
  } catch (err: any) {
    console.error("Error generating Text Captcha:", err);
    throw err;
  }
}
