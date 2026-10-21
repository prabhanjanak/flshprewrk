module.exports = {
  apps: [
    {
      name: "fellowship-api",
      script: "artifacts/api-server/dist/index.mjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/pm2-api-error.log",
      out_file: "logs/pm2-api-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
