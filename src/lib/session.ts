/* VisionDine server-side session + RBAC.
   HMAC-signed httpOnly cookie. PIN login. All checks run on the server. */
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SECRET = process.env.AUTH_SECRET || "visiondine-dev-secret-2f8a";
export const SESSION_COOKIE = "vd_session";

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "WAITER" | "KITCHEN" | "INVENTORY";

export type Session = {
  staffId: string;
  name: string;
  role: Role;
  ts: number;
};

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function makeToken(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): Session | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    // sessions valid for 12h
    if (Date.now() - s.ts > 12 * 3600 * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Throws HttpError when the caller lacks the role. */
export async function requireRole(roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Sign in required");
  if (!roles.includes(s.role)) throw new HttpError(403, "Not allowed for your role");
  return s;
}

/** Manager override via PIN (for discounts/cancellations performed at counter). */
export async function authorizeManagerPin(pin: string): Promise<{ name: string; role: string }> {
  const staff = await db.staff.findFirst({ where: { pin, active: true, role: { in: ["OWNER", "MANAGER"] } } });
  if (!staff) throw new HttpError(403, "Invalid manager PIN");
  return { name: staff.name, role: staff.role };
}

export async function logAudit(staffName: string, role: string, action: string, detail: string) {
  await db.auditLog.create({ data: { staffName, role, action, detail } });
}

/** Uniform error envelope for API routes. */
export function errorResponse(e: unknown): { error: string; status: number } {
  if (e instanceof HttpError) return { error: e.message, status: e.status };
  console.error("[api]", e);
  return { error: e instanceof Error ? e.message : "Something went wrong", status: 500 };
}
