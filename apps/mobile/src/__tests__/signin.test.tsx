import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SignIn from '../../app/(auth)/sign-in';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
const mockSignIn = jest.fn();
let mockAuthState: { status: string; notice: string | null } = {
  status: 'signedOut',
  notice: null,
};
jest.mock('../features/auth/AuthProvider', () => ({
  useAuth: () => ({ ...mockAuthState, signIn: mockSignIn }),
}));

beforeEach(() => {
  mockSignIn.mockReset();
  mockReplace.mockReset();
  mockAuthState = { status: 'signedOut', notice: null };
});

describe('sign-in screen', () => {
  it('requires email and password and does not call the backend when empty', async () => {
    await render(<SignIn />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows the safe error message returned by the auth layer', async () => {
    mockSignIn.mockResolvedValue({ ok: false, message: 'Incorrect email or password.' });
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Incorrect email or password.')).toBeTruthy());
    expect(mockSignIn).toHaveBeenCalledWith('a@example.test', 'wrong');
  });

  it('shows a configuration warning and disables sign-in when the backend is missing', async () => {
    mockAuthState = { status: 'unconfigured', notice: null };
    await render(<SignIn />);
    expect(screen.getByText(/not connected to a backend/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows the deactivated-account notice', async () => {
    mockAuthState = {
      status: 'signedOut',
      notice: 'This account has been deactivated. Contact your administrator.',
    };
    await render(<SignIn />);
    expect(screen.getByText(/deactivated/)).toBeTruthy();
  });

  it('navigates home once signed in', async () => {
    mockAuthState = { status: 'signedIn', notice: null };
    await render(<SignIn />);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});
