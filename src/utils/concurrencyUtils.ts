// Rate limiting utility for client-side mutation guards.
class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  checkLimit(key: string, maxAttempts: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing || now > existing.resetTime) {
      this.attempts.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (existing.count >= maxAttempts) {
      return false;
    }

    existing.count++;
    return true;
  }

  getRemainingAttempts(key: string, maxAttempts: number = 10): number {
    const existing = this.attempts.get(key);
    if (!existing || Date.now() > existing.resetTime) {
      return maxAttempts;
    }
    return Math.max(0, maxAttempts - existing.count);
  }
}

export const rateLimiter = new RateLimiter();
