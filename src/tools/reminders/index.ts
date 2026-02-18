import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database, Reminder } from '../../services/database';

import { z } from 'zod';
import axios from 'axios';

import { Supabase, TablesEnum } from '../../services/database';

const agentAPI = axios.create({
  baseURL: process.env.AGENT_API_URL,
});

const setupTools = (server: McpServer, dbClient: Database, config: Record<string, boolean>) => {
  if (config.setDiscordReminder) {
    server.registerTool(
      'set-discord-reminder',
      {
        title: 'Set Discord Reminder or Scheduled Message',
        description: `Sets a reminder or scheduled message to be sent through Discord to a specific recipient (an User or a Channel).

          Requires a relative time (e.g., "in 30 minutes", "in 2 hours").
          If the user provides an absolute time (like "at 3 PM" or "tomorrow at noon") ask them to rephrase using a relative format.
          Do not assume the user’s time zone.

          If the reminder already exists, it will be updated with the new time and description.

          Always make sure to call the get-discord-reminders tool to check if the reminder already exists before setting it.
          `,
        inputSchema: z.object({
          targetId: z
            .string()
            .describe(
              'Discord recipient Id where the message will be sent to. Can be either an User Id or a Channel Id.',
            ),
          userName: z.string().describe('Discord user name of the recipient.'),
          description: z
            .string()
            .describe('Description of what the user wants to be messaged about, include any context as needed.'),
          prompt: z
            .string()
            .describe(
              'Context prompt that will be given to an AI Agent when the message is triggered to give it more context when messaging the user.',
            ),
          timeValue: z
            .number()
            .describe(
              'The value of the relative time when the message will be triggered. Decimals can be used to represent fractions when needed (e.g., "in 9 hours and 30 minutes" would translate to 9.5 hours).',
            ),
          timeUnit: z
            .enum(['minutes', 'hours', 'days'])
            .describe('The time unit of the relative time when the message will be triggered.'),
        }).shape,
      },
      async ({ targetId, userName, description, prompt, timeValue, timeUnit }) => {
        try {
          console.log('Attempting to store reminder', {
            targetId,
            userName,
            description,
            prompt,
            timeValue,
            timeUnit,
          });

          const currentReminders = await dbClient.select<Reminder>(TablesEnum.REMINDERS, {
            filters: [
              {
                field: 'target_id',
                operator: 'eq',
                value: targetId,
              },
            ],
          });

          if (currentReminders.length) {
            const isDuplicate = currentReminders.some(reminder => reminder.description === description);

            if (isDuplicate) {
              return {
                content: [{ type: 'text', text: 'Reminder already exists' }],
              };
            }
          }

          const dueDate = new Date();

          const timeIntervals = {
            minutes: 1,
            hours: 60,
            days: 24 * 60,
          };

          const timeIncrease = timeValue * timeIntervals[timeUnit];

          dueDate.setUTCMinutes(dueDate.getUTCMinutes() + timeIncrease);
          dueDate.setUTCSeconds(0, 0);

          const reminder: Omit<Reminder, 'id'> = {
            name: userName,
            target_id: targetId,
            due_date: dueDate.toUTCString(),
            context_prompt: prompt,
            description,
          };

          const created = await dbClient.insert(TablesEnum.REMINDERS, reminder);

          if (!created) {
            throw new Error(`Error inserting reminder`);
          }

          return {
            content: [{ type: 'text', text: 'Reminder correctly set up.' }],
          };
        } catch (error) {
          console.error(`Error setting up reminder`, { targetId, description, prompt, timeValue, timeUnit }, error);

          return {
            content: [{ type: 'text', text: 'Error setting up reminder' }],
          };
        }
      },
    );
  }

  if (config.getDiscordReminders) {
    server.registerTool(
      'get-discord-reminders',
      {
        title: 'Get Discord Reminders or Scheduled Messages for a given User or Channel Id.',
        description: 'Gets all of the messages that have yet to trigger of a given Discord User or Channel.',
        inputSchema: z.object({
          recipientId: z.string().describe('Discord Id recipient of the messages. Can be an User Id or a Channel Id.'),
        }).shape,
      },
      async ({ recipientId }) => {
        try {
          console.log('Attempting to fetch reminders', {
            recipientId,
          });

          const reminders = await dbClient.select<Reminder>(TablesEnum.REMINDERS, {
            filters: [{ field: 'target_id', operator: 'eq', value: recipientId }],
          });

          const msTimeFrames = {
            minutes: 60000,
            hours: 60000 * 60,
            days: 60000 * 60 * 24,
          };

          const currentDate = new Date();
          const response = reminders
            .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
            .reduce((acc, reminder, index) => {
              const { due_date, description, context_prompt } = reminder;
              const dueDate = new Date(due_date);

              const dueInMs = dueDate.getTime();
              const currentMs = currentDate.getTime();

              let timeLeftMs = dueInMs - currentMs;
              let timeLeft = '';

              if (timeLeftMs >= msTimeFrames.days) {
                const daysLeft = Math.floor(timeLeftMs / msTimeFrames.days);
                timeLeft += `${daysLeft} days `;
                timeLeftMs -= daysLeft * msTimeFrames.days;
              }

              if (timeLeftMs >= msTimeFrames.hours) {
                const hoursLeft = Math.floor(timeLeftMs / msTimeFrames.hours);
                timeLeft += `${hoursLeft} hours `;
                timeLeftMs -= hoursLeft * msTimeFrames.hours;
              }

              if (timeLeftMs >= msTimeFrames.minutes) {
                const minutesLeft = Math.floor(timeLeftMs / msTimeFrames.minutes);
                timeLeft += `${minutesLeft} minutes `;
                timeLeftMs -= minutesLeft * msTimeFrames.minutes;
              }

              acc += `\n${
                index + 1
              }. [Reminder In ${timeLeft.trim()}]\n- **Description**\n${description}\n- **Context**\n${context_prompt}`;

              return acc;
            }, '');

          return {
            content: [{ type: 'text', text: response.trim() || '0 reminders found' }],
          };
        } catch (error) {
          console.error(`Error fetching reminders`, { recipientId }, error);

          return {
            content: [{ type: 'text', text: 'Error fetching reminders' }],
          };
        }
      },
    );
  }
};

const pollReminders = async () => {
  const dbClient = new Supabase();
  const filters = [
    {
      field: 'due_date',
      operator: 'lte',
      value: new Date().toUTCString(),
    },
  ];

  const reminders = await dbClient.select<Reminder>(TablesEnum.REMINDERS, { filters });

  if (!reminders.length) {
    return;
  }

  await agentAPI.post(
    '/reminders',
    reminders.map(reminder => ({
      targetId: reminder.target_id,
      userName: reminder.name,
      description: reminder.description,
      prompt: reminder.context_prompt,
    })),
    {
      headers: {
        'x-api-key': process.env.AGENT_API_KEY,
      },
    },
  );

  await dbClient.delete(TablesEnum.REMINDERS, filters);

  console.log(`Successfully triggered ${reminders.length} reminders`);
};

const now = new Date();
const seconds = now.getUTCSeconds();
const milliseconds = now.getUTCMilliseconds();

let delay;
if (seconds < 3) {
  delay = (3 - seconds) * 1000 - milliseconds;
} else {
  delay = (60 - seconds + 3) * 1000 - milliseconds;
}

setTimeout(() => {
  pollReminders();

  setInterval(() => {
    pollReminders().catch(e => console.log('Error polling reminders', e));
  }, Number(process.env.REMINDERS_POLLING_INTERVAL));
}, delay);

export default setupTools;
