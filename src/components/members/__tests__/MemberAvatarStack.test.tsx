import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberAvatarStack } from '../MemberAvatarStack';

const members = Array.from({ length: 12 }, (_, index) => ({
  id: `user-${index}`,
  name: `Member ${index + 1}`,
}));

describe('MemberAvatarStack', () => {
  it('shows overflow badge when members exceed maxVisible', () => {
    render(<MemberAvatarStack members={members} maxVisible={5} totalCount={12} />);
    expect(screen.getByRole('button', { name: 'View all 12 members' })).toHaveTextContent('+7');
    expect(screen.getByText('12 members')).toBeInTheDocument();
  });

  it('invokes overflow click handler', async () => {
    const user = userEvent.setup();
    const onOverflowClick = vi.fn();
    render(
      <MemberAvatarStack
        members={members}
        maxVisible={4}
        totalCount={12}
        onOverflowClick={onOverflowClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View all 12 members' }));
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
  });
});
