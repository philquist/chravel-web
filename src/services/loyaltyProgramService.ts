import { AirlineProgram, HotelProgram, RentalCarProgram } from '../types/pro';
import { supabase } from '../integrations/supabase/client';

export type LoyaltyProgramType = 'airline' | 'hotel' | 'rental';

export interface LoyaltyProgram {
  id: string;
  user_id: string;
  program_type: LoyaltyProgramType;
  company_name: string;
  program_name: string;
  membership_number: string;
  tier?: string;
  is_preferred: boolean;
  created_at?: string;
  updated_at?: string;
}

export const loyaltyProgramService = {
  async getUserPrograms(userId: string): Promise<LoyaltyProgram[]> {
    const { data, error } = await supabase
      .from('user_loyalty_programs')
      .select(
        'id, user_id, program_type, company_name, program_name, membership_number, tier, is_preferred, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []) as LoyaltyProgram[];
  },

  async getProgramsByType(userId: string, type: LoyaltyProgramType): Promise<LoyaltyProgram[]> {
    const programs = await this.getUserPrograms(userId);
    return programs.filter(p => p.program_type === type);
  },

  async saveProgram(
    userId: string,
    program: Omit<LoyaltyProgram, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<LoyaltyProgram | null> {
    const { data, error } = await supabase
      .from('user_loyalty_programs')
      .insert({ ...program, user_id: userId })
      .select(
        'id, user_id, program_type, company_name, program_name, membership_number, tier, is_preferred, created_at, updated_at',
      )
      .single();

    if (error) throw error;

    return data as LoyaltyProgram;
  },

  async updateProgram(programId: string, updates: Partial<LoyaltyProgram>): Promise<boolean> {
    const { error } = await supabase
      .from('user_loyalty_programs')
      .update({
        company_name: updates.company_name,
        program_name: updates.program_name,
        membership_number: updates.membership_number,
        tier: updates.tier,
        is_preferred: updates.is_preferred,
      })
      .eq('id', programId);

    if (error) throw error;
    return true;
  },

  async deleteProgram(programId: string): Promise<boolean> {
    const { error } = await ((supabase as any).from)('user_loyalty_programs').delete().eq('id', programId);
    if (error) throw error;
    return true;
  },

  // Helper functions to convert to legacy types
  toAirlineProgram(program: LoyaltyProgram): AirlineProgram {
    return {
      id: program.id,
      airline: program.company_name,
      programName: program.program_name,
      membershipNumber: program.membership_number,
      tier: program.tier,
      isPreferred: program.is_preferred,
    };
  },

  toHotelProgram(program: LoyaltyProgram): HotelProgram {
    return {
      id: program.id,
      hotelChain: program.company_name,
      programName: program.program_name,
      membershipNumber: program.membership_number,
      tier: program.tier,
      isPreferred: program.is_preferred,
    };
  },

  toRentalCarProgram(program: LoyaltyProgram): RentalCarProgram {
    return {
      id: program.id,
      company: program.company_name,
      programName: program.program_name,
      membershipNumber: program.membership_number,
      tier: program.tier,
      isPreferred: program.is_preferred,
    };
  },
};
