// Local server: `npm start`. On Vercel, api/index.js serves the same handler.
import { createServer } from 'node:http';
import { handler } from './lib/app.js';

createServer(handler).listen(process.env.PORT ?? 3000, () => console.log('http://localhost:' + (process.env.PORT ?? 3000)));
