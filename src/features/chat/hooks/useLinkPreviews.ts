import { useState, useEffect, useRef } from 'react';
import { fetchOGMetadata, type OGMetadata } from '@/services/ogMetadataService';

interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
}

/** Extract the first URL from message text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

function extractUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  if (!match) return null;
  let url = match[0];
  // The edge function's Zod schema only accepts HTTPS; auto-upgrade HTTP URLs
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Stable fingerprint so the effect does not re-run on every parent re-render
 * (new array identity) while still reacting to real message content changes.
 */
function fingerprintMessages(
  messages: Array<{ id: string; text: string; linkPreview?: unknown }>,
): string {
  return JSON.stringify(
    messages.map(m => ({
      id: m.id,
      text: m.text,
      lp: m.linkPreview != null ? 1 : 0,
    })),
  );
}

/**
 * Client-side link preview enrichment for messages.
 * Detects URLs in message content and fetches OG metadata via the
 * existing fetch-og-metadata edge function.
 *
 * Returns a map of messageId → LinkPreview for messages that have URLs
 * and whose previews have been fetched.
 *
 * Important: the fetch effect must NOT depend on `previews` state. Including it
 * caused a feedback loop (each preview completion re-ran the effect and walked
 * the full message list), which thrashed React reconciliation in long concierge
 * threads — especially older bubbles that often contain URLs.
 */
export function useLinkPreviews(
  messages: Array<{ id: string; text: string; linkPreview?: unknown }>,
  options?: { enabled?: boolean },
): Record<string, LinkPreview> {
  const enabled = options?.enabled ?? true;
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
  const previewsRef = useRef<Record<string, LinkPreview>>({});
  previewsRef.current = previews;
  // Tracks URLs currently being fetched or successfully fetched (prevents concurrent dupes)
  const fetchedUrlsRef = useRef<Set<string>>(new Set());
  // Tracks URLs that failed, with retry count (allows one retry)
  const failedUrlsRef = useRef<Map<string, number>>(new Map());
  // Message ids we have finished processing (success, failure cap, no URL, or server preview)
  const finishedMessageIdsRef = useRef<Set<string>>(new Set());
  const MAX_RETRIES = 1;
  const BATCH_SIZE = 3;

  const messagesFingerprint = fingerprintMessages(messages);

  useEffect(() => {
    if (!enabled) return;
    if (messages.length === 0) return;

    finishedMessageIdsRef.current = new Set();

    for (const msg of messages) {
      if (msg.linkPreview) {
        finishedMessageIdsRef.current.add(msg.id);
        continue;
      }
      const url = extractUrl(msg.text);
      if (!url) {
        finishedMessageIdsRef.current.add(msg.id);
        continue;
      }
      const cached = previewsRef.current[msg.id];
      if (cached && cached.url === url) {
        finishedMessageIdsRef.current.add(msg.id);
        if (!fetchedUrlsRef.current.has(url)) {
          fetchedUrlsRef.current.add(url);
        }
      }
    }

    let cancelled = false;

    const drainQueue = async (): Promise<void> => {
      while (!cancelled) {
        const batch: Array<{ id: string; url: string }> = [];

        for (const msg of messages) {
          if (batch.length >= BATCH_SIZE) break;

          if (msg.linkPreview) {
            finishedMessageIdsRef.current.add(msg.id);
            continue;
          }
          if (finishedMessageIdsRef.current.has(msg.id)) continue;

          const url = extractUrl(msg.text);
          if (!url) {
            finishedMessageIdsRef.current.add(msg.id);
            continue;
          }

          const failCount = failedUrlsRef.current.get(url) ?? 0;
          if (failCount > MAX_RETRIES) {
            finishedMessageIdsRef.current.add(msg.id);
            continue;
          }

          // Same dedupe as before: one in-flight/success slot per URL (first message wins).
          // Mark duplicate-URL messages finished so the drain loop cannot spin forever.
          if (fetchedUrlsRef.current.has(url)) {
            finishedMessageIdsRef.current.add(msg.id);
            continue;
          }

          batch.push({ id: msg.id, url });
          fetchedUrlsRef.current.add(url);
        }

        if (batch.length === 0) break;

        const results: Record<string, LinkPreview> = {};

        await Promise.all(
          batch.map(async ({ id, url }) => {
            const metadata: OGMetadata = await fetchOGMetadata(url);
            if (cancelled) return;
            if (!metadata.error) {
              results[id] = {
                url,
                title: metadata.title,
                description: metadata.description,
                image: metadata.image,
                domain: getDomain(url),
              };
            } else {
              fetchedUrlsRef.current.delete(url);
              failedUrlsRef.current.set(url, (failedUrlsRef.current.get(url) ?? 0) + 1);
            }
          }),
        );

        if (cancelled) return;

        for (const { id, url } of batch) {
          if (results[id]) {
            finishedMessageIdsRef.current.add(id);
          } else {
            const fc = failedUrlsRef.current.get(url) ?? 0;
            if (fc > MAX_RETRIES) {
              finishedMessageIdsRef.current.add(id);
            }
          }
        }

        if (Object.keys(results).length > 0) {
          setPreviews(prev => ({ ...prev, ...results }));
        }
      }
    };

    void drainQueue();

    return () => {
      cancelled = true;
    };
    // Intentionally omit `messages` — array identity churns every render; fingerprint captures content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, messagesFingerprint]);

  return previews;
}
