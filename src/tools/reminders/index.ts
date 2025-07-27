import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Reminder } from '../../services/database';

import { z } from 'zod';
import axios from 'axios';

import { Supabase } from '../../services/database';

const agentAPI = axios.create({
  baseURL: process.env.AGENT_API_URL,
});

const setupTools = (server: McpServer) => {
  server.registerTool(
    'set-discord-reminder',
    {
      title: 'Set Discord Reminder',
      description: 'Sets a reminder to be sent through Discord to a specific user.',
      inputSchema: z.object({
        userId: z.string().describe('Discord user Id where the reminder will be sent to.'),
        userName: z.string().describe('Discord user name'),
        description: z
          .string()
          .describe('Description of what the user wants to be reminded of, include any context as needed.'),
        timeValue: z.number().describe('The value of the relative time when the reminder will be triggered.'),
        timeUnit: z
          .enum(['minutes', 'hours', 'days'])
          .describe('The time unit of the relative time when the reminder will be triggered.'),
      }).shape,
    },
    async ({ userId, userName, description, timeValue, timeUnit }) => {
      try {
        console.log('Attempting to store reminder', {
          userId,
          userName,
          description,
          timeValue,
          timeUnit,
        });

        const dbClient = new Supabase();
        const dueDate = new Date();

        const timeIntervals = {
          minutes: 1,
          hours: 60,
          days: 24 * 60,
        };

        const timeIncrease = timeValue * timeIntervals[timeUnit];

        dueDate.setUTCMinutes(dueDate.getUTCMinutes() + timeIncrease);

        const reminder: Omit<Reminder, 'id'> = {
          name: userName,
          target_id: userId,
          due_date: dueDate.toISOString(),
          description,
        };

        const created = await dbClient.setReminder(reminder);

        if (!created) {
          throw new Error(`Error inserting reminder`);
        }

        return {
          content: [{ type: 'text', text: 'Reminder correctly set up.' }],
        };
      } catch (error) {
        console.error(`Error setting up reminder`, { userId, description, timeValue, timeUnit }, error);

        return {
          content: [{ type: 'text', text: 'Error setting up reminder' }],
        };
      }
    },
  );
};

const pollReminders = async () => {
  const dbClient = new Supabase();

  const reminders = await dbClient.getReminders([
    {
      field: 'due_date',
      operator: 'lte',
      value: new Date().toISOString(),
    },
  ]);

  if (!reminders.length) {
    console.log('No reminders found');
    return;
  }

  await agentAPI.post(
    '/reminders',
    reminders.map((reminder) => ({
      userId: reminder.target_id,
      userName: reminder.name,
      description: reminder.description,
    })),
    {
      headers: {
        'x-api-key': process.env.AGENT_API_KEY,
      },
    },
  );

  console.log(`Successfully triggered ${reminders.length} reminders`);
};

setInterval(() => {
  pollReminders().catch((e) => console.log('Error polling reminders', e));
}, Number(process.env.REMINDERS_POLLING_INTERVAL));

export default setupTools;
