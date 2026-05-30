import { supabase } from '@/integrations/supabase/client';
import { useDemoModeStore } from '@/store/demoModeStore';
import type { Recommendation } from '@/data/recommendations';

export interface SavedRecommendationRow {
  id: string;
  user_id: string;
  rec_id: number;
  rec_type: Recommendation['type'] | string;
  title: string;
  location: string | null;
  city: string | null;
  external_link: string | null;
  image_url: string | null;
  data: unknown;
  created_at: string;
  updated_at: string;
}

const mapRecommendationToRow = (
  rec: Recommendation,
  userId: string,
): Omit<SavedRecommendationRow, 'id' | 'created_at' | 'updated_at'> => ({
  user_id: userId,
  rec_id: rec.id,
  rec_type: rec.type,
  title: rec.title,
  location: rec.location,
  city: rec.city,
  external_link: rec.externalLink,
  image_url: rec.images?.[0] || null,
  data: rec,
});

/**
 * App-preview / demo mode has a stable demo user id but no real Supabase session,
 * so writes to `saved_recommendations` fail RLS. To keep the save/bookmark flow
 * working in demos (and to persist across reload within the session), we transparently
 * fall back to a per-user localStorage store. Real authenticated users always use Supabase.
 */
const isDemo = () => useDemoModeStore.getState().isDemoMode;
const demoKey = (userId: string) => `chravel_saved_recs_demo_${userId}`;

const demoStore = {
  read(userId: string): SavedRecommendationRow[] {
    try {
      const raw = localStorage.getItem(demoKey(userId));
      return raw ? (JSON.parse(raw) as SavedRecommendationRow[]) : [];
    } catch {
      return [];
    }
  },
  write(userId: string, rows: SavedRecommendationRow[]): void {
    try {
      localStorage.setItem(demoKey(userId), JSON.stringify(rows));
    } catch {
      // Non-critical: demo persistence is best-effort.
    }
  },
};

export const savedRecommendationsService = {
  async list(userId: string): Promise<SavedRecommendationRow[]> {
    if (isDemo()) {
      return demoStore.read(userId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    const { data, error } = await supabase
      .from('saved_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async isSaved(userId: string, recId: number): Promise<boolean> {
    if (isDemo()) {
      return demoStore.read(userId).some(r => r.rec_id === recId);
    }
    const { data, error } = await supabase
      .from('saved_recommendations')
      .select('id')
      .eq('user_id', userId)
      .eq('rec_id', recId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  async save(userId: string, rec: Recommendation): Promise<SavedRecommendationRow | null> {
    const payload = mapRecommendationToRow(rec, userId);
    if (isDemo()) {
      const rows = demoStore.read(userId);
      if (rows.some(r => r.rec_id === rec.id)) return null;
      const now = new Date().toISOString();
      const row: SavedRecommendationRow = {
        ...payload,
        id: `demo-${rec.id}`,
        created_at: now,
        updated_at: now,
      };
      demoStore.write(userId, [row, ...rows]);
      return row;
    }
    const { data, error } = await supabase
      .from('saved_recommendations')
      .insert(payload as never)
      .select('*')
      .maybeSingle();
    if (error && error.code !== '23505') {
      // unique violation => already saved
      throw error;
    }
    return data || null;
  },

  async remove(userId: string, recId: number): Promise<void> {
    if (isDemo()) {
      demoStore.write(
        userId,
        demoStore.read(userId).filter(r => r.rec_id !== recId),
      );
      return;
    }
    const { error } = await supabase
      .from('saved_recommendations')
      .delete()
      .eq('user_id', userId)
      .eq('rec_id', recId);
    if (error) throw error;
  },

  async toggle(userId: string, rec: Recommendation): Promise<'saved' | 'removed'> {
    const exists = await this.isSaved(userId, rec.id);
    if (exists) {
      await this.remove(userId, rec.id);
      return 'removed';
    }
    await this.save(userId, rec);
    return 'saved';
  },

  async addToTrip(
    userId: string,
    saved: SavedRecommendationRow,
    tripId: string | number,
  ): Promise<void> {
    const { error } = await supabase.from('trip_links').insert({
      added_by: userId,
      trip_id: String(tripId),
      title: saved.title,
      url: saved.external_link || ((saved.data as { externalLink?: string })?.externalLink ?? ''),
      description: saved.location || saved.city || null,
      category: typeof saved.rec_type === 'string' ? saved.rec_type : 'recommendation',
    });
    if (error) throw error;
  },
};
