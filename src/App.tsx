import { Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import Header from './components/Header';
import AppErrorBoundary from './components/AppErrorBoundary';
import Home from './pages/Home';
import { AuthProvider } from './lib/auth/AuthProvider';
import LocalDataMigrationPrompt from './components/auth/LocalDataMigrationPrompt';
import GymLiveWatcher from './components/GymLiveWatcher';

// Every OTHER page used to be a static top-of-file import, which meant
// Vite bundled all ~58 pages (curriculum editor, sparring analysis, pose
// analysis, nutrition AI modals, marketplace, gym routines, ...) into ONE
// eagerly-loaded chunk that has to be fully parsed + compiled + executed
// before React can render even the Home screen. Measured on the real
// packaged production app (not the dev server): a fresh launch took
// ~4000ms to DOMContentLoaded, while a blank-page Electron baseline (same
// electron binary/version) took ~250ms, and reloading the SAME already-
// running window (V8 reusing its compiled-code cache, so no re-parse) took
// only ~195ms — pointing squarely at cold parse/compile of this app's own
// oversized initial bundle, not data processing, network, or Electron
// overhead itself. React.lazy() + Suspense makes Vite split each page into
// its own chunk, fetched only when that route is actually visited — Home
// stays a normal eager import since it's needed on first paint regardless.
// No page's own behavior changes; this only changes WHEN its code loads.
const MartialArtsList = lazy(() => import('./pages/MartialArtsList'));
const AddMartialArt = lazy(() => import('./pages/AddMartialArt'));
const MartialArtDetail = lazy(() => import('./pages/MartialArtDetail'));
const TechniqueList = lazy(() => import('./pages/TechniqueList'));
const TechniqueDetail = lazy(() => import('./pages/TechniqueDetail'));
const LearningHub = lazy(() => import('./pages/LearningHub'));
const CurriculumList = lazy(() => import('./pages/CurriculumList'));
const CurriculumDayList = lazy(() => import('./pages/CurriculumDayList'));
const CurriculumDayDetail = lazy(() => import('./pages/CurriculumDayDetail'));
const CurriculumEditor = lazy(() => import('./pages/CurriculumEditor'));
const CurriculumTrainingStart = lazy(() => import('./pages/CurriculumTrainingStart'));
const Community = lazy(() => import('./pages/Community'));
const PostDetail = lazy(() => import('./pages/PostDetail'));
const MySkills = lazy(() => import('./pages/MySkills'));
const FighterStyleLearning = lazy(() => import('./pages/FighterStyleLearning'));
const AiGoalCurriculum = lazy(() => import('./pages/AiGoalCurriculum'));
const RequestTechnique = lazy(() => import('./pages/RequestTechnique'));
const HomeTraining = lazy(() => import('./pages/HomeTraining'));
const RequestHomeExercise = lazy(() => import('./pages/RequestHomeExercise'));
const TrainingHub = lazy(() => import('./pages/TrainingHub'));
const GymRoutineManager = lazy(() => import('./pages/GymRoutineManager'));
const GymRoutineActivation = lazy(() => import('./pages/GymRoutineActivation'));
const GymExerciseBrowser = lazy(() => import('./pages/GymExerciseBrowser'));
const RequestGymExercise = lazy(() => import('./pages/RequestGymExercise'));
const BodyPartDetail = lazy(() => import('./pages/BodyPartDetail'));
const GymHub = lazy(() => import('./pages/GymHub'));
const GymClassSession = lazy(() => import('./pages/GymClassSession'));
const GymAdminHub = lazy(() => import('./pages/GymAdminHub'));
const GymAdminDetail = lazy(() => import('./pages/GymAdminDetail'));
const GymAdminSessionRoster = lazy(() => import('./pages/GymAdminSessionRoster'));
const Nutrition = lazy(() => import('./pages/Nutrition'));
const NutritionGoals = lazy(() => import('./pages/NutritionGoals'));
const FreeTraining = lazy(() => import('./pages/FreeTraining'));
const SparringSession = lazy(() => import('./pages/SparringSession'));
const CurriculumCoachSession = lazy(() => import('./pages/CurriculumCoachSession'));
const AiComboGenerator = lazy(() => import('./pages/AiComboGenerator'));
const ComboList = lazy(() => import('./pages/ComboList'));
const AiHistory = lazy(() => import('./pages/AiHistory'));
const ComboBuilder = lazy(() => import('./pages/ComboBuilder'));
const ComboTraining = lazy(() => import('./pages/ComboTraining'));
const SkillTree = lazy(() => import('./pages/SkillTree'));
const TacticList = lazy(() => import('./pages/TacticList'));
const TacticBuilder = lazy(() => import('./pages/TacticBuilder'));
const TrainingAnalytics = lazy(() => import('./pages/TrainingAnalytics'));
const TrainingHistoryList = lazy(() => import('./pages/TrainingHistoryList'));
const TrainingHistoryDetail = lazy(() => import('./pages/TrainingHistoryDetail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PersonalCoach = lazy(() => import('./pages/PersonalCoach'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const MarketplaceCurriculumDetail = lazy(() => import('./pages/MarketplaceCurriculumDetail'));
const MarketplacePublish = lazy(() => import('./pages/MarketplacePublish'));
const MarketplacePaymentResult = lazy(() => import('./pages/MarketplacePaymentResult'));
const AiCoach = lazy(() => import('./pages/AiCoach'));
const AiCoachClass = lazy(() => import('./pages/AiCoachClass'));
const VisualMitt = lazy(() => import('./pages/VisualMitt'));
const LearnedTechniques = lazy(() => import('./pages/LearnedTechniques'));
const TodayTraining = lazy(() => import('./pages/TodayTraining'));
const SparringAnalysis = lazy(() => import('./pages/SparringAnalysis'));
const SparringSessionDetail = lazy(() => import('./pages/SparringSessionDetail'));
const SparringRecord = lazy(() => import('./pages/SparringRecord'));
const SparringVideoList = lazy(() => import('./pages/SparringVideoList'));
const TechniqueGraph = lazy(() => import('./pages/TechniqueGraph'));
const SituationRecommend = lazy(() => import('./pages/SituationRecommend'));
const MyStats = lazy(() => import('./pages/MyStats'));
const TodayReview = lazy(() => import('./pages/TodayReview'));
const MyStyle = lazy(() => import('./pages/MyStyle'));
const Profile = lazy(() => import('./pages/Profile'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const GymLiveSession = lazy(() => import('./pages/GymLiveSession'));
const OneOffCoachLesson = lazy(() => import('./pages/OneOffCoachLesson'));
const GymLiveControl = lazy(() => import('./pages/GymLiveControl'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Only shown while a lazy route's own chunk is still loading — for a
// locally-bundled chunk (few KB to a few hundred KB) this is normally on
// screen well under 100ms, so it's deliberately minimal rather than a full
// skeleton, matching the existing "불러오는 중..." + .spinner convention
// used elsewhere (Marketplace.tsx, AiHistory.tsx, ...).
function RouteLoadingFallback() {
  return (
    <div className="page">
      <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
        <span className="spinner" /> 불러오는 중...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Header />
        <ScrollToTop />
        <LocalDataMigrationPrompt />
        <GymLiveWatcher />
        <Suspense fallback={<RouteLoadingFallback />}>
          <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/arts" element={<MartialArtsList />} />
            <Route path="/arts/add" element={<AddMartialArt />} />
            <Route path="/arts/:martialArtId" element={<MartialArtDetail />} />
            <Route path="/arts/:martialArtId/techniques" element={<TechniqueList />} />
            <Route path="/arts/:martialArtId/techniques/:techniqueId" element={<TechniqueDetail />} />
            <Route path="/techniques" element={<TechniqueList />} />
            <Route path="/techniques/request" element={<RequestTechnique />} />
            <Route path="/free-training" element={<FreeTraining />} />
            <Route path="/free-training/sparring" element={<SparringSession />} />
            <Route path="/ai-combo" element={<AiComboGenerator />} />
            <Route path="/ai-history" element={<AiHistory />} />
            <Route path="/combos" element={<ComboList />} />
            <Route path="/combos/new" element={<ComboBuilder />} />
            <Route path="/combos/:comboId/edit" element={<ComboBuilder />} />
            <Route path="/combos/:comboId/train" element={<ComboTraining />} />
            <Route path="/skill-tree" element={<SkillTree />} />
            <Route path="/tactics" element={<TacticList />} />
            <Route path="/tactics/new" element={<TacticBuilder />} />
            <Route path="/tactics/:tacticId/edit" element={<TacticBuilder />} />
            <Route path="/training-analytics" element={<TrainingAnalytics />} />
            <Route path="/training-analytics/history" element={<TrainingHistoryList />} />
            <Route path="/training-analytics/:entryId" element={<TrainingHistoryDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/personal-coach" element={<PersonalCoach />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/publish/:curriculumId" element={<MarketplacePublish />} />
            <Route path="/marketplace/payment/result" element={<MarketplacePaymentResult />} />
            <Route path="/marketplace/:curriculumId" element={<MarketplaceCurriculumDetail />} />
            <Route path="/learning" element={<LearningHub />} />
            <Route path="/learning/new" element={<CurriculumEditor />} />
            <Route path="/learning/:martialArtId" element={<CurriculumList />} />
            <Route path="/learning/:martialArtId/:curriculumId/edit" element={<CurriculumEditor />} />
            <Route path="/learning/:martialArtId/:curriculumId/train" element={<CurriculumTrainingStart />} />
            <Route path="/learning/:martialArtId/:curriculumId/coach/:day" element={<CurriculumCoachSession />} />
            <Route path="/learning/:martialArtId/:curriculumId/day/:day" element={<CurriculumDayDetail />} />
            <Route path="/learning/:martialArtId/:curriculumId" element={<CurriculumDayList />} />
            <Route path="/community" element={<Community />} />
            <Route path="/community/post/:postId" element={<PostDetail />} />
            <Route path="/my-skills" element={<MySkills />} />
            <Route path="/learned-techniques" element={<LearnedTechniques />} />
            <Route path="/fighter-style" element={<FighterStyleLearning />} />
            <Route path="/ai-curriculum" element={<AiGoalCurriculum />} />
            <Route path="/home-training" element={<HomeTraining />} />
            <Route path="/home-training/request" element={<RequestHomeExercise />} />
            <Route path="/training" element={<TrainingHub />} />
            <Route path="/training/routines" element={<GymRoutineManager />} />
            <Route path="/training/routines/manage" element={<GymRoutineActivation />} />
            <Route path="/training/exercises" element={<GymExerciseBrowser />} />
            <Route path="/training/exercises/request" element={<RequestGymExercise />} />
            <Route path="/training/body/:bodyPart" element={<BodyPartDetail />} />
            <Route path="/gym" element={<GymHub />} />
            <Route path="/gym/session/:sessionId" element={<GymClassSession />} />
            <Route path="/gym/admin" element={<GymAdminHub />} />
            <Route path="/gym/admin/:gymId" element={<GymAdminDetail />} />
            <Route path="/gym/admin/session/:sessionId" element={<GymAdminSessionRoster />} />
            <Route path="/gym/admin/live/:sessionId" element={<GymLiveControl />} />
            <Route path="/gym/live/:sessionId" element={<GymLiveSession />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/nutrition/goals" element={<NutritionGoals />} />
            <Route path="/coach" element={<AiCoach />} />
            <Route path="/coach/class" element={<AiCoachClass />} />
            <Route path="/coach/lesson" element={<OneOffCoachLesson />} />
            <Route path="/coach/mitt" element={<VisualMitt />} />
            <Route path="/today-training" element={<TodayTraining />} />
            <Route path="/sparring" element={<SparringAnalysis />} />
            <Route path="/sparring/record" element={<SparringRecord />} />
            <Route path="/sparring/videos" element={<SparringVideoList />} />
            <Route path="/sparring/:sessionId" element={<SparringSessionDetail />} />
            <Route path="/graph" element={<TechniqueGraph />} />
            <Route path="/situation" element={<SituationRecommend />} />
            <Route path="/stats" element={<MyStats />} />
            <Route path="/review" element={<TodayReview />} />
            <Route path="/my-style" element={<MyStyle />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AppErrorBoundary>
        </Suspense>
        <footer className="site-footer">MARTIALDEX — 무술 기술 백과사전 (참고용 데이터, 실전 적용은 지도자 감독 하에)</footer>
      </div>
    </AuthProvider>
  );
}
