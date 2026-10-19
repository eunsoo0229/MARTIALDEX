import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { todayDateKey } from '../lib/dateUtil';
import { useNutritionMeals } from '../lib/nutrition/useNutritionMeals';
import { useNutritionProfile } from '../lib/nutrition/useNutritionProfile';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { deleteMeal } from '../lib/nutrition/mealService';
import { computeCalorieGoalStatus, formatKcal, GOAL_STATUS_LABEL, sumMealsTotals } from '../lib/nutrition/calc';
import { computeBmr, computeEstimatedDailyBurn } from '../lib/nutrition/bmr';
import { estimateSessionCalories, sumEstimatedCalories } from '../lib/nutrition/trainingEnergy';
import { computeNutritionCalendarMonth } from '../lib/nutrition/calendarData';
import { deriveEntryCurriculumTitle, deriveEntryMartialArt } from '../lib/trainingAnalytics/historyView';
import { getMartialArt } from '../lib/loadData';
import { GOAL_TYPE_LABEL, MEAL_TYPE_LABEL, type MealType, type NutritionFoodItem, type NutritionMealEntry } from '../lib/nutrition/types';
import NutritionCalendarView from '../components/NutritionCalendarView';
import MealFormModal from '../components/nutrition/MealFormModal';
import AiMealGenModal from '../components/nutrition/AiMealGenModal';
import AiMealTextModal from '../components/nutrition/AiMealTextModal';
import AiMealPhotoModal from '../components/nutrition/AiMealPhotoModal';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

function MealRow({ meal, onEdit, onDelete }: { meal: NutritionMealEntry; onEdit: () => void; onDelete: () => void }) {
  const totals = sumMealsTotals([meal]);
  return (
    <div className="technique-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="technique-row__main">
        <div className="technique-row__name">
          {MEAL_TYPE_LABEL[meal.mealType]} · {meal.foods.map((f) => f.name).join(', ')}
          {meal.isEstimate && <span className="chip" style={{ marginLeft: 6 }}>AI 추정값</span>}
        </div>
      </div>
      <div className="technique-row__sub">
        {formatKcal(totals.calories)} · 탄 {Math.round(totals.carbsG)}g · 단 {Math.round(totals.proteinG)}g · 지 {Math.round(totals.fatG)}g
      </div>
      <div className="modal-actions modal-actions--start" style={{ gap: 4, marginTop: 4 }}>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>
          수정
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDelete}>
          삭제
        </button>
      </div>
    </div>
  );
}

