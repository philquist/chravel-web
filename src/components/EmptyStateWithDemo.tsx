import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { useDemoMode } from '@/hooks/useDemoMode';

interface EmptyStateWithDemoProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  showDemoPrompt?: boolean;
}

export const EmptyStateWithDemo = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  showDemoPrompt = true,
}: EmptyStateWithDemoProps) => {
  const { isDemoMode, enableDemoMode } = useDemoMode();

  return (
    <div className="text-center py-12 px-4">
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 rounded-full flex items-center justify-center">
        <Icon size={32} className="text-primary" />
      </div>

      <h3 className="text-xl font-semibold tracking-tight text-foreground mb-3">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">{description}</p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}

        {showDemoPrompt && !isDemoMode && (
          <Button onClick={enableDemoMode} variant="outline">
            Show Demo Data
          </Button>
        )}
      </div>

      {showDemoPrompt && !isDemoMode && (
        <p className="text-xs text-muted-foreground mt-4 max-w-sm mx-auto">
          Turn on Demo Mode to see sample data and explore all features
        </p>
      )}
    </div>
  );
};
