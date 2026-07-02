import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { AuthModal } from '../AuthModal';
import { AuthProvider } from '@/hooks/useAuth';
import * as platformDetection from '@/utils/platformDetection';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('AuthModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(platformDetection, 'isInstalledApp').mockReturnValue(false);
  });

  describe('email form functionality', () => {
    it('renders email and password fields in signin mode', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-modal-logo')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/your@email.com/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
      });
    });

    it('renders first and last name fields in signup mode', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} initialMode="signup" />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/john/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/doe/i)).toBeInTheDocument();
      });
    });

    it('shows forgot password form when clicked', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} initialMode="signin" />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /chravelapp/i })).toBeInTheDocument();
      });

      // Click on "Forgot password?" link
      const forgotPasswordButton = screen.getByRole('button', { name: /forgot password/i });
      fireEvent.click(forgotPasswordButton);

      // Should show reset password form
      await waitFor(() => {
        expect(screen.getByText('Reset Password')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
      });
    });
  });

  describe('tab navigation', () => {
    it('switches between signin and signup modes', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} initialMode="signin" />, {
        wrapper: createTestWrapper(),
      });

      // Wait for signin mode
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /chravelapp/i })).toBeInTheDocument();
      });

      // Switch to signup mode (mode switcher uses tab semantics)
      const signUpTab = screen.getByRole('tab', { name: /^sign up$/i });
      fireEvent.click(signUpTab);

      // Should show Create Account header (use heading role to be more specific)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
        // Name fields should appear
        expect(screen.getByPlaceholderText(/john/i)).toBeInTheDocument();
      });
    });
  });

  describe('modal behavior', () => {
    it('does not render when isOpen is false', () => {
      render(<AuthModal isOpen={false} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders when isOpen is true', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /chravelapp/i })).toBeInTheDocument();
      });
    });

    it('renders the modal content in a centered viewport container', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        const backdrop = screen.getByTestId('auth-modal-backdrop');
        const content = screen.getByTestId('auth-modal-content');
        expect(backdrop).toHaveClass('fixed');
        expect(content).toHaveClass('max-w-md');
        expect(content).toHaveClass('w-full');
      });
    });

    it('uses an opaque viewport scrim and renders a single ChravelApp wordmark', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        const scrim = screen.getByTestId('auth-modal-scrim');
        expect(scrim).toHaveClass('bg-slate-950');
        expect(scrim).not.toHaveClass('bg-slate-950/85');
        expect(screen.getAllByText('ChravelApp')).toHaveLength(1);
      });
    });

    it('calls onClose when X button is clicked', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /chravelapp/i })).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-modal-backdrop')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when the backdrop is clicked', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-modal-backdrop')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('auth-modal-backdrop'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onClose when modal content is clicked', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-modal-content')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('auth-modal-content'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('shows Google and Apple OAuth options in browser context', async () => {
      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^google$/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^apple$/i })).toBeInTheDocument();
    });

    it('shows Google and Apple OAuth options in installed app context', async () => {
      vi.spyOn(platformDetection, 'isInstalledApp').mockReturnValue(true);

      render(<AuthModal isOpen={true} onClose={mockOnClose} />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^google$/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^apple$/i })).toBeInTheDocument();
      expect(screen.queryByText(/To stay inside the app/i)).not.toBeInTheDocument();
    });
  });
});
