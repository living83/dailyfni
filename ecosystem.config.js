module.exports = {
  apps: [
    {
      name: 'blog-macro',
      script: 'src/index.js',
      cwd: '/opt/dailyfni-blog',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        PYTHON_API_URL: 'http://localhost:8001',
      },
      max_memory_restart: '500M',
      restart_delay: 5000,
    },
    {
      name: 'blog-macro-python',
      script: '/opt/dailyfni-blog/blog-generator/venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8001',
      cwd: '/opt/dailyfni-blog/blog-generator/backend',
      interpreter: 'none',
      env: {
        VIRTUAL_ENV: '/opt/dailyfni-blog/blog-generator/venv',
        PATH: '/opt/dailyfni-blog/blog-generator/venv/bin:/usr/bin:/bin',
        PYTHON_API_PORT: '8001',
      },
      max_memory_restart: '1G',
      restart_delay: 5000,
    },
  ],
};
