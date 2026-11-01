import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import TicketDetail from '../../app/tickets/[id]';
import type { CommentRow, EventRow } from '../features/tickets/types';
import { fail, ok } from '../repositories/result';
import { ticketFixture } from '../testUtils/helpers';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useLocalSearchParams: () => ({ id: 't-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});
jest.mock('../features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));

const mockGetTicket = jest.fn();
const mockGetTimeline = jest.fn();
const mockAddReply = jest.fn();
const mockReopen = jest.fn();
jest.mock('../repositories', () => ({
  ticketRepository: {
    getTicket: (...a: unknown[]) => mockGetTicket(...a),
    getTimeline: (...a: unknown[]) => mockGetTimeline(...a),
    addReply: (...a: unknown[]) => mockAddReply(...a),
    reopenTicket: (...a: unknown[]) => mockReopen(...a),
  },
}));

const events: EventRow[] = [
  {
    id: 1,
    event_type: 'ticket_created',
    actor_id: 'me',
    reason: null,
    created_at: '2026-10-30T09:00:00Z',
  },
];
let comments: CommentRow[];
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(() => {
  comments = [
    {
      id: 'c1',
      author_id: 'staff',
      body: 'We are looking into it',
      created_at: '2026-10-30T09:05:00Z',
    },
  ];
  mockGetTicket
    .mockReset()
    .mockImplementation(async () => ok(ticketFixture({ status: 'in_progress', version: 4 })));
  mockGetTimeline
    .mockReset()
    .mockImplementation(async () => ok({ events, comments: [...comments] }));
  mockAddReply.mockReset().mockResolvedValue(ok(undefined));
  mockReopen.mockReset().mockResolvedValue(ok(undefined));
});

const open = async () => {
  await render(<TicketDetail />);
  await screen.findByText('Reply to support');
};
const send = () => screen.getByRole('button', { name: 'Send reply' });

describe('requester reply', () => {
  it('shows the timeline, a reply box and who will see the reply', async () => {
    await open();
    expect(screen.getByText('We are looking into it')).toBeTruthy();
    expect(screen.getByText(/Support will see this reply/)).toBeTruthy();
  });

  it('does not send an empty reply', async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), '   ');
    await fireEvent.press(send());
    expect(await screen.findByText('Write something first.')).toBeTruthy();
    expect(mockAddReply).not.toHaveBeenCalled();
  });

  it('sends the trimmed text, clears the box, confirms only after the server answers, and reloads the timeline', async () => {
    mockAddReply.mockImplementation(async () => {
      comments.push({
        id: 'c2',
        author_id: 'me',
        body: 'Still not working',
        created_at: new Date().toISOString(),
      });
      return ok(undefined);
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), '  Still not working ');
    await fireEvent.press(send());
    expect(await screen.findByText('Reply sent.')).toBeTruthy();
    expect(mockAddReply).toHaveBeenCalledWith('t-1', 'Still not working');
    expect(screen.getByLabelText('Reply to support').props.value).toBe('');
    expect(await screen.findByText('You replied')).toBeTruthy();
  });

  it('blocks a second send while the first is in flight and claims no success early', async () => {
    const d = deferred<ReturnType<typeof ok<undefined>>>();
    mockAddReply.mockReturnValue(d.promise);
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), 'Hello');
    await fireEvent.press(send());
    await fireEvent.press(send());
    expect(mockAddReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Reply sent.')).toBeNull();
    await act(async () => {
      d.resolve(ok(undefined));
    });
    expect(await screen.findByText('Reply sent.')).toBeTruthy();
  });

  it('keeps the text and explains a rate limit', async () => {
    mockAddReply.mockResolvedValue(
      fail('rate_limited', "You're doing that too often. Please wait a few minutes and try again."),
    );
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), 'Please help');
    await fireEvent.press(send());
    expect(await screen.findByText(/too often/)).toBeTruthy();
    expect(screen.getByLabelText('Reply to support').props.value).toBe('Please help');
  });

  it('after a network failure, keeps the text when the message did NOT arrive (so the user can retry)', async () => {
    mockAddReply.mockResolvedValue(
      fail('network', "Can't reach the server. Check your connection and try again."),
    );
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), 'Did this send?');
    await fireEvent.press(send());
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByLabelText('Reply to support').props.value).toBe('Did this send?');
    expect(screen.queryByText('Reply sent.')).toBeNull();
  });

  it('after a network failure, recognises that the message DID arrive and does not ask the user to resend', async () => {
    mockAddReply.mockImplementation(async () => {
      comments.push({
        id: 'c9',
        author_id: 'me',
        body: 'Did this send?',
        created_at: new Date().toISOString(),
      });
      return fail('network', "Can't reach the server. Check your connection and try again.");
    });
    await open();
    await fireEvent.changeText(screen.getByLabelText('Reply to support'), 'Did this send?');
    await fireEvent.press(send());
    expect(await screen.findByText('Reply sent.')).toBeTruthy();
    expect(
      screen.queryByText("Can't reach the server. Check your connection and try again."),
    ).toBeNull();
    expect(mockAddReply).toHaveBeenCalledTimes(1);
  });
});

