/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Tests for Chat Content Parser Service
 *
 * Tests receipt OCR, itinerary parsing, link unfurling, and NLP entity extraction
 *
 * @module services/__tests__/chatContentParser.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseReceipt,
  parseItinerary,
  parseLink,
  parseMessage,
  autoParseContent,
  applySuggestion,
} from '../chatContentParser';
import type { ParsedContent } from '../chatContentParser';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'receipt-123' }, error: null }),
        }),
      }),
    }),
  },
}));

// Mock calendar service
vi.mock('../calendarService', () => ({
  calendarService: {
    createEvent: vi.fn(),
  },
}));

// Mock link service
vi.mock('../linkService', () => ({
  insertLinkIndex: vi.fn(),
}));

// Mock OG metadata service
vi.mock('../ogMetadataService', () => ({
  fetchOGMetadata: vi.fn(),
}));

// NOTE: Tests have issues with URL parsing and mock setup
// Skipped pending proper investigation
describe('chatContentParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseReceipt', () => {
    it('should parse receipt image and extract structured data', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      supabase.functions.invoke.mockResolvedValue({
        data: {
          parsed_data: {
            document_type: 'receipt',
            extracted_text: 'Total: $25.50',
            structured_data: {
              amounts: [{ value: 25.5, currency: 'USD', description: 'Total' }],
              dates: ['2024-01-15'],
              vendors: ['Coffee Shop'],
            },
            ocr_confidence: 0.95,
          },
        },
      });

      const result = await parseReceipt('https://example.com/receipt.jpg', 'trip-123');

      expect(result.type).toBe('receipt');
      expect(result.receipt).toBeDefined();
      expect(result.receipt?.structured_data.amounts).toHaveLength(1);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });

    it('should handle parsing errors gracefully', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      supabase.functions.invoke.mockRejectedValue(new Error('API error'));

      await expect(parseReceipt('https://example.com/receipt.jpg', 'trip-123')).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('parseItinerary', () => {
    it('should parse itinerary and extract calendar events', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      supabase.functions.invoke.mockResolvedValue({
        data: {
          extracted_data: {
            events: [
              {
                title: 'Flight to NYC',
                date: '2024-02-15',
                start_time: '10:00',
                location: 'JFK Airport',
                category: 'transportation',
                confidence: 0.9,
              },
            ],
            confidence_overall: 0.9,
          },
        },
      });

      const result = await parseItinerary(
        'https://example.com/itinerary.pdf',
        'application/pdf',
        '',
        'trip-123',
      );

      expect(result.type).toBe('itinerary');
      expect(result.itinerary?.events).toHaveLength(1);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.length).toBe(1);
    });
  });

  describe('parseLink', () => {
    it('should fetch OG metadata and store link', async () => {
      const { fetchOGMetadata } = await import('../ogMetadataService');
      const { insertLinkIndex } = await import('../linkService');

      fetchOGMetadata.mockResolvedValue({
        title: 'Example Page',
        description: 'Example description',
        image: 'https://example.com/image.jpg',
        siteName: 'Example',
      });

      insertLinkIndex.mockResolvedValue({ id: 'link-123' });

      const result = await parseLink('https://example.com/page', 'trip-123');

      expect(result.type).toBe('link');
      expect(result.linkPreview?.title).toBe('Example Page');
      expect(insertLinkIndex).toHaveBeenCalled();
    });

    it('should handle invalid URLs gracefully', async () => {
      const { fetchOGMetadata } = await import('../ogMetadataService');
      fetchOGMetadata.mockRejectedValue(new Error('Invalid URL'));

      await expect(parseLink('invalid-url', 'trip-123')).rejects.toThrow('Invalid URL');
    });
  });

  describe('parseMessage', () => {
    it('should extract entities from natural language message', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: {
            extracted_data: {
              events: [
                {
                  title: 'Coffee Meeting',
                  date: '2024-02-15',
                  start_time: '15:00',
                  location: "Joe's Coffee",
                  confidence: 0.85,
                },
              ],
              confidence_overall: 0.85,
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            todos: [],
          },
        });

      const result = await parseMessage("Let's meet at Joe's Coffee at 3pm", 'trip-123');

      expect(result.type).toBe('message');
      expect(result.entities?.suggested_events).toBeDefined();
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });

    it('should emit a create_todo suggestion for high-confidence todos', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: { extracted_data: { events: [], confidence_overall: 0.5 } },
        })
        .mockResolvedValueOnce({
          data: { todos: [{ title: 'Book the rental car', confidence: 0.9 }] },
        });

      const result = await parseMessage('We still need to book the rental car', 'trip-123');

      const todoSuggestion = result.suggestions?.find(s => s.action === 'create_todo');
      expect(todoSuggestion).toBeDefined();
      expect(todoSuggestion?.message).toContain('Book the rental car');
    });
  });

  describe('autoParseContent', () => {
    it('should auto-detect content type and parse accordingly', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      supabase.functions.invoke.mockResolvedValue({
        data: {
          parsed_data: {
            document_type: 'receipt',
            extracted_text: 'Total: $25.50',
            structured_data: {},
            ocr_confidence: 0.9,
          },
        },
      });

      const result = await autoParseContent(
        'https://example.com/image.jpg',
        'image',
        'image/jpeg',
        'trip-123',
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('receipt');
    });
  });

  describe('applySuggestion', () => {
    it('should create calendar event from suggestion', async () => {
      const { calendarService } = await import('../calendarService');
      calendarService.createEvent.mockResolvedValue({ event: { id: 'event-123' }, conflicts: [] });

      const suggestion: ParsedContent['suggestions'][0] = {
        action: 'create_calendar_event',
        data: {
          title: 'Test Event',
          date: '2024-02-15',
          start_time: '10:00',
        },
        message: 'Add event',
      };

      const result = await applySuggestion(suggestion, 'trip-123');

      expect(result).toBe('event-123');
      expect(calendarService.createEvent).toHaveBeenCalled();
    });

    it('should create receipt from suggestion', async () => {
      const suggestion: ParsedContent['suggestions'][0] = {
        action: 'extract_receipt',
        data: { structured_data: { total_cost: 42.5, vendors: ['Test Vendor'] } },
        message: 'Extract receipt',
      };

      const result = await applySuggestion(suggestion, 'trip-123');

      expect(result).toBe('receipt-123');
    });

    it('should return null for unimplemented actions', async () => {
      const suggestion: ParsedContent['suggestions'][0] = {
        action: 'create_todo',
        data: {},
        message: 'Create todo',
      };

      const result = await applySuggestion(suggestion, 'trip-123');

      expect(result).toBeNull();
    });
  });
});
