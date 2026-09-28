import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import GymExercisePicker from '../components/GymExercisePicker';
import { formatLastSessionSets, getExerciseStats } from '../lib/gymTraining/records';
import type { Technique } from '../types';

export default function GymExerciseBrowser() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Technique | null>(null);
  const [postureOpen, setPostureOpen] = useState(false);

  const stats = selected ? getExerciseStats(selected.id) : null;
  const lastSets = selected ? formatLastSessionSets(selected.id) : null;

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training">훈련</Link>
          <span>/</span>
          <span>헬스 운동 목록</span>
        </div>
        <div className="section-title">
          <h2>🏋️ 헬스 운동 목록</h2>
          <Link to="/training/exercises/request" className="see-all">
            + 운동 추가 요청
          </Link>
        </div>

        <div className="card info-card">
          <GymExercisePicker
            onSelect={(t) => {
              setSelected(t);
              setPostureOpen(false);
            }}
          />
        </div>

        {selected && (
          <div className="card info-card">
            <h3>{selected.name}</h3>
            <p className="technique-row__sub">
              {selected.category} · 주요 근육 {selected.primaryMuscle}
              {selected.secondaryMuscles && selected.secondaryMuscles.length > 0 ? ` · 보조 근육 ${selected.secondaryMuscles.join(', ')}` : ''}
            </p>
            <p className="technique-row__sub">장비: {(selected.gymEquipment ?? []).join('/') || '맨몸'}</p>
            {lastSets && <p>최근 기록: {lastSets}</p>}
            {stats && stats.timesPerformed > 0 && (
              <div className="curriculum-stat-row">
                <div>
                  <strong>{stats.timesPerformed}회</strong>
                  <span>수행 횟수</span>
                </div>
                <div>
                  <strong>{stats.maxWeightKg}kg</strong>
                  <span>최대 중량</span>
                </div>
                <div>
                  <strong>{stats.maxReps}회</strong>
                  <span>최대 반복</span>
                </div>
                <div>
                  <strong>{Math.round(stats.cumulativeVolumeKg)}kg</strong>
                  <span>누적 볼륨</span>
                </div>
              </div>
            )}
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/training/routines')}>
                루틴에 추가하기
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPostureOpen((v) => !v)}>
                {postureOpen ? '자세 보기 닫기' : '자세 보기'}
              </button>
            </div>
            {postureOpen && (
              <div className="card info-card" style={{ marginTop: 8 }}>
                {selected.gymPostureNotes ? (
                  <p style={{ whiteSpace: 'pre-line' }}>{selected.gymPostureNotes}</p>
                ) : (
                  <p className="video-status-message">자세 정보가 준비되지 않았습니다.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
