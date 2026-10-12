import crypto from "crypto";

export interface LoginSession {
  authorized: boolean;
  tgUserId?: number;
  expiresAt: number;
  ip?: string;
  code: string;
}

export const activeSessions = new Map<string, LoginSession>();
export const codeSessions = new Map<string, string>(); // code -> token

export function createLoginSession(ip?: string): { token: string; code: string } {
  cleanExpiredSessions();

  // Capacity protection: prevent memory bloat and code collisions under flood attacks
  if (codeSessions.size >= 1000) {
    for (const [token, session] of activeSessions.entries()) {
      if (!session.authorized) {
        activeSessions.delete(token);
        codeSessions.delete(session.code);
        if (codeSessions.size < 800) break;
      }
    }
  }

  const token = "session_" + crypto.randomBytes(32).toString("hex");
  
  // Generate a cryptographically secure unique 6-digit code with bounded retry guard
  let code = "";
  let tries = 0;
  do {
    code = crypto.randomInt(100000, 1000000).toString();
  } while (codeSessions.has(code) && ++tries < 50);

  if (codeSessions.has(code)) {
    throw new Error("Failed to generate unique login verification code after 50 attempts.");
  }

  activeSessions.set(token, {
    authorized: false,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry for login scan
    ip,
    code
  });
  
  codeSessions.set(code, token);
  
  return { token, code };
}

export function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(token);
      codeSessions.delete(session.code);
    }
  }
}

// Automatically clean up expired login sessions every 5 minutes
setInterval(() => {
  cleanExpiredSessions();
}, 5 * 60 * 1000);

