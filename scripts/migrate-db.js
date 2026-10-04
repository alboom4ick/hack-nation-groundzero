// node --env-file=.env scripts/migrate-db.js  (creates the action-tree tables; safe to re-run)
import { migrateVideos } from '../lib/videos.js';
import { migrate } from '../lib/trees-db.js';
await migrate();
await migrateVideos();
console.log('action-tree tables ready');
process.exit(0);
