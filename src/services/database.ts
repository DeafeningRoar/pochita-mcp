import { createClient } from '@supabase/supabase-js';

const { SUPABASE_KEY, SUPABASE_URL } = process.env as {
  SUPABASE_KEY: string;
  SUPABASE_URL: string;
};

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface Database {
  setReminder: (reminders: Omit<Reminder, 'id'>) => Promise<boolean>;
  getReminders: (filters?: Filter[]) => Promise<Reminder[]>;
  deleteReminders: (filters: Filter[]) => Promise<boolean>;
}

export interface Filter {
  field: string;
  operator: string;
  value: string;
}

export interface Reminder {
  id: string;
  target_id: string;
  name: string;
  context_prompt: string;
  description: string;
  due_date: string;
}

export class Supabase implements Database {
  async setReminder(reminder: Omit<Reminder, 'id'>) {
    const result = await supabaseClient.from('reminders').insert(reminder);

    console.log(result);

    return result.status === 201;
  }

  async getReminders(filters?: Filter[]) {
    const query = supabaseClient.from('reminders').select('*');

    if (filters) {
      for (const filter of filters) {
        query.filter(filter.field, filter.operator, filter.value);
      }
    }

    const result = await query;

    if (result?.data) {
      return result.data as Reminder[];
    }

    return [];
  }

  async deleteReminders(filters: Filter[]) {
    const query = supabaseClient.from('reminders').delete();

    if (filters) {
      for (const filter of filters) {
        query.filter(filter.field, filter.operator, filter.value);
      }
    }

    const result = await query;

    return result.status === 204;
  }
}
