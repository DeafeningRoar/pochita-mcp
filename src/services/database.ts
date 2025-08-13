import { createClient } from '@supabase/supabase-js';

const { SUPABASE_KEY, SUPABASE_URL } = process.env as {
  SUPABASE_KEY: string;
  SUPABASE_URL: string;
};

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface Database {
  insert: <T>(table: string, data: T) => Promise<boolean>;
  select: <T>(table: string, { filters, columns }: { filters?: Filter[]; columns?: string }) => Promise<T[]>;
  delete: (table: string, filters: Filter[]) => Promise<boolean>;
}

export interface Filter {
  field: string;
  operator: string;
  value: unknown;
}

export interface Reminder {
  id: string;
  target_id: string;
  name: string;
  context_prompt: string;
  description: string;
  due_date: string;
}

export interface Fact {
  id: string;
  target_id: string;
  name: string;
  fact: string;
}

export enum TablesEnum {
  REMINDERS = 'reminders',
  FACTS = 'facts',
};

export class Supabase implements Database {
  async insert<T>(table: string, data: T) {
    const result = await supabaseClient.from(table).insert(data);

    if (result.error) {
      throw result.error;
    }

    return result.status === 201;
  }

  async select<T>(
    table: string,
    { filters, columns }: { filters?: Filter[]; columns?: string } = { columns: '*' },
  ): Promise<T[]> {
    const query = supabaseClient.from(table).select(columns);

    if (filters) {
      for (const filter of filters) {
        query.filter(filter.field, filter.operator, filter.value);
      }
    }

    const result = await query;

    if (result.error) {
      throw result.error;
    }

    if (result?.data) {
      return result.data as T[];
    }

    return [];
  }

  async delete(table: string, filters: Filter[]) {
    const query = supabaseClient.from(table).delete();

    if (filters) {
      for (const filter of filters) {
        query.filter(filter.field, filter.operator, filter.value);
      }
    }

    const result = await query;

    if (result.error) {
      throw result.error;
    }

    return result.status === 204;
  }
}
