import { CALL_GAP_MAX, CALL_GAP_MIN, STEP_MS_MAX, STEP_MS_MIN, STEP_PRESETS, tempoLabel, type MittTempo } from '../../lib/visualMitt/tempo';

/**
 * 콤보 속도 + 음성 → 미트 간격 sliders. The speed bar runs from slow (left) to
 * real pad-work speed (right), so the stored value (ms per technique) is
 * inverted for the input. Preset chips jump the bar to the usual speeds.
 */
export default function TempoControls({
  tempo,
  onChange,
  showCallGap = true,
  testIdPrefix,
}: {
  tempo: MittTempo;
  onChange: (patch: Partial<Pick<MittTempo, 'stepMs' | 'callGapMs'>>) => void;
  showCallGap?: boolean;
  /** Keeps each mode's existing preset test ids (e.g. "command-pace", "mitt-runner-speed"). */
  testIdPrefix: string;
}) {
  const presets: [keyof typeof STEP_PRESETS, string][] = [
    ['slow', '천천히'],
    ['normal', '보통'],
    ['fast', '빠르게'],
    ['max', '최고 속도'],
  ];
  return (
    <div className="mitt-tempo" data-testid="mitt-tempo">
      <label className="mitt-tempo__row">
        <span className="field-label">콤보 속도</span>
        <span className="mitt-tempo__end">느리게</span>
        <input
          type="range"
          min={STEP_MS_MIN}
          max={STEP_MS_MAX}
          step={10}
          value={STEP_MS_MIN + STEP_MS_MAX - tempo.stepMs}
          onChange={(e) => onChange({ stepMs: STEP_MS_MIN + STEP_MS_MAX - Number(e.target.value) })}
          aria-label="콤보 속도"
          data-testid="mitt-tempo-speed"
          data-step-ms={tempo.stepMs}
        />
        <span className="mitt-tempo__end">빠르게</span>
        <strong className="mitt-tempo__value" data-testid="mitt-tempo-speed-value">
          {tempoLabel(tempo.stepMs)} · 기술 간격 {(tempo.stepMs / 1000).toFixed(2)}초
        </strong>
      </label>
      <div className="chip-row" style={{ margin: '2px 0 4px' }}>
        {presets.map(([k, label]) => (
          <button key={k} type="button" className={`chip${tempo.stepMs === STEP_PRESETS[k] ? ' active' : ''}`} onClick={() => onChange({ stepMs: STEP_PRESETS[k] })} data-testid={`${testIdPrefix}-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {showCallGap && (
        <label className="mitt-tempo__row">
          <span className="field-label">말 끝 → 미트 간격</span>
          <span className="mitt-tempo__end">바로</span>
          <input
            type="range"
            min={CALL_GAP_MIN}
            max={CALL_GAP_MAX}
            step={10}
            value={tempo.callGapMs}
            onChange={(e) => onChange({ callGapMs: Number(e.target.value) })}
            aria-label="코치의 말이 끝난 뒤 미트가 나오기까지의 간격"
            data-testid="mitt-tempo-gap"
            data-gap-ms={tempo.callGapMs}
          />
          <span className="mitt-tempo__end">늦게</span>
          <strong className="mitt-tempo__value" data-testid="mitt-tempo-gap-value">
            {(tempo.callGapMs / 1000).toFixed(2)}초
          </strong>
        </label>
      )}
      <p className="technique-row__sub" style={{ margin: 0 }}>
        주먹이 미트에 닿는 동작 자체는 항상 실제 속도입니다. 콤보 속도는 기술 사이 간격이고, 오른쪽 끝이 실제 미트 최고 속도(기술 간격 {(STEP_MS_MIN / 1000).toFixed(2)}초)입니다.
        {showCallGap ? ' 말 끝 → 미트 간격은 코치가 지시를 다 말한 뒤 미트가 나오기까지의 시간입니다.' : ''}
      </p>
    </div>
  );
}
