
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { ChatPersona, Conversation } from '../../types';
import { FiLoader, FiMessageSquare, FiChevronsRight, FiLock, FiEye, FiXCircle } from 'react-icons/fi';
import { useData } from '../../hooks/useData';
import ConversationModal from '../profile/ConversationModal';
import SubscriptionRequiredBanner from '../common/SubscriptionRequiredBanner';
import { useConversationsInfiniteQuery } from '../../hooks/queries/useChatQueries';
import { List } from 'react-window';
import { InfiniteLoader } from 'react-window-infinite-loader';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { useTranslation } from 'react-i18next';


const HistoryModal: React.FC<{
    persona: ChatPersona;
    allHeaders: { key: string; label: string }[];
    onClose: () => void;
    onViewConversation: (conv: Conversation) => void;
    highlightedConvId: string | null;
}> = ({ persona, allHeaders, onClose, onViewConversation, highlightedConvId }) => {
    const { t } = useTranslation();
    const {
        data: infiniteData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = useConversationsInfiniteQuery({
        personaId: persona.id,
        limit: 50
    });

    const conversations = useMemo(() => {
        return infiniteData?.pages.flatMap(page => page.data) ?? [];
    }, [infiniteData]);

    const columnColorPalettes = useMemo(() => [
        { header: 'bg-blue-100 text-blue-800', cell: 'bg-blue-50' },
        { header: 'bg-green-100 text-green-800', cell: 'bg-green-50' },
        { header: 'bg-purple-100 text-purple-800', cell: 'bg-purple-50' },
        { header: 'bg-yellow-100 text-yellow-800', cell: 'bg-yellow-50' },
        { header: 'bg-pink-100 text-pink-800', cell: 'bg-pink-50' },
        { header: 'bg-indigo-100 text-indigo-800', cell: 'bg-indigo-50' },
    ], []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const isItemLoaded = (index: number) => !hasNextPage || index < conversations.length;
    const loadMoreItems = isFetchingNextPage ? () => Promise.resolve() : () => fetchNextPage();

    const ConversationRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
        if (!isItemLoaded(index)) {
            return (
                <div style={style} className="flex items-center justify-center border-b border-gray-200 py-4 bg-white">
                    <FiLoader className="animate-spin text-blue-500" size={24} />
                </div>
            );
        }

        const conv = conversations[index];
        if (!conv) return null;

        const isTranscriptAvailable = (conv.messageCount ?? 0) > 0;
        const isHighlighted = conv.id === highlightedConvId;

        return (
            <div 
                style={style} 
                className={`flex transition-colors border-b border-gray-200 bg-white ${isHighlighted ? 'animate-fade-in-out' : ''}`}
            >
                <div className="flex-[0.5] px-4 py-3 text-sm text-gray-700 truncate min-w-[100px] flex items-center">
                    {new Date(conv.date).toLocaleDateString()}
                </div>
                {allHeaders.map((setting, idx) => {
                    const colorClasses = columnColorPalettes[idx % columnColorPalettes.length];
                    return (
                        <div key={setting.key} className={`flex-1 px-4 py-3 text-sm text-gray-700 align-top overflow-hidden flex items-center ${colorClasses.cell}`}>
                            <div className="line-clamp-2" title={conv.extractedFactors?.[setting.key] || 'N/A'}>
                                {conv.extractedFactors?.[setting.key] || 'N/A'}
                            </div>
                        </div>
                    )
                })}
                <div className="flex-[0.5] px-4 py-3 text-sm font-medium flex items-center justify-center min-w-[80px]">
                    <button
                        onClick={() => isTranscriptAvailable && onViewConversation(conv)}
                        disabled={!isTranscriptAvailable}
                        className={`p-1 rounded transition-colors ${
                            isTranscriptAvailable
                            ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-100'
                            : 'text-gray-400 cursor-not-allowed'
                        }`}
                        title={isTranscriptAvailable ? t('chat.viewConversation') : t('chat.transcriptNotAvailable')}
                        aria-label={isTranscriptAvailable ? t('chat.viewConversation') : t('chat.transcriptNotAvailable')}
                        >
                        <FiEye size={18} />
                    </button>
                </div>
            </div>
        );
    };

    return ReactDOM.createPortal(
         <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                 <div className="p-4 border-b flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">{t('chat.chatInsightsFor', { name: persona.name })}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('chat.closeChatInsights')}><FiXCircle size={24}/></button>
                </div>
                
                <div className="flex-grow flex flex-col overflow-hidden p-6">
                    {isLoading && !infiniteData ? (
                        <div className="flex items-center justify-center h-full">
                            <FiLoader className="animate-spin text-blue-500" size={48} />
                        </div>
                    ) : isError ? (
                        <div className="flex items-center justify-center h-full text-red-500">
                             {t('chat.errorLoadingHistory')}
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 h-full flex flex-col justify-center">
                            <FiMessageSquare size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg">{t('chat.noConversationHistory')}</p>
                        </div>
                    ) : (
                        <div className="flex-grow flex flex-col overflow-hidden border border-gray-200 rounded-lg shadow-sm">
                            <div className="flex bg-gray-100 border-b border-gray-200 shrink-0 font-medium text-xs text-gray-500 uppercase tracking-wider">
                                <div className="flex-[0.5] px-4 py-3 text-left min-w-[100px]">{t('chat.dateColumn')}</div>
                                {allHeaders.map((setting, index) => {
                                    const colorClasses = columnColorPalettes[index % columnColorPalettes.length];
                                    return (
                                        <div key={setting.key} className={`flex-1 px-4 py-3 text-left uppercase tracking-wider ${colorClasses.header}`}>
                                            {setting.label}
                                        </div>
                                    )
                                })}
                                <div className="flex-[0.5] px-4 py-3 text-center min-w-[80px]">{t('chat.actionsColumn')}</div>
                            </div>
                            
                            <div className="flex-grow min-h-0">
                                <AutoSizer>
                                    {({ height, width }) => (
                                        <InfiniteLoader
                                            isItemLoaded={isItemLoaded}
                                            itemCount={hasNextPage ? conversations.length + 1 : conversations.length}
                                            loadMoreItems={loadMoreItems}
                                        >
                                            {({ onItemsRendered, ref }) => (
                                                <List
                                                    height={height}
                                                    itemCount={hasNextPage ? conversations.length + 1 : conversations.length}
                                                    itemSize={80}
                                                    onItemsRendered={onItemsRendered}
                                                    ref={ref}
                                                    width={width}
                                                    className="custom-scrollbar"
                                                >
                                                    {ConversationRow}
                                                </List>
                                            )}
                                        </InfiniteLoader>
                                    )}
                                </AutoSizer>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};

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


const ChatPage: React.FC = () => {
    const { t } = useTranslation();
    const { user, selectedOrganization, isOrgSubscriptionActive } = useAuth();
    const {
        conversations: allConversations,
        deleteConversationMessages,
        accessiblePersonas: personas,
        fetchAccessiblePersonas,
        isLoading: dataIsLoading,
    } = useData();
    // Show spinner only on first load before DataContext has populated personas.
    const isLoading = dataIsLoading && personas.length === 0;
    const location = useLocation();
    const navigate = useNavigate();

    // Silently refresh the accessible persona list whenever this page is visited
    // so any admin add / archive / restore changes are reflected without a full reload.
    useEffect(() => {
        fetchAccessiblePersonas();
    }, [fetchAccessiblePersonas]);

    const [historyModalPersona, setHistoryModalPersona] = useState<ChatPersona | null>(null);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [headersForModal, setHeadersForModal] = useState<{ key: string; label: string }[]>([]);
    const [highlightedConvId, setHighlightedConvId] = useState<string | null>(null);

    useEffect(() => {
        const { showInsightsForPersonaId, newConversationId } = location.state || {};
        if (showInsightsForPersonaId && personas.length > 0) {
          const personaToShow = personas.find(p => p.id === showInsightsForPersonaId);
          if (personaToShow) {
            handleOpenHistoryModal(personaToShow);
            if (newConversationId) {
              setHighlightedConvId(newConversationId);
            }
            // Clear state to prevent re-opening on refresh
            navigate('.', { replace: true, state: {} });
          }
        }
      }, [location.state, personas, navigate]);
    
    const handleOpenHistoryModal = (persona: ChatPersona) => {
        setHeadersForModal(getHeadersForPersona(persona));
        setHistoryModalPersona(persona);
    };

    const hasChatFeatureAccess = selectedOrganization?.hasChatAccess !== false;

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center py-10">
                    <FiLoader className="animate-spin h-8 w-8 text-blue-500 mx-auto"/>
                </div>
            );
        }

        if (!isOrgSubscriptionActive) {
            return <SubscriptionRequiredBanner />;
        }

        if (!hasChatFeatureAccess) {
            return (
                <div className="text-center py-10 text-gray-500 bg-white rounded-lg shadow-md p-6">
                    <FiLock size={48} className="text-gray-400 mb-4 mx-auto" />
                    <h2 className="text-xl font-semibold text-gray-700">{t('chat.chatNotAvailable')}</h2>
                    <p className="text-gray-500 mt-2">{t('chat.chatNotEnabled')}</p>
                </div>
            );
        }

        if (personas.length === 0) {
            return (
                <div className="text-center py-10 text-gray-500 bg-white rounded-lg shadow-md p-6">
                    <FiMessageSquare size={48} className="text-gray-400 mb-4 mx-auto" />
                    <h2 className="text-xl font-semibold text-gray-700">{t('chat.noMentorsConfigured')}</h2>
                    <p className="text-gray-500 mt-2">{t('chat.noMentorsDescription')}</p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {personas.map(persona => (
                    <Link
                        to={`/chat/conversation/${persona.id}`}
                        key={persona.id}
                        className="block bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden transform hover:-translate-y-1 group flex flex-col"
                    >
                        <div className="p-6 flex-grow">
                            <div className="flex items-start justify-between">
                                <h2 className="text-xl font-bold text-gray-800 ">{persona.name}</h2>
                                <FiMessageSquare className="h-8 w-8 text-blue-300 group-hover:text-blue-500 transition-colors"/>
                            </div>
                            <p className="text-gray-600 text-sm mt-2 h-16 overflow-hidden">{persona.description}</p>
                        </div>

                        <div className="bg-gray-50 px-6 py-3 flex justify-between items-end gap-2 group-hover:bg-blue-100 transition-colors">
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenHistoryModal(persona); }}
                                className="border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white font-semibold py-2 px-2 w-24 text-center md:w-auto md:px-4 md:whitespace-nowrap rounded-md text-sm z-10 transition-colors"
                                title={t('chat.viewInsightsFor', { name: persona.name })}
                            >
                                {t('chat.chatInsights')}
                            </button>
                            <div className="flex items-center text-blue-500 font-semibold text-right">
                                {t('chat.startChat')} <FiChevronsRight className="ml-1 flex-shrink-0 rtl-flip"/>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        );
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                        <FiMessageSquare className="mr-3 text-blue-500" /> {t('chat.selectMentor')}
                    </h1>
                </div>
            </div>

            {/* Main Content */}
            <div className="px-4 md:px-8 pb-8 pt-4">
                <div className="max-w-6xl mx-auto">
                    {renderContent()}
                </div>
            </div>

            {historyModalPersona && (
                <HistoryModal
                    persona={historyModalPersona}
                    conversations={allConversations.filter(c => c.personaId === historyModalPersona.id)}
                    allHeaders={headersForModal}
                    onClose={() => {
                        setHistoryModalPersona(null);
                        setHighlightedConvId(null);
                    }}
                    onViewConversation={(conv) => setSelectedConversation(conv)}
                    highlightedConvId={highlightedConvId}
                />
            )}

            {selectedConversation && (
                <ConversationModal 
                    isOpen={!!selectedConversation} 
                    onClose={() => setSelectedConversation(null)} 
                    conversation={selectedConversation}
                    allHeaders={headersForModal}
                    deleteConversationMessages={deleteConversationMessages}
                    onUpdateConversation={setSelectedConversation}
                />
            )}
        </div>
    );
};

export default ChatPage;
