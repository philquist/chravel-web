import React from 'react';
import { PollOption as PollOptionType } from './types';
import { Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface VoterProfile {
  displayName: string;
  avatarUrl: string | null;
}

interface PollOptionProps {
  option: PollOptionType;
  totalVotes: number;
  userVote?: string | string[];
  selectedOptions?: string[];
  onVote: (optionId: string) => void;
  disabled?: boolean;
  isMultiple?: boolean;
  isLeading?: boolean;
  /** When set, show facepile for non-anonymous polls */
  showVoters?: boolean;
  voterProfiles?: Record<string, VoterProfile>;
}

const MAX_FACEPILE = 3;

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export const PollOption = ({
  option,
  totalVotes,
  userVote,
  selectedOptions = [],
  onVote,
  disabled = false,
  isMultiple = false,
  isLeading = false,
  showVoters = false,
  voterProfiles = {},
}: PollOptionProps) => {
  const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
  const isVoted = Array.isArray(userVote) ? userVote.includes(option.id) : userVote === option.id;
  const isSelected = selectedOptions.includes(option.id);
  const interactive = !disabled || isMultiple;
  const voterIds = showVoters ? (option.voters ?? []).filter(Boolean) : [];
  const visibleVoters = voterIds.slice(0, MAX_FACEPILE);
  const overflow = Math.max(0, voterIds.length - MAX_FACEPILE);

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => onVote(option.id)}
        disabled={disabled && !isMultiple}
        className={[
          'relative w-full text-left overflow-hidden rounded-xl min-h-[48px] transition-colors',
          'border border-white/10',
          interactive
            ? 'cursor-pointer hover:border-primary/30 hover:bg-white/[0.04]'
            : 'cursor-default',
          isSelected ? 'border-primary/50 bg-primary/5' : '',
          isVoted ? 'border-primary/40 bg-primary/[0.07]' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={`Vote for "${option.text}" — ${option.votes} vote${option.votes !== 1 ? 's' : ''} (${percentage.toFixed(0)}%)${isVoted ? ', you voted for this' : ''}${isLeading ? ', currently leading' : ''}`}
        aria-pressed={isVoted || isSelected}
        role="option"
        aria-selected={isVoted || isSelected}
      >
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(percentage, 0)}%` }}
          aria-hidden="true"
        >
          <div
            className={[
              'h-full w-full',
              isVoted || isLeading
                ? 'bg-gradient-to-r from-primary/35 via-primary/20 to-transparent'
                : 'bg-white/[0.06]',
            ].join(' ')}
          />
        </div>

        <div className="relative z-[1] flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isMultiple ? (
              <div
                className={[
                  'w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center',
                  isSelected || isVoted
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40',
                ].join(' ')}
                aria-hidden="true"
              >
                {(isSelected || isVoted) && <Check size={12} strokeWidth={3} />}
              </div>
            ) : (
              <div
                className={[
                  'w-4 h-4 rounded-full border flex-shrink-0',
                  isVoted
                    ? 'border-primary bg-primary shadow-ring-glow'
                    : 'border-muted-foreground/40',
                ].join(' ')}
                aria-hidden="true"
              />
            )}
            <span
              className={`text-sm font-medium truncate ${isVoted ? 'text-gold-light' : 'text-foreground'}`}
            >
              {option.text}
            </span>
            {isLeading && totalVotes > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-gold-light border border-primary/25 flex-shrink-0">
                Leading
              </span>
            )}
            {isVoted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary flex-shrink-0">
                Yours
              </span>
            )}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            {option.votes}
            <span className="text-ink-3 ml-1">({percentage.toFixed(0)}%)</span>
          </span>
        </div>
      </button>

      {showVoters && voterIds.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <div
            className="flex items-center gap-1.5 pl-2"
            aria-label={`${voterIds.length} voter${voterIds.length !== 1 ? 's' : ''}`}
          >
            <div className="flex -space-x-2">
              {visibleVoters.map(voterId => {
                const profile = voterProfiles[voterId];
                const name = profile?.displayName || 'Traveler';
                return (
                  <Tooltip key={voterId}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="relative h-7 w-7 min-h-[28px] min-w-[28px] rounded-full border-2 border-background focus-visible:ring-2 focus-visible:ring-primary/50"
                        onClick={event => event.stopPropagation()}
                        aria-label={name}
                      >
                        <Avatar className="h-full w-full">
                          {profile?.avatarUrl ? (
                            <AvatarImage src={profile.avatarUrl} alt="" />
                          ) : null}
                          <AvatarFallback className="bg-primary/15 text-gold-light text-[9px]">
                            {initialsFromName(name)}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            {overflow > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[11px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10">
                    +{overflow}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  {voterIds
                    .slice(MAX_FACEPILE)
                    .map(id => voterProfiles[id]?.displayName || 'Traveler')
                    .join(', ')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
};
