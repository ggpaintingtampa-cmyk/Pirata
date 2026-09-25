// Chunk B owns this file: CSV exports (Excel-compatible UTF-8 with BOM, CRLF, attachment disposition).
// Foundation registers the routes so the paths are final; both return 501 until B implements them.
import type { FastifyInstance } from 'fastify';
import type { Sqlite } from '../db/database.js';
import { notImplemented } from '../core/errors.js';
import { requireSession } from '../auth/sessions.js';
export function registerExports(app:FastifyInstance,{db,now}:{db:Sqlite;now:()=>number}):void {
  // GET /api/v1/export/shifts.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&projectId=
  app.get('/api/v1/export/shifts.csv',async req=>{requireSession(db,req,now());return notImplemented();});
  // GET /api/v1/export/daily-report.csv?date=YYYY-MM-DD
  app.get('/api/v1/export/daily-report.csv',async req=>{requireSession(db,req,now());return notImplemented();});
}
