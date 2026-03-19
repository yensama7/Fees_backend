import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'fees_admin_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 1000 * 60 * 15;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getEnvValue(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

const adminUsername = getEnvValue(process.env.ADMIN_USERNAME, 'admin');
const adminPassword = getEnvValue(process.env.ADMIN_PASSWORD, 'admin');
const sessionSecret = getEnvValue(process.env.SESSION_SECRET, 'replace-this-secret-before-production');

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(payload: string): string {
  return createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

function encodeSession(username: string): string {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const nonce = randomBytes(16).toString('hex');
  const payload = `${username}.${expiresAt}.${nonce}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(cookieValue: string | undefined): { username: string; expiresAt: number } | null {
  if (!cookieValue) {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const [username, expiresAtRaw, nonce, signature] = parts;
  const payload = `${username}.${expiresAtRaw}.${nonce}`;
  const expectedSignature = signPayload(payload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  return { username, expiresAt };
}

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export function isLoginRateLimited(request: NextRequest): { limited: boolean; retryAfter?: number } {
  const key = getClientKey(request);
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { limited: false };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { limited: false };
}

export function recordFailedLogin(request: NextRequest) {
  const key = getClientKey(request);
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  current.count += 1;
  loginAttempts.set(key, current);
}

export function clearFailedLogins(request: NextRequest) {
  loginAttempts.delete(getClientKey(request));
}

export function validateAdminCredentials(username: string, password: string): boolean {
  return safeEqual(username, adminUsername) && safeEqual(password, adminPassword);
}

export function createAdminSessionResponse(response: NextResponse, username: string): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession(username),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return response;
}

export function clearAdminSessionResponse(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export function getAdminSessionFromRequest(request: NextRequest): { username: string; expiresAt: number } | null {
  return decodeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export async function getAdminSessionFromCookies(): Promise<{ username: string; expiresAt: number } | null> {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function buildSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
  return response;
}
