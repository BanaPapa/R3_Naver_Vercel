// Vercel Serverless Function — 승인된 사용자에게 단기 크롤 토큰 발급
// 에이전트가 네이버 프록시 요청 시 X-Crawl-Token 헤더로 이 토큰을 전달한다.
//
// ⚠️ 이 함수는 의도적으로 self-contained(상대경로 import 0개)다.
//   이 Vercel 프로젝트에서는 api/ 함수가 상대경로 모듈(./_core, ../lib/...)을 import하면
//   런타임에 그 의존성이 번들에 포함되지 않아 모듈 로드 단계에서 크래시
//   (FUNCTION_INVOCATION_FAILED, 본문 없는 맨 500)한다. 핸들러 진입 전에 죽으므로
//   구조화 에러조차 못 내보낸다. 정상 동작하는 다른 함수(ping/naver-proxy)는 모두
//   상대경로 import가 없다. → 발급 로직을 이 파일 안에 인라인한다.
//   동일 로직의 공유본은 lib/crawlTokenCore.ts (로컬 Vite 미들웨어 전용). 서명 규칙을
//   바꿀 땐 두 곳을 함께 수정할 것. (의존성은 node 내장 crypto + 전역 fetch뿐)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

const TOKEN_TTL_SECONDS = 600; // 10분

function buildCrawlToken(userId: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = JSON.stringify({ sub: userId, exp });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

interface IssueResult {
  status: number;
  body: Record<string, unknown>;
}

// Supabase 세션 검증 → 승인 상태 확인 → 단기 서명 토큰 발급.
async function issueCrawlToken(
  accessToken: string,
  env: { supabaseUrl?: string; supabaseKey?: string; secret?: string },
): Promise<IssueResult> {
  if (!accessToken) {
    return { status: 401, body: { error: '인증 토큰이 없습니다.' } };
  }

  const { supabaseUrl, supabaseKey, secret } = env;
  if (!supabaseUrl || !supabaseKey) {
    return { status: 500, body: { error: 'Supabase 환경변수 미설정' } };
  }
  if (!secret) {
    return { status: 500, body: { error: 'CRAWL_TOKEN_SECRET 환경변수가 설정되지 않았습니다.' } };
  }

  try {
    // 1. 사용자 ID 조회 (access token 검증)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey },
    });
    if (!userRes.ok) {
      return { status: 401, body: { error: '유효하지 않은 세션입니다.' } };
    }

    const user = (await userRes.json()) as { id?: string };
    const userId = user?.id;
    if (!userId) {
      return { status: 401, body: { error: '사용자 정보를 가져올 수 없습니다.' } };
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
      return { status: 500, body: { error: '프로필 조회 실패' } };
    }

    const profiles = (await profileRes.json()) as Array<{ status?: string }>;
    if (profiles[0]?.status !== 'approved') {
      return { status: 403, body: { error: '승인된 사용자만 크롤 토큰을 발급받을 수 있습니다.' } };
    }

    // 3. 크롤 토큰 발급
    const token = buildCrawlToken(userId, secret);
    return { status: 200, body: { token, expiresIn: TOKEN_TTL_SECONDS } };
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const auth = req.headers.authorization ?? '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  const { status, body } = await issueCrawlToken(accessToken, {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    secret: process.env.CRAWL_TOKEN_SECRET,
  });

  res.status(status).json(body);
}
