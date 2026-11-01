import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NewTicket from '../../app/tickets/new';
import { fakeRepo, makeIds, memoryDrafts, ticketFixture } from '../testUtils/helpers';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockRepo = fakeRepo();
jest.mock('../repositories', () => ({
  ticketRepository: {
    listCategories: async () => ({
      ok: true,
      data: [
        { id: 'cat-1', name: 'Network', description: null },
        { id: 'cat-2', name: 'Hardware', description: null },
      ],
    }),
  },
}));
jest.mock('../store/useDraftStore', () => {
  const { createDraftStore } = jest.requireActual('../store/draftStore');
  const h = jest.requireActual('../testUtils/helpers');
  return {
    useDraftStore: createDraftStore({
      drafts: h.memoryDrafts(),
      repo: { createTicket: (...a: unknown[]) => mockRepo.createTicket(...a) },
      newId: h.makeIds(),
    }),
  };
});
import { useDraftStore } from '../store/useDraftStore';
void memoryDrafts;
void makeIds;

beforeEach(async () => {
  mockReplace.mockReset();
  mockRepo.createTicket.mockReset();
  await useDraftStore.getState().clearAll();
  await useDraftStore.getState().load('user-1');
});

async function fillForm() {
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Wi-Fi down');
  await fireEvent.changeText(screen.getByLabelText('Description'), 'Cannot connect since morning');
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Network' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('radio', { name: 'Network' }));
}

describe('new ticket screen', () => {
  it('labels the unsent text as a local draft, not a ticket', async () => {
    await render(<NewTicket />);
    await fillForm();
    expect(
      await screen.findByText(/Local draft — saved on this device. Not sent yet./),
    ).toBeTruthy();
  });

  it('shows required-field errors and sends nothing when the form is empty', async () => {
    await render(<NewTicket />);
    await fireEvent.changeText(screen.getByLabelText('Title'), ' ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send ticket' }));
    expect(await screen.findByText('Title is required.')).toBeTruthy();
    expect(await screen.findByText('Choose a category.')).toBeTruthy();
    expect(mockRepo.createTicket).not.toHaveBeenCalled();
  });

  it('sends once and opens the created ticket', async () => {
    mockRepo.createTicket.mockResolvedValue({ ok: true, data: ticketFixture({ id: 't-99' }) });
    await render(<NewTicket />);
    await fillForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/tickets/[id]',
        params: { id: 't-99', created: '1' },
      }),
    );
    expect(mockRepo.createTicket).toHaveBeenCalledTimes(1);
  });

  it('keeps the text, explains the failure and retries with the same key', async () => {
    mockRepo.createTicket.mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'network',
        message: "Can't reach the server. Check your connection and try again.",
      },
    });
    await render(<NewTicket />);
    await fillForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() =>
      expect(screen.getByText(/Not confirmed — your draft is saved/)).toBeTruthy(),
    );
    expect(
      screen.getByText("Can't reach the server. Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByLabelText('Title').props.value).toBe('Wi-Fi down');

    mockRepo.createTicket.mockResolvedValueOnce({ ok: true, data: ticketFixture() });
    await fireEvent.press(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const keys = mockRepo.createTicket.mock.calls.map((c) => c[0].clientRequestId);
    expect(keys[0]).toBe(keys[1]);
  });
});
