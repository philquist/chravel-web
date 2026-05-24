import fs from 'fs';
import { execSync } from 'child_process';

const frontend = fs.readFileSync('src/types/permissionMatrix.generated.ts', 'utf8');
const backend = fs.readFileSync('supabase/functions/_shared/permissionMatrix.generated.ts', 'utf8');
if (frontend !== backend) {
  console.error('Permission matrix drift: frontend/backend generated files differ.');
  process.exit(1);
}
execSync('node scripts/generate-permission-matrix.mjs', { stdio: 'ignore' });
const frontend2 = fs.readFileSync('src/types/permissionMatrix.generated.ts', 'utf8');
const backend2 = fs.readFileSync('supabase/functions/_shared/permissionMatrix.generated.ts', 'utf8');
if (frontend !== frontend2 || backend !== backend2) {
  console.error('Permission matrix drift: generated files are stale. Run node scripts/generate-permission-matrix.mjs');
  process.exit(1);
}
console.log('Permission matrix drift check passed.');
