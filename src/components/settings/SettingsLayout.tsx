/**
 * Shared layout for settings screens (Consumer, Enterprise, Events).
 * Provides responsive sidebar (desktop) / dropdown (mobile) + content area.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsMobile } from '../../hooks/use-mobile';

export interface SettingsSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

interface SettingsLayoutProps {
  title: string;
  /** Optional subtitle for desktop sidebar */
  subtitle?: string;
  sections: SettingsSection[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  children: React.ReactNode;
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  title,
  subtitle,
  sections,
  activeSection,
  onSectionChange,
  children,
}) => {
  const isMobile = useIsMobile();
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const currentSection = sections.find(s => s.id === activeSection);

  const sectionButtonClass = (isActive: boolean) =>
    isActive
      ? 'border border-gold-primary/60 bg-black/70 text-gold-primary shadow-ring-glow'
      : 'border border-transparent text-gray-300 hover:border-gold-primary/30 hover:bg-black/45 hover:text-gold-primary';

  const sectionButtonBaseClass =
    'w-full min-h-[44px] rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black';

  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full min-w-0">
        <div className="flex-shrink-0 p-3 md:p-4 border-b border-white/20">
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="w-full flex items-center justify-between p-3 bg-black/50 border border-white/15 rounded-xl text-white min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary/70"
          >
            <div className="flex items-center gap-3">
              {currentSection && <currentSection.icon size={20} />}
              <span className="text-sm">{currentSection?.label}</span>
            </div>
            <ChevronDown
              size={20}
              className={`transform transition-transform duration-200 ${showMobileMenu ? 'rotate-180' : ''}`}
            />
          </button>

          {showMobileMenu && (
            <div
              className="mt-2 bg-white/10 rounded-xl overflow-hidden animate-fade-in"
              role="tablist"
              aria-label="Settings sections"
            >
              {sections.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      onSectionChange(section.id);
                      setShowMobileMenu(false);
                    }}
                    role="tab"
                    aria-selected={isActive}
                    className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 text-left text-sm font-medium rounded-xl transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary/70 ${sectionButtonClass(
                      isActive,
                    )}`}
                  >
                    <Icon size={20} />
                    <span className="flex-1 text-sm">{section.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
          <div className="p-3 md:p-4 min-w-0 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))]">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 bg-black/30">
      <aside className="w-72 flex-shrink-0 border-r border-gold-primary/15 bg-black/60 p-4 backdrop-blur-md overflow-y-auto">
        <h2 className="text-xl font-semibold tracking-tight text-white mb-2">{title}</h2>
        {subtitle && <p className="mb-4 text-xs text-gray-400">{subtitle}</p>}
        <nav className="space-y-1.5" role="tablist" aria-label="Settings sections">
          {sections.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                role="tab"
                aria-selected={isActive}
                className={`${sectionButtonBaseClass} flex items-center gap-3 ${sectionButtonClass(isActive)}`}
              >
                <Icon size={20} />
                <span className="flex-1 text-left text-sm">{section.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        <div className="sticky top-0 z-10 border-b border-gold-primary/15 bg-black/70 px-6 py-4 backdrop-blur-md">
          <h3 className="text-lg font-semibold tracking-tight text-white">
            {currentSection?.label ?? title}
          </h3>
        </div>
        <div className="min-w-0 space-y-4 px-6 py-5 pb-20">{children}</div>
      </main>
    </div>
  );
};
