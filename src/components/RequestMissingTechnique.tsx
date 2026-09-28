import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { verifyMissingTechnique, registerMissingTechnique } from '../lib/martialArtDiscovery/service';
import type { DiscoveredTechniqueCandidate, SingleTechniqueVerificationOutcome } from '../lib/martialArtDiscovery/types';

type Step =
  | 'input'
  | 'verifying'
  | 'already_exists'
  | 'multiple_candidates'
  | 'wrong_martial_art'
  | 'not_a_technique'
  | 'insufficient_evidence'
  | 'preview'
  | 'registering'
  | 'done';

interface RequestMissingTechniqueProps {
  martialArtId: string;
  martialArtNameKo: string;
  martialArtNameEn: string | null;
  onClose: () => void;
  onRegistered: (techniqueId: string) => void;
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Spec "MARTIALDEX — 신규 무술 미등록 기술 요청 기능 Part B" — works identically
 * for ANY martial art (official, add_teq-only, or brand-new custom), always
 * with the martial art's own name/id included in every search query (spec
 * section 5), reusing the SAME Tavily-evidence-based verification pipeline
 * martialArtDiscovery/service.ts already built for the "신규 무술 추가"
 * flow — not a parallel implementation. Rendered as an inline card (same
 * pattern as VideoPickerModal.tsx) rather than a separate route, since it's
 * always entered from a specific martial art's technique list.
 */
