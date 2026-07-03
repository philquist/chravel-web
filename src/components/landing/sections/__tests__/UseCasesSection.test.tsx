import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UseCasesSection } from '../UseCasesSection';

const renderSection = () =>
  render(
    <MemoryRouter>
      <UseCasesSection />
    </MemoryRouter>,
  );

describe('UseCasesSection (homepage)', () => {
  it('shows the Travel Concierge card and a link to the use-cases hub', () => {
    renderSection();
    expect(screen.getByText('Travel Concierge & Advisors')).toBeInTheDocument();
    const hubLink = screen.getByRole('link', { name: /explore all use cases/i });
    expect(hubLink).toHaveAttribute('href', '/use-cases');
  });

  it('shows use-case CTA copy on a /use-cases card when expanded', () => {
    renderSection();
    // The per-card CTA link only appears once the card is expanded.
    fireEvent.click(screen.getByText('Travel Concierge & Advisors'));
    const link = screen.getByRole('link', { name: /see how chravelapp helps/i });
    expect(link).toHaveAttribute('href', '/use-cases/travel-concierge-client-portal');
    // Per-destination labeling: a /use-cases card must not show blog-oriented copy.
    expect(
      screen.queryByRole('link', { name: /see the chravelapp blog for more/i }),
    ).not.toBeInTheDocument();
  });

  it('links the Fraternities/Sororities card to the new blog post when expanded', () => {
    renderSection();
    fireEvent.click(screen.getByText('Fraternities, Sororities & Student Organizations'));
    const link = screen.getByRole('link', { name: /see the chravelapp blog for more/i });
    expect(link).toHaveAttribute('href', '/blog/fraternity-and-sorority-chapter-management-app');
  });

  it('is keyboard-accessible: cards are buttons that toggle on Enter', () => {
    renderSection();
    const card = screen.getByText('Travel Concierge & Advisors').closest('[role="button"]');
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(card!, { key: 'Enter' });
    expect(card).toHaveAttribute('aria-expanded', 'true');
  });
});
