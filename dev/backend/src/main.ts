// Process entrypoint — the only side effect that starts the server, so
// server.ts stays importable in tests without binding a port.
import { start } from './server.js';

start();
