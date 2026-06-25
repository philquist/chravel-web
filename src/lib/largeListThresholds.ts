/** Preview avatar counts for large trip/event rosters. */
export const LARGE_LIST_THRESHOLDS = {
  /** Show search once roster exceeds this count. */
  searchMinCount: 10,
  /** Virtualize member lists above this count. */
  virtualizeMinCount: 25,
  /** Cap mention picker results. */
  mentionPickerMaxResults: 25,
  /** Max chat messages retained in client state. */
  maxRetainedChatMessages: 250,
  /** Desktop avatar stack preview. */
  previewAvatarsDesktop: 10,
  /** Mobile avatar stack preview. */
  previewAvatarsMobile: 4,
  /** Payment member picker page hint threshold. */
  paymentPickerSearchMinCount: 8,
} as const;
