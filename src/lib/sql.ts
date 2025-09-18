import Database from 'better-sqlite3';
import { logger } from '../logger';

export interface E2EJob {
  id: string;
  srcTxHash?: string;
  destTxHash?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  step: string;
  createdAt: number;
  updatedAt: number;
  metadata?: string; // JSON string for additional data
}

export class E2EDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables() {
    const createJobsTable = `
      CREATE TABLE IF NOT EXISTS e2e_jobs (
        id TEXT PRIMARY KEY,
        srcTxHash TEXT,
        destTxHash TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
        step TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        metadata TEXT
      )
    `;

    this.db.exec(createJobsTable);
    logger.info('E2E database tables initialized');
  }

  createJob(job: Omit<E2EJob, 'createdAt' | 'updatedAt'>): E2EJob {
    const now = Date.now();
    const fullJob: E2EJob = {
      ...job,
      createdAt: now,
      updatedAt: now,
    };

    const insert = this.db.prepare(`
      INSERT INTO e2e_jobs (id, srcTxHash, destTxHash, status, step, createdAt, updatedAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      fullJob.id,
      fullJob.srcTxHash || null,
      fullJob.destTxHash || null,
      fullJob.status,
      fullJob.step,
      fullJob.createdAt,
      fullJob.updatedAt,
      fullJob.metadata || null
    );

    logger.info(`Created E2E job: ${job.id} (${job.step})`);
    return fullJob;
  }

  updateJob(id: string, updates: Partial<Pick<E2EJob, 'srcTxHash' | 'destTxHash' | 'status' | 'step' | 'metadata'>>): void {
    const updateFields = Object.keys(updates)
      .filter(key => updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`)
      .join(', ');

    if (updateFields.length === 0) return;

    const values = Object.values(updates).filter(v => v !== undefined);
    values.push(Date.now(), id); // updatedAt, id

    const update = this.db.prepare(`
      UPDATE e2e_jobs 
      SET ${updateFields}, updatedAt = ?
      WHERE id = ?
    `);

    const result = update.run(...values);
    
    if (result.changes === 0) {
      throw new Error(`Job ${id} not found`);
    }

    logger.info(`Updated E2E job: ${id}`, updates);
  }

  getJob(id: string): E2EJob | null {
    const select = this.db.prepare('SELECT * FROM e2e_jobs WHERE id = ?');
    const row = select.get(id) as any;
    
    if (!row) return null;

    return {
      id: row.id,
      srcTxHash: row.srcTxHash,
      destTxHash: row.destTxHash,
      status: row.status,
      step: row.step,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
    };
  }

  getJobsByStatus(status: E2EJob['status']): E2EJob[] {
    const select = this.db.prepare('SELECT * FROM e2e_jobs WHERE status = ? ORDER BY createdAt DESC');
    const rows = select.all(status) as any[];

    return rows.map(row => ({
      id: row.id,
      srcTxHash: row.srcTxHash,
      destTxHash: row.destTxHash,
      status: row.status,
      step: row.step,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
    }));
  }

  getAllJobs(): E2EJob[] {
    const select = this.db.prepare('SELECT * FROM e2e_jobs ORDER BY createdAt DESC');
    const rows = select.all() as any[];

    return rows.map(row => ({
      id: row.id,
      srcTxHash: row.srcTxHash,
      destTxHash: row.destTxHash,
      status: row.status,
      step: row.step,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
    }));
  }

  close(): void {
    this.db.close();
    logger.info('E2E database connection closed');
  }
}

// Singleton instance
let dbInstance: E2EDatabase | null = null;

export function getE2EDatabase(): E2EDatabase {
  if (!dbInstance) {
    const dbPath = process.env.SQLITE_PATH || './data/e2e.db';
    dbInstance = new E2EDatabase(dbPath);
  }
  return dbInstance;
}

export function closeE2EDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
