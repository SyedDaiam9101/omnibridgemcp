import Docker from 'dockerode';

/**
 * 10x Refinement: Centralized Docker initialization. 
 * Automatically detects OS and provides standard defaults, 
 * while allowing override via .env.
 */
export function createDockerInstance(): Docker {
  const socketPath = process.env.DOCKER_SOCKET_PATH;
  
  if (socketPath) {
    return new Docker({ socketPath });
  }

  // Default behavior based on Platform
  if (process.platform === 'win32') {
    // Windows Named Pipe (Standard for Docker Desktop)
    return new Docker({ socketPath: '//./pipe/docker_engine' });
  } else {
    // Unix Socket (Standard for Linux/macOS/WSL)
    return new Docker({ socketPath: '/var/run/docker.sock' });
  }
}
