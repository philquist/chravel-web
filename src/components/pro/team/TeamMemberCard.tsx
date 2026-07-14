import React from 'react';
import { AlertTriangle, Mail, MessageCircle, Phone } from 'lucide-react';
import { ProParticipant } from '../../../types/pro';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { getInitials } from '../../../utils/avatarUtils';
import { ROLE_BADGE_CLASS } from '../../../utils/roleUtils';
import { QuickContactMenu } from '../QuickContactMenu';

export interface TeamRolePill {
  name: string;
  isAdmin?: boolean;
  isCoordinator?: boolean;
}

interface TeamMemberCardProps {
  member: ProParticipant;
  /** Pre-computed role pills (admin/coordinator first, then assigned roles). */
  rolePills: TeamRolePill[];
  /** Legacy single-role fallback shown only when rolePills is empty. */
  fallbackRole?: string | null;
}

export const TeamMemberCard = ({ member, rolePills, fallbackRole }: TeamMemberCardProps) => {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 transition-colors hover:bg-white/[0.07] hover:border-primary/25">
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 border-2 border-white/10 flex-shrink-0">
          <AvatarImage src={member.avatar} alt={member.name} />
          <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
            {getInitials(member.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-white text-sm font-medium truncate leading-tight">{member.name}</h3>
            <QuickContactMenu member={member}>
              <button
                type="button"
                aria-label={`Contact ${member.name}`}
                className="flex-shrink-0 w-8 h-8 min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-ink-3 hover:text-gold-mid hover:bg-white/10 transition-colors"
              >
                <MessageCircle size={15} />
              </button>
            </QuickContactMenu>
          </div>

          <p className="text-ink-3 text-xs truncate leading-tight mt-1 flex items-center gap-1">
            <Mail size={11} className="flex-shrink-0" />
            <span className="truncate">{member.email}</span>
          </p>
          {member.phone && (
            <p className="text-ink-3 text-xs truncate leading-tight mt-0.5 flex items-center gap-1">
              <Phone size={11} className="flex-shrink-0" />
              {member.phone}
            </p>
          )}

          {(rolePills.length > 0 || fallbackRole) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {rolePills.map((pill, index) => (
                <span
                  key={`${pill.name}-${index}`}
                  role="status"
                  aria-label={`Role: ${pill.name}${pill.isAdmin ? ' (admin)' : pill.isCoordinator ? ' (coordinator)' : ''}`}
                  className={`${
                    pill.isAdmin
                      ? 'bg-primary/20 text-gold-light border border-primary/30'
                      : pill.isCoordinator
                        ? 'bg-gold-mid/10 text-gold-light border border-gold-mid/40'
                        : ROLE_BADGE_CLASS
                  } px-1.5 py-0.5 rounded text-[11px] font-medium leading-none`}
                >
                  {pill.name}
                </span>
              ))}
              {fallbackRole && (
                <span
                  role="status"
                  aria-label={`Role: ${fallbackRole}`}
                  className={`${ROLE_BADGE_CLASS} px-1.5 py-0.5 rounded text-[11px] font-medium leading-none`}
                >
                  {fallbackRole}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {member.medicalNotes && (
        <div className="mt-2 p-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-xs font-medium">Medical Alert</span>
        </div>
      )}

      {member.dietaryRestrictions && member.dietaryRestrictions.length > 0 && (
        <p className="mt-1.5 text-ink-3 text-xs leading-tight truncate">
          Dietary: {member.dietaryRestrictions.join(', ')}
        </p>
      )}
    </div>
  );
};
