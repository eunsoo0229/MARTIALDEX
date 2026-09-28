export type ReportReason = 'duplicate' | 'not_real' | 'incorrect_info' | 'wrong_martial_art' | 'other';

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  duplicate: '중복 기술입니다',
  not_real: '실제 존재하지 않는 기술입니다',
  incorrect_info: '기술 정보가 잘못되었습니다',
  wrong_martial_art: '잘못된 무술 종목입니다',
  other: '기타',
};

export const REPORT_REASON_ORDER: ReportReason[] = ['duplicate', 'not_real', 'incorrect_info', 'wrong_martial_art', 'other'];

export type TechniqueReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface TechniqueReport {
  id: string;
  techniqueId: string;
  userId: string;
  reason: ReportReason;
  description: string | null;
  status: TechniqueReportStatus;
  createdAt: string;
}
