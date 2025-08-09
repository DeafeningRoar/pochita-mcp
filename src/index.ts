import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { Supabase } from './services/database';

import setupLOANewsTools from './tools/loa-news';
import reminders from './tools/reminders';
import utilities from './tools/utilities';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const setupServer = () => {
  const server = new McpServer(
    {
      name: 'Pochita MCP Server',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {
          level: 'debug',
        },
      },
    },
  );

  const dbClient = new Supabase();

  setupLOANewsTools(server);
  reminders(server, dbClient);
  utilities(server);

  return server;
};

app.use((req: Request, res: Response, next: NextFunction) => {
  const { uid } = req.query as { uid: string };

  if (!uid) {
    res.status(401).json();
  } else {
    const actualUid = process.env.API_KEY;

    if (uid !== actualUid) {
      res.status(401).json();
    } else {
      next();
    }
  }
});

app.post('/mcp', async (req, res) => {
  try {
    const server = setupServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    console.log('Processing MCP Request', req.body);

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log('Server is running on port', PORT);
});
