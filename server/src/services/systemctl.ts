import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ServiceInfo, ServiceVerb } from '@usw/shared';
import { config } from '../config';
import { AppError } from '../lib/errors';

const run = promisify(execFile);
const EXEC_OPTS = { timeout: 15_000, maxBuffer: 10 * 1024 * 1024 };

const VERBS: ReadonlySet<string> = new Set(['start', 'stop', 'restart']);
// systemd unit names: letters, digits, and :-_.\@ — never spaces or slashes.
// Must start alphanumeric so it can't be mistaken for a CLI flag.
const UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9:_.@\\-]*\.service$/;

export function isValidVerb(v: string): v is ServiceVerb {
  return VERBS.has(v);
}

export function isValidUnit(unit: string): boolean {
  return unit.length <= 256 && !unit.startsWith('-') && UNIT_RE.test(unit);
}

interface ListUnitsRow {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

interface UnitFileRow {
  unit_file: string;
  state: string;
}

export async function listServices(): Promise<ServiceInfo[]> {
  const [unitsOut, filesOut] = await Promise.all([
    run('systemctl', ['list-units', '--type=service', '--all', '--output=json', '--no-pager'], EXEC_OPTS),
    run('systemctl', ['list-unit-files', '--type=service', '--output=json', '--no-pager'], EXEC_OPTS),
  ]);
  const units = JSON.parse(unitsOut.stdout) as ListUnitsRow[];
  const files = JSON.parse(filesOut.stdout) as UnitFileRow[];
  const enabledByUnit = new Map(files.map((f) => [f.unit_file, f.state]));
  return units.map((u) => ({
    unit: u.unit,
    description: u.description,
    load: u.load,
    active: u.active,
    sub: u.sub,
    enabled: enabledByUnit.get(u.unit) ?? null,
  }));
}

export interface VerbResult {
  unit: string;
  active: string;
  sub: string;
}

export async function runServiceVerb(unit: string, verb: string): Promise<VerbResult> {
  if (!isValidVerb(verb)) throw new AppError(400, `invalid verb: must be one of ${[...VERBS].join(', ')}`);
  if (!isValidUnit(unit)) throw new AppError(400, 'invalid unit name');
  if (unit === config.ownUnit && verb !== 'start') {
    throw new AppError(400, `refusing to ${verb} the web UI's own service — use SSH for that`);
  }

  try {
    await run('systemctl', [verb, unit], EXEC_OPTS);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new AppError(500, stderr || `systemctl ${verb} ${unit} failed`);
  }

  const show = await run('systemctl', ['show', unit, '-p', 'ActiveState,SubState', '--no-pager'], EXEC_OPTS);
  const props = new Map(
    show.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq), line.slice(eq + 1)] as const;
      }),
  );
  return {
    unit,
    active: props.get('ActiveState') ?? 'unknown',
    sub: props.get('SubState') ?? 'unknown',
  };
}
