import React, { useEffect, useState } from 'react';
import { listSearchLogs, type SearchLog } from '../../services/searchLogsRepo';
import type { Profile } from '../../services/profilesRepo';
import { REAL_ESTATE_TYPES, TRADE_TYPE_LABELS } from '../../types';

interface MemberDetailModalProps {
  member: Profile;
  onClose: () => void;
}

type DetailTab = 'search' | 'inquiry';

function productLabel(code: string): string {
  return REAL_ESTATE_TYPES.find((t) => t.value === code)?.label ?? code;
}

function regionLabel(l: SearchLog): string {
  return [l.largeName, l.midName, l.smallName].filter(Boolean).join(' ') || '—';
}

function statusLabel(s: SearchLog['status']): string {
  switch (s) {
    case 'done': return '완료';
    case 'error': return '실패';
    case 'stopped': return '중지';
    case 'running': return '진행중';
  }
}

export function MemberDetailModal({ member, onClose }: MemberDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('search');
  const [logs, setLogs] = useState<SearchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listSearchLogs(member.id)
      .then((rows) => { if (alive) setLogs(rows); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [member.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card member-detail" onClick={(e) => e.stopPropagation()}>
        <button className="cm-close" onClick={onClose} title="닫기">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <h3 className="md-title">{member.name || member.email || '회원'} 상세</h3>
        <p className="md-sub">{member.email}</p>

        <div className="md-tabs">
          <button className={`md-tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>
            검색내역
          </button>
          <button className={`md-tab${tab === 'inquiry' ? ' active' : ''}`} onClick={() => setTab('inquiry')}>
            문의
          </button>
        </div>

        {tab === 'search' && (
          <div className="md-search">
            {loading ? (
              <div className="md-empty">불러오는 중…</div>
            ) : error ? (
              <div className="auth-msg err">{error}</div>
            ) : logs.length === 0 ? (
              <div className="md-empty">최근 6개월 검색내역이 없습니다.</div>
            ) : (
              <div className="md-log-table">
                <div className="md-log-row md-log-head">
                  <span>시각</span><span>지역</span><span>상품</span><span>거래</span>
                  <span>면적</span><span>결과</span><span>상태</span>
                </div>
                {logs.map((l) => (
                  <div className="md-log-row" key={l.id}>
                    <span className="md-log-time">{new Date(l.createdAt).toLocaleString('ko-KR', { hour12: false })}</span>
                    <span>{regionLabel(l)}</span>
                    <span>{productLabel(l.realEstateType)}</span>
                    <span>{l.tradeType ? (TRADE_TYPE_LABELS[l.tradeType] ?? l.tradeType) : '—'}</span>
                    <span>{l.areaLabel || '—'}</span>
                    <span>{l.resultCount != null ? `${l.resultCount.toLocaleString()}건` : '—'}</span>
                    <span className={`md-log-status ${l.status}`}>{statusLabel(l.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'inquiry' && (
          <div className="md-inquiry-placeholder md-empty">문의 기능은 곧 추가됩니다.</div>
        )}
      </div>
    </div>
  );
}
