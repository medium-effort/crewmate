export const HOOKS_JSON =
  JSON.stringify(
    {
      'crewmate-events': {
        enabled: true,
        PreInvocation: [
          {
            type: 'command',
            command: 'crewmate hook heartbeat',
            timeout: 10,
          },
        ],
        PostToolUse: [
          {
            matcher: 'run_command',
            hooks: [
              {
                type: 'command',
                command: 'crewmate hook post-tool',
                timeout: 10,
              },
            ],
          },
        ],
        Stop: [
          {
            type: 'command',
            command: 'crewmate hook stop',
            timeout: 10,
          },
        ],
      },
    },
    null,
    2
  ) + '\n';
