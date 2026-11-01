import { supabase } from '../lib/supabase';
import { createTicketRepository } from './ticketRepository';

export const ticketRepository = createTicketRepository(supabase);
