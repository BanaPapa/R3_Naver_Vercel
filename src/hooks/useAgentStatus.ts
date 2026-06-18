import { useState, useEffect, useCallback } from 'react';
import { pingAgent, getCookieStatus, startNaverLogin, AgentStatus } from '../services/agentApi';

const POLL_INTERVAL_MS = 10_000;

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>('unknown');
  const [cookieReady, setCookieReady] = useState(false);
  const [bearerReady, setBearerReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginJustSucceeded, setLoginJustSucceeded] = useState(false);

  const check = useCallback(async () => {
    const agentSt = await pingAgent();
    setStatus(agentSt);
    if (agentSt === 'running') {
      const cs = await getCookieStatus();
      setCookieReady(cs.hasCookies);
      setBearerReady(cs.hasBearer);
    } else {
      setCookieReady(false);
      setBearerReady(false);
    }
  }, []);

  const triggerLogin = useCallback(async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await startNaverLogin();
      setCookieReady(true);
      setBearerReady(true);
      setLoginJustSucceeded(true);
      // 5초 후 플래그 초기화 (성공 화면이 3.5초간 표시된 뒤)
      setTimeout(() => setLoginJustSucceeded(false), 5000);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoginLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check]);

  return { status, cookieReady, bearerReady, loginLoading, loginError, loginJustSucceeded, recheck: check, triggerLogin };
}
