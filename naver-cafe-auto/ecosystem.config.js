module.exports = {
  apps: [
    {
      name: "cafe-macro-python",
      script: "/opt/dailyfni-cafe/venv/bin/uvicorn",
      args: "main:app --host 0.0.0.0 --port 8002",
      cwd: "/opt/dailyfni-cafe/backend",
      interpreter: "none",
      env: {
        PORT: "8002",
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
