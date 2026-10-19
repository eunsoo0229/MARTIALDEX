import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveTechnique } from '../../lib/userTechniques/service';
import { getClip } from '../../lib/sparringAnalysis/clipStore';
import { extractSessionClips, listSparringSessions, setWeaknessVerified } from '../../lib/sparringAnalysis/sparringSessionService';
import { describeAttire } from '../../lib/sparringAnalysis/attire';
import { WEAKNESS_STATUS_LABEL, type SparringClip, type SparringSession, type SparringWeakness } from '../../lib/sparringAnalysis/types';

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Plays a stored clip — rendered only for clips whose media was verified playable. */
function ClipPlayer({ sessionId, clip }: { sessionId: string; clip: SparringClip }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void getClip(sessionId, clip.id).then((stored) => {
      if (!alive) return;
      if (!stored) {
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(stored.blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, clip.id, clip.sizeBytes]);
  if (missing) return <p className="technique-row__sub">이 기기에 클립 파일이 없습니다 (다른 기기에서 분석했거나 삭제됨).</p>;
  if (!url) return <p className="technique-row__sub">클립 불러오는 중…</p>;
  return <video className="weakness-clip" src={url} controls playsInline preload="metadata" data-testid="weakness-clip-video" />;
}

export default function WeaknessScenes({
  session,
  videoUrl,
  onSeek,
  onSessionChange,
}: {
  session: SparringSession;
  videoUrl?: string | null;
  onSeek?: (t: number) => void;
  onSessionChange: (s: SparringSession) => void;
}) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const weaknesses = session.weaknesses;
  if (!weaknesses) return null; // sessions analysed before 2.0
  const clips = new Map((session.clips ?? []).map((c) => [c.id, c]));
  // 재평가: the most recent EARLIER analysis of the same sport that had weakness scenes.
  const previous = listSparringSessions().find((p) => p.id !== session.id && p.martialArt === session.martialArt && p.date < session.date && p.weaknesses);
  const idn = session.identification;

  async function retry(clipId: string) {
    if (!videoUrl) return;
    setRetrying(clipId);
    const s = await extractSessionClips(session.id, videoUrl, { onlyClipId: clipId, onUpdate: onSessionChange });
    if (s) onSessionChange(s);
    setRetrying(null);
  }

  function verify(w: SparringWeakness, value: boolean) {
    const s = setWeaknessVerified(session.id, w.id, w.verifiedOnVideo === value ? null : value);
    if (s) onSessionChange(s);
  }

  return (
    <div className="card info-card" data-testid="weakness-scenes">
      <h3>🎬 약점 장면 (본인 기준)</h3>
      {idn && (
        <p className="technique-row__sub" data-testid="identification-summary">
          선수 식별: {idn.method === 'manual+attire' ? `직접 지정 + 복장 비교 (${idn.attire ? describeAttire(idn.attire.me) : ''})` : '직접 지정 + 위치 추적 (복장 정보 없음)'}
          {idn.consistency !== null && ` · 복장 일치 ${Math.round(idn.consistency * 100)}% (${idn.meFrames}/${idn.observedFrames} 프레임)`}
          {idn.excludedFrames > 0 && ` · 상대로 보이는 ${idn.excludedFrames}개 프레임은 분석에서 제외`}
          {idn.unclearFrames > 0 && ` · 불확실 ${idn.unclearFrames}개 프레임`}
        </p>
      )}
      {(session.weaknessNotes ?? []).map((n) => (
        <p key={n} className="technique-row__sub">
          ℹ️ {n}
        </p>
      ))}
      {weaknesses.length === 0 && <p>반복해서 확인되는 약점 장면이 없습니다.</p>}

      <div className="stack gap-2">
        {weaknesses.map((w) => (
          <div key={w.id} className="weakness-card" data-testid="weakness-card" data-status={w.status}>
            <div className="chip-row">
              <strong>{w.title}</strong>
              <span className={`chip weakness-status weakness-status--${w.status}`}>{WEAKNESS_STATUS_LABEL[w.status]}</span>
              <span className="chip">신뢰도 {w.confidence}% (임시 지표)</span>
            </div>
            <p style={{ margin: '4px 0' }}>{w.description}</p>
            {previous &&
              (() => {
                const before = previous.weaknesses!.find((p) => p.situationType === w.situationType);
                return (
                  <p className="technique-row__sub" data-testid="weakness-compare">
                    이전 분석({new Date(previous.date).toLocaleDateString('ko-KR')}): {before ? `${before.occurrences.length}/${before.opportunities}회` : '이 약점 장면 없음'} → 이번: {w.occurrences.length}/{w.opportunities}회
                  </p>
                );
              })()}

            {w.clipIds.map((cid) => {
              const c = clips.get(cid);
              if (!c) return null;
              return (
                <div key={cid} className="weakness-clip-box" data-testid="weakness-clip" data-clip-status={c.status}>
                  {c.status === 'ready' ? (
                    <ClipPlayer sessionId={session.id} clip={c} />
                  ) : c.status === 'pending' ? (
                    <p className="technique-row__sub">원본 영상에서 장면을 잘라내는 중… (재생은 완료 후 가능)</p>
                  ) : (
                    <p className="ai-inline-warning">클립을 만들지 못했습니다: {c.error}</p>
                  )}
                  <div className="chip-row">
                    <span className="technique-row__sub">
                      원본 {fmt(c.actualStartSec ?? c.startSec)} – {fmt(c.actualEndSec ?? c.endSec)}
                    </span>
                    {onSeek && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSeek(c.startSec)}>
                        원본에서 보기
                      </button>
                    )}
                    {c.status === 'failed' &&
                      (videoUrl ? (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={retrying === cid} onClick={() => void retry(cid)}>
                          {retrying === cid ? '다시 만드는 중…' : '클립 다시 만들기'}
                        </button>
                      ) : (
                        <span className="technique-row__sub">원본 영상을 다시 불러오면 재시도할 수 있습니다.</span>
                      ))}
                  </div>
                </div>
              );
            })}

            <div className="field-label" style={{ marginTop: 6 }}>
              영상에서 관찰된 근거
            </div>
            <ul className="weakness-list">
              {w.observedEvidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
              {w.occurrences.slice(0, 4).map((o) => (
                <li key={o.eventSec}>
                  {fmt(o.eventSec)} — {o.note}
                </li>
              ))}
            </ul>
            <div className="field-label">해석 (추론)</div>
            <p style={{ margin: '2px 0' }}>{w.inference}</p>
            <div className="field-label">개선 방법</div>
            <p style={{ margin: '2px 0' }}>{w.recommendation}</p>

            <details>
              <summary>신뢰도 근거</summary>
              <ul className="weakness-list">
                <li>선수 식별 {Math.round(w.confidenceBasis.identity * 100)}%</li>
                <li>관찰 가능성 {Math.round(w.confidenceBasis.observability * 100)}%</li>
                <li>
                  일관성 {Math.round(w.confidenceBasis.consistency * 100)}% ({w.occurrences.length}/{w.opportunities}회)
                </li>
                <li>분류 방식 {w.confidenceBasis.classification === 1 ? '자세 좌표 측정' : 'AI 기술 추정 포함 (검증 안 됨)'}</li>
                {w.confidenceBasis.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>

            <div className="chip-row" style={{ marginTop: 6 }}>
              {w.relatedTechniqueIds.map((id) => {
                const t = resolveTechnique(id);
                return t ? (
                  <Link key={id} className="chip" to={`/arts/${t.martialArt}/techniques/${t.id}`}>
                    관련 기술: {t.koreanName || t.name}
                  </Link>
                ) : null;
              })}
              {w.curriculumId && (
                <Link className="chip active" to={`/learning/${session.martialArt}/${w.curriculumId}`}>
                  관련 커리큘럼 보기
                </Link>
              )}
            </div>
            <div className="chip-row" style={{ marginTop: 6 }}>
              <span className="technique-row__sub">클립을 보고 확인해 주세요:</span>
              <button type="button" className={`chip${w.verifiedOnVideo === true ? ' active' : ''}`} onClick={() => verify(w, true)} data-testid="weakness-verify-yes">
                맞아요
              </button>
              <button type="button" className={`chip${w.verifiedOnVideo === false ? ' active' : ''}`} onClick={() => verify(w, false)}>
                아니에요
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
