
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiX, FiPlay } from 'react-icons/fi';

interface TutorialSectionProps {
  videoUrl?: string;
  isEmbedded?: boolean;
}

const TutorialSection: React.FC<TutorialSectionProps> = ({ videoUrl, isEmbedded }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeEmbedUrl, setActiveEmbedUrl] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const parseVideoUrl = (url: string) => {
    if (!url) return null;
    let videoId: string | null = null;
    let provider: 'youtube' | 'vimeo' | null = null;

    // YouTube
    let match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
        videoId = match[1];
        provider = 'youtube';
    }

    // Vimeo
    if (!videoId) {
        match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
        if (match && match[1]) {
            videoId = match[1];
            provider = 'vimeo';
        }
    }
    return { provider, videoId };
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isEmbedded) {
      window.open(videoUrl, '_blank');
      return;
    }

    if (!videoUrl) return;
    const videoInfo = parseVideoUrl(videoUrl);
    if (!videoInfo || !videoInfo.videoId) return;

    // Construct URL with aggressive autoplay settings
    // playsinline=0 tells iOS to use the native full-screen player immediately if possible
    const embedUrl = videoInfo.provider === 'youtube'
      ? `https://www.youtube.com/embed/${videoInfo.videoId}?autoplay=1&playsinline=0&rel=0&modestbranding=1`
      : `https://player.vimeo.com/video/${videoInfo.videoId}?autoplay=1&title=0&byline=0&portrait=0`;

    setActiveEmbedUrl(embedUrl);
    setIsOpen(true);

    // CRITICAL: Trigger native fullscreen synchronously within the click event handler.
    // This works because the element is already mounted (just hidden via CSS).
    if (containerRef.current) {
        const isMobile = window.innerWidth < 640;
        if (isMobile) {
            try {
                // Standard API
                if (containerRef.current.requestFullscreen) {
                    containerRef.current.requestFullscreen();
                } 
                // Webkit fallback (Safari/iOS)
                else if ((containerRef.current as any).webkitRequestFullscreen) {
                    (containerRef.current as any).webkitRequestFullscreen();
                }
            } catch (err) {
                console.log('Fullscreen request denied (likely browser restriction):', err);
            }
        }
    }
  };

  const handleClose = () => {
      // Exit native fullscreen if active
      if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
      }
      setIsOpen(false);
      setActiveEmbedUrl(''); // Reset src to stop audio/video
  }

  if (!videoUrl) return null;

  return (
    <>
      <button 
        onClick={handleOpen}
        className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors mt-2 mb-4 group"
      >
        <div className="bg-blue-100 px-2.5 py-1.5 rounded-lg mr-2 group-hover:bg-blue-200 transition-colors flex items-center justify-center">
            <FiPlay className="w-3 h-3 text-blue-600 fill-current" />
        </div>
        {t('common.watchTutorial')}
      </button>

      {/* 
         We always render the Portal, but control visibility with CSS. 
         This ensures the DOM node exists when the user clicks, allowing 'requestFullscreen' to work.
      */}
      {ReactDOM.createPortal(
        <div 
            ref={containerRef}
            className={`fixed inset-0 z-[100] bg-black sm:bg-opacity-90 flex items-center justify-center sm:p-4 ${isOpen ? 'flex' : 'hidden'}`}
        >
          <div className="flex flex-col w-full h-full sm:h-auto sm:max-w-4xl relative bg-black sm:bg-transparent">
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-50 sm:static sm:flex sm:justify-end sm:mb-2 sm:top-auto sm:right-auto">
               <button
                onClick={handleClose}
                className="p-2 bg-black/50 sm:bg-transparent text-white sm:text-gray-300 sm:hover:text-white rounded-full transition-colors flex items-center justify-center backdrop-blur-sm sm:backdrop-blur-none"
                aria-label={t('common.closeTutorial')}
              >
                <span className="hidden sm:inline mr-2 text-sm font-medium">{t('common.close')}</span>
                <FiX size={24} />
              </button>
            </div>
            
            {/* Video Container */}
            <div className="relative bg-black w-full h-full sm:h-auto sm:aspect-video rounded-none sm:rounded-lg shadow-2xl overflow-hidden border-none sm:border border-gray-800">
              {isOpen && (
                  <iframe 
                    src={activeEmbedUrl}
                    className="w-full h-full border-0"
                    allow="autoplay; fullscreen; picture-in-picture" 
                    allowFullScreen
                    title="Tutorial Video"
                  ></iframe>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TutorialSection;
