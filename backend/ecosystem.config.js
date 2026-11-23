module.exports = {
  apps: [
    {
      name: 'skillup-chat',
      script: './server.js',
      watch: false,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        JWT_SECRET: 'REPLACE_WITH_A_LONG_RANDOM_SECRET'
      }
    }
  ]
};
