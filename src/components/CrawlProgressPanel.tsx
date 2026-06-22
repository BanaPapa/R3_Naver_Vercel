import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DongProgress, LogEntry } from '../types';
import { CrawlerStatus } from '../hooks/useCrawler';

interface CrawlProgressPanelProps {
  dongs: DongProgress[];
  logs: LogEntry[];
  status: CrawlerStatus;
  regionName: string;
  isAdmin: boolean;
  onClearLogs: () => void;
  onSkipDong: (index: number) => void;
}

const LOG_MIN_H = 90;
const LOG_MAX_H = 560;
const LOG_DEFAULT_H = 200;

function levelIcon(level: LogEntry['level']): string {
  switch (level) {
    case 'info': return '●';
    case 'warn': return '▲';
    case 'error': return '✕';
    case 'success': return '✓';
  }
}

export function CrawlProgressPanel({
  dongs, logs, status, regionName, isAdmin, onClearLogs, onSkipDong,
}: CrawlProgressPanelProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [logHeight, setLogHeight] = useState(LOG_DEFAULT_H);
  const logRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // 펼친 로그는 항상 최신으로 스크롤
  useEffect(() => {
    if (logOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, logOpen]);

  // 진행 중인 동이 보이도록 자동 스크롤
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [dongs]);

  // 상세 로그 영역 ↕ 드래그 리사이즈 (위로 끌면 로그 영역 확대 / 동 목록 축소)
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = logHeight;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY; // 위로 드래그(음의 clientY 이동) → 로그 확대
      const next = Math.min(Math.max(startH + dy, LOG_MIN_H), LOG_MAX_H);
      setLogHeight(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logHeight]);

  // 검색 전/결과 없음 → 패널 숨김. 중지 시에도 마지막 진행 상태는 유지.
  const visible = status === 'running' || status === 'done' || status === 'stopped';
  if (!visible || dongs.length === 0) {
    return null;
  }

  const isRunning = status === 'running';
  const doneCount = dongs.filter((d) => d.status === 'done').length;

  return (
    <div className="crawl-prog">
      <div className="cp-head">
        <b>조회 진행{regionName ? ` · ${regionName}` : ''}</b>
        <span className="cp-frac">{doneCount} / {dongs.length}</span>
      </div>

      <div className="cp-list">
        {dongs.map((d, i) => {
          const isPresalePhase = d.phase === 'presale-price';
          // 수집 중일 때 대기/진행 동만 건너뛰기 가능 (분양권 가격 조회 바는 Skip 없음)
          const canSkip = isRunning && !isPresalePhase && (d.status === 'pending' || d.status === 'active');
          return (
            <React.Fragment key={`${d.name}-${i}`}>
              {isPresalePhase && (
                <div className="cp-presale-notice">
                  <span className="cp-presale-ic">✓</span>
                  <div>
                    <div className="cp-presale-title">단지 조회 완료</div>
                    <div className="cp-presale-msg">
                      이어 개별 분양권 가격 조회를 시작합니다.<br />
                      분양권 가격 조회는 시간이 많이 소요될 수 있습니다.
                    </div>
                  </div>
                </div>
              )}
              <div
                ref={d.status === 'active' ? activeRef : undefined}
                className={`cp-dong ${d.status}${d.status === 'done' && d.count === 0 ? ' empty' : ''}${isPresalePhase ? ' presale-phase' : ''}`}
              >
                <div className="cp-dong-main">
                  <div className="cp-dong-row">
                    <span className="cp-nm">
                      {d.status === 'active' ? '▸ ' : d.status === 'done' ? '✓ ' : d.status === 'skipped' ? '⏭ ' : ''}{d.name}
                    </span>
                    <span className="cp-ct">
                      {d.status === 'done'
                        ? (isPresalePhase ? `${d.count.toLocaleString()}건` : d.count.toLocaleString())
                        : d.status === 'active'
                          ? `${d.pct}%`
                          : d.status === 'skipped'
                            ? '건너뜀'
                            : '대기'}
                    </span>
                  </div>
                  <div className="cp-bar">
                    <i style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
                {canSkip && (
                  <button
                    type="button"
                    className="cp-skip"
                    onClick={() => onSkipDong(i)}
                    title="이 지역 건너뛰기"
                  >
                    Skip
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {isAdmin && (
        <div className="cp-log-wrap">
          {logOpen && (
            <div className="cp-resizer" onMouseDown={startResize} title="드래그하여 로그 영역 크기 조절">
              <span className="cp-resizer-grip" />
            </div>
          )}
          <button className="cp-log-toggle" onClick={() => setLogOpen((v) => !v)}>
            <svg className={`caret${logOpen ? ' open' : ''}`} viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" />
            </svg>
            상세 로그
            <span className="cp-log-count">{logs.length > 0 ? logs.length : ''}</span>
          </button>

          {logOpen && (
            <>
              <div className="cp-log-body" ref={logRef} style={{ height: logHeight }}>
                {logs.length === 0 ? (
                  <div className="cp-log-empty">로그가 없습니다</div>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className={`cp-log-entry log-${entry.level}`}>
                      <span className="cp-log-ic">{levelIcon(entry.level)}</span>
                      <span className="cp-log-msg">{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
              <button
                className="btn-ghost btn-sm cp-log-clear"
                onClick={onClearLogs}
                disabled={logs.length === 0}
              >
                지우기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
