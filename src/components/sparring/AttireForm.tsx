import { ATTIRE_COLOR_LABEL, ATTIRE_COLORS, BOTTOM_TYPES, TOP_TYPES, type AttireColor, type FighterAttire } from '../../lib/sparringAnalysis/attire';

/** Compact attire input for one fighter — colours are chosen from a short list; types and memo are optional. Nothing is pre-filled. */
export default function AttireForm({ title, value, onChange, required }: { title: string; value: FighterAttire; onChange: (v: FighterAttire) => void; required: boolean }) {
  const colorSelect = (label: string, key: 'topColor' | 'bottomColor' | 'gloveColor', isRequired: boolean) => (
    <label className="field-label attire-field">
      {label}
      {isRequired ? ' *' : ' (선택)'}
      <select className="select" value={value[key] ?? ''} onChange={(e) => onChange({ ...value, [key]: (e.target.value || null) as AttireColor | null })} data-testid={`attire-${title}-${key}`}>
        <option value="">선택 안 함</option>
        {ATTIRE_COLORS.map((c) => (
          <option key={c} value={c}>
            {ATTIRE_COLOR_LABEL[c]}
          </option>
        ))}
      </select>
    </label>
  );
  const typeSelect = (label: string, key: 'topType' | 'bottomType', options: readonly string[]) => (
    <label className="field-label attire-field">
      {label} (선택)
      <select className="select" value={value[key] ?? ''} onChange={(e) => onChange({ ...value, [key]: e.target.value || null })}>
        <option value="">선택 안 함</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <fieldset className="attire-form">
      <legend>{title}</legend>
      <div className="attire-grid">
        {colorSelect('상의 색', 'topColor', required)}
        {typeSelect('상의 종류', 'topType', TOP_TYPES)}
        {colorSelect('하의 색', 'bottomColor', required)}
        {typeSelect('하의 종류', 'bottomType', BOTTOM_TYPES)}
        {colorSelect('글러브/보호구 색', 'gloveColor', false)}
      </div>
      <input
        className="select"
        style={{ width: '100%', marginTop: 6 }}
        placeholder="구분 메모 (선택, 예: 헤드기어 착용)"
        value={value.memo ?? ''}
        onChange={(e) => onChange({ ...value, memo: e.target.value || null })}
      />
    </fieldset>
  );
}
