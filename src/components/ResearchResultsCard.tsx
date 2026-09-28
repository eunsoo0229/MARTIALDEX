import type { CurriculumDay } from '../lib/curriculum/types';
import type { GoalTechniqueMatch } from '../lib/aiCurriculum/types';
import type { GoalCurriculumResearchSummary, GoalCurriculumDiscoveryStats } from '../lib/aiCurriculum/service';

// The "조사 결과" panel — spec section 11's requirement that the user can
// actually see (a) whether the internet-research stage genuinely succeeded,
// partially succeeded, or failed/wasn't available (never silently shown as
// "조사 완료" when it wasn't — see SearchStatus's doc comment in
// aiCurriculum/types.ts), and (b) enough of what happened underneath that
// the number isn't just a black box: queries, found techniques, DB match
// status, and what got excluded and why.
//
// The banner text is keyed PRIMARILY by researchMode (web_search / grounded
// / knowledge_fallback / unavailable), not just SearchStatus — a later task
// found the previous version could show a generic "✓ 검색 성공" even when
// grounding had actually failed and a knowledge-only fallback ran. Each mode
// gets its own explicit, honest title + body text (never implying a real
// web search happened when it didn't); status only adjusts the icon/detail
// within that mode's own wording.
interface BannerMeta {
  icon: string;
  bannerClass: string;
  title: string;
  body: string;
}

function buildBannerMeta(r: GoalCurriculumResearchSummary): BannerMeta {
  const n = r.validResearchedCount;
  const thin = r.status === 'SEARCH_PARTIAL';

  if (r.researchMode === 'web_search' && (r.status === 'SEARCH_SUCCESS' || r.status === 'SEARCH_PARTIAL')) {
    return thin
      ? { icon: '⚠', bannerClass: 'banner--warning', title: '외부 웹 검색 완료(결과 부족)', body: `실제 웹 검색 결과를 분석했지만 유효한 기술은 ${n}개뿐입니다 — 목표를 더 구체적으로 입력하면 결과가 나아질 수 있습니다.` }
      : { icon: '✓', bannerClass: 'banner--success', title: '외부 웹 검색 완료', body: `실제 웹 검색 결과 ${n}개를 분석했습니다.` };
  }
  if (r.researchMode === 'grounded' && (r.status === 'SEARCH_SUCCESS' || r.status === 'SEARCH_PARTIAL')) {
    return thin
      ? { icon: '⚠', bannerClass: 'banner--warning', title: 'Google Search 기반 조사 완료(결과 부족)', body: `유효한 검색 결과가 ${n}개뿐입니다 — 목표를 더 구체적으로 입력하면 결과가 나아질 수 있습니다.` }
      : { icon: '✓', bannerClass: 'banner--success', title: 'Google Search 기반 조사 완료', body: `실제 검색 결과 ${n}개를 분석했습니다.` };
  }
  if (r.researchMode === 'knowledge_fallback' && (r.status === 'SEARCH_SUCCESS' || r.status === 'SEARCH_PARTIAL')) {
    // Always rendered as a warning, never success — this is a degraded mode
    // by definition (no real web search backs these results), regardless of
    // how many candidates it produced. See ResearchMode's doc comment.
    return {
      icon: '⚠',
      bannerClass: 'banner--warning',
      title: 'AI 지식 기반 조사 (실시간 검색 아님)',
      body: '실시간 웹 검색에 실패하여 AI의 기존 지식만으로 추정했습니다 — 검색 결과에 근거한 것이 아니므로 실제와 다르거나 부정확한 기술이 포함될 수 있습니다. 정확도가 중요하다면 잠시 후 다시 시도해 실시간 검색이 적용되는지 확인해주세요.',
    };
  }
  // Defensive only — service.ts's INSUFFICIENT_WEB_EVIDENCE gate always
  // aborts generation before a GoalCurriculumPreview (and therefore this
  // card) can exist, so this case is structurally unreachable in normal use.
  // Kept distinct from the generic failure banner below in case that
  // invariant is ever loosened later.
  if (r.researchMode === 'insufficient_web_evidence') {
    return {
      icon: '⚠',
      bannerClass: 'banner--warning',
      title: '검색 근거가 충분하지 않습니다',
      body: '실시간 웹 검색은 실행되었지만 현재 목표와 직접적으로 관련된 자료를 충분히 찾지 못했습니다. 정확하지 않은 기술을 임의로 추가하지 않고 커리큘럼 생성을 중단했습니다.',
    };
  }
  // 'unavailable', or a mode that technically ran but produced literally
  // nothing (status SEARCH_FAILED/SEARCH_NOT_AVAILABLE) — never dress this
  // up as a partial success.
  return { icon: '✕', bannerClass: 'banner--error', title: '조사에 실패했습니다', body: '외부 검색과 AI 지식 분석을 모두 사용할 수 없습니다.' };
}

