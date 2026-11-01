import { createContext, useContext, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { createStaffRepository, type StaffRepository } from './staffRepository';

const defaultRepo = createStaffRepository(supabase);
const RepoContext = createContext<StaffRepository>(defaultRepo);

/** Lets tests (and later environments) inject a different repository. */
export function RepoProvider({ repo, children }: { repo: StaffRepository; children: ReactNode }) {
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useRepo = () => useContext(RepoContext);
