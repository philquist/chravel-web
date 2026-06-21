import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileLandingNav } from '../MobileLandingNav';

describe('MobileLandingNav', () => {
  it('opens a menu exposing Use Cases, Blog, and For Teams links', () => {
    render(
      <MemoryRouter>
        <MobileLandingNav onSignUp={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('link', { name: 'Use Cases' })).toHaveAttribute('href', '/use-cases');
    expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
    expect(screen.getByRole('link', { name: 'For Teams' })).toHaveAttribute('href', '/teams');
  });

  it('invokes onSignUp from the Get started button', () => {
    let signedUp = false;
    render(
      <MemoryRouter>
        <MobileLandingNav
          onSignUp={() => {
            signedUp = true;
          }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(signedUp).toBe(true);
  });
});
