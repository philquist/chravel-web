import {
  buildNotificationContent,
  buildAllChannelContent,
  isPushContent,
  isEmailContent,
  type NotificationContentType,
  type TripContext,
} from '../notifications/contentBuilder';

const sampleTrip: TripContext = {
  tripName: 'Japan Trip',
  location: ['Tokyo', 'Kyoto', 'Osaka'],
  startDate: '2026-06-10',
  endDate: '2026-06-25',
};

describe('buildNotificationContent', () => {
  describe('push notifications', () => {
    it('builds broadcast push content', () => {
      const content = buildNotificationContent({
        type: 'broadcast_posted',
        channel: 'push',
        tripContext: sampleTrip,
        actorName: 'Tour Manager',
      });

      expect(isPushContent(content)).toBe(true);
      if (isPushContent(content)) {
        expect(content.title).toContain('Broadcast');
        expect(content.title).toContain('Japan Trip');
        expect(content.body).toContain('your Japan Trip trip');
        expect(content.body).not.toContain('Tour Manager');
        expect(content.body).toContain('Open ChravelApp');
      }
    });

    it('builds calendar bulk import push content', () => {
      const content = buildNotificationContent({
        type: 'calendar_bulk_import',
        channel: 'push',
        tripContext: {
          tripName: 'Cat Williams Tour Nationwide',
          startDate: '2026-02-18',
          endDate: '2026-09-26',
        },
        count: 22,
      });

      if (isPushContent(content)) {
        expect(content.title).toContain('22');
        expect(content.title).toContain('Calendar Events');
        expect(content.body).toContain('Smart Import');
        expect(content.body).toContain('your Cat Williams Tour Nationwide trip');
      }
    });

    it('builds poll push content with location context', () => {
      const content = buildNotificationContent({
        type: 'poll_created',
        channel: 'push',
        tripContext: sampleTrip,
        actorName: 'Alex',
      });

      if (isPushContent(content)) {
        expect(content.title).toContain('Poll');
        expect(content.title).toContain('Japan Trip');
        expect(content.body).toContain('Tokyo');
        expect(content.body).toContain('vote');
        expect(content.body).not.toContain('Alex');
      }
    });

    it('builds join request push content', () => {
      const content = buildNotificationContent({
        type: 'join_request',
        channel: 'push',
        tripContext: {
          tripName: 'Becky Robinson Tour of North America',
          startDate: '2026-02-15',
          endDate: '2026-12-31',
        },
        actorName: 'Emily',
      });

      if (isPushContent(content)) {
        expect(content.title).toContain('Join Request');
        expect(content.body).toContain('Someone requested to join');
        expect(content.body).not.toContain('Emily');
        expect(content.body).toContain('review');
      }
    });

    it('builds payment request push content', () => {
      const content = buildNotificationContent({
        type: 'payment_request',
        channel: 'push',
        tripContext: sampleTrip,
        actorName: 'Tom',
      });

      if (isPushContent(content)) {
        expect(content.title).toContain('Payment');
        expect(content.body).toContain('A new payment request was added');
        expect(content.body).not.toContain('Tom');
        expect(content.body).toContain('review');
      }
    });

    it('builds basecamp push content without address details', () => {
      const content = buildNotificationContent({
        type: 'basecamp_updated',
        channel: 'push',
        tripContext: sampleTrip,
      });

      if (isPushContent(content)) {
        expect(content.title).toContain('Basecamp Updated');
        expect(content.body).toContain('The basecamp was updated');
        expect(content.body).toContain('your Japan Trip trip');
      }
    });
  });

  describe('email notifications', () => {
    it('builds email with subject, CTA, and footer', () => {
      const content = buildNotificationContent({
        type: 'poll_created',
        channel: 'email',
        tripContext: sampleTrip,
        actorName: 'Alex',
        extra: { tripId: 'trip-123' },
      });

      expect(isEmailContent(content)).toBe(true);
      if (isEmailContent(content)) {
        expect(content.subject).toContain('Poll');
        expect(content.ctaLabel).toBe('Open in ChravelApp');
        expect(content.ctaUrl).toContain('trip-123');
        expect(content.footerText).toContain('notifications enabled');
        expect(content.footerText).toContain('Want fewer notifications like this?');
        expect(content.footerText).toContain('https://www.chravel.app');
      }
    });
  });

  describe('buildAllChannelContent', () => {
    it('returns content for push and email channels', () => {
      const result = buildAllChannelContent('task_assigned', sampleTrip, 'Alex');

      expect(result.push.title).toContain('Task');
      expect(result.email.subject).toContain('Task');
    });
  });

  describe('all notification types generate content', () => {
    const types: NotificationContentType[] = [
      'broadcast_posted',
      'calendar_event_added',
      'calendar_event_updated',
      'calendar_bulk_import',
      'payment_request',
      'payment_settled',
      'task_assigned',
      'task_completed',
      'poll_created',
      'join_request',
      'join_request_approved',
      'basecamp_updated',
      'trip_invite',
      'trip_reminder',
      'rsvp_update',
    ];

    types.forEach(type => {
      it(`generates push content for ${type}`, () => {
        const content = buildNotificationContent({
          type,
          channel: 'push',
          tripContext: sampleTrip,
          actorName: 'TestActor',
          count: 5,
        });
        if (isPushContent(content)) {
          expect(content.title.length).toBeGreaterThan(0);
          expect(content.body.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
