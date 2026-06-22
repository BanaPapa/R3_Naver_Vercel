import React from 'react';
import { DongProgress, LogEntry, DoneSummary } from '../types';
import { CrawlerStatus } from '../hooks/useCrawler';
import { CrawlProgressPanel } from './CrawlProgressPanel';

interface CrawlModalProps {
  dongs: DongProgress[];
  logs: LogEntry[];
  status: CrawlerStatus;
  regionName: string;
  isAdmin: boolean;
  summary: DoneSummary | null;
  propertyCount: number;
  complexCount: number;
  enumerateDongs: boolean; // 중지역 동 순회 모드 → 동이 많아 모달을 크게(80vh)
  onClose: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  onSkipDong: (index: number) => void;
}

export function CrawlModal({
  dongs, logs, status, regionName, isAdmin, summary, propertyCount, complexCount, enumerateDongs,
  onClose, onStop, onClearLogs, onSkipDong,
}: CrawlModalProps) {
  const isDone = status === 'done';
  const isStopped = status === 'stopped';
  const isRunning = status === 'running';
  const durationSec = summary ? Math.round(summary.duration / 1000) : 0;
  const doneDongs = dongs.filter((d) => d.status === 'done').length;

  // 모달 밖(오버레이) 클릭으로는 닫히지 않음 — '결과 보기'/'닫기' 버튼으로만 닫힘
  return (
    <div className="modal-overlay">
      <div className={`modal-card crawl-modal ${enumerateDongs ? 'tall' : 'compact'}`}>
        {!isRunning && (
          <button className="cm-close" onClick={onClose} title="닫기">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}

        <div className="cm-body">
          {/* 좌: 동별 진행률 막대 */}
          <div className="cm-left">
            <CrawlProgressPanel
              dongs={dongs}
              logs={logs}
              status={status}
              regionName={regionName}
              isAdmin={isAdmin}
              onClearLogs={onClearLogs}
              onSkipDong={onSkipDong}
            />
          </div>

          {/* 우: 진행 중 라이브 카운트 / 완료 요약 */}
          <div className={`cm-right${isDone || isStopped ? ' done' : ''}`}>
            {isDone || isStopped ? (
              <>
                <h3 className="cm-done-title">
                  {isStopped ? (
                    <svg className="cm-done-ic stop" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <rect x="5" y="5" width="14" height="14" rx="2.5" />
                    </svg>
                  ) : (
                    <svg className="cm-done-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isStopped ? '조회 중지됨' : '조회 완료'}
                </h3>
                <p className="cm-done-sub">{regionName}</p>

                <div className="cm-stats">
                  <div className="cm-stat">
                    <span className="cm-v accent">{propertyCount.toLocaleString()}</span>
                    <span className="cm-l">수집 매물</span>
                  </div>
                  <div className="cm-stat">
                    <span className="cm-v">{complexCount.toLocaleString()}</span>
                    <span className="cm-l">수집 단지</span>
                  </div>
                  <div className="cm-stat">
                    <span className="cm-v">{doneDongs}/{dongs.length}</span>
                    <span className="cm-l">완료 동</span>
                  </div>
                  <div className="cm-stat">
                    <span className="cm-v">{durationSec.toLocaleString()}</span>
                    <span className="cm-l">소요(초)</span>
                  </div>
                </div>

                <button className="eos-run-btn cm-result-btn" onClick={onClose}>
                  결과 보기
                </button>
              </>
            ) : (
              <div className="cm-live">
                <div className="cm-live-spin" />
                <div className="cm-live-v">{propertyCount.toLocaleString()}</div>
                <div className="cm-live-l">건 수집 중…</div>
                <div className="cm-live-frac">{complexCount.toLocaleString()}개 단지</div>
                <button className="eos-run-btn stop cm-stop-btn" onClick={onStop}>
                  <svg viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                  수집 중지
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
