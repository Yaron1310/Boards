
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { UserQuestionnaireResult, ChatPersona, Conversation } from '../../types';
import { FiMessageSquare, FiLoader, FiChevronRight, FiFileText, FiBookOpen, FiArchive, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import SubscriptionRequiredBanner from '../common/SubscriptionRequiredBanner';
import QuestionnaireIcon from '../common/QuestionnaireIcon';
import ConfirmationModal from '../admin/shared/ConfirmationModal';
import ArchiveRestoreModal from '../admin/shared/ArchiveRestoreModal';
import * as apiService from '../../services/geminiService';

const getHeadersForPersona = (persona: ChatPersona | null): { key: string; label: string }[] => {
    if (!persona) return [];
    const headersMap = new Map<string, string>();

    (persona.extractionSettings || []).forEach(setting => {
        if (setting.enabled && setting.label.trim() && !headersMap.has(setting.key)) {
            headersMap.set(setting.key, setting.label);
        }
    });
    (persona.aiInsightSettings || []).forEach(setting => {
        if (setting.enabled && setting.label.trim() && !headersMap.has(setting.key)) {
            headersMap.set(setting.key, setting.label);
        }
    });

    return Array.from(headersMap.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
};

const getFallbackHeaders = (conversations: Conversation[]): { key: string; label: string }[] => {
    const allKeys = new Set<string>();
    conversations.forEach(conv => {
        if (conv.extractedFactors) {
            Object.keys(conv.extractedFactors).forEach(key => allKeys.add(key));
        }
    });
    return Array.from(allKeys)
        .map(key => ({ key, label: key }))
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
};

type ArchiveItem = { id: string; name: string; updatedAt?: Date };

type ArchiveTarget =
  | { type: 'personalInsight'; id: string; label: string }
  | { type: 'conversationInsight'; id: string; label: string }
  | { type: 'questionnaireResult'; id: string; label: string };

const VIEW_ARCHIVED_BTN_CLASS = 'bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed';

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, isOrgSubscriptionActive } = useAuth();
  const {
    myQuestionnaireResults,
    myProgress,
    courses,
    academySettings,
    conversations: allConversationsFromCtx,
    personalInsights,
    accessiblePersonas: personas,
    publishedQuestionnaires,
    isLoading: dataCtxLoading,
    archivePersonalInsight,
    archiveConversationInsight,
    archiveQuestionnaireResult,
    restorePersonalInsight,
    restoreConversationInsight,
    restoreQuestionnaireResult,
  } = useData();
  const navigate = useNavigate();

  // Archive confirm modal
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // View Archived modal open state
  const [isInsightsArchiveOpen, setIsInsightsArchiveOpen] = useState(false);
  const [isConvArchiveOpen, setIsConvArchiveOpen] = useState(false);
  const [isResultsArchiveOpen, setIsResultsArchiveOpen] = useState(false);

  // Collapsible card open state
  const [openInsightIds, setOpenInsightIds] = useState<Set<string>>(new Set());
  const [openConvIds, setOpenConvIds] = useState<Set<string>>(new Set());

  const toggleInsight = (id: string) => {
    setOpenInsightIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleConv = (id: string) => {
    setOpenConvIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Archived items state (for sections requiring backend fetch)
  const [archivedInsightItems, setArchivedInsightItems] = useState<ArchiveItem[]>([]);
  const [archivedResultItems, setArchivedResultItems] = useState<ArchiveItem[]>([]);

  if (!user && !authLoading) {
      navigate('/login');
  }

  const isLoading = authLoading || dataCtxLoading;
  const appName = academySettings?.appName || 'Gymind';

  const completedCoursesCount = myProgress.filter(p => p.status === 'completed').length;
  const totalCourses = courses.length;
  const conversationsCount = allConversationsFromCtx.filter(conv => conv.userId === user?.id).length;

  const completedQuestionnairesCount = myQuestionnaireResults.length;
  const totalQuestionnaires = publishedQuestionnaires.length;

  const hasQuestionnaireInsights = myQuestionnaireResults.some(r => r.topCategories && r.topCategories.length > 0);
  const categoriesIdentified = myQuestionnaireResults.reduce((sum, result) => sum + (result.topCategories?.length || 0), 0);

  const columnColorPalettes = useMemo(() => [
    { header: 'bg-blue-100 text-blue-800', cell: 'bg-blue-50' },
    { header: 'bg-green-100 text-green-800', cell: 'bg-green-50' },
    { header: 'bg-purple-100 text-purple-800', cell: 'bg-purple-50' },
    { header: 'bg-yellow-100 text-yellow-800', cell: 'bg-yellow-50' },
    { header: 'bg-pink-100 text-pink-800', cell: 'bg-pink-50' },
    { header: 'bg-indigo-100 text-indigo-800', cell: 'bg-indigo-50' },
  ], []);

  const recentConversationsByPersona = useMemo(() => {
    if (!user || personas.length === 0) return {};

    const accessiblePersonaIds = new Set(personas.map(p => p.id));

    const userConversationsWithInsights = allConversationsFromCtx
        .filter(conv =>
            conv.userId === user.id &&
            conv.extractedFactors &&
            Object.keys(conv.extractedFactors).length > 0 &&
            accessiblePersonaIds.has(conv.personaId) &&
            !conv.isInsightArchivedByUser
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const conversationsByPersonaId = userConversationsWithInsights.reduce((acc, conv) => {
        if (!acc[conv.personaId]) {
            acc[conv.personaId] = [];
        }
        acc[conv.personaId].push(conv);
        return acc;
    }, {} as Record<string, Conversation[]>);

    for (const personaId in conversationsByPersonaId) {
        conversationsByPersonaId[personaId].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    const sortedPersonaIds = Object.keys(conversationsByPersonaId).sort((a, b) => {
        const lastConvA = conversationsByPersonaId[a][conversationsByPersonaId[a].length - 1];
        const lastConvB = conversationsByPersonaId[b][conversationsByPersonaId[b].length - 1];
        return new Date(lastConvB.date).getTime() - new Date(lastConvA.date).getTime();
    });

    const finalResult: Record<string, Conversation[]> = {};
    for (const personaId of sortedPersonaIds) {
        finalResult[personaId] = conversationsByPersonaId[personaId];
    }

    return finalResult;
  }, [allConversationsFromCtx, user, personas]);

  // Archived conversation insight items computed from existing state (no extra API call)
  const archivedConvItems = useMemo<ArchiveItem[]>(() =>
    allConversationsFromCtx
      .filter(conv =>
        conv.userId === user?.id &&
        conv.isInsightArchivedByUser === true &&
        conv.extractedFactors && Object.keys(conv.extractedFactors).length > 0
      )
      .map(conv => ({
        id: conv.id,
        name: `${personas.find(p => p.id === conv.personaId)?.name || conv.personaName} — ${new Date(conv.date).toLocaleDateString()}`,
        updatedAt: new Date(conv.date),
      })),
  [allConversationsFromCtx, user, personas]);

  // Flat list of conversation insight cards (one per conversation, sorted newest first)
  const allConvInsightCards = useMemo(() => {
    const result: Array<{ conv: Conversation; personaName: string; headers: { key: string; label: string }[] }> = [];
    for (const [personaId, convs] of Object.entries(recentConversationsByPersona)) {
      const persona = personas.find(p => p.id === personaId);
      const personaName = persona?.name || convs[0]?.personaName || 'Unknown Chat';
      const headers = persona ? getHeadersForPersona(persona) : getFallbackHeaders(convs);
      if (headers.length === 0) continue;
      convs.forEach(conv => result.push({ conv, personaName, headers }));
    }
    result.sort((a, b) => new Date(b.conv.date).getTime() - new Date(a.conv.date).getTime());
    return result;
  }, [recentConversationsByPersona, personas]);

  // Fetch archived items from backend on mount
  const fetchArchivedInsightItems = useCallback(async () => {
    try {
      const items = await apiService.getArchivedPersonalInsights();
      setArchivedInsightItems(items.map(i => ({
        id: i.id,
        name: i.label,
        updatedAt: new Date(i.updatedAt),
      })));
    } catch (_e) { /* silent */ }
  }, []);

  const fetchArchivedResultItems = useCallback(async () => {
    try {
      const items = await apiService.getMyArchivedResults();
      setArchivedResultItems(items.map(r => ({
        id: r.id,
        name: r.questionnaireName,
        updatedAt: new Date(r.completedAt),
      })));
    } catch (_e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (user) {
      fetchArchivedInsightItems();
      fetchArchivedResultItems();
    }
  }, [user, fetchArchivedInsightItems, fetchArchivedResultItems]);

  // Archive confirm handler
  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      if (archiveTarget.type === 'personalInsight') {
        await archivePersonalInsight(archiveTarget.id);
        setArchivedInsightItems(prev => [...prev, { id: archiveTarget.id, name: archiveTarget.label, updatedAt: new Date() }]);
      } else if (archiveTarget.type === 'conversationInsight') {
        await archiveConversationInsight(archiveTarget.id);
        // archivedConvItems is computed reactively from allConversationsFromCtx
      } else if (archiveTarget.type === 'questionnaireResult') {
        await archiveQuestionnaireResult(archiveTarget.id);
        setArchivedResultItems(prev => [...prev, { id: archiveTarget.id, name: archiveTarget.label, updatedAt: new Date() }]);
      }
    } finally {
      setIsArchiving(false);
      setArchiveTarget(null);
    }
  };

  // Restore handlers for ArchiveRestoreModal
  const handleRestoreInsight = useCallback(async (id: string): Promise<boolean> => {
    const success = await restorePersonalInsight(id);
    if (success) {
      setArchivedInsightItems(prev => prev.filter(i => i.id !== id));
    }
    return success;
  }, [restorePersonalInsight]);

  const handleRestoreConvInsight = useCallback(async (id: string): Promise<boolean> => {
    return await restoreConversationInsight(id);
  }, [restoreConversationInsight]);

  const handleRestoreResult = useCallback(async (id: string): Promise<boolean> => {
    const success = await restoreQuestionnaireResult(id);
    if (success) {
      setArchivedResultItems(prev => prev.filter(i => i.id !== id));
    }
    return success;
  }, [restoreQuestionnaireResult]);

  const noopFetch = useCallback(() => {}, []);

  if (isLoading && myQuestionnaireResults.length === 0) {
    return (
      <div className="p-6 text-center text-gray-600 flex justify-center items-center h-full">
        <FiLoader className="animate-spin h-8 w-8 text-blue-500"/>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
                {t('profile.welcomeTo')}{' '}
                <span><bdi>{appName}</bdi>{', '}<span className="text-blue-600"><bdi>{user?.name}</bdi>{'!'}</span></span>
              </h1>
          </div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-8 pb-8 pt-6">
        <div className="max-w-5xl mx-auto">
          {!isOrgSubscriptionActive && <SubscriptionRequiredBanner />}

          {/* Your Progress at a Glance */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">{t('profile.progressAtAGlance')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link to="/courses" className="block bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500 hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase">{t('profile.coursesCompleted')}</p>
                            <p className="text-3xl font-bold text-gray-800">{completedCoursesCount} / {totalCourses}</p>
                        </div>
                        <div className="p-3 rounded-full bg-blue-100 text-blue-600 text-2xl flex items-center justify-center">
                            <FiBookOpen />
                        </div>
                    </div>
                </Link>

                <Link to="/chat" className="block bg-white p-6 rounded-xl shadow-lg border-l-4 border-purple-500 hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase">{t('profile.aiMentorConversations')}</p>
                            <p className="text-3xl font-bold text-gray-800">{conversationsCount}</p>
                        </div>
                        <div className="p-3 rounded-full bg-purple-100 text-purple-600 text-2xl flex items-center justify-center">
                            <FiMessageSquare />
                        </div>
                    </div>
                </Link>

                <Link to="/questionnaires" className="block bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500 hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase">{t('questionnaire.title')}</p>
                            <p className="text-3xl font-bold text-gray-800">{completedQuestionnairesCount} / {totalQuestionnaires}</p>
                        </div>
                        <div className="p-3 rounded-full bg-green-100 text-green-600 text-2xl flex items-center justify-center">
                            <QuestionnaireIcon />
                        </div>
                    </div>
                </Link>
            </div>
          </section>

          {/* Insights from Lessons Chat */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center">
                <FiBookOpen className="mr-2 text-blue-600" /> {t('profile.insightsFromLessons')}
              </h2>
              <button
                onClick={() => setIsInsightsArchiveOpen(true)}
                disabled={archivedInsightItems.length === 0}
                className={VIEW_ARCHIVED_BTN_CLASS}
                aria-label={t('profile.viewArchivedInsights')}
              >
                <FiArchive className="mr-2" /> {t('common.viewArchived')}
              </button>
            </div>
            {personalInsights.length > 0 ? (
                <div className="space-y-2">
                    {personalInsights.map(insight => {
                        const isOpen = openInsightIds.has(insight.id);
                        return (
                            <div key={insight.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                                <div
                                    className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                                    onClick={() => toggleInsight(insight.id)}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isOpen}
                                    aria-label={isOpen ? `Collapse insight: ${insight.label}` : `Expand insight: ${insight.label}`}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInsight(insight.id); } }}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-medium text-gray-800">{insight.label}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-gray-500 text-sm whitespace-nowrap">{new Date(insight.updatedAt).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center flex-shrink-0 ml-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setArchiveTarget({ type: 'personalInsight', id: insight.id, label: insight.label }); }}
                                            className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded"
                                            aria-label={`Archive insight: ${insight.label}`}
                                            title="Archive insight"
                                        >
                                            <FiArchive className="h-4 w-4" />
                                        </button>
                                        <div className="w-4" />
                                        <span className="text-gray-500 p-1" aria-hidden="true">
                                            {isOpen ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
                                        </span>
                                    </div>
                                </div>
                                {isOpen && (
                                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-gray-600 whitespace-pre-wrap text-sm">
                                        {String(insight.value)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="p-6 bg-white border border-gray-200 rounded-lg text-center">
                    <p className="text-gray-500">{t('profile.noLessonInsights')}</p>
                </div>
            )}
          </section>

          {/* AI Mentor Insights */}
          <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-700 flex items-center">
                  <FiMessageSquare className="mr-2 text-purple-600" /> {t('profile.aiMentorInsights')}
                </h2>
                <button
                  onClick={() => setIsConvArchiveOpen(true)}
                  disabled={archivedConvItems.length === 0}
                  className={VIEW_ARCHIVED_BTN_CLASS}
                  aria-label={t('profile.viewArchivedAIMentorInsights')}
                >
                  <FiArchive className="mr-2" /> {t('common.viewArchived')}
                </button>
              </div>
              {isLoading ? (
                  <div className="text-center p-4"><FiLoader className="animate-spin h-6 w-6 text-blue-500 mx-auto"/></div>
              ) : allConvInsightCards.length === 0 ? (
                  <div className="p-6 bg-white border border-gray-200 rounded-lg text-center">
                      <p className="text-gray-600">{t('profile.noInsightsFound')}</p>
                      <p className="text-sm text-gray-500 mt-1">{t('profile.insightsWillAppear')}</p>
                      <Link to="/chat" className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-colors">
                          {t('chat.startConversation')} <FiChevronRight className="ml-2 rtl-flip"/>
                      </Link>
                  </div>
              ) : (
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                      {allConvInsightCards.map(({ conv, personaName, headers }) => {
                          const isOpen = openConvIds.has(conv.id);
                          return (
                              <div key={conv.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                                  <div
                                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                                      onClick={() => toggleConv(conv.id)}
                                      role="button"
                                      tabIndex={0}
                                      aria-expanded={isOpen}
                                      aria-label={isOpen ? `Collapse insight for ${personaName}` : `Expand insight for ${personaName}`}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleConv(conv.id); } }}
                                  >
                                      <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-medium text-gray-800">{personaName}</span>
                                          <span className="text-gray-300">|</span>
                                          <span className="text-gray-500 text-sm whitespace-nowrap">{new Date(conv.date).toLocaleDateString()}</span>
                                      </div>
                                      <div className="flex items-center flex-shrink-0 ml-3">
                                          <button
                                              onClick={(e) => { e.stopPropagation(); setArchiveTarget({ type: 'conversationInsight', id: conv.id, label: new Date(conv.date).toLocaleDateString() }); }}
                                              className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded"
                                              aria-label={`Archive conversation insight from ${new Date(conv.date).toLocaleDateString()}`}
                                              title="Archive insight"
                                          >
                                              <FiArchive className="h-4 w-4" />
                                          </button>
                                          <div className="w-4" />
                                          <span className="text-gray-500 p-1" aria-hidden="true">
                                              {isOpen ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
                                          </span>
                                      </div>
                                  </div>
                                  {isOpen && (
                                      <div className="border-t border-gray-100">
                                          <table className="min-w-full text-sm">
                                              <tbody className="divide-y divide-gray-100">
                                                  {headers.map((h, index) => {
                                                      const colorClasses = columnColorPalettes[index % columnColorPalettes.length];
                                                      return (
                                                          <tr key={h.key}>
                                                              <td className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider w-20 md:w-40 whitespace-normal md:whitespace-nowrap break-words align-top md:align-middle ${colorClasses.header}`}>{h.label}</td>
                                                              <td className={`px-4 py-2 text-gray-700 align-top md:align-middle ${colorClasses.cell}`}>
                                                                  {conv.extractedFactors?.[h.key] || <span className="text-gray-400">N/A</span>}
                                                              </td>
                                                          </tr>
                                                      );
                                                  })}
                                              </tbody>
                                          </table>
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                  </div>
              )}
          </section>

          {/* Your Top Questionnaires Categories */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center">
                <QuestionnaireIcon className="mr-2 text-green-600" /> {t('profile.topQuestionnaireCategories')}
              </h2>
              <button
                onClick={() => setIsResultsArchiveOpen(true)}
                disabled={archivedResultItems.length === 0}
                className={VIEW_ARCHIVED_BTN_CLASS}
                aria-label={t('profile.viewArchivedInsights')}
              >
                <FiArchive className="mr-2" /> {t('common.viewArchived')}
              </button>
            </div>
            {user?.organizationHasMindPatternsAccess !== false && (
                <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-md">
                {isLoading ? (
                    <FiLoader className="animate-spin h-6 w-6 text-indigo-500"/>
                ) : hasQuestionnaireInsights ? (
                    <div className="space-y-4">
                      {myQuestionnaireResults.map((result) => (
                        (result.topCategories && result.topCategories.length > 0) && (
                            <div key={result.id} className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-700">{result.questionnaireName}</h4>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {result.topCategories.map(cat => (
                                      <span key={cat.categoryId} className="px-3 py-1 bg-indigo-500 text-white rounded-full text-sm font-medium shadow">
                                      {cat.name}
                                      </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                  onClick={() => setArchiveTarget({ type: 'questionnaireResult', id: result.id, label: result.questionnaireName })}
                                  className="flex-shrink-0 text-indigo-300 hover:text-red-600 transition-colors p-1 rounded mt-1"
                                  aria-label={`Archive questionnaire result: ${result.questionnaireName}`}
                                  title="Archive result"
                              >
                                  <FiArchive className="h-4 w-4" />
                              </button>
                            </div>
                        )
                      ))}
                    </div>
                ) : (
                    <div>
                    <p className="text-gray-600 mb-4">{t('profile.noQuestionnaireCategories')}</p>
                    <button
                        onClick={() => navigate('/questionnaires')}
                        className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow hover:bg-indigo-700 transition-colors"
                    >
                        {t('questionnaire.viewQuestionnaires')} <FiChevronRight className="ml-2 rtl-flip"/>
                    </button>
                    </div>
                )}
                </div>
            )}
          </section>

        </div>
      </div>

      {/* Archive Confirm Modal */}
      <ConfirmationModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchiveConfirm}
        isLoading={isArchiving}
        title={t('profile.archiveInsight')}
        message={<>{t('profile.confirmArchiveInsight', { label: archiveTarget?.label })}</>}
        confirmText={t('profile.confirmArchive')}
      />

      {/* View Archived Modals */}
      <ArchiveRestoreModal
        isOpen={isInsightsArchiveOpen}
        onClose={() => setIsInsightsArchiveOpen(false)}
        title={t('profile.archivedInsightsFromLessons')}
        items={archivedInsightItems}
        onRestore={handleRestoreInsight}
        fetchItems={fetchArchivedInsightItems}
      />

      <ArchiveRestoreModal
        isOpen={isConvArchiveOpen}
        onClose={() => setIsConvArchiveOpen(false)}
        title={t('profile.archivedAIMentorInsights')}
        items={archivedConvItems}
        onRestore={handleRestoreConvInsight}
        fetchItems={noopFetch}
      />

      <ArchiveRestoreModal
        isOpen={isResultsArchiveOpen}
        onClose={() => setIsResultsArchiveOpen(false)}
        title={t('profile.archivedPersonalInsights')}
        items={archivedResultItems}
        onRestore={handleRestoreResult}
        fetchItems={fetchArchivedResultItems}
      />
    </div>
  );
};

export default DashboardPage;
