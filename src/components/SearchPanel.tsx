import React, { useState } from 'react';
import { RegionSelect } from './RegionSelect';
import { FilterSelect, AreaMode } from './FilterSelect';
import { ConfirmModal } from './ConfirmModal';
import { RegionSelection, SPACE_OPTIONS, isExclusiveSpaceType } from '../types';
import { CrawlerStatus } from '../hooks/useCrawler';

const PYEONG_TO_SQM = 3.30579;

// 하위지역(소지역) 미선택 경고 문구. \n 줄바꿈은 ConfirmModal에서 pre-line으로 렌더.
const NO_SUBREGION_WARNING =
  '하위 지역을 선택하지 않고 검색을 진행할 경우,\n' +
  '많은 매물량으로 인해 IP가 일시적으로 차단될 수 있습니다.\n' +
  '\n' +
  '일부 지역만 필요하신 경우\n' +
  '하위 지역까지 선택하시기 바랍니다.\n' +
  '\n' +
  '하위 지역 선택 없이 이대로 진행하시겠습니까?';

interface StartConfig {
  legalDivisionCode: string;
  legalDivisionName: string;
  tradeType: string;
  realEstateType: string;
  spcMin: number;
  spcMax: number;
  largeName: string;
  midName: string;
  smallName: string;
  midCode: string;
  enumerateDongs: boolean;
  areaLabel: string;
}

interface SearchPanelProps {
  status: CrawlerStatus;
  onStart: (config: StartConfig) => void;
  onStop: () => void;
  onToggleCollapse: () => void;
}

