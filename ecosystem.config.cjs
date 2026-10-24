/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "pipeline",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "280M",
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: 3000,
        PIPELINE_DATA_DIR: ".data",
        // This 512MB instance already runs the Spanwrap API. Keep Node in RAM
        // and let the 2GB swap cover short spikes.
        NODE_OPTIONS: "--max-old-space-size=256",
      },
    },
  ],
};
