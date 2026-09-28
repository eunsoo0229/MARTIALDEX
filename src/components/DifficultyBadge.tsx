import type { Difficulty } from '../types';

const LABEL: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

export default function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  if (!difficulty) return <span className="badge badge-neutral">난이도 정보 없음</span>;
  return <span className={`badge badge-${difficulty}`}>{LABEL[difficulty] ?? difficulty}</span>;
}
