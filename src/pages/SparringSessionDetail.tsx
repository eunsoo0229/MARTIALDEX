import { useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getSparringSession } from '../lib/sparringAnalysis/sparringSessionService';
import { useSparringSessions } from '../lib/sparringAnalysis/useSparringSessions';
import SparringResultView from '../components/SparringResultView';
import BackButton from '../components/BackButton';

// The uploaded video is never persisted (see repository.ts) — reopening a
// saved session later can still show every computed result, but scene
// playback needs the SAME file re-selected locally. Nothing is uploaded
// anywhere for this; it's just a fresh local object URL, same as the first
// time.
export default function SparringSessionDetail() {
  const { sessionId = '' } = useParams();
  useSparringSessions();
  const session = getSparringSession(sessionId);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  if (!session) return <Navigate to="/sparring" replace />;

  function handleReattach(file: File) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setVideoUrl(url);
  }

  function handleSeek(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    void video.play();
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/sparring">스파링 분석</Link>
          <span>/</span>
          <span>{new Date(session.date).toLocaleDateString('ko-KR')}</span>
        </div>

        <div className="section-title">
          <h2>🥊 스파링 기록</h2>
        </div>

        {!videoUrl ? (
          <div className="card info-card">
            <h3>영상 다시 불러오기</h3>
            <p className="video-status-message">
              영상 파일 자체는 저장하지 않습니다. 같은 영상을 다시 선택하면 아래 결과에서 장면 이동 기능을 사용할 수
              있습니다.
            </p>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleReattach(f);
              }}
            />
          </div>
        ) : (
          <div className="card info-card">
            <video ref={videoRef} src={videoUrl} controls className="video-preview-el" />
          </div>
        )}

        <SparringResultView key={session.id} session={session} videoUrl={videoUrl} onSeek={videoUrl ? handleSeek : undefined} />
      </div>
    </div>
  );
}
