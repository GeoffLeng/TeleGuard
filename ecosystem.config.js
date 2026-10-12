module.exports = {
  apps: [
    {
      name: "teleguard-bot",
      script: "dist/bot.js",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      restart_delay: 3000,
      autorestart: true,
    },
  ],
};
