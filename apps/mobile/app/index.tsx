import { Redirect } from 'expo-router';
import { useAuth } from '../src/features/auth/AuthProvider';

export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/home' : '/sign-in'} />;
}
