export const HOOKS_JSON =
  JSON.stringify(
    {
      'crewmate-events': {
        enabled: true,
        PostToolUse: [
          {
            matcher: 'run_command|replace_file_content|write_to_file|multi_replace_file_content',
            hooks: [
              {
                type: 'command',
                command:
                  'crewmate event add --actor executor --type started --message "File modified by executor"',
                timeout: 10,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  ) + '\n';
