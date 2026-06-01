import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MessageItem } from '../MessageItem';
import {
  DEFAULT_SYSTEM_MESSAGE_CATEGORIES,
  SystemMessageCategoryPrefs,
} from '@/utils/systemMessageCategory';

const { messageBubbleProps } = vi.hoisted(() => ({
  messageBubbleProps: [] as Array<Record<string, unknown>>,
}));

// Stub out heavy / DOM-coupled bubble dependencies
vi.mock('../MessageBubble', () => ({
  MessageBubble: (props: { text: string }) => {
    messageBubbleProps.push(props as unknown as Record<string, unknown>);
    return <div data-testid="user-bubble">{props.text}</div>;
  },
}));

vi.mock('../SystemMessageBubble', () => ({
  SystemMessageBubble: ({ body }: { body: string }) => (
    <div data-testid="system-bubble">{body}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@x.com' } }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const baseSystemMessage = {
  id: 'm1',
  text: 'Alice created a poll: "Beach or pool?"',
  sender: { id: 'system', name: 'System' },
  createdAt: '2026-04-17T12:00:00Z',
  tags: ['system'],
  message_type: 'system',
  system_event_type: 'poll_created',
} as unknown as Parameters<typeof MessageItem>[0]['message'];

const allOn: SystemMessageCategoryPrefs = {
  member: true,
  basecamp: true,
  uploads: true,
  polls: true,
  calendar: true,
  tasks: true,
  payments: true,
};

describe('MessageItem — system message category filter', () => {
  it('passes async edit/delete callbacks through to the action layer', async () => {
    messageBubbleProps.length = 0;
    const onDelete = vi.fn().mockRejectedValue(new Error('Delete denied'));
    render(
      <MessageItem
        message={{
          id: 'user-msg',
          text: 'hello',
          sender: { id: 'me', name: 'Me' },
          createdAt: '2026-04-17T12:00:00Z',
        }}
        onReaction={vi.fn()}
        onDelete={onDelete}
      />,
    );

    const bubbleProps = messageBubbleProps[0];
    const deleteResult = (bubbleProps.onDelete as (messageId: string) => Promise<void>)('user-msg');

    await expect(deleteResult).rejects.toThrow('Delete denied');
  });

  it('renders system bubble when master toggle ON and category ON', () => {
    render(
      <MessageItem
        message={baseSystemMessage}
        onReaction={vi.fn()}
        systemMessagePrefs={{ showSystemMessages: true, categories: allOn }}
      />,
    );
    expect(screen.getByTestId('system-bubble')).toBeInTheDocument();
  });

  it('hides system bubble when master toggle OFF', () => {
    const { container } = render(
      <MessageItem
        message={baseSystemMessage}
        onReaction={vi.fn()}
        systemMessagePrefs={{ showSystemMessages: false, categories: allOn }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides system bubble when its category is OFF (polls=false)', () => {
    const { container } = render(
      <MessageItem
        message={baseSystemMessage}
        onReaction={vi.fn()}
        systemMessagePrefs={{
          showSystemMessages: true,
          categories: { ...allOn, polls: false },
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides hidden-by-default categories under DEFAULTS (tasks/payments)', () => {
    const taskMsg = {
      ...baseSystemMessage,
      id: 'm-task',
      system_event_type: 'task_created',
    } as typeof baseSystemMessage;
    const { container } = render(
      <MessageItem
        message={taskMsg}
        onReaction={vi.fn()}
        systemMessagePrefs={{
          showSystemMessages: true,
          categories: DEFAULT_SYSTEM_MESSAGE_CATEGORIES,
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows system message with no event type when master toggle ON (legacy fallback)', () => {
    const legacy = {
      ...baseSystemMessage,
      id: 'legacy',
      system_event_type: undefined,
    } as typeof baseSystemMessage;
    render(
      <MessageItem
        message={legacy}
        onReaction={vi.fn()}
        systemMessagePrefs={{ showSystemMessages: true, categories: allOn }}
      />,
    );
    expect(screen.getByTestId('system-bubble')).toBeInTheDocument();
  });
});
