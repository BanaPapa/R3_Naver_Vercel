import { useState, useEffect, useCallback } from 'react';
import { pingAgent, AgentStatus } from '../services/agentApi';

const POLL_INTERVAL_MS = 10_000; // 10초마다 재확인

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>('unknown');

  const check = useCallback(async () => {
    const result = await pingAgent();
    setStatus(result);
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check]);

  return { status, recheck: check };
}
