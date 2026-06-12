import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroSection } from '../HeroSection';

// Regression coverage for the production incident where the hero video AND its
// poster pointed at a sandbox-only asset store (/__l5e/assets-v1/...) that
// 404s outside that environment, leaving a broken image on the homepage.

const mockReducedMotion = vi.fn(() => false);
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion(),
}));

describe('HeroSection demo video', () => {
  beforeEach(() => {
    mockReducedMotion.mockReturnValue(false);
  });

  it('renders the video from the deploy-local /videos/ path with a matching poster', () => {
    render(<HeroSection onSignUp={vi.fn()} />);
    const video = screen.getByLabelText('ChravelApp trip dashboard product demo');
    // src must live in public/ (shipped with every deploy) — never an external
    // or sandbox asset URL, which is what broke the homepage previously.
    expect(video).toHaveAttribute('src', '/videos/chravel-homepage-demo-60.mp4');
    expect(video).toHaveAttribute('poster', '/videos/chravel-homepage-demo-60-poster.jpg');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
  });

  it('falls back to the poster image when the video errors', () => {
    render(<HeroSection onSignUp={vi.fn()} />);
    const video = screen.getByLabelText('ChravelApp trip dashboard product demo');
    fireEvent.error(video);
    expect(screen.queryByLabelText('ChravelApp trip dashboard product demo')).toBeNull();
    const fallback = screen.getByAltText('ChravelApp trips dashboard preview');
    expect(fallback).toHaveAttribute('src', '/videos/chravel-homepage-demo-60-poster.jpg');
  });

  it('shows the static poster instead of video under prefers-reduced-motion', () => {
    mockReducedMotion.mockReturnValue(true);
    render(<HeroSection onSignUp={vi.fn()} />);
    expect(screen.queryByLabelText('ChravelApp trip dashboard product demo')).toBeNull();
    expect(screen.getByAltText('ChravelApp trips dashboard preview')).toBeInTheDocument();
  });
});
