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

  it('reveals a card’s use-case page link when expanded', () => {
    renderSection();
    // The per-card "See how" link only appears once the card is expanded.
    fireEvent.click(screen.getByText('Travel Concierge & Advisors'));
    const link = screen.getByRole('link', { name: /see how chravelapp helps/i });
    expect(link).toHaveAttribute('href', '/use-cases/travel-concierge-client-portal');
  });
});
