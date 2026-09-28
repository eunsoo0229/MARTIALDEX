import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { verifyNewMartialArt, researchTechniquesForMartialArt, registerNewMartialArt } from '../lib/martialArtDiscovery/service';
import type { DiscoveredTechniqueCandidate, MartialArtVerificationOutcome } from '../lib/martialArtDiscovery/types';
import BackButton from '../components/BackButton';

type Step = 'input' | 'verifying' | 'already_exists' | 'insufficient_evidence' | 'verified' | 'researching' | 'research_insufficient' | 'preview' | 'registering' | 'done' | 'error';

const CATEGORY_LABEL_KO: Record<string, string> = {
  strike: '펀치/손기술',
  kick: '킥',
  defense: '방어',
  evasion: '회피',
  takedown: '테이크다운/던지기',
  clinch: '클린치',
  grip: '그립',
  other: '기타',
};

export default function AddMartialArt() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [input, setInput] = useState('');
  const [verification, setVerification] = useState<MartialArtVerificationOutcome | null>(null);
  const [candidates, setCandidates] = useState<DiscoveredTechniqueCandidate[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawCandidateCount, setRawCandidateCount] = useState(0);
  const [registeredResult, setRegisteredResult] = useState<{ martialArtId: string; techniqueCount: number } | null>(null);

  async function handleVerify() {
    if (!input.trim()) return;
    setStep('verifying');
    const result = await verifyNewMartialArt(input.trim());
    setVerification(result);
    if (result.status === 'already_exists') setStep('already_exists');
    else if (result.status === 'verified') setStep('verified');
    else {
      setErrorMessage(result.errorMessage ?? '실제 존재하는 무술이라는 충분한 웹 근거를 찾지 못했습니다.');
      setStep('insufficient_evidence');
    }
  }

  async function handleResearchTechniques() {
    if (!verification || verification.status !== 'verified' || !verification.nameKo) return;
    setStep('researching');
    const result = await researchTechniquesForMartialArt(verification.nameKo, verification.nameEn ?? null);
    setRawCandidateCount(result.rawCandidateCount);
    if (result.status !== 'ok' || result.candidates.length === 0) {
      setErrorMessage(result.errorMessage ?? '웹 검색으로 검증된 기술을 충분히 찾지 못했습니다.');
      setStep('research_insufficient');
      return;
    }
    setCandidates(result.candidates);
    setSelectedNames(new Set(result.candidates.filter((c) => c.selected).map((c) => c.name)));
    setStep('preview');
  }

  function toggleCandidate(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleRegister() {
    if (!verification || verification.status !== 'verified' || !verification.nameKo || !user) return;
    setStep('registering');
    const selected = candidates.filter((c) => selectedNames.has(c.name));
    const result = await registerNewMartialArt(
      { nameKo: verification.nameKo, nameEn: verification.nameEn ?? null, description: verification.description ?? '', sources: verification.sources ?? [] },
      selected,
      user.id
    );
    if (!result.ok) {
      setErrorMessage(result.message);
      setStep('error');
      return;
    }
    setRegisteredResult({ martialArtId: result.martialArtId, techniqueCount: result.techniqueIds.length });
    setStep('done');
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/arts" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/arts">무술 목록</Link>
          <span>/</span>
          <span>무술 추가</span>
        </div>
        <div className="section-title">
          <h2>+ 무술 추가</h2>
        </div>

        {step === 'input' && (
          <div className="card info-card">
            <p className="video-status-message">
              MARTIALDEX에 없는 무술을 실제 웹 검색으로 검증한 뒤 추가합니다. AI의 자체 지식만으로 무술이나 기술을 만들어내지 않으며, 충분한 웹 근거가 없으면 등록하지 않습니다.
            </p>
            <label className="field-label">추가할 무술을 입력하세요</label>
            <input
              className="select field-full"
              placeholder="예: 우슈, Wushu, 중국 무술 우슈"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleVerify} disabled={!input.trim()}>
                AI로 무술 검증
              </button>
            </div>
            {!user && <p className="video-status-message" style={{ marginTop: 8 }}>무술 등록은 로그인이 필요합니다 (검증까지는 로그인 없이도 가능합니다).</p>}
          </div>
        )}

        {step === 'verifying' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> 실제 웹 검색으로 "{input}"이(가) 실제 존재하는 무술인지 검증하는 중...
            </p>
          </div>
        )}

        {step === 'already_exists' && verification?.status === 'already_exists' && (
          <div className="card info-card">
            <div className="banner banner--warning">
              이미 MARTIALDEX에 등록된 무술입니다. ({verification.existingMartialArtName})
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <Link to={`/arts/${verification.existingMartialArtId}`} className="btn btn-primary">
                무술 보기
              </Link>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>
                다시 입력
              </button>
            </div>
          </div>
        )}

        {step === 'insufficient_evidence' && (
          <div className="card info-card">
            <div className="banner banner--error">
              ⚠ 검색 근거가 충분하지 않습니다.
              <div style={{ fontWeight: 400, marginTop: 4 }}>
                실시간 웹 검색은 실행되었지만 "{input}"이(가) 실제 독립적인 무술이라는 충분한 근거를 찾지 못했습니다. 정확하지 않은 정보를 임의로 추가하지 않고 등록을 중단했습니다.
              </div>
              {errorMessage && <div style={{ marginTop: 4 }}>{errorMessage}</div>}
            </div>
            {verification && verification.executedQueries.length > 0 && (
              <p className="video-status-message">실행된 검색어: {verification.executedQueries.join(' · ')}</p>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => setStep('input')}>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {step === 'verified' && verification?.status === 'verified' && (
          <div className="card info-card">
            <div className="banner banner--success">✓ 검증됨</div>
            <h3 style={{ marginTop: 12 }}>
              {verification.nameKo} {verification.nameEn ? `(${verification.nameEn})` : ''}
            </h3>
            <p>{verification.description}</p>
            {verification.sources && verification.sources.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 8 }}>확인된 출처</div>
                <ul style={{ paddingLeft: 18 }}>
                  {verification.sources.map((s) => (
                    <li key={s.url} className="video-status-message" style={{ margin: 0 }}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleResearchTechniques}>
                기술 50개 조사하기
              </button>
            </div>
          </div>
        )}

        {step === 'researching' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> 실제 웹 검색으로 대표 기술을 조사하는 중... (다소 시간이 걸릴 수 있습니다)
            </p>
          </div>
        )}

        {step === 'research_insufficient' && (
          <div className="card info-card">
            <div className="banner banner--error">
              ⚠ 검증된 기술을 충분히 찾지 못했습니다.
              <div style={{ fontWeight: 400, marginTop: 4 }}>{errorMessage}</div>
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleResearchTechniques}>
                다시 검색
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>
                처음으로
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && verification?.status === 'verified' && (
          <div className="card info-card">
            <h3>{verification.nameKo} — 검증된 기술 {candidates.length}개</h3>
            {candidates.length < 50 && (
              <p className="video-status-message">
                웹 근거를 통해 검증된 기술은 {candidates.length}개입니다 (원본 후보 {rawCandidateCount}개 중 검증/중복제거 후). 50개를 채우기 위해 검증되지 않은 기술을 임의로 추가하지 않았습니다.
              </p>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedNames(new Set(candidates.map((c) => c.name)))}>
                전체 선택
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedNames(new Set())}>
                전체 해제
              </button>
            </div>
            <div className="stack gap-2">
              {candidates.map((c) => (
                <details key={c.name} className="technique-row">
                  <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedNames.has(c.name)} onChange={() => toggleCandidate(c.name)} onClick={(e) => e.stopPropagation()} />
                    <strong>{c.name}</strong>
                    {c.nameKo && <span className="video-status-message">({c.nameKo})</span>}
                    <span className="chip">{CATEGORY_LABEL_KO[c.category] ?? c.category}</span>
                    <span className="video-status-message">신뢰도 {c.confidence}</span>
                  </summary>
                  <div style={{ marginTop: 6, paddingLeft: 24 }}>
                    <p style={{ margin: 0 }}>{c.description}</p>
                    {c.sources.length > 0 && (
                      <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                        {c.sources.map((s) => (
                          <li key={s.url} className="video-status-message" style={{ margin: 0 }}>
                            <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              ))}
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleRegister} disabled={selectedNames.size === 0 || !user}>
                무술 추가 ({selectedNames.size}개 기술)
              </button>
            </div>
            {!user && <p className="video-status-message">무술 등록은 로그인이 필요합니다.</p>}
          </div>
        )}

        {step === 'registering' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> 무술과 선택한 기술을 등록하는 중...
            </p>
          </div>
        )}

        {step === 'done' && registeredResult && (
          <div className="card info-card">
            <div className="banner banner--success">✓ 무술이 추가되었습니다.</div>
            <p>{verification?.nameKo}에 기술 {registeredResult.techniqueCount}개가 등록되었습니다.</p>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate(`/arts/${registeredResult.martialArtId}`)}>
                무술 보기
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="card info-card">
            <div className="banner banner--error">{errorMessage}</div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => setStep('preview')}>
                다시 시도
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
