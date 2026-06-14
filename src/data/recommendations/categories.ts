export const recommendationCategoryFilters = [
  { id: 'hotel', label: 'Hotels' },
  { id: 'restaurant', label: 'Dining' },
  { id: 'activity', label: 'Activities' },
  { id: 'tour', label: 'Tours' },
  { id: 'experience', label: 'Experiences' },
  { id: 'transportation', label: 'Transportation' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'sports', label: 'Sports' },
  { id: 'landmarks', label: 'Landmarks' },
] as const;

export type RecommendationCategoryFilterId = (typeof recommendationCategoryFilters)[number]['id'];
