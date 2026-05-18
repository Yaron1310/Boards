import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import { useForceDocumentLang } from '../../hooks/useForceDocumentLang';

const LandingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  useForceDocumentLang();
  return (
    <div className="h-dvh w-full overflow-y-auto bg-gradient-to-br from-purple-50 via-white to-gray-50 text-gray-800 font-sans">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-x-12 lg:gap-x-24 gap-y-16 items-center">
          
          {/* Left Column: Content */}
          <div className="text-center animate-fade-in-up">
            <h1 className="text-5xl md:text-7xl tracking-tight leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800 }}>
              <span className="text-gray-900">The exact tool</span>
              <br />
              <span style={{ color: '#2d6fe8' }}>for the job</span><span style={{ color: '#f5c027', fontStyle: 'normal' }}>&#9632;</span>
            </h1>

            <p className="mt-6 text-lg text-gray-600">
              Logyx is a smart work management platform — build custom boards, track every task, and keep your team moving in one organized workhub.
            </p>

            <ul className="mt-6 space-y-3 inline-block text-left mx-auto">
              <li className="flex items-center text-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3">
                  <FiCheck className="w-4 h-4" />
                </span>
                Custom boards and workflows built for your team
              </li>
              <li className="flex items-center text-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3">
                  <FiCheck className="w-4 h-4" />
                </span>
                Real-time task tracking across every project
              </li>
              <li className="flex items-center text-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3">
                  <FiCheck className="w-4 h-4" />
                </span>
                Smart automations that eliminate repetitive work
              </li>
              <li className="flex items-center text-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3">
                  <FiCheck className="w-4 h-4" />
                </span>
                {t('landing.feature4')}
              </li>
            </ul>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto bg-gray-900 text-white font-semibold py-3 px-6 rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-700 transition-transform transform hover:-translate-y-0.5 shadow-lg"
              >
                Sign Up <span className="font-bold text-lg">&raquo;</span>
              </Link>
              <span className="text-gray-400 font-medium">{t('common.or')}</span>
              <Link
                to="/login"
                className="w-full sm:w-auto text-white font-semibold py-3 px-8 rounded-full transition-transform transform hover:-translate-y-0.5 shadow-lg"
                style={{ backgroundColor: '#2d6fe8' }}
              >
                {t('auth.signIn')}
              </Link>
            </div>
          </div>

          {/* Separator */}
          <div className="hidden md:block h-72 w-px bg-gray-200 self-center"></div>

          {/* Right Column: Branding */}
          <div className="flex flex-col items-center justify-center animate-fade-in">
            <img src="/logo_gym.webp" alt={t('common.appLogoAlt')} className="w-80 h-auto" />
          </div>

        </div>
      </div>
    </div>
    </div>
  );
};

export default LandingPage;
