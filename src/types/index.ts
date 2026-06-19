// =============================================
// 지역 선택 타입
// =============================================
export interface RegionItem {
  code: string;
  name: string;
  level: 1 | 2 | 3;
}

export interface RegionSelection {
  large: RegionItem | null;
  mid: RegionItem | null;
  small: RegionItem | null;
}

// =============================================
// 크롤링 필터 타입
// =============================================
export interface RealEstateTypeOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface TradeTypeOption {
  label: string;
  value: string;
}

export interface SpaceOption {
  label: string;
  spcMin: number;
  spcMax: number;
}

// =============================================
// 매물 데이터 모델
// =============================================
export interface Property {
  _uid?: number;
  midName: string;   // 중지역명 (예: 강남구)
  smallName: string; // 소지역명 (예: 역삼동)
  complexNumber: number;
  complexName: string;
  dongName: string;
  articleNumber: string;
  realEstateType: string;
  tradeType: string;
  dealPrice: number;
  warrantyPrice: number;
  rentPrice: number;
  managementFee: number;
  priceChangeStatus: number;
  priceChangeHistories?: Array<{ modifiedDate: string; dealPrice: number }>;
  premiumPrice: number;   // 분양권 프리미엄 (원 단위, 0 if not applicable)
  optionPrice: number;    // 분양권 옵션비용 (원 단위, 0 if not applicable)
  supplySpace: number;
  exclusiveSpace: number;
  contractSpace: number;
  supplySpaceName: string;
  exclusiveSpaceName: string;
  direction: string;
  floorInfo: string;
  targetFloor: string;
  totalFloor: string;
  address: string;
  lat: number;
  lng: number;
  articleFeature: string;
  brokerageName: string;
  brokerName: string;
  confirmDate: string;
  buildDate: string;
  realtorCount: number;
  verificationType: string;
}

// =============================================
// 로그 / 진행 / 완료 타입
// =============================================
export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  time: string;
}

export interface ProgressInfo {
  phase: 'search' | 'crawl';
  current: number;
  total: number;
  complexName?: string;
  propertyCount: number;
}

// 동별 실시간 진행률 (사이드바 시각화용)
export interface DongProgress {
  name: string;                          // 소지역명 (예: 고색동)
  status: 'pending' | 'active' | 'done' | 'skipped';
  pct: number;                           // 0~100
  count: number;                         // 그 동에서 수집된 건수
  indeterminate?: boolean;               // 총량 미상(빌라/단독/지산) → 펄스 애니메이션
}

export interface DoneSummary {
  totalComplexes: number;
  totalProperties: number;
  duration: number;
}

// =============================================
// 크롤러 설정
// =============================================
export interface CrawlerConfig {
  legalDivisionCode: string;
  legalDivisionName: string;
  tradeType: string;
  realEstateType: string;
  spcMin: number;
  spcMax: number;
  // 지역 계층 정보 (중지역/소지역 컬럼 표기 + 동 순회 수집용)
  largeName: string;      // 대지역명 (시/도)
  midName: string;        // 중지역명 ('' 가능)
  smallName: string;      // 소지역명 (소지역 직접 선택 시, '' 가능)
  midCode: string;        // 중지역 5자리 코드 (동 순회 enumerate용)
  enumerateDongs: boolean; // true면 중지역 하위 동을 순회 수집
  areaLabel: string;      // 면적 조건 표시용 (예: '전체', '전용 10~20평')
}

// 검색 조건 스냅샷 — 슬롯 저장 시 메타 표기에 사용
export interface SearchMeta {
  largeName: string;
  midName: string;
  smallName: string;
  realEstateType: string;
  tradeType: string;
  areaLabel: string;
}

// 저장 슬롯 (현재는 메모리, 추후 Supabase로 교체)
export interface SavedSlot {
  id: string;
  createdAt: number;      // 검색/저장 시각 (슬롯 구분용)
  meta: SearchMeta;       // 표시용 메타
  config: CrawlerConfig;  // 재검색용 전체 조건
  count: number;
  properties: Property[];
}

// =============================================
// 탭 정의
// =============================================
export interface TabDefinition {
  id: string;
  label: string;
  icon: string;
}

// =============================================
// 코드표 상수
// =============================================
export const REAL_ESTATE_TYPES: RealEstateTypeOption[] = [
  { label: '아파트/재건축/재개발', value: 'APT:JGC:JGB' },
  { label: '아파트 분양권', value: 'ABYG' },
  { label: '오피스텔', value: 'OPST' },
  { label: '오피스텔 분양권', value: 'OBYG' },
  { label: '빌라', value: 'VL' },
  { label: '단독/다가구', value: 'DDDGG' },
  { label: '사무실/지식산업센터', value: 'APTHGJ:SMS' },
];

// 전용면적 기준으로 필터링하는 상품 유형
export const EXCLUSIVE_SPACE_TYPES = ['OPST', 'OBYG', 'SMS', 'APTHGJ', 'APTHGJ:SMS'];

export function isExclusiveSpaceType(realEstateType: string): boolean {
  return realEstateType.split(':').some((t) => EXCLUSIVE_SPACE_TYPES.includes(t));
}

export function isPresaleType(realEstateType: string): boolean {
  return realEstateType === 'ABYG' || realEstateType === 'OBYG';
}

// UI 코드 → Naver API 상품 유형 코드 매핑
export const NAVER_TYPE_MAP: Record<string, string[]> = {
  'APT:JGC:JGB': ['A01', 'A04', 'F01'],
  'ABYG':        ['B01'],
  'OPST':        ['A02'],
  'OBYG':        ['B02'],
  'VL':          ['A05', 'A06', 'A07', 'C02'],
  'DDDGG':       ['C03'],
  'APTHGJ:SMS':  [],       // DIRECT_ARTICLE_TYPES → new.land /api/articles 직접 조회
};

export const TRADE_TYPES: TradeTypeOption[] = [
  { label: '매매', value: 'A1' },
  { label: '전세', value: 'B1' },
  { label: '월세', value: 'B2' },
];

export const SPACE_OPTIONS: SpaceOption[] = [
  { label: '전체', spcMin: 0, spcMax: 1000 },
  { label: '59미만', spcMin: 0, spcMax: 79.3 },
  { label: '59타입', spcMin: 79.4, spcMax: 89.2 },
  { label: '74타입', spcMin: 89.3, spcMax: 105.7 },
  { label: '84타입', spcMin: 105.8, spcMax: 119 },
  { label: '85초과', spcMin: 119.1, spcMax: 1000 },
];

export const DIRECTION_LABELS: Record<string, string> = {
  SS: '남향',
  NN: '북향',
  EE: '동향',
  WW: '서향',
  ES: '동남향',
  EN: '동북향',
  WS: '서남향',
  WN: '서북향',
  SE: '남동향',
  SW: '남서향',
  NE: '북동향',
  NW: '북서향',
};

export const TRADE_TYPE_LABELS: Record<string, string> = {
  A1: '매매',
  B1: '전세',
  B2: '월세',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  OWNER: '집주인',
  DOC: '서류',
  MOBL: '모바일',
  NDOC1: '미확인1',
  NDOC2: '미확인2',
  NONE: '미확인',
};
