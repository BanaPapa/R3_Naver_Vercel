// Vercel Serverless Function — 승인된 사용자에게 단기 크롤 토큰 발급
// 에이전트가 네이버 프록시 요청 시 X-Crawl-Token 헤더로 이 토큰을 전달한다.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_SECONDS = 600; // 10분

function getSecret(): string {
  const secret = process.env.CRAWL_TOKEN_SECRET;
  if (!secret) throw new Error('CRAWL_TOKEN_SECRET 환경변수가 설정되지 않았습니다.');
  return secret;
}

export function signToken(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildCrawlToken(userId: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = JSON.stringify({ sub: userId, exp });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = signToken(b64, secret);
  return `${b64}.${sig}`;
}

export function verifyCrawlToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = signToken(b64, secret);
  try {
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return false;
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString()) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Supabase access token 추출
  const auth = req.headers.authorization ?? '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!accessToken) {
    res.status(401).json({ error: '인증 토큰이 없습니다.' });
    return;
  }

  // Supabase REST API로 사용자 조회
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Supabase 환경변수 미설정' });
    return;
  }

  try {
    // 1. 사용자 ID 조회 (access token 검증)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
      },
    });

    if (!userRes.ok) {
      res.status(401).json({ error: '유효하지 않은 세션입니다.' });
      return;
    }

    const user = (await userRes.json()) as { id?: string };
    const userId = user?.id;
    if (!userId) {
      res.status(401).json({ error: '사용자 정보를 가져올 수 없습니다.' });
      return;
    }

    // 2. profiles 테이블에서 승인 상태 확인
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=status`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
          Accept: 'application/json',
        },
      },
    );

    if (!profileRes.ok) {
      res.status(500).json({ error: '프로필 조회 실패' });
      return;
    }

    const profiles = (await profileRes.json()) as Array<{ status?: string }>;
    const profile = profiles[0];

    if (profile?.status !== 'approved') {
      res.status(403).json({ error: '승인된 사용자만 크롤 토큰을 발급받을 수 있습니다.' });
      return;
    }

    // 3. 크롤 토큰 발급
    const secret = getSecret();
    const token = buildCrawlToken(userId, secret);

    res.status(200).json({ token, expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
