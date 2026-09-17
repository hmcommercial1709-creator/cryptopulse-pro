module.exports = {
  apps: [
    {
      name: 'cryptopulse-bot',
      script: './dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cryptopulse-automation',
      script: './dist/automation/production-worker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' }
    }
  ]
};
