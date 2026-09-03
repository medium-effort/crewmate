import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { runMigrations } from './migrations.js';

const DB_DIR = '.crewmate';
const DB_FILE = 'crewmate.db';

const dbCache = new Map<string, Database.Database>();

/**
 * Returns all project roots currently held in the database cache.
 *
 * @returns Array of absolute paths to cached project roots.
 */
export function getCachedProjectRoots(): string[] {
  return Array.from(dbCache.keys());
}

/**
 * Finds the canonical project root by locating the .crewmate directory
 *
 * @param startDir The starting directory (defaults to process.cwd())
 * @param searchParents Whether to traverse upwards searching for .crewmate in parent directories (default true)
 */
export function findProjectRoot(
  startDir: string = process.cwd(),
  searchParents: boolean = true
): string {
  if (process.env.CREWMATE_PROJECT_DIR) {
    return resolve(process.env.CREWMATE_PROJECT_DIR);
  }

  const resolvedStart = resolve(startDir);
  if (existsSync(join(resolvedStart, DB_DIR))) {
    return resolvedStart;
  }

  if (!searchParents) {
    return resolvedStart;
  }

  let current = resolvedStart;
  while (true) {
    if (existsSync(join(current, DB_DIR))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolvedStart;
    }
    current = parent;
  }
}

/**
 * Returns a SQLite database connection for the target project directory, initializing it on first call
 */
export function getDb(targetDir?: string): Database.Database {
  const projectRoot = targetDir
    ? findProjectRoot(targetDir, false)
    : findProjectRoot(process.cwd(), true);
  let connection = dbCache.get(projectRoot);

  if (connection) {
    return connection;
  }

  const dbDir = join(projectRoot, DB_DIR);
  mkdirSync(dbDir, { recursive: true });

  const dbPath = join(dbDir, DB_FILE);
  connection = new Database(dbPath);

  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  connection.pragma('busy_timeout = 5000');

  runMigrations(connection);

  dbCache.set(projectRoot, connection);

  return connection;
}

/**
 * Closes all open SQLite database connections in the cache.
 */
export function closeDb(): void {
  for (const [, connection] of dbCache.entries()) {
    try {
      connection.close();
    } catch {
      // already closed
    }
  }
  dbCache.clear();
}

process.on('exit', closeDb);

process.on('SIGTERM', () => {
  closeDb();
  process.exit(143);
});

process.on('SIGINT', () => {
  closeDb();
  process.exit(130);
});
