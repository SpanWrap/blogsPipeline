import { appConfig } from "../config";
import {
  AUTH_COOKIE,
  parseCookies,
  verifySession,
  type SessionUser,
} from "../services/auth";

export type { SessionUser };

export function sessionFromCookieHeader(cookieHeader: string | null): SessionUser | null {
  const token = parseCookies(cookieHeader ?? undefined)[AUTH_COOKIE];
  if (!token) return null;
  try {
    return verifySession(token);
  } catch {
    return null;
  }
}

export function buildSessionCookie(token: string, secure: boolean, maxAgeSec?: number): string {
  const days = appConfig.auth.sessionDays;
  const maxAge = maxAgeSec ?? days * 24 * 60 * 60;
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(secure: boolean): string {
  return buildSessionCookie("deleted", secure, 0);
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    const proto = forwarded.split(",")[0]!.trim().toLowerCase();
    if (proto === "https") return true;
    if (proto === "http") return false;
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
