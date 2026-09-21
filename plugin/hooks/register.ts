import type { Register } from 'claude-code';

const tool = 'mcp__hermit__nu';

const description = `Runs a nushell script and returns its output.
- Each call is a fresh nu with no config, started in Bash's working directory: variables, $env and cd don't carry over, and stdin is empty.
- Prefer it over Bash whenever the work is data (JSON, YAML, CSV, HTTP APIs, git output, tables of files or processes), where Bash would need jq, awk, sed or cut. Otherwise, stick to Bash.
- The final value prints as NUON, strings as themselves; stdout and stderr interleave. A failure leads with its exit code, and nu's error points at /dev/stdin:line:column.
- Separate commands with ; not &&. Any error, a non-zero exit included, stops the script.
- A subexpression is (cmd), not $(cmd). Interpolate with $"...(expr)...".
- ls, ps, find and sort are nu's own; ^ runs the system binary.
- External output is text until lines, parse or from json.
- An empty list's math sum is an error, not 0: append 0 first.
- Only print and the final value show; echo mid-script is dropped.
- Write files with save; > compares, so ^cmd > file writes nothing.
- save -f over a file you're still reading empties it; let the data first.`;

export const register: Register = (on) => {
  on('session.start', ($, e, next) =>
    $.tool
      .register({
        name: 'nu',
        description,
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The nu script to run' },
            description: {
              type: 'string',
              description: 'What this does, in 5-10 words, active voice',
            },
            timeout: { type: 'number', description: 'Optional timeout in milliseconds (max 600000)' },
          },
          required: ['command'],
          additionalProperties: false,
        },
      })
      .then(() => next(e)),
  );

  // On the terminal the engine draws the call's row as a tool named Nu, with Bash's own dot and wait,
  // rather than under the plugin-name (MCP) label
  on('ui.render', { component: 'ToolUse' }, (_$, e, next) => {
    if (e.props.tool !== tool || e.surface !== 'terminal') return next(e);
    // As Bash's row does, a long script shows its opening and an ellipsis
    const { command = '' } = e.props.input as { command?: string };
    const first = command.split('\n')[0]?.slice(0, 160) ?? '';
    const shown = first.length < command.trimEnd().length ? `${first} …` : first;
    return next({ ...e, props: { ...e.props, tool: 'Nu', input: shown ? { command: shown } : {} } });
  });

  // Listed beside Bash rather than behind ToolSearch
  on('tool.describe', { tool }, async (_$, e, next) => ({ ...(await next(e)), isDeferred: false }));

  on('tool.call', { tool }, async ($, e, next) => {
    // Core asks permission beneath us, then fails the call because no hook answered it: that failure is the
    // go-ahead. Anything else (a refusal, another plugin's answer) stands, so a reworded message fails closed
    const gate = await next(e);
    if (!gate.isError || !gate.text?.includes('no tool.call hook answered')) return gate;

    // The script comes in on stdin as a file nu sources, so its errors point at its own lines; cat makes
    // stdin a pipe, which /dev/stdin can reopen where the engine's own stdin cannot be
    const wrapper = `let r = source /dev/stdin
if ($r | describe) in [string nothing] { $r } else { $r | to nuon }`;
    const timeoutMs = Math.min(Number(e.timeout) || 120_000, 600_000);
    const run = await $.process
      .run(['sh', '-c', 'cat | "$@" 2>&1', 'sh', 'nu', '-n', '-c', wrapper], {
        stdin: String(e.command),
        timeoutMs,
      })
      .catch((err: Error) => err);
    if (run instanceof Error) {
      return {
        result: /still running/.test(run.message) ? `Command timed out after ${timeoutMs} ms` : run.message,
      };
    }

    const out = run.stdout.trimEnd();
    if (run.exitCode) return { result: `Exit code ${run.exitCode}${out && `\n${out}`}` };
    return { result: out || '(nu completed with no output)' };
  });
};
