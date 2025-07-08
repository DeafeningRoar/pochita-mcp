import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import setupLOACodexTools from "./tools/loacodex";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());


const setupServer = () => {
  const server = new McpServer(
    {
      name: "MCP Server Boilerplate",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {
          level: "debug",
        }
      }
    }
  );

  setupLOACodexTools(server);

  return server;
};

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
  console.log("Server is running on port", PORT);
});
