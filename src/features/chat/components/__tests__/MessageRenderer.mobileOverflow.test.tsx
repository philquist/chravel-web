import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MessageRenderer } from '../MessageRenderer';

describe('MessageRenderer mobile overflow containment', () => {
  it('constrains assistant markdown with long links inside the message rail', () => {
    const { container } = render(
      <MessageRenderer
        message={{
          id: 'long-link',
          type: 'assistant',
          content:
            'Use [this very long itinerary link](https://example.com/routes/tokyo-kyoto-osaka-budget-hostels-highway-buses-shinjuku-gyoen-meiji-jingu-sensoji-temple-day-by-day-plan) before booking.',
          timestamp: new Date().toISOString(),
        }}
      />,
    );

    const row = container.firstElementChild;
    expect(row?.className).toContain('overflow-x-hidden');
    expect(row?.className).toContain('min-w-0');

    const bubbleColumn = row?.children?.[1] as HTMLElement | undefined;
    expect(bubbleColumn?.className).toContain('min-w-0');
    expect(bubbleColumn?.className).toMatch(/max-w-\[min\(100%,28rem\)\]|max-w-\[78%\]/);

    const markdown = container.querySelector('.ai-markdown-content');
    expect(markdown?.className).toContain('max-w-full');
    expect(markdown?.className).toContain('overflow-hidden');
  });
});
