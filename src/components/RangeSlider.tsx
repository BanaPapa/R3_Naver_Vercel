import React from 'react';

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  lo: number;                       // 현재 하한 (0 = 하한 없음)
  hi: number;                       // 현재 상한 (0 = 상한 없음)
  unit?: string;
  format?: (v: number) => string;   // 라벨 표기 포맷 (기본: toLocaleString)
  onChange: (lo: number, hi: number) => void;
}

// 이중 손잡이 범위 슬라이더. 두 개의 range input 을 겹쳐 하한/상한을 조절한다.
// 부모는 lo/hi 의 0 을 '제한 없음'으로 해석한다(여기선 표시상 min/max 로 환산).
export function RangeSlider({ label, min, max, step, lo, hi, unit = '', format, onChange }: RangeSliderProps) {
  const fmt = format ?? ((v: number) => v.toLocaleString());
  const safeMax = max > min ? max : min + 1;

  const loVal = lo > 0 ? Math.min(Math.max(lo, min), safeMax) : min;
  const hiVal = hi > 0 ? Math.min(Math.max(hi, min), safeMax) : safeMax;

  const pct = (v: number) => ((v - min) / (safeMax - min)) * 100;

  const handleLo = (v: number) => onChange(Math.min(v, hiVal), hiVal);
  const handleHi = (v: number) => onChange(loVal, Math.max(v, loVal));

  return (
    <div className="range-slider" title={`${label} 범위`}>
      <div className="rs-head">
        <span className="rs-label">{label}</span>
        <span className="rs-vals">{fmt(loVal)} ~ {fmt(hiVal)}{unit}</span>
      </div>
      <div className="rs-track">
        <div className="rs-fill" style={{ left: `${pct(loVal)}%`, right: `${100 - pct(hiVal)}%` }} />
        <input
          type="range" className="rs-input rs-input-lo"
          min={min} max={safeMax} step={step} value={loVal}
          onChange={(e) => handleLo(Number(e.target.value))}
          aria-label={`${label} 최소`}
        />
        <input
          type="range" className="rs-input rs-input-hi"
          min={min} max={safeMax} step={step} value={hiVal}
          onChange={(e) => handleHi(Number(e.target.value))}
          aria-label={`${label} 최대`}
        />
      </div>
    </div>
  );
}
