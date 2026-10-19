import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AI_FEATURES, AI_GROUP_LABEL, AI_GROUP_ORDER, aiFeaturesByGroup, type AiFeatureGroup } from '../../lib/aiCoach/aiFeatureCatalog';

/**
 * AI 코치 탭의 "AI 기능 전체" — every AI feature of MARTIALDEX, grouped,
 * filterable by area (?tab=) and by text. Each card starts the real feature.
 */
export default function AiFeatureCatalog(props: { onAsk: () => void }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: AiFeatureGroup | 'all' = raw && (AI_GROUP_ORDER as string[]).includes(raw) ? (raw as AiFeatureGroup) : 'all';
  const [query, setQuery] = useState('');
  const features = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = aiFeaturesByGroup(q ? 'all' : tab);
    return q ? list.filter((f) => `${f.title} ${f.description} ${AI_GROUP_LABEL[f.group]}`.toLowerCase().includes(q)) : list;
  }, [tab, query]);
  const groups = tab === 'all' || query.trim() ? AI_GROUP_ORDER : [tab];

  function selectTab(next: AiFeatureGroup | 'all') {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
    setQuery('');
  }

  return (
    <section className="ai-catalog" data-testid="ai-feature-catalog" data-tab={tab}>
      <div className="ai-catalog__head">
        <h3 style={{ margin: 0 }}>AI 기능 전체 ({AI_FEATURES.length})</h3>
        <input className="select ai-catalog__search" placeholder="AI 기능 찾기 (예: 식단, 콤보, 스파링)" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="ai-feature-search" />
      </div>
      <div className="chip-row" role="tablist" aria-label="AI 기능 분류">
        <button type="button" role="tab" aria-selected={tab === 'all'} className={`chip${tab === 'all' && !query ? ' active' : ''}`} onClick={() => selectTab('all')} data-testid="ai-tab-all">
          전체
        </button>
        {AI_GROUP_ORDER.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={tab === g} className={`chip${tab === g && !query ? ' active' : ''}`} onClick={() => selectTab(g)} data-testid={`ai-tab-${g}`}>
            {AI_GROUP_LABEL[g]} {aiFeaturesByGroup(g).length}
          </button>
        ))}
      </div>
      {features.length === 0 && <p className="video-status-message">"{query}"에 맞는 AI 기능이 없습니다.</p>}
      {groups.map((g) => {
        const list = features.filter((f) => f.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="ai-catalog__group" data-group={g}>
            {(tab === 'all' || query) && <h4 className="ai-catalog__group-title">{AI_GROUP_LABEL[g]}</h4>}
            <div className="ai-catalog__grid">
              {list.map((f) => (
                <div key={f.id} className="card info-card ai-feature-card" data-testid={f.testId ?? `ai-feature-${f.id}`} data-feature={f.id}>
                  <h3>
                    {f.icon} {f.title}
                  </h3>
                  <p className="ai-feature-card__desc">{f.description}</p>
                  {f.where && <p className="video-status-message ai-feature-card__where">위치: {f.where}</p>}
                  <div className="modal-actions modal-actions--start">
                    {f.action === 'ask' ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={props.onAsk} data-testid="ai-feature-ask-button">
                        {f.cta}
                      </button>
                    ) : (
                      <Link to={f.to} className="btn btn-primary btn-sm">
                        {f.cta}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
