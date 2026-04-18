/**
 * Safe wrapper for prisma generate.
 * On Windows, the Prisma query engine DLL can be locked by a running dev server.
 * In that case, the existing client is still valid — we skip and continue.
 */
import { execSync } from 'child_process';

try {
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch {
  console.warn('[build] prisma generate skipped (engine DLL may be locked by dev process)');
}
