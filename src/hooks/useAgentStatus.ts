import { useState, useEffect, useCallback } from 'react';
import { pingAgent, getCookieStatus, startNaverLogin, AgentStatus, CookieStatus } from '../services/agentApi';

const POLL_INTERVAL_MS = 10_000;

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>('unknown');
  const [cookieReady, setCookieReady] = useState(false);
  const [bearerReady, setBearerReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginJustSucceeded, setLoginJustSucceeded] = useState(false);

  const check = useCallback(async (): Promise<CookieStatus | null> => {
    const agentSt = await pingAgent();
    setStatus(agentSt);
    if (agentSt === 'running') {
      const cs = await getCookieStatus();
      setCookieReady(cs.hasCookies);
      setBearerReady(cs.hasBearer);
      return cs;
    } else {
      setCookieReady(false);
      setBearerReady(false);
      return null;
    }
  }, []);

  const triggerLogin = useCallback(async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await startNaverLogin();
      // 실제 상태를 에이전트에서 확인 — bearer 캡처 여부를 정확히 반영
      const cs = await check();
      // 쿠키와 bearer 모두 정상일 때만 성공 화면 표시.
      // bearer 미캡처(창 조기 닫힘 등) 시에는 성공 화면 없이 검색 화면으로 가고
      // bearer 경고 배너가 뜨면서 재로그인 버튼이 안내함.
      if (cs?.hasCookies && cs?.hasBearer) {
        setLoginJustSucceeded(true);
        setTimeout(() => setLoginJustSucceeded(false), 5000);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoginLoading(false);
    }
  }, [check]);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check]);

  return { status, cookieReady, bearerReady, loginLoading, loginError, loginJustSucceeded, recheck: check, triggerLogin };
}
