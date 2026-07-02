import React, { useState, useMemo } from 'react';
import { Compass, Bookmark, TrendingUp, MapPin, Search, X, Star } from 'lucide-react';
import { SavedRecommendations } from '@/components/SavedRecommendations';
import { RecommendationCard } from '@/components/RecommendationCard';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useSavedRecommendations } from '@/hooks/useSavedRecommendations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { recommendationCategoryFilters } from '@/data/recommendations/categories';

export const ChravelRecsPage = () => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchCity, setSearchCity] = useState('');
  const [appliedCityFilter, setAppliedCityFilter] = useState('');

  // Recs is an internal/admin preview on the bundled mock feed during MVP, so we
  // request mock data here (no live Supabase / RLS dependency). City filtering is
  // applied client-side below.
  const { recommendations, isLoading, error } = useRecommendations({
    type: activeFilter as import('@/data/recommendations/types').Recommendation['type'] | 'all',
    city: appliedCityFilter || undefined,
    useMockData: true,
  });

  const { toggleSave, isSaved } = useSavedRecommendations();

  // We still do client-side filtering as a fallback/enhancement
  const filteredRecommendations = useMemo(() => {
    if (!appliedCityFilter) {
      return recommendations;
    }
    const normalizedFilter = appliedCityFilter.toLowerCase().trim();
    return recommendations.filter(
      rec =>
        rec.city?.toLowerCase().includes(normalizedFilter) ||
        rec.location?.toLowerCase().includes(normalizedFilter),
    );
  }, [recommendations, appliedCityFilter]);

  // The previous implementation specifically mapped sponsoredRecs. Now we want to show all recommendations returned by the feed.
  const displayRecs = filteredRecommendations;

  const handleCitySearch = () => {
    setAppliedCityFilter(searchCity);
  };

  const clearCityFilter = () => {
    setSearchCity('');
    setAppliedCityFilter('');
  };

  const handleSaveToTrip = async (rec: import('@/data/recommendations/types').Recommendation) => {
    // The previous implementation was passing an ID in the mock, but the toggleSave takes a full rec.
    // The onSaveToTrip prop from RecommendationCard passes an ID originally, but we'll adapt it.
    // Actually, looking closely, `RecommendationCard` passes the ID back to `onSaveToTrip`. We need to pass the full `rec`.
    await toggleSave(rec);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pt-[env(safe-area-inset-top)] pb-24 md:pb-0">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
          <Compass size={32} className="text-primary shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-bold">ChravelApp Recs</h1>
          <Badge
            variant="outline"
            className="gap-1 border-gold-primary/40 bg-gold-primary/10 text-gold-primary text-xs font-medium"
          >
            <Star className="h-3 w-3" />
            Admin Preview · Mock Data
          </Badge>
        </div>
        <p className="text-muted-foreground mb-4">
          Discover amazing places, save favorites, and add them to your trips
        </p>

        {/* City/Location Search */}
        <div className="max-w-xl">
          <label className="text-sm text-muted-foreground mb-2 block">
            Search by city or location to see recommendations near your trip
          </label>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search city or location..."
                value={searchCity}
                onChange={e => setSearchCity(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    handleCitySearch();
                  }
                }}
                className="h-11 pl-10"
              />
            </div>
            <Button className="h-11" onClick={handleCitySearch} disabled={!searchCity.trim()}>
              Search
            </Button>
            {appliedCityFilter && (
              <Button variant="outline" className="h-11" onClick={clearCityFilter}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
          {appliedCityFilter && (
            <p className="text-sm text-primary mt-2">
              <MapPin className="h-4 w-4 inline mr-1" />
              Showing recommendations for: <strong>{appliedCityFilter}</strong>
            </p>
          )}
        </div>
      </div>

      {/* Content Sections */}
      <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
        {/* Featured Recommendations */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-primary" />
            <h2 className="text-xl font-semibold">Featured Places</h2>
          </div>

          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
            <ScrollArea className="w-full mb-6 md:mb-0">
              <TabsList className="inline-flex w-auto mb-6">
                <TabsTrigger value="all" className="whitespace-nowrap">
                  All
                </TabsTrigger>
                {recommendationCategoryFilters.map(filter => (
                  <TabsTrigger key={filter.id} value={filter.id} className="whitespace-nowrap">
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" className="md:hidden" />
            </ScrollArea>

            <TabsContent value={activeFilter} className="mt-0">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="h-8 w-8 animate-spin gold-gradient-spinner" />
                </div>
              ) : error ? (
                <div className="flex justify-center items-center py-12 text-destructive">
                  <p>Failed to load recommendations. Please try again.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {displayRecs.map(rec => (
                      <RecommendationCard
                        key={rec.uuid ?? rec.campaignId ?? rec.id}
                        recommendation={rec}
                        isSaved={isSaved(rec.id)}
                        onSaveToTrip={() => handleSaveToTrip(rec)}
                      />
                    ))}
                  </div>
                  {displayRecs.length === 0 && (
                    <div className="bg-muted/50 border border-border rounded-xl p-6 text-center mt-6">
                      <p className="text-muted-foreground">
                        {appliedCityFilter
                          ? `No featured places found in "${appliedCityFilter}". Try searching for a different city.`
                          : 'No featured places in this category yet.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </section>

        {/* Saved Recommendations */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bookmark size={20} className="text-primary" />
            <h2 className="text-xl font-semibold">Your Saved Places</h2>
          </div>
          <SavedRecommendations />
        </section>
      </div>
    </div>
  );
};

export default ChravelRecsPage;
