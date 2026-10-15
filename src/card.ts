import fs from "fs";
import path from "path";
import sharp from "sharp";
import { BotSettings } from "./types";
import { getXpRequiredForLevel } from "./database";

// Optimize sharp memory usage by disabling cache and restricting thread concurrency
sharp.cache(false);
sharp.concurrency(1);

// Helper to convert URL or local file to Base64 safely (prevents SSRF and directory traversal)
async function imageToBase64(imagePathOrUrl: string): Promise<string | null> {
  if (!imagePathOrUrl) return null;

  // If already a base64 data URI, return directly
  if (imagePathOrUrl.startsWith("data:")) {
    return imagePathOrUrl;
  }

  try {
    if (imagePathOrUrl.startsWith("http://") || imagePathOrUrl.startsWith("https://")) {
      // Security Check: SSRF prevention - only allow telegram CDN files
      if (!imagePathOrUrl.startsWith("https://api.telegram.org/")) {
        console.warn("SSRF Blocked: URL is not a Telegram API host", imagePathOrUrl);
        return null;
      }
      const res = await fetch(imagePathOrUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let contentType = res.headers.get("content-type") || "image/jpeg";
      if (contentType === "application/octet-stream") {
        if (imagePathOrUrl.toLowerCase().endsWith(".png")) {
          contentType = "image/png";
        } else if (imagePathOrUrl.toLowerCase().endsWith(".webp")) {
          contentType = "image/webp";
        } else if (imagePathOrUrl.toLowerCase().endsWith(".svg")) {
          contentType = "image/svg+xml";
        } else {
          contentType = "image/jpeg";
        }
      }
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } else {
      // Local static files: strictly confine to public/ directory
      const publicDir = path.resolve(process.cwd(), "public");
      const cleanRel = imagePathOrUrl.replace(/^[\/\\]+/, "").replace(/^public[\/\\]+/i, "");
      const absolutePath = path.resolve(publicDir, cleanRel);

      // Security Check: Directory Traversal prevention & allowed image extension whitelist
      if (!absolutePath.startsWith(publicDir + path.sep)) {
        console.warn("Directory Traversal Blocked: Path is outside public directory", absolutePath);
        return null;
      }

      const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
      const ext = path.extname(absolutePath).toLowerCase();
      if (!allowedExts.includes(ext)) {
        console.warn("Security Blocked: Non-image file type in imageToBase64", absolutePath);
        return null;
      }

      if (fs.existsSync(absolutePath)) {
        const buffer = await fs.promises.readFile(absolutePath);
        let mime = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".svg") mime = "image/svg+xml";
        else if (ext === ".webp") mime = "image/webp";
        return `data:${mime};base64,${buffer.toString("base64")}`;
      }
    }
  } catch (e) {
    console.error("Failed to convert image to Base64:", imagePathOrUrl, e);
  }
  return null;
}