function foundTechniqueSectionLabel(r: GoalCurriculumResearchSummary): string {
  if (r.researchMode === 'web_search') return '웹 검색에서 발견된 기술';
  if (r.researchMode === 'grounded') return 'Google Search에서 발견된 기술';
  if (r.researchMode === 'knowledge_fallback') return 'AI 지식에서 확인된 기술 후보';
  if (r.researchMode === 'insufficient_web_evidence') return '웹 검색에서 발견됐지만 근거가 부족한 기술';
  return '발견한 기술';
}

function unregisteredSummaryLine(r: GoalCurriculumResearchSummary): string {
  if (r.researchMode === 'web_search') return `Martialdex 등록 기술 ${r.registeredCount}개 · 웹 검색에서 발견된 미등록 기술 ${r.externalOnlyCount}개`;
  if (r.researchMode === 'grounded') return `Martialdex 등록 기술 ${r.registeredCount}개 · Google Search에서 발견된 미등록 기술 ${r.externalOnlyCount}개`;
  if (r.researchMode === 'knowledge_fallback') return `Martialdex 등록 기술 ${r.registeredCount}개 · AI 지식에서 확인된 미등록 후보 ${r.externalOnlyCount}개`;
  if (r.researchMode === 'insufficient_web_evidence') return `Martialdex 등록 기술 ${r.registeredCount}개 · 근거 부족으로 제외된 후보 ${r.externalOnlyCount}개`;
  return `Martialdex 등록 기술 ${r.registeredCount}개 · 미등록 ${r.externalOnlyCount}개`;
}

