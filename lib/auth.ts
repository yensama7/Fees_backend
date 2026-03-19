import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'fees_admin_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 1000 * 60 * 15;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const encoder = new TextEncoder();

function getEnvValue(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

const adminUsername = getEnvValue(process.env.ADMIN_USERNAME, 'admin');
const adminPassword = getEnvValue(process.env.ADMIN_PASSWORD, 'admin');
const sessionSecret = getEnvValue(process.env.SESSION_SECRET, 'replace-this-secret-before-production');

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function getHmacKey() {
  return crypto.subtle.importKey('raw', encoder.encode(sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signPayload(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await getHmacKey(), encoder.encode(payload));
  return toHex(signature);
}

async function encodeSession(username: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const payload = `${username}.${expiresAt}.${nonce}`;
  const signature = await signPayload(payload);
  return `${payload}.${signature}`;
}

async function decodeSession(cookieValue: string | undefined): Promise<{ username: string; expiresAt: number } | null> {
  if (!cookieValue) {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const [username, expiresAtRaw, nonce, signature] = parts;
  const payload = `${username}.${expiresAtRaw}.${nonce}`;
  const expectedSignature = await signPayload(payload);

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

export async function createAdminSessionResponse(response: NextResponse, username: string): Promise<NextResponse> {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await encodeSession(username),
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

export async function getAdminSessionFromRequest(request: NextRequest): Promise<{ username: string; expiresAt: number } | null> {
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
  response.headers.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
  return response;
}