// Generate colored placeholder avatar with user initials
function generateAvatarPlaceholder(name: string, color: string = "#7E57C2"): string {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  const escapedInitial = initial
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(color) ? color : "#7E57C2";
  const svg = `
    <svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${safeColor}"/>
      <text x="50%" y="55%" font-family="sans-serif" font-weight="bold" font-size="110" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${escapedInitial}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

interface CardData {
  level: number;
  rank: number;
  displayName: string;
  username: string | null;
  totalXp: number;
  avatarUrl: string | null; // Telegram direct avatar url
}

interface CardCacheEntry {
  buffer: Buffer;
  expiresAt: number;
}
const rankCardCache = new Map<string, CardCacheEntry>();

export async function generateRankCard(data: CardData, settings: BotSettings): Promise<Buffer> {
  const cacheKey = `${data.rank}_${data.displayName}_${data.level}_${data.totalXp}_${data.avatarUrl || ""}_${settings.card_bg_image || ""}_${settings.card_bg_color || ""}_${settings.card_text_color || ""}`;
  const cached = rankCardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer;
  }

  // 1. Prepare avatar base64
  let avatarBase64 = "";
  if (data.avatarUrl) {
    const base64 = await imageToBase64(data.avatarUrl);
    if (base64) avatarBase64 = base64;
  }
  if (!avatarBase64 && settings.default_avatar) {
    const base64 = await imageToBase64(settings.default_avatar);
    if (base64) avatarBase64 = base64;
  }
  if (!avatarBase64) {
    // Generate fallback placeholder
    avatarBase64 = generateAvatarPlaceholder(data.displayName, settings.card_progress_color || "#FFC107");
  }

  // 2. Prepare background base64 if configured
  let bgImageBase64 = "";
  if (settings.card_bg_image) {
    const base64 = await imageToBase64(settings.card_bg_image);
    if (base64) bgImageBase64 = base64;
  }

  // 3. XP calculation for progress bar
  const currentLevelMinXp = getXpRequiredForLevel(data.level);
  const nextXpTarget = getXpRequiredForLevel(data.level + 1);
  const currentXpInLevel = data.totalXp - currentLevelMinXp;
  const xpNeededInLevel = nextXpTarget - currentLevelMinXp;
  const progressRatio = Math.max(0, Math.min(1, currentXpInLevel / xpNeededInLevel));
  const progressWidth = Math.round(460 * progressRatio);

  // Sanitizing inputs for XML compatibility
  const escapedName = data.displayName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const escapedUsername = data.username
    ? `@${data.username}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : "";

  const textColor = /^#[0-9A-Fa-f]{3,8}$/.test(settings.card_text_color || "") ? (settings.card_text_color as string) : "#FFFFFF";
  const progressColor = /^#[0-9A-Fa-f]{3,8}$/.test(settings.card_progress_color || "") ? (settings.card_progress_color as string) : "#FFC107";
  const bgColor = /^#[0-9A-Fa-f]{3,8}$/.test(settings.card_bg_color || "") ? (settings.card_bg_color as string) : "#512DA8";

  // Use sanitization/fallback values for sizes
  const fontSizeLevel = settings.card_font_size_level || 70;
  const fontSizeRank = settings.card_font_size_rank || 70;
  const fontSizeName = settings.card_font_size_name || 28;
  const labelFontSize = Math.round(fontSizeLevel * 0.35); // Responsive label font size

  // Construct SVG Template
  const svg = `
    <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <!-- Clip path for the rounded card itself -->
        <clipPath id="card-clip">
          <rect width="600" height="600" rx="30" ry="30" />
        </clipPath>
        <!-- Clip path for the circular avatar -->
        <clipPath id="avatar-clip">
          <circle cx="300" cy="245" r="115" />
        </clipPath>
      </defs>

      <!-- Card Container with clip-path -->
      <g clip-path="url(#card-clip)">
        <!-- Solid background color -->
        <rect width="600" height="600" fill="${bgColor}" />
        
        <!-- Optional background image -->
        ${
          bgImageBase64
            ? `<image href="${bgImageBase64}" width="600" height="600" preserveAspectRatio="xMidYMid slice" />
               <!-- Overlay for text readability -->
               <rect width="600" height="600" fill="#000000" opacity="0.35" />`
            : ""
        }

        <!-- Top Left: LEVEL -->
        <text x="70" y="100" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="${labelFontSize}px" fill="${textColor}" opacity="0.75">LEVEL</text>
        <text x="70" y="165" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="${fontSizeLevel}px" fill="${textColor}">${data.level}</text>

        <!-- Top Right: RANK -->
        <text x="530" y="100" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="${labelFontSize}px" fill="${textColor}" opacity="0.75">RANK</text>
        <text x="530" y="165" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="${fontSizeRank}px" fill="${textColor}">#${data.rank}</text>

        <!-- Circular Avatar Border & Avatar Image -->
        <circle cx="300" cy="245" r="122" fill="none" stroke="${progressColor}" stroke-width="5" />
        <image href="${avatarBase64}" x="180" y="125" width="240" height="240" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />

        <!-- Display Name -->
        <text x="300" y="415" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="${fontSizeName}px" fill="${textColor}">${escapedName}</text>
        
        <!-- Username -->
        ${
          escapedUsername
            ? `<text x="300" y="450" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="18px" fill="${textColor}" opacity="0.7">${escapedUsername}</text>`
            : ""
        }

        <!-- Progress Bar Background track -->
        <rect x="70" y="490" width="460" height="22" rx="11" fill="${textColor}" opacity="0.2" />
        
        <!-- Progress Bar Active fill -->
        ${
          progressWidth > 0
            ? `<rect x="70" y="490" width="${progressWidth}" height="22" rx="11" fill="${progressColor}" />`
            : ""
        }

        <!-- XP Details Text -->
        <text x="300" y="555" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18px" fill="${textColor}">${data.totalXp} / ${nextXpTarget} XP</text>
      </g>
    </svg>
  `;

  // Render SVG to PNG using sharp
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

  if (rankCardCache.size > 150) {
    const now = Date.now();
    for (const [k, v] of rankCardCache.entries()) {
      if (v.expiresAt <= now) rankCardCache.delete(k);
    }
  }
  rankCardCache.set(cacheKey, { buffer, expiresAt: Date.now() + 20000 });
  return buffer;
}