export function SearchPanel({ status, onStart, onStop, onToggleCollapse }: SearchPanelProps) {
  const [region, setRegion] = useState<RegionSelection>({
    large: null,
    mid: null,
    small: null,
  });
  const [realEstateType, setRealEstateType] = useState('APT:JGC:JGB');
  const [tradeType, setTradeType] = useState('A1');
  const [spaceIndex, setSpaceIndex] = useState(0);
  const [areaMode, setAreaMode] = useState<AreaMode>('preset');
  const [exclusivePyeongMin, setExclusivePyeongMin] = useState(0);
  const [exclusivePyeongMax, setExclusivePyeongMax] = useState(0);
  const [supplyPyeongMin, setSupplyPyeongMin] = useState(0);
  const [supplyPyeongMax, setSupplyPyeongMax] = useState(0);
  const [spaceUnit, setSpaceUnit] = useState<'pyeong' | 'sqm'>('pyeong');
  // 소지역 미선택 경고 모달 — 확인 대기 중인 검색 설정을 보관
  const [pendingConfig, setPendingConfig] = useState<StartConfig | null>(null);

  const handleRealEstateTypeChange = (v: string) => {
    setRealEstateType(v);
    setSpaceIndex(0);
    setAreaMode('preset');
    setExclusivePyeongMin(0);
    setExclusivePyeongMax(0);
    setSupplyPyeongMin(0);
    setSupplyPyeongMax(0);
  };

  const isRunning = status === 'running';
  const disabled = isRunning;

  const getLegalDivisionCode = (): string => {
    const code = region.small?.code ?? region.mid?.code ?? region.large?.code ?? '';
    if (code.length === 8) return code + '00';
    if (code.length === 5) return code + '00000';
    if (code.length === 2) return code + '00000000';
    return code;
  };

  const buildPreview = (): string => {
    const large = region.large?.name.trim() ?? '';
    const mid = region.mid?.name.trim() ?? '';
    const small = region.small?.name.trim() ?? '';
    const parts: string[] = [];
    if (mid && mid !== large) parts.push(mid);
    else if (large) parts.push(large);
    if (small) parts.push(small);
    return parts.join(' ');
  };

  const handleStart = () => {
    if (!region.large) {
      alert('시/도를 선택해주세요');
      return;
    }
    const legalDivisionCode = getLegalDivisionCode();
    // 빌라/단독·다가구는 면적 필터 없음 → 전체 수집
    const noAreaFilter = realEstateType === 'VL' || realEstateType === 'DDDGG';
    let spcMin: number;
    let spcMax: number;
    if (noAreaFilter) {
      spcMin = 0;
      spcMax = 0;
    } else if (isExclusiveSpaceType(realEstateType)) {
      // 오피스텔 등: 전용면적 직접설정
      spcMin = exclusivePyeongMin > 0 ? exclusivePyeongMin * PYEONG_TO_SQM : 0;
      spcMax = exclusivePyeongMax > 0 ? exclusivePyeongMax * PYEONG_TO_SQM : 99999;
    } else if (areaMode === 'manual') {
      // 아파트 등: 공급면적 직접설정 (레인지)
      spcMin = supplyPyeongMin > 0 ? supplyPyeongMin * PYEONG_TO_SQM : 0;
      spcMax = supplyPyeongMax > 0 ? supplyPyeongMax * PYEONG_TO_SQM : 99999;
    } else {
      // 아파트 등: 타입 고정값 (공급면적 기준)
      const space = SPACE_OPTIONS[spaceIndex];
      spcMin = space.spcMin;
      spcMax = space.spcMax;
    }
    const parts = [region.mid?.name, region.small?.name]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s);
    const legalDivisionName = parts.length > 0
      ? parts.join(' ')
      : (region.large?.name.trim() ?? '');
    const largeName = region.large?.name.trim() ?? '';
    const midName = region.mid?.name.trim() ?? '';
    const smallName = region.small?.name.trim() ?? '';
    const midCode = region.mid?.code ?? '';
    // 중지역만 선택(소지역 미선택)한 경우 하위 동을 순회 수집
    const enumerateDongs = !!region.mid && !region.small;
    const areaLabel = buildAreaLabel(noAreaFilter);
    const config: StartConfig = {
      legalDivisionCode, legalDivisionName, tradeType, realEstateType, spcMin, spcMax,
      largeName, midName, smallName, midCode, enumerateDongs, areaLabel,
    };
    // 중지역만 선택(소지역 미선택)한 경우 → 차단 위험 경고 모달 후 진행.
    // 소지역까지 선택했다면 경고 없이 바로 진행.
    if (enumerateDongs) {
      setPendingConfig(config);
      return;
    }
    onStart(config);
  };

  const handleConfirmProceed = () => {
    if (pendingConfig) onStart(pendingConfig);
    setPendingConfig(null);
  };

  // 면적 조건을 사람이 읽기 쉬운 라벨로 (슬롯 메타 표기용)
  const buildAreaLabel = (noAreaFilter: boolean): string => {
    if (noAreaFilter) return '전체';
    const range = (min: number, max: number) =>
      min > 0 || max > 0 ? `${min || 0}~${max > 0 ? max : '∞'}평` : '전체';
    if (isExclusiveSpaceType(realEstateType)) {
      return `전용 ${range(exclusivePyeongMin, exclusivePyeongMax)}`;
    }
    if (areaMode === 'manual') {
      return `공급 ${range(supplyPyeongMin, supplyPyeongMax)}`;
    }
    return SPACE_OPTIONS[spaceIndex].label;
  };

  const regionPreview = region.large ? buildPreview() : null;
  const codePreview = region.large ? getLegalDivisionCode() : null;

  return (
    <aside className="eos-ctrl">
      <div className="eos-ctrl-head">
        <div className="ch-ic">
          <svg viewBox="0 0 24 24">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
        </div>
        <b>검색 조건</b>
        <button className="eos-ctrl-toggle" title="패널 접기" onClick={onToggleCollapse}>
          <svg viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className="eos-ctrl-body">
        <RegionSelect value={region} onChange={setRegion} disabled={disabled} />

        {regionPreview && (
          <div className="keyword-preview">
            <span className="keyword-label">지역</span>
            <span className="keyword-value">{regionPreview}</span>
            <span className="keyword-code">{codePreview}</span>
          </div>
        )}

        <FilterSelect
          realEstateType={realEstateType}
          tradeType={tradeType}
          spaceIndex={spaceIndex}
          areaMode={areaMode}
          exclusivePyeongMin={exclusivePyeongMin}
          exclusivePyeongMax={exclusivePyeongMax}
          supplyPyeongMin={supplyPyeongMin}
          supplyPyeongMax={supplyPyeongMax}
          spaceUnit={spaceUnit}
          onRealEstateTypeChange={handleRealEstateTypeChange}
          onTradeTypeChange={setTradeType}
          onSpaceIndexChange={setSpaceIndex}
          onAreaModeChange={setAreaMode}
          onExclusivePyeongMinChange={setExclusivePyeongMin}
          onExclusivePyeongMaxChange={setExclusivePyeongMax}
          onSupplyPyeongMinChange={setSupplyPyeongMin}
          onSupplyPyeongMaxChange={setSupplyPyeongMax}
          onSpaceUnitChange={setSpaceUnit}
          disabled={disabled}
        />

        <div className="run-btn-wrap">
          {!isRunning ? (
            <button className="eos-run-btn" onClick={handleStart} disabled={!region.large}>
              <svg viewBox="0 0 24 24">
                <path d="M5 3l14 9-14 9z" />
              </svg>
              데이터 수집 실행
            </button>
          ) : (
            <button className="eos-run-btn stop" onClick={onStop}>
              <svg viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
              수집 중지
            </button>
          )}
        </div>
      </div>

      {pendingConfig && (
        <ConfirmModal
          message={NO_SUBREGION_WARNING}
          confirmLabel="진행"
          cancelLabel="취소"
          onConfirm={handleConfirmProceed}
          onCancel={() => setPendingConfig(null)}
        />
      )}
    </aside>
  );
}
