import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GymBodyPart } from '../types';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import { computeBodyPartRecovery, GYM_BODY_PART_LABEL, GYM_BODY_PARTS } from '../lib/gymTraining/recovery';
import { formatVolumeCompact } from '../lib/gymTraining/volume';
import { formatRelativeDays } from '../lib/dateUtil';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import TrainingEntryRow from '../components/TrainingEntryRow';

export default function BodyPartDetail() {
  const { bodyPart: bodyPartParam } = useParams<{ bodyPart: string }>();
  const navigate = useNavigate();
  const allEntries = useTrainingHistory();

  const bodyPart = (GYM_BODY_PARTS as string[]).includes(bodyPartParam ?? '') ? (bodyPartParam as GymBodyPart) : null;

  const recovery = useMemo(() => (bodyPart ? computeBodyPartRecovery(bodyPart, allEntries) : null), [bodyPart, allEntries]);

  const recentSessions = useMemo(() => {
    if (!bodyPart) return [];
    return allEntries
      .filter((e) => e.completed && e.exerciseDetails)
      .filter((e) => e.exerciseDetails!.some((ex) => resolveTechniquesByIds([ex.techniqueId])[0]?.gymBodyPart === bodyPart))
      .slice(0, 10);
  }, [bodyPart, allEntries]);

  if (!bodyPart) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/training" />
          <EmptyState icon="🧍" text="알 수 없는 부위입니다." />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training">훈련</Link>
          <span>/</span>
          <span>{GYM_BODY_PART_LABEL[bodyPart]} 회복도</span>
        </div>
        <div className="section-title">
          <h2>{GYM_BODY_PART_LABEL[bodyPart]} 회복도</h2>
        </div>

        {recovery && (
          <div className="card info-card">
            <div className="gym-volume-hero">
              <span className="gym-volume-hero__value">{recovery.recoveryPercent}%</span>
              <span className="gym-volume-hero__label">회복도</span>
            </div>
            <p className="technique-row__sub">
              마지막 훈련: {recovery.lastTrainedAt ? formatRelativeDays(recovery.lastTrainedAt) : '기록 없음'}
              {recovery.recentVolumeKg > 0 ? ` · 최근 볼륨 ${formatVolumeCompact(recovery.recentVolumeKg)}` : ''}
            </p>
            <p className="body-part-map__caption" style={{ textAlign: 'left', marginTop: 8 }}>
              의학적 판단이 아닌 참고용 추정치입니다.
            </p>
          </div>
        )}

        <div className="section-title">
          <h2>최근 훈련</h2>
        </div>
        {recentSessions.length === 0 ? (
          <EmptyState icon="🏋️" text="아직 이 부위를 훈련한 기록이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {recentSessions.map((entry) => (
              <TrainingEntryRow key={entry.id} entry={entry} onClick={() => navigate(`/training-analytics/${entry.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
