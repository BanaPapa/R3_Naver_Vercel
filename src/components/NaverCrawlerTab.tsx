import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SearchPanel } from './SearchPanel';
import { Monitor } from './Monitor';
import { ResultTable } from './ResultTable';
import { CrawlModal } from './CrawlModal';
import { SlotModal } from './SlotModal';
import { InfoModal } from './InfoModal';
import { useCrawler } from '../hooks/useCrawler';
import { useSlots } from '../hooks/useSlots';
import { useAgentStatus } from '../hooks/useAgentStatus';
import { CrawlerConfig, SavedSlot } from '../types';
import { AreaUnit, PriceUnit } from '../services/api';
import { setNaverBases, setNaverCrawlToken } from '../services/naverApi';
import { fetchCrawlToken } from '../services/agentApi';

interface NaverCrawlerTabProps {
  crawler: ReturnType<typeof useCrawler>;
  slots: ReturnType<typeof useSlots>;
  session: Session | null;
}

const AGENT_DOWNLOAD_URL =
  'https://github.com/BanaPapa/Estate-OS/releases/latest/download/Estate-OS-Agent-Setup.exe';

export function NaverCrawlerTab({ crawler, slots, session }: NaverCrawlerTabProps) {
  const { state, start, stop, skipDong, reset, clearLogs, load } = crawler;
  const [searchKey, setSearchKey] = useState(0);
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('thousand');
  const [ctrlCollapsed, setCtrlCollapsed] = useState(false);
  const [crawlModalOpen, setCrawlModalOpen] = useState(false);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const {
    status: agentStatus,
    cookieReady,
    bearerReady,
    loginLoading,
    loginError,
    loginJustSucceeded,
    recheck: recheckAgent,
    triggerLogin,
  } = useAgentStatus();

  // 로그인 직후 성공 화면 표시 (3.5초)
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const prevLoginSucceeded = useRef(false);
  useEffect(() => {
    if (loginJustSucceeded && !prevLoginSucceeded.current) {
      prevLoginSucceeded.current = true;
      setShowLoginSuccess(true);
      const t = setTimeout(() => setShowLoginSuccess(false), 3500);
      return () => clearTimeout(t);
    }
    if (!loginJustSucceeded) {
      prevLoginSucceeded.current = false;
    }
  }, [loginJustSucceeded]);

  // 에이전트 상태 변경 시 베이스 URL + 크롤 토큰 관리
  useEffect(() => {
    const agentRunning = agentStatus === 'running';
    setNaverBases(agentRunning);

    if (agentRunning && session?.access_token) {
      fetchCrawlToken(session.access_token)
        .then((token: string) => setNaverCrawlToken(token))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setNotice(`크롤 토큰 발급 실패: ${msg}`);
        });
    } else {
      setNaverCrawlToken(null);
    }
  }, [agentStatus, session]);

  const handleInstallConsent = () => {
    setInstallDone(true);
    window.location.href = AGENT_DOWNLOAD_URL;
  };

  const handleCloseInstallModal = () => {
    setShowInstallModal(false);
    setInstallDone(false);
  };

  const canSave = state.properties.length > 0 && state.lastConfig !== null;
  const savedCount = slots.slots.filter(Boolean).length;

  // 수집된 매물 기준 고유 단지 수 (수집 진행/완료 모달 표기용)
  const complexCount = useMemo(() => {
    const set = new Set<string>();
    for (const p of state.properties) {
      if (p.complexName) set.add(p.complexName);
    }
    return set.size;
  }, [state.properties]);

  // 첫 빈 슬롯에 저장
  const handleSaveSlot = () => {
    if (!state.lastConfig) return;
    const idx = slots.saveFirstEmpty(state.meta, state.lastConfig, state.properties);
    if (idx === -1) {
      alert('저장 슬롯이 가득 찼습니다 (최대 20개). 기존 슬롯을 삭제한 뒤 다시 시도해 주세요.');
      return;
    }
    setSlotModalOpen(true);
  };

  // 지정 슬롯에 저장/덮어쓰기
  const handleSaveAt = (index: number) => {
    if (!state.lastConfig) return;
    slots.saveAt(index, state.meta, state.lastConfig, state.properties);
  };

  // 슬롯 데이터를 현재 결과로 불러오기
  const handleLoad = (slot: SavedSlot) => {
    load(slot);
    setSlotModalOpen(false);
    setNotice('데이터를 성공적으로 불러왔습니다.');
  };

  // 같은 조건으로 재검색
  const handleReSearch = (slot: SavedSlot) => {
    setSlotModalOpen(false);
    handleStart(slot.config);
  };

  // 오류 발생 시 모달은 닫고 메인 화면에서 오류를 노출
  useEffect(() => {
    if (state.status === 'error') setCrawlModalOpen(false);
  }, [state.status]);

  const handleStart = (config: CrawlerConfig) => {
    setSearchKey((k) => k + 1);
    setCrawlModalOpen(true); // 검색 시작과 동시에 진행률 모달 표시
    start(config);
  };

  const canReset = state.status === 'done' || state.status === 'stopped';
  // 첫 수집 전(idle)에는 결과 영역(헤더 포함)을 대형 안내로 가린다.
  const showEmptyState = state.status === 'idle';

  // 에이전트 미실행 시 안내 화면 표시
  if (agentStatus === 'offline') {
    return (
      <div className="eos-state-screen">
        <div className="nv-agent-offline">
          <div className="nv-agent-offline-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12h8M12 8v8" strokeLinecap="round" />
            </svg>
          </div>
          <h2>로컬 에이전트가 실행되지 않고 있습니다</h2>
          <p>
            네이버 부동산 매물 검색은 사용자 PC에서 실행되는
            <br />
            <b>Estate-OS Agent</b> 프로그램을 통해 동작합니다.
          </p>
          <div className="nv-agent-steps">
            <div className="nv-agent-step">
              <span className="step-num">1</span>
              <span>아래 버튼을 눌러 에이전트를 설치합니다.</span>
            </div>
            <div className="nv-agent-step">
              <span className="step-num">2</span>
              <span>설치가 완료되면 트레이에 아이콘이 표시됩니다.</span>
            </div>
            <div className="nv-agent-step">
              <span className="step-num">3</span>
              <span>에이전트가 실행 중일 때 아래 재시도 버튼을 누르세요.</span>
            </div>
          </div>
          <div className="nv-agent-actions">
            <button className="btn-primary" onClick={() => setShowInstallModal(true)}>
              에이전트 설치
            </button>
            <button className="btn-outline" onClick={recheckAgent}>
              연결 재시도
            </button>
          </div>
        </div>

        {showInstallModal && (
          <div className="nv-install-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCloseInstallModal(); }}>
            <div className="nv-install-modal">
              <div className="nv-install-modal-header">
                <h3>Estate-OS Agent 설치</h3>
                <button className="nv-install-close" onClick={handleCloseInstallModal} aria-label="닫기">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {installDone ? (
                <div className="nv-install-done">
                  <div className="nv-install-done-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="nv-install-done-title">다운로드가 시작되었습니다!</p>
                  <p className="nv-install-done-desc">
                    파일 다운로드가 완료되면 실행해 주세요.
                    <br />
                    클릭 한 번으로 설치가 자동 완료됩니다.
                  </p>
                  <button className="btn-primary nv-install-action-btn" onClick={handleCloseInstallModal}>
                    확인
                  </button>
                </div>
              ) : (
                <div className="nv-install-modal-body">
                  <p>이 PC에 <b>Estate-OS Agent</b>를 설치합니다.</p>
                  <ul className="nv-install-list">
                    <li>설치 위치: 현재 사용자 앱 폴더 (관리자 권한 불필요)</li>
                    <li>Windows 시작 시 자동 실행 (트레이 상주)</li>
                    <li>네이버 부동산 요청을 로컬 IP로 중계</li>
                  </ul>
                  <div className="nv-install-modal-actions">
                    <button className="btn-outline" onClick={handleCloseInstallModal}>취소</button>
                    <button className="btn-primary nv-install-action-btn" onClick={handleInstallConsent}>
                      동의하고 설치
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 에이전트 실행 중이지만 네이버 로그인 안 됨
  if (agentStatus === 'running' && !cookieReady) {
    return (
      <div className="eos-state-screen">
        <div className="nv-agent-offline">
          <div className="nv-agent-offline-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l3 3" strokeLinecap="round" />
            </svg>
          </div>
          <h2>네이버 로그인이 필요합니다</h2>
          <p>
            아래 버튼을 누르면 네이버 로그인 창이 열립니다.
            <br />
            <b>평소처럼 네이버에 로그인</b>하면 자동으로 연결됩니다.
          </p>
          {loginError && (
            <div className="nv-login-error">{loginError}</div>
          )}
          <div className="nv-agent-actions">
            <button
              className="nv-login-btn"
              onClick={triggerLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <>
                  <span className="nv-login-spinner" />
                  로그인 창 열림 — 네이버에 로그인해 주세요…
                </>
              ) : (
                '네이버 로그인'
              )}
            </button>
          </div>
          {loginLoading && (
            <p style={{ fontSize: 13 }}>
              로그인 완료 후 창이 자동으로 닫힙니다. (최대 3분)
            </p>
          )}
        </div>
      </div>
    );
  }

  // 로그인 직후 성공 안내 (3.5초)
  if (agentStatus === 'running' && cookieReady && showLoginSuccess) {
    return (
      <div className="eos-state-screen">
        <div className="nv-agent-offline">
          <div className="nv-login-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 style={{ color: 'var(--blue)' }}>네이버 로그인 완료!</h2>
          <p>
            이제 매물 검색을 시작할 수 있습니다.
            <br />
            <span style={{ fontSize: 13 }}>잠시 후 검색 화면으로 전환됩니다…</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`eos-work${ctrlCollapsed ? ' ctrl-collapsed' : ''}`}>
      <SearchPanel
        status={state.status}
        onStart={handleStart}
        onStop={stop}
        onToggleCollapse={() => setCtrlCollapsed((v) => !v)}
      />

      <main className="eos-view">
        {cookieReady && !bearerReady && (
          <div className="nv-bearer-warn">
            Bearer 토큰이 만료되었습니다 — new.land API 검색이 실패할 수 있습니다.
            트레이 아이콘 우클릭 → <b>네이버 로그인</b>으로 갱신해 주세요.
          </div>
        )}
        <Monitor
          status={state.status}
          progress={state.progress}
          summary={state.summary}
          propertyCount={state.properties.length}
        />

        <div className="eos-card grow nv-result-card">
          {showEmptyState ? (
            <div className="nv-result-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M3 3v18h18" />
                <path d="M7 14l3-4 3 2 4-6" />
              </svg>
              <h2>아직 데이터 조회 전입니다</h2>
              <p>좌측에서 조건을 설정한 뒤 <b>데이터 수집 실행</b>을 눌러주세요.</p>
            </div>
          ) : (
          <>
          <div className="result-header">
            <span className="result-title">데이터 조회 결과</span>
            <div className="result-unit-controls">
              <div className="result-unit-group">
                <span className="result-unit-label">면적</span>
                <div className="space-unit-toggle">
                  <button
                    type="button"
                    className={`space-unit-btn ${areaUnit === 'sqm' ? 'active' : ''}`}
                    onClick={() => setAreaUnit('sqm')}
                  >
                    ㎡
                  </button>
                  <button
                    type="button"
                    className={`space-unit-btn ${areaUnit === 'pyeong' ? 'active' : ''}`}
                    onClick={() => setAreaUnit('pyeong')}
                  >
                    평
                  </button>
                </div>
              </div>
              <div className="result-unit-group">
                <span className="result-unit-label">가격</span>
                <div className="space-unit-toggle">
                  <button
                    type="button"
                    className={`space-unit-btn ${priceUnit === 'thousand' ? 'active' : ''}`}
                    onClick={() => setPriceUnit('thousand')}
                  >
                    천원
                  </button>
                  <button
                    type="button"
                    className={`space-unit-btn ${priceUnit === 'manwon' ? 'active' : ''}`}
                    onClick={() => setPriceUnit('manwon')}
                  >
                    만원
                  </button>
                </div>
              </div>
              <button
                className="btn-outline btn-sm"
                onClick={handleSaveSlot}
                disabled={!canSave}
                title="현재 수집 결과를 슬롯에 저장"
              >
                슬롯 저장
              </button>
              <button
                className="btn-outline btn-sm"
                onClick={() => setSlotModalOpen(true)}
              >
                저장 슬롯 {savedCount > 0 ? `(${savedCount})` : ''}
              </button>
              {canReset && (
                <button className="btn-ghost btn-sm" onClick={reset}>
                  초기화
                </button>
              )}
            </div>
          </div>

          <ResultTable
            key={searchKey}
            properties={state.properties}
            realEstateType={state.searchType}
            areaUnit={areaUnit}
            priceUnit={priceUnit}
            meta={state.meta}
          />
          </>
          )}
        </div>
      </main>

      {crawlModalOpen && (
        <CrawlModal
          dongs={state.dongs}
          logs={state.logs}
          status={state.status}
          regionName={state.regionName}
          summary={state.summary}
          propertyCount={state.properties.length}
          complexCount={complexCount}
          enumerateDongs={state.lastConfig?.enumerateDongs ?? false}
          onClose={() => setCrawlModalOpen(false)}
          onStop={stop}
          onClearLogs={clearLogs}
          onSkipDong={skipDong}
        />
      )}

      {slotModalOpen && (
        <SlotModal
          slots={slots.slots}
          priceUnit={priceUnit}
          areaUnit={areaUnit}
          canSave={canSave}
          onSaveAt={handleSaveAt}
          onLoad={handleLoad}
          onReSearch={handleReSearch}
          onDelete={slots.deleteSlot}
          onClose={() => setSlotModalOpen(false)}
        />
      )}

      {notice && <InfoModal message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
