# Concierge Tool Reliability Audit (Static + Code-path), 2026-05-25

- Total tools: 74
- Write tools: 28
- Read tools: 46
- Buffered pending-action tools: 12

| Tool | Type | Flow | Executor Case | Invalidation | Evidence Status |
|---|---|---|---|---|---|
| addToCalendar | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| createTask | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| createPoll | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| getPaymentSummary | read | read | yes | n/a | Read pass |
| searchPlaces | read | read | yes | n/a | Read pass |
| getDirectionsETA | read | read | yes | n/a | Read pass |
| getTimezone | read | read | yes | n/a | Read pass |
| getPlaceDetails | read | read | yes | n/a | Read pass |
| searchImages | read | read | yes | n/a | Read pass |
| getStaticMapUrl | read | read | yes | n/a | Read pass |
| searchWeb | read | read | yes | n/a | Read pass |
| getDistanceMatrix | read | read | yes | n/a | Read pass |
| validateAddress | read | read | yes | n/a | Read pass |
| savePlace | write | direct | yes | yes | Static pass; runtime QA required |
| saveLink | write | direct | yes | yes | Static pass; runtime QA required |
| setBasecamp | write | direct | yes | yes | Static pass; runtime QA required |
| addToAgenda | write | direct | yes | yes | Static pass; runtime QA required |
| searchFlights | read | read | yes | n/a | Read pass |
| searchHotels | read | read | yes | n/a | Read pass |
| getHotelDetails | read | read | yes | n/a | Read pass |
| emitSmartImportPreview | write | direct | yes | yes | Static pass; runtime QA required |
| emitReservationDraft | write | direct | yes | yes | Static pass; runtime QA required |
| updateCalendarEvent | write | direct | yes | yes | Static pass; runtime QA required |
| deleteCalendarEvent | write | direct | yes | yes | Static pass; runtime QA required |
| emitBulkDeletePreview | write | direct | yes | yes | Static pass; runtime QA required |
| updateTask | write | direct | yes | yes | Static pass; runtime QA required |
| deleteTask | write | direct | yes | yes | Static pass; runtime QA required |
| searchTripData | read | read | yes | n/a | Read pass |
| searchTripArtifacts | read | read | yes | n/a | Read pass |
| detectCalendarConflicts | read | read | yes | n/a | Read pass |
| createBroadcast | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| createNotification | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| getWeatherForecast | read | read | yes | n/a | Read pass |
| convertCurrency | read | read | yes | n/a | Read pass |
| generateTripImage | write | direct | yes | yes | Static pass; runtime QA required |
| setTripHeaderImage | write | direct | yes | yes | Static pass; runtime QA required |
| browseWebsite | read | read | yes | n/a | Read pass |
| makeReservation | read | read | yes | n/a | Read pass |
| settleExpense | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| getDeepLink | read | read | yes | n/a | Read pass |
| explainPermission | read | read | yes | n/a | Read pass |
| verify_artifact | read | read | yes | n/a | Read pass |
| bulkDeleteCalendarEvents | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| optimizeItinerary | read | read | yes | n/a | Read pass |
| detectScheduleConflicts | read | read | yes | n/a | Read pass |
| generatePackingList | read | read | yes | n/a | Read pass |
| getVisaRequirements | read | read | yes | n/a | Read pass |
| getTravelAdvisories | read | read | yes | n/a | Read pass |
| getLocalPhrases | read | read | yes | n/a | Read pass |
| trackFlightStatus | read | read | yes | n/a | Read pass |
| searchCarRentals | read | read | yes | n/a | Read pass |
| searchPublicTransit | read | read | yes | n/a | Read pass |
| searchExperiences | read | read | yes | n/a | Read pass |
| getLocalEvents | read | read | yes | n/a | Read pass |
| findNearby | read | read | yes | n/a | Read pass |
| splitTaskAssignments | write | direct | yes | yes | Static pass; runtime QA required |
| getTripStats | read | read | yes | n/a | Read pass |
| shareItinerary | read | read | yes | n/a | Read pass |
| getEmergencyContacts | read | read | yes | n/a | Read pass |
| duplicateCalendarEvent | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| bulkMarkTasksDone | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| cloneActivity | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| addExpense | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
| moveCalendarEvent | write | direct | yes | yes | Static pass; runtime QA required |
| closePoll | write | direct | yes | yes | Static pass; runtime QA required |
| getRecentActivity | read | read | yes | n/a | Read pass |
| getTaskSummary | read | read | yes | n/a | Read pass |
| getGroupAvailability | read | read | yes | n/a | Read pass |
| getUpcomingReminders | read | read | yes | n/a | Read pass |
| searchTripChats | read | read | yes | n/a | Read pass |
| getPollResults | read | read | yes | n/a | Read pass |
| getTripLinks | read | read | yes | n/a | Read pass |
| getTripInfo | read | read | yes | n/a | Read pass |
| updateTripDetails | write | buffered/bespoke | yes | yes | Static pass; runtime QA required |