export default function RequestMissingTechnique({ martialArtId, martialArtNameKo, martialArtNameEn, onClose, onRegistered }: RequestMissingTechniqueProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<SingleTechniqueVerificationOutcome | null>(null);
  const [selected, setSelected] = useState<DiscoveredTechniqueCandidate | null>(null);
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  async function runVerify(extraSearch: boolean) {
    if (!input.trim()) return;
    setStep('verifying');
    const result = await verifyMissingTechnique(martialArtId, martialArtNameKo, martialArtNameEn, input.trim(), { extraSearch });
    setOutcome(result);
    if (result.status === 'already_exists') setStep('already_exists');
    else if (result.status === 'multiple_candidates') setStep('multiple_candidates');
    else if (result.status === 'wrong_martial_art') setStep('wrong_martial_art');
    else if (result.status === 'not_a_technique') setStep('not_a_technique');
    else if (result.status === 'verified' && result.candidate) {
      setSelected(result.candidate);
      setStep('preview');
    } else setStep('insufficient_evidence');
  }

  function pickCandidate(candidate: DiscoveredTechniqueCandidate) {
    setSelected(candidate);
    setStep('preview');
  }

  async function handleRegister() {
    if (!selected) return;
    setStep('registering');
    setRegisterError(null);
    const result = await registerMissingTechnique(martialArtId, selected, user?.id ?? null);
    if (result.ok) {
      setRegisteredName(selected.name);
      onRegistered(result.techniqueId);
      setStep('done');
    } else if (result.code === 'already_exists') {
      setOutcome({ status: 'already_exists', existingTechniqueId: result.existingTechniqueId, existingTechniqueName: result.existingTechniqueName, executedQueries: [], wavesRun: 0 });
      setStep('already_exists');
    } else {
      setRegisterError(result.message);
      setStep('preview');
    }
  }

  function renderSources(sources: DiscoveredTechniqueCandidate['sources']) {
    if (sources.length === 0) return null;
    return (
      <>
        <div className="field-label">확인된 출처</div>
        <ul style={{ paddingLeft: 18 }}>
          {sources.map((s) => (
            <li key={s.url} className="video-status-message" style={{ margin: 0 }}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title || s.url}
              </a>{' '}
              <span style={{ opacity: 0.6 }}>({sourceDomain(s.url)})</span>
              {s.snippet && <div style={{ fontSize: 12, opacity: 0.7 }}>{s.snippet}</div>}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="card info-card">
      <h3>+ 없는 기술 요청</h3>

      {step === 'input' && (
        <>
          <p className="video-status-message">
            이 무술에 없는 기술을 요청할 수 있습니다. 입력한 기술은 실제 웹 자료를 검색하여 "{martialArtNameKo}"의 기술인지 확인합니다.
          </p>
          <input
            className="select field-full"
            placeholder="기술 이름 또는 기술 설명"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runVerify(false)}
          />
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => runVerify(false)} disabled={!input.trim()}>
              검색 및 검증
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'verifying' && (
        <p className="video-status-message row gap-1">
          <span className="spinner" /> 실제 웹 검색으로 "{input}"이(가) {martialArtNameKo}의 기술인지 검증하는 중...
        </p>
      )}

      {step === 'already_exists' && outcome?.status === 'already_exists' && (
        <>
          <div className="banner banner--warning">이 기술은 이미 MARTIALDEX에 등록되어 있습니다. ({outcome.existingTechniqueName})</div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            {outcome.existingTechniqueId && (
              <Link className="btn btn-secondary" to={`/arts/${martialArtId}/techniques/${outcome.existingTechniqueId}`}>
                기존 기술 보기
              </Link>
            )}
            <button className="btn btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      )}

      {step === 'multiple_candidates' && outcome?.status === 'multiple_candidates' && outcome.candidates && (
        <>
          <p className="video-status-message">입력하신 설명과 관련된 기술을 찾았습니다. 어떤 기술을 등록할까요?</p>
          <div className="stack gap-2">
            {outcome.candidates.map((c) => (
              <div key={c.name} className="card" style={{ padding: 10 }}>
                <strong>
                  {c.name} {c.nameKo ? `(${c.nameKo})` : ''}
                </strong>
                <p style={{ margin: '4px 0' }}>{c.description}</p>
                <button className="btn btn-primary btn-sm" onClick={() => pickCandidate(c)}>
                  이 기술 선택
                </button>
              </div>
            ))}
          </div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'wrong_martial_art' && (
        <>
          <div className="banner banner--error">
            요청한 기술이 "{martialArtNameKo}"의 기술이라는 충분한 근거를 찾지 못했습니다.
            <div style={{ fontWeight: 400, marginTop: 4 }}>
              검색 결과에서는 이 기술이{outcome?.likelyMartialArt ? ` "${outcome.likelyMartialArt}"의 기술로` : ' 다른 무술의 기술로'} 확인됩니다.
            </div>
            <div style={{ fontWeight: 400, marginTop: 4 }}>기술을 등록하지 않았습니다.</div>
          </div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => setStep('input')}>
              다시 시도
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'not_a_technique' && (
        <>
          <div className="banner banner--error">
            요청하신 내용은 "{martialArtNameKo}"의 특정 기술로 확인되지 않았습니다.
            {outcome?.errorMessage && <div style={{ fontWeight: 400, marginTop: 4 }}>{outcome.errorMessage}</div>}
            <div style={{ fontWeight: 400, marginTop: 4 }}>기술을 등록하지 않았습니다.</div>
          </div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => setStep('input')}>
              다시 시도
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'insufficient_evidence' && (
        <>
          <div className="banner banner--error">
            요청한 기술이 "{martialArtNameKo}"의 기술이라는 충분한 웹 근거를 찾지 못했습니다.
            <div style={{ fontWeight: 400, marginTop: 4 }}>검증된 기술로 등록하지 않았습니다.</div>
            {outcome?.errorMessage && <div style={{ marginTop: 4 }}>{outcome.errorMessage}</div>}
          </div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => runVerify(true)}>
              추가 검색
            </button>
            <button className="btn btn-secondary" onClick={() => setStep('input')}>
              다시 입력
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'preview' && selected && (
        <>
          <div className="banner banner--success">확인됨 (신뢰도 {selected.confidence}%)</div>
          {registerError && <div className="banner banner--error">{registerError}</div>}
          <p style={{ marginTop: 8 }}>
            <strong>무술:</strong> {martialArtNameKo}
          </p>
          <p>
            <strong>기술:</strong> {selected.name} {selected.nameKo ? `(${selected.nameKo})` : ''}
          </p>
          <p>{selected.description}</p>
          {renderSources(selected.sources)}
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleRegister}>
              기술 추가
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {step === 'registering' && <p className="video-status-message row gap-1"><span className="spinner" /> 기술을 등록하는 중...</p>}

      {step === 'done' && (
        <>
          <div className="banner banner--success">✓ "{registeredName}" 기술이 추가되었습니다.</div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
