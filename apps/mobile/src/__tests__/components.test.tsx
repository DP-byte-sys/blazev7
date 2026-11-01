import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppButton } from '../components/AppButton';
import { AppTextField } from '../components/AppTextField';
import { ErrorState } from '../components/States';
import { StatusBadge } from '../components/StatusBadge';
import { TicketCard } from '../components/TicketCard';
import type { TicketSummary } from '../features/tickets/types';

const FIXTURE: TicketSummary = {
  id: '1',
  reference: 'BLZ-000001',
  title: 'Cannot connect to office Wi-Fi',
  status: 'in_progress',
  priority: 'high',
  category: 'Network',
  updatedAt: new Date().toISOString(),
};

describe('components', () => {
  it('StatusBadge shows a text label (not color only)', async () => {
    await render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('AppButton calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<AppButton title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('AppButton blocks presses while loading (no duplicate submit)', async () => {
    const onPress = jest.fn();
    await render(<AppButton title="Save" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('AppTextField shows its error message', async () => {
    await render(
      <AppTextField label="Title" value="" onChangeText={() => {}} error="Title is required." />,
    );
    expect(screen.getByText('Title is required.')).toBeTruthy();
  });

  it('TicketCard shows reference, title and status label', async () => {
    const t = FIXTURE;
    await render(<TicketCard ticket={t} onPress={() => {}} />);
    expect(screen.getByText(t.reference)).toBeTruthy();
    expect(screen.getByText(t.title)).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('ErrorState offers retry', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
