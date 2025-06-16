const { execSync } = require('child_process');

try {
  console.log('--- Running script checks ---');
  execSync('node check_scripts.js', { stdio: 'inherit' });

  console.log('--- Running dataLayer event checks ---');
  execSync('node check_datalayer_events.js', { stdio: 'inherit' });

  console.log('All tests completed.');
} catch (e) {
  process.exit(1);
}