export default function Nutrition() {
  const allMeals = useNutritionMeals();
  const profile = useNutritionProfile();
  const allTrainingEntries = useTrainingHistory();

  const today = todayDateKey();
  const todayMeals = useMemo(() => allMeals.filter((m) => m.date === today), [allMeals, today]);
  const todayTotals = useMemo(() => sumMealsTotals(todayMeals), [todayMeals]);

  const todayTrainingEntries = useMemo(() => allTrainingEntries.filter((e) => e.date === today), [allTrainingEntries, today]);
  const todayTrainingKcal = useMemo(
    () => sumEstimatedCalories(todayTrainingEntries, profile.bodyWeightKg),
    [todayTrainingEntries, profile.bodyWeightKg]
  );
  const bmr = useMemo(() => computeBmr(profile), [profile]);
  const dailyBurn = useMemo(() => computeEstimatedDailyBurn(bmr, todayTrainingKcal), [bmr, todayTrainingKcal]);
  // Per-source breakdown (spec item 6 — "오늘 내가 왜 이만큼 소모한 것으로
  // 계산됐지?") — reuses the SAME estimateSessionCalories() per entry
  // instead of a new calc engine; the total above is still the authoritative
  // sum, this list is purely informational. Never double-counts: it's
  // recomputed fresh from today's entries on every render, nothing is
  // accumulated/stored.
  const todayTrainingBreakdown = useMemo(
    () =>
      todayTrainingEntries.map((entry) => {
        const title = entry.gymClassMeta
          ? `체육관 · ${entry.gymClassMeta.classTitle}`
          : deriveEntryCurriculumTitle(entry) ?? getMartialArt(deriveEntryMartialArt(entry) ?? '')?.nameKo ?? '훈련';
        return { id: entry.id, title, kcal: estimateSessionCalories(entry, profile.bodyWeightKg) };
      }),
    [todayTrainingEntries, profile.bodyWeightKg]
  );

  const goalStatus = computeCalorieGoalStatus(profile.goalType, todayTotals.calories, profile.calorieGoal);

  const [calendarDate, setCalendarDate] = useState(new Date());
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendarDays = useMemo(
    () => computeNutritionCalendarMonth(allMeals, year, month, profile.goalType, profile.calorieGoal),
    [allMeals, year, month, profile.goalType, profile.calorieGoal]
  );
  const selectedMeals = useMemo(() => (selectedDate ? allMeals.filter((m) => m.date === selectedDate) : []), [allMeals, selectedDate]);
  const selectedTotals = useMemo(() => sumMealsTotals(selectedMeals), [selectedMeals]);

  const [addOpen, setAddOpen] = useState(false);
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [aiTextOpen, setAiTextOpen] = useState(false);
  const [aiPhotoOpen, setAiPhotoOpen] = useState(false);
  // ?ai=gen|text|photo — opened straight from the AI 코치 tab's feature catalog.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const ai = searchParams.get('ai');
    if (!ai) return;
    if (ai === 'gen') setAiGenOpen(true);
    else if (ai === 'text') setAiTextOpen(true);
    else if (ai === 'photo') setAiPhotoOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('ai');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editingMeal, setEditingMeal] = useState<NutritionMealEntry | null>(null);
  const [pendingReview, setPendingReview] = useState<{ mealType: MealType; foods: NutritionFoodItem[]; source: 'ai_photo' | 'ai_text' } | null>(
    null
  );

  function handleDelete(id: string) {
    if (!window.confirm('이 식사 기록을 삭제할까요?')) return;
    deleteMeal(id);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>영양/식단</span>
        </div>
        <div className="section-title">
          <h2>🍚 오늘의 영양</h2>
          <Link to="/nutrition/goals" className="see-all">
            목표 설정 →
          </Link>
        </div>

        <div className="card info-card">
          <div className="curriculum-stat-row">
            <div>
              <strong>{formatKcal(todayTotals.calories)}</strong>
              <span>섭취 칼로리</span>
            </div>
            <div>
              <strong>{profile.calorieGoal != null ? formatKcal(profile.calorieGoal) : '미설정'}</strong>
              <span>목표 칼로리 ({GOAL_TYPE_LABEL[profile.goalType]})</span>
            </div>
            <div>
              <strong>{GOAL_STATUS_LABEL[goalStatus]}</strong>
              <span>달성 상태</span>
            </div>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{Math.round(todayTotals.carbsG)}g</strong>
              <span>탄수화물{profile.carbGoalG != null ? ` / ${profile.carbGoalG}g` : ''}</span>
            </div>
            <div>
              <strong>{Math.round(todayTotals.proteinG)}g</strong>
              <span>단백질{profile.proteinGoalG != null ? ` / ${profile.proteinGoalG}g` : ''}</span>
            </div>
            <div>
              <strong>{Math.round(todayTotals.fatG)}g</strong>
              <span>지방{profile.fatGoalG != null ? ` / ${profile.fatGoalG}g` : ''}</span>
            </div>
          </div>
        </div>

        <div className="card info-card">
          <h3>🔥 오늘의 에너지</h3>
          <p className="video-status-message">
            {bmr != null ? `기초대사량 ${formatKcal(bmr)}` : '기초대사량 계산에 필요한 정보(키/나이/성별/체중)가 부족합니다'}
            {' + 오늘 훈련 예상 소비 '}
            {formatKcal(dailyBurn.training)}
            {' = 오늘 예상 소비 칼로리 '}
            {formatKcal(dailyBurn.total)}
          </p>
          <div className="curriculum-stat-row">
            <div>
              <strong>{formatKcal(dailyBurn.total)}</strong>
              <span>예상 소비</span>
            </div>
            <div>
              <strong>{formatKcal(todayTotals.calories)}</strong>
              <span>섭취</span>
            </div>
            <div>
              <strong>{formatKcal(todayTotals.calories - dailyBurn.total)}</strong>
              <span>섭취 - 소비 차이</span>
            </div>
          </div>
          {todayTrainingBreakdown.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p className="video-status-message" style={{ marginBottom: 4 }}>활동</p>
              {todayTrainingBreakdown.map((b) => (
                <p key={b.id} className="technique-row__sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{b.title}</span>
                  <span>{b.kcal != null ? `- ${formatKcal(b.kcal)}` : '-'}</span>
                </p>
              ))}
            </div>
          )}
          {todayTrainingEntries.some((e) => e.source === 'sparring_session') && (
            <p className="video-status-message" style={{ marginTop: 8 }}>
              오늘 스파링 운동 기록이 있습니다. 운동 후에는 수분을 충분히 보충하고 탄수화물과 단백질을 포함한 균형 잡힌 식사를
              하는 것이 회복에 도움이 될 수 있습니다.
            </p>
          )}
          {bmr == null && (
            <Link to="/nutrition/goals" className="btn btn-secondary btn-sm">
              신체 정보 입력하기
            </Link>
          )}
        </div>

        <div className="chip-row">
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            + 직접 입력
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAiGenOpen(true)}>
            🤖 AI 식단 생성
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAiTextOpen(true)}>
            📝 자연어 입력
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAiPhotoOpen(true)}>
            📷 사진 분석
          </button>
        </div>

        <div className="section-title" style={{ marginTop: 16 }}>
          <h3>오늘 등록된 식사</h3>
        </div>
        {todayMeals.length === 0 ? (
          <EmptyState icon="🍚" text="오늘 등록된 식사가 없습니다." />
        ) : (
          <div className="stack gap-2">
            {todayMeals.map((m) => (
              <MealRow key={m.id} meal={m} onEdit={() => setEditingMeal(m)} onDelete={() => handleDelete(m.id)} />
            ))}
          </div>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>
          <h3>📅 영양 캘린더</h3>
        </div>
        <div className="card info-card">
          <NutritionCalendarView
            year={year}
            month={month}
            days={calendarDays}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
            onPrevMonth={() => setCalendarDate(new Date(year, month - 1, 1))}
            onNextMonth={() => setCalendarDate(new Date(year, month + 1, 1))}
          />
          <p className="video-status-message">
            {GOAL_TYPE_LABEL[profile.goalType]} 목표 달성일이 노란색으로 표시됩니다.
          </p>
          {selectedDate && (
            <div style={{ marginTop: 10 }}>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{selectedDate}</strong>
                  <span>선택한 날짜</span>
                </div>
                <div>
                  <strong>{formatKcal(selectedTotals.calories)}</strong>
                  <span>섭취 칼로리</span>
                </div>
                <div>
                  <strong>{profile.calorieGoal != null ? formatKcal(profile.calorieGoal) : '미설정'}</strong>
                  <span>목표 칼로리</span>
                </div>
              </div>
              <div className="technique-row__sub">
                탄 {Math.round(selectedTotals.carbsG)}g · 단 {Math.round(selectedTotals.proteinG)}g · 지 {Math.round(selectedTotals.fatG)}g
              </div>
              {selectedMeals.length === 0 ? (
                <p className="video-status-message">이 날짜에 등록된 식사가 없습니다.</p>
              ) : (
                <div className="stack gap-2" style={{ marginTop: 8 }}>
                  {selectedMeals.map((m) => (
                    <MealRow key={m.id} meal={m} onEdit={() => setEditingMeal(m)} onDelete={() => handleDelete(m.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {addOpen && <MealFormModal mode="create" onClose={() => setAddOpen(false)} />}
      {editingMeal && (
        <MealFormModal
          mode="edit"
          existingId={editingMeal.id}
          initialMealType={editingMeal.mealType}
          initialFoods={editingMeal.foods}
          initialNotes={editingMeal.notes ?? ''}
          onClose={() => setEditingMeal(null)}
        />
      )}
      {aiGenOpen && <AiMealGenModal profile={profile} onClose={() => setAiGenOpen(false)} onSaved={() => {}} />}
      {aiTextOpen && (
        <AiMealTextModal
          onClose={() => setAiTextOpen(false)}
          onParsed={(result) => {
            setAiTextOpen(false);
            setPendingReview({ ...result, source: 'ai_text' });
          }}
        />
      )}
      {aiPhotoOpen && (
        <AiMealPhotoModal
          onClose={() => setAiPhotoOpen(false)}
          onAnalyzed={(foods) => {
            setAiPhotoOpen(false);
            setPendingReview({ mealType: 'lunch', foods, source: 'ai_photo' });
          }}
        />
      )}
      {pendingReview && (
        <MealFormModal
          mode="create"
          source={pendingReview.source}
          initialMealType={pendingReview.mealType}
          initialFoods={pendingReview.foods}
          onClose={() => setPendingReview(null)}
        />
      )}
    </div>
  );
}