describe('requester reopen', () => {
  const resolved = () =>
    mockGetTicket.mockImplementation(async () =>
      ok(ticketFixture({ status: 'resolved', version: 9, resolutionSummary: 'Fixed it' })),
    );

  it('is not offered unless the ticket is resolved', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Reopen this ticket' })).toBeNull();
  });

  it('requires a reason before calling the server', async () => {
    resolved();
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen this ticket' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen ticket' }));
    expect(await screen.findByText('Tell support why you are reopening this ticket.')).toBeTruthy();
    expect(mockReopen).not.toHaveBeenCalled();
  });

  it('sends the reason and the version it saw, then shows the refreshed ticket', async () => {
    resolved();
    mockReopen.mockImplementation(async () => {
      mockGetTicket.mockImplementation(async () =>
        ok(ticketFixture({ status: 'reopened', version: 10 })),
      );
      return ok(undefined);
    });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen this ticket' }));
    await fireEvent.changeText(
      screen.getByLabelText('Why are you reopening this ticket?'),
      '  It broke again ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen ticket' }));
    expect(mockReopen).toHaveBeenCalledWith('t-1', 'It broke again', 9);
    expect(await screen.findByText(/Ticket reopened/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reopen this ticket' })).toBeNull(),
    );
    expect(screen.getByLabelText('Status: Reopened')).toBeTruthy();
  });

  it('on a stale version, explains, refreshes, and keeps the form so the user can try again', async () => {
    resolved();
    mockReopen.mockResolvedValue(
      fail(
        'stale',
        "This ticket changed while you were looking at it. We've refreshed it; please check and try again.",
      ),
    );
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen this ticket' }));
    await fireEvent.changeText(
      screen.getByLabelText('Why are you reopening this ticket?'),
      'Broken',
    );
    const before = mockGetTicket.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen ticket' }));
    expect(await screen.findByText(/changed while you were looking/)).toBeTruthy();
    await waitFor(() => expect(mockGetTicket.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByLabelText('Why are you reopening this ticket?').props.value).toBe('Broken');
  });

  it('cancel closes the form without calling the server', async () => {
    resolved();
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Reopen this ticket' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Reopen this ticket' })).toBeTruthy();
    expect(mockReopen).not.toHaveBeenCalled();
  });
});

describe('auto refresh while the ticket is open', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  const setAppState = (s: string) =>
    Object.defineProperty(AppState, 'currentState', { value: s, configurable: true });

  it('quietly reloads every 30 seconds while the app is in the foreground, and pauses in the background', async () => {
    jest.useFakeTimers();
    setAppState('active');
    await render(<TicketDetail />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    const base = mockGetTicket.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockGetTicket.mock.calls.length).toBe(base + 1);

    setAppState('background');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(mockGetTicket.mock.calls.length).toBe(base + 1);
    setAppState('active');
  });

  it('keeps showing the ticket when a background refresh fails', async () => {
    jest.useFakeTimers();
    setAppState('active');
    await render(<TicketDetail />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    mockGetTicket.mockResolvedValue(fail('network', "Can't reach the server."));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText('We are looking into it')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this ticket")).toBeNull();
  });
});
