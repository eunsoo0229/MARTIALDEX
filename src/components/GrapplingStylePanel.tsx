import { useState } from 'react';
import type { Technique } from '../types';
import PostureSection from './PostureSection';
import RelatedVideos from './RelatedVideos';
import { openExternal } from '../lib/externalLink';
import {
  CLASS_LABEL,
  defaultStyle,
  getPreferredStyle,
  setPreferredStyle,
  STYLE_LABEL,
  styleView,
  type GiNoGiRecord,
  type GrapplingStyle,
  type StylePosture,
} from '../lib/grappling/giNoGi';

const METHOD_LABEL: Record<GiNoGiRecord['method'], string> = {
  rule: '앱 데이터 근거',
  ai_grounded: 'AI · 웹 검색 근거',
  ai_web_sources: 'AI · 웹 자료 근거',
  ai_rejected: '근거 부족으로 보류',
  pending: '조사 전',
  user: '사용자 판단',
};

function StylePostureCard({ style, posture }: { style: GrapplingStyle; posture: StylePosture }) {
  return (
    <div className="card info-card style-posture" data-testid="style-posture" data-style={style}>
      <h3>
        🧍 {STYLE_LABEL[style]} 자세 <span className="chip chip--sm style-posture__status">{posture.status === 'verified' ? '검토 완료' : 'AI 조사 · 검토 전'}</span>
      </h3>
      <p>
        <strong>그립·제어:</strong> {posture.grips}
      </p>
      <div className="field-label">단계별 수행</div>
      <ol className="style-posture__steps">
        {posture.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {posture.keyPoints.length > 0 && (
        <>
          <div className="field-label">핵심 포인트</div>
          <ul className="style-posture__points">
            {posture.keyPoints.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {posture.safety && <p className="video-status-message">⚠️ {posture.safety}</p>}
      {posture.sources.length > 0 && (
        <details>
          <summary>근거 자료 {posture.sources.length}개</summary>
          <ul className="style-posture__sources">
            {posture.sources.map((s) => (
              <li key={s.url}>
                <button type="button" className="link-button" onClick={() => openExternal(s.url)}>
                  {s.title || s.url}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Gi / No-Gi — one technique, two views. The toggle switches the posture
 * description and the related videos together; a style that doesn't apply
 * is disabled, and a style with no description of its own says so instead
 * of borrowing the other style's text.
 */
export default function GrapplingStylePanel({ technique, record }: { technique: Technique; record: GiNoGiRecord }) {
  const [style, setStyle] = useState<GrapplingStyle>(() => defaultStyle(record, getPreferredStyle()));
  const view = styleView(record, style, !!technique.posture);
  const applicable = (s: GrapplingStyle) => (s === 'gi' ? record.gi.applicable : record.noGi.applicable) !== false;

  function choose(s: GrapplingStyle) {
    if (!applicable(s)) return;
    setStyle(s);
    setPreferredStyle(s);
  }

  return (
    <section className="grappling-style" data-testid="grappling-style" data-style={style} data-class={record.classification}>
      <div className="card info-card grappling-style__head">
        <div className="chip-row" role="tablist" aria-label="Gi / No-Gi">
          {(['gi', 'nogi'] as GrapplingStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={style === s}
              aria-disabled={!applicable(s)}
              disabled={!applicable(s)}
              className={`chip grappling-style__tab${style === s ? ' active' : ''}`}
              onClick={() => choose(s)}
              data-testid={`style-tab-${s}`}
            >
              {STYLE_LABEL[s]}
              {!applicable(s) ? ' · 적용 불가' : ''}
            </button>
          ))}
        </div>
        <p className="grappling-style__class" data-testid="style-class">
          <strong>{CLASS_LABEL[record.classification]}</strong>
          <span className="technique-row__sub"> · {METHOD_LABEL[record.method]}</span>
        </p>
        {record.reason && <p className="video-status-message" style={{ margin: '2px 0' }}>{record.reason}</p>}
        {record.difference && (
          <p className="grappling-style__diff" data-testid="style-difference">
            <strong>Gi와 No-Gi의 차이:</strong> {record.difference}
          </p>
        )}
        {(record.evidence.length > 0 || record.sources.length > 0) && (
          <details className="grappling-style__evidence">
            <summary>분류 근거 보기</summary>
            <ul>
              {record.evidence.map((e, i) => (
                <li key={i}>{e.text}</li>
              ))}
              {record.sources.map((s) => (
                <li key={s.url}>
                  웹 자료:{' '}
                  <button type="button" className="link-button" onClick={() => openExternal(s.url)}>
                    {s.title || s.url}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {view.kind === 'not_applicable' && (
        <div className="card info-card" data-testid="style-not-applicable">
          <p style={{ margin: 0 }}>{view.reason}</p>
        </div>
      )}
      {view.kind === 'style' && <StylePostureCard style={style} posture={view.posture} />}
      {view.kind === 'shared' && technique.posture && (
        <div data-testid="style-shared-posture">
          <p className="video-status-message style-posture__note">{view.note}</p>
          <PostureSection posture={technique.posture} />
        </div>
      )}
      {view.kind === 'missing' && (
        <div className="card info-card" data-testid="style-posture-missing">
          <h3>🧍 {STYLE_LABEL[style]} 자세</h3>
          <p className="posture-pending-note video-status-message" style={{ margin: 0 }}>
            {view.note}
          </p>
        </div>
      )}

      {view.kind !== 'not_applicable' && <RelatedVideos technique={technique} style={style} styleRecord={record} />}
    </section>
  );
}