export default function ResearchResultsCard({
  research,
  discoveryStats,
  matchedTechniques,
  days,
}: {
  research: GoalCurriculumResearchSummary;
  discoveryStats: GoalCurriculumDiscoveryStats;
  matchedTechniques: GoalTechniqueMatch[];
  days: CurriculumDay[];
}) {
  const meta = buildBannerMeta(research);

  return (
    <div className="card info-card">
      <h3 style={{ marginTop: 0 }}>🔍 외부 조사</h3>
      <div className={`banner ${meta.bannerClass}`} style={{ marginBottom: 10 }}>
        <span aria-hidden="true">{meta.icon}</span>
        <div>
          <strong>{meta.title}</strong>
          <div style={{ fontWeight: 400 }}>{meta.body}</div>
        </div>
      </div>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>자세히 보기</summary>
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          {research.plannedQueries.length > 0 && (
            <p className="video-status-message" style={{ margin: 0 }}>
              <strong>조사 관점</strong> (검색을 위해 계획한 주제 — 아래 "실행된 검색어"와는 다를 수 있음)
              <br />
              {research.plannedQueries.join(' · ')}
            </p>
          )}
          {research.researchMode === 'web_search' && research.executedQueries.length > 0 && (
            <p className="video-status-message" style={{ margin: 0 }}>
              <strong>실행된 검색어</strong> (실제로 외부 검색 API에 전송됨)
              <br />
              {research.executedQueries.join(' · ')}
            </p>
          )}
          {research.researchMode === 'grounded' && research.actualSearchQueries.length > 0 && (
            <p className="video-status-message" style={{ margin: 0 }}>
              <strong>실행된 검색어</strong> (Google Search가 실제로 검색했다고 보고한 내용)
              <br />
              {research.actualSearchQueries.join(' · ')}
            </p>
          )}
          {research.researchMode === 'web_search' && (
            <p className="video-status-message" style={{ margin: 0 }}>
              웹 검색 결과 {research.searchResultCount}개 · 실제로 분석한 출처 {research.analyzedSourceCount}개
            </p>
          )}

          {research.foundTechniques.length > 0 && (
            <div>
              <p className="video-status-message" style={{ margin: 0 }}>
                <strong>{foundTechniqueSectionLabel(research)}</strong> ({research.foundTechniques.length}개)
              </p>
              <div className="chip-row" style={{ marginTop: 4 }}>
                {research.foundTechniques.map((t) => (
                  <span
                    key={t.name}
                    className="chip"
                    title={
                      t.evidence
                        ? `${t.evidence}${t.sourceUrls?.length ? `\n출처: ${t.sourceUrls.join(', ')}` : ''}`
                        : t.matchedToDatabase
                          ? 'Martialdex에 등록된 기술과 매칭됨'
                          : 'Martialdex에서 확인되지 않음'
                    }
                  >
                    {t.matchedToDatabase ? '✓' : '?'} {t.name}
                  </span>
                ))}
              </div>
              {research.researchMode === 'web_search' && research.foundTechniques.some((t) => t.sourceUrls?.length) && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {research.foundTechniques
                    .filter((t) => t.sourceUrls?.length)
                    .map((t) => (
                      <li key={`src-${t.name}`} className="video-status-message" style={{ margin: 0 }}>
                        {t.name}:{' '}
                        {t.sourceUrls!.map((u, i) => (
                          <span key={u}>
                            {i > 0 ? ', ' : ''}
                            <a href={u} target="_blank" rel="noreferrer">
                              {u}
                            </a>
                          </span>
                        ))}
                      </li>
                    ))}
                </ul>
              )}
              <p className="video-status-message" style={{ margin: '4px 0 0' }}>
                {unregisteredSummaryLine(research)}
              </p>
            </div>
          )}

          {research.uncertainCount > 0 && (
            <p className="video-status-message" style={{ margin: 0 }}>
              근거가 충분하지 않아 확정할 수 없는 후보 {research.uncertainCount}개는 커리큘럼에 포함하지 않았습니다.
            </p>
          )}

          {research.excludedTechniques.length > 0 && (
            <div>
              <p className="video-status-message" style={{ margin: 0 }}>
                <strong>제외된 항목</strong>
              </p>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {research.excludedTechniques.map((e, i) => (
                  <li key={`${e.name}-${i}`} className="video-status-message" style={{ margin: 0 }}>
                    {e.name} → {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="video-status-message" style={{ margin: 0 }}>
            사용자가 직접 언급한 기술 중 {discoveryStats.discoveredCount}개를 Martialdex 데이터에서 확인했고, 그 중{' '}
            {discoveryStats.newlyRegisteredCount}개는 기존에 없어 실존 여부를 검증한 뒤 새로 등록했습니다.
          </p>
          <p className="video-status-message" style={{ margin: 0 }}>
            최종 후보 기술 {matchedTechniques.length}개 · 관련도 높음(70+) {matchedTechniques.filter((m) => m.relevanceScore >= 70).length}개 · 중간(40~69){' '}
            {matchedTechniques.filter((m) => m.relevanceScore >= 40 && m.relevanceScore < 70).length}개 · 낮음(&lt;40){' '}
            {matchedTechniques.filter((m) => m.relevanceScore < 40).length}개
          </p>
          <p className="video-status-message" style={{ margin: 0 }}>
            내용이 채워진 Day {days.filter((d) => d.techniqueIds.length > 0).length}개 · 복습 전용 Day{' '}
            {days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length > 0).length}개 · 빈 Day{' '}
            {days.filter((d) => d.techniqueIds.length === 0 && d.reviewTechniqueIds.length === 0).length}개
          </p>
        </div>
      </details>
    </div>
  );
}
