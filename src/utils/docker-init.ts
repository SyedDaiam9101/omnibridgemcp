import Docker from 'dockerode';
import fs from 'fs';

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
    // Windows Named Pipe (Docker Desktop)
    // Prefer the Linux engine pipe when Docker Desktop is in "desktop-linux" mode.
    // Fallback to the legacy docker_engine pipe for older installs / Windows engine.
    const linuxEnginePipeFsPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
    const linuxEngineSocketPath = '//./pipe/dockerDesktopLinuxEngine';
    const legacyEngineSocketPath = '//./pipe/docker_engine';

    try {
      if (fs.existsSync(linuxEnginePipeFsPath)) {
        return new Docker({ socketPath: linuxEngineSocketPath });
      }
    } catch {
      // ignore and fallback
    }

    return new Docker({ socketPath: legacyEngineSocketPath });
  } else {
    // Unix Socket (Standard for Linux/macOS/WSL)
    return new Docker({ socketPath: '/var/run/docker.sock' });
  }
}
