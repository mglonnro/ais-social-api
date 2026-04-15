module.exports = {
  apps: [
    {
      name: "ais-social-api.beta",
      script: "server.js",

      // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
      args: "one two",
      instances: 1,
      interpreter: "node@14.15.1",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        PORT: 3103,
        GOOGLE_APPLICATION_CREDENTIALS: "/home/mikael/keys/ais-social-service-account.json",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3103,
        GOOGLE_APPLICATION_CREDENTIALS: "/home/mikael/keys/ais-social-service-account.json",
      },
    },
  ]
}
