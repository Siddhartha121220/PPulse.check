const { execSync } = require('child_process');
try {
  const output = execSync('git status', { encoding: 'utf-8' });
  console.log(output);
} catch (error) {
  console.error('Error executing git status:', error.message);
  if (error.stdout) console.log('Stdout:', error.stdout);
  if (error.stderr) console.error('Stderr:', error.stderr);
}
