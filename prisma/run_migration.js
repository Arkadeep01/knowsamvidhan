const { execSync } = require('child_process');
try {
  const result = execSync('cd D:\knowsamvidhan && npx prisma migrate dev init_evaluation', { stdio: 'pipe' });
  console.log(result.stdout);
  console.log(result.stderr);
} catch (e) {
  console.error('Error:', e.stdout, e.stderr);
}