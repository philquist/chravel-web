import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UseCasePage from '../UseCasePage';
import UseCasesHub from '../UseCasesHub';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/use-cases" element={<UseCasesHub />} />
        <Route path="/use-cases/:slug" element={<UseCasePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('UseCasePage', () => {
  it('renders the travel concierge page from registry content', () => {
    renderAt('/use-cases/travel-concierge-client-portal');
    expect(
      screen.getByRole('heading', { level: 1, name: /client-ready trip portal/i }),
    ).toBeInTheDocument();
    // Feature-map content proves the structured body rendered, not just the header.
    expect(screen.getByText(/One shared trip workspace/i)).toBeInTheDocument();
  });

  it('shows a not-found state for unknown slugs', () => {
    renderAt('/use-cases/not-a-real-use-case');
    expect(screen.getByText(/available yet/i)).toBeInTheDocument();
  });

  it('renders a newly published page (weddings)', () => {
    renderAt('/use-cases/wedding-guest-coordination-app');
    expect(
      screen.getByRole('heading', { level: 1, name: /run the whole wedding weekend/i }),
    ).toBeInTheDocument();
  });
});

describe('UseCasesHub', () => {
  it('lists the concierge card linking to its page', () => {
    renderAt('/use-cases');
    const link = screen.getByRole('link', { name: /travel concierge/i });
    expect(link).toHaveAttribute('href', '/use-cases/travel-concierge-client-portal');
  });

  it('links the group trips card to the existing standalone page', () => {
    renderAt('/use-cases');
    const link = screen.getByRole('link', { name: /group trips/i });
    expect(link).toHaveAttribute('href', '/group-travel-planning-app');
  });
});
