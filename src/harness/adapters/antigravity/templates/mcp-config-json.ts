export const MCP_CONFIG_JSON =
  JSON.stringify(
    {
      mcpServers: {
        crewmate: {
          command: 'crewmate',
          args: ['mcp'],
        },
      },
    },
    null,
    2
  ) + '\n';
