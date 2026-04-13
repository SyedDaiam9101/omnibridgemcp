import { createDockerInstance } from '../utils/docker-init.js';
import Docker from 'dockerode';
import { AttestationService } from './attestation-service.js';
import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { Writable } from 'stream';
import tar from 'tar-stream';
import { createHash } from 'crypto';

export class DockerClient {
  private docker: Docker;
  private attestationService: AttestationService;

  constructor() {
    this.docker = createDockerInstance();
    this.attestationService = new AttestationService();
  }

  /**
   * 10x Move: Provision files via tar streams to avoid path-escaping bugs.
   */
  public async writeFile(containerId: string, filePath: string, content: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const pack = tar.pack();
    
    // Ensure we are working with Linux-style paths inside the container
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop() || 'file';
    const dirName = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '/workspace';

    pack.entry({ name: fileName }, content);
    pack.finalize();

    try {
      await container.putArchive(pack, { path: dirName });
    } catch (error: any) {
      throw new Error(`Failed to write file to ${filePath}: ${error.message}`);
    }
  }

  /**
   * 10x Move: Get filesystem changes for audit/diffing.
   */
  public async getChanges(containerId: string) {
    const container = this.docker.getContainer(containerId);
    try {
      const result: any = await container.changes();

      // Some Dockerode/daemon combos can return raw buffers/strings; normalize.
      if (Buffer.isBuffer(result)) {
        const text = result.toString('utf8').trim();
        if (text === '' || text === 'null') return [];
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }

      if (typeof result === 'string') {
        const text = result.trim();
        if (text === '' || text === 'null') return [];
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }

      return result ?? [];
    } catch (error: any) {
      throw new Error(`Failed to fetch container changes: ${error.message}`);
    }
  }

  /**
   * 10x Refinement: Creates a long-running, hardened sandbox container.
   * We use 'tail -f /dev/null' to keep it alive while we exec commands into it.
   */
  public async createSandbox(image: string, env?: Record<string, string>): Promise<string> {
    try {
      // 10x Refinement: Respect .env resource limits
      const memoryLimitStr = process.env.CONTAINER_MEMORY_LIMIT || '512m';
      const cpuLimit = parseFloat(process.env.CONTAINER_CPU_LIMIT || '1.0');

      // 10x Move: Auto-pull missing images
      const images = await this.docker.listImages();
      const hasImage = images.some(i => i.RepoTags?.includes(image));
      
      if (!hasImage) {
        console.error(`[Docker] Image ${image} not found. Pulling...`);
        // Note: docker.pull returns a stream that we need to drain
        const stream = await this.docker.pull(image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
        });
        console.error(`[Docker] Successfully pulled ${image}`);
      }

      // Simple memory parser: assumes bytes if no suffix, or handles 'm' for megabytes
      let memoryBytes = 512 * 1024 * 1024;
      if (memoryLimitStr.endsWith('m')) {
        memoryBytes = parseInt(memoryLimitStr) * 1024 * 1024;
      } else if (memoryLimitStr.endsWith('g')) {
        memoryBytes = parseInt(memoryLimitStr) * 1024 * 1024 * 1024;
      } else {
        memoryBytes = parseInt(memoryLimitStr);
      }

      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['sh', '-lc', 'mkdir -p /workspace && chmod 777 /workspace && tail -f /dev/null'],
        WorkingDir: '/workspace',
        Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : [],
        NetworkDisabled: true,
        Labels: { 'omnibridge-sandbox': 'true' },
        HostConfig: {
          Runtime: process.env.DOCKER_RUNTIME || 'runsc', // Default to runsc for prod security
          AutoRemove: true,
          Memory: memoryBytes,
          NanoCpus: cpuLimit * 1000000000,
        },
      });

      await container.start();
      return container.id;
    } catch (error: any) {
      const raw = String(error?.message || error);
      const hints: string[] = [];

      if (raw.includes('permission denied while trying to connect')) {
        hints.push('Docker Desktop is running but this user cannot access the Docker named pipe (add your Windows user to the docker-users group, then log out/in).');
      }

      // Docker Desktop can expose multiple pipes; some setups need the Linux engine pipe explicitly.
      if (process.platform === 'win32') {
        hints.push('On Windows/Docker Desktop, try setting DOCKER_SOCKET_PATH=//./pipe/dockerDesktopLinuxEngine in your MCP server env and restart Claude Desktop.');
      }

      const suffix = hints.length ? ` Suggestion: ${hints.join(' ')}` : '';
      throw new Error(`Failed to create sandbox: ${raw}.${suffix}`);
    }
  }

  /**
   * Executes a command inside an existing sandbox.
   * Every execution is wrapped in an attestation receipt.
   */
  public async execInSandbox(containerId: string, options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    const container = this.docker.getContainer(containerId);
    let stdout = '';
    let stderr = '';
    let exitCode = -1;
    const image = options.image || 'UNKNOWN';

    try {
      const exec = await container.exec({
        Cmd: options.command,
        WorkingDir: options.workDir,
        User: '1000:1000',
        Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});

      // Capture logs
      const streamProcessing = new Promise((resolve) => {
        const stdoutStream = new Writable({
          write(chunk, _, callback) {
            stdout += chunk.toString('utf8');
            callback();
          }
        });
        const stderrStream = new Writable({
          write(chunk, _, callback) {
            stderr += chunk.toString('utf8');
            callback();
          }
        });

        this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);
        stream.on('end', resolve);
      });

      await streamProcessing;

      const inspect = await exec.inspect();
      exitCode = inspect.ExitCode ?? -1;

    } catch (error: any) {
      return this.handleError(error, options);
    }

    // Sign Attestation
    const attestationReceipt = {
      containerId,
      image,
      stdoutHash: createHash('sha256').update(stdout).digest('hex'),
      exitCode,
      timestamp: new Date().toISOString(),
    };

    return {
      stdout,
      stderr,
      exitCode,
      attestation: {
        receipt: attestationReceipt,
        signature: this.attestationService.signReceipt(attestationReceipt),
        timestamp: attestationReceipt.timestamp,
        imageDigest: image // V2: Fetch from container.inspect()
      }
    } as any;
  }

  public async stopSandbox(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop().catch(() => {});
      await container.remove({ force: true }).catch(() => {});
    } catch (error) {}
  }

  private handleError(error: any, options: DockerExecutionOptions): DockerExecutionResult {
    let suggestion = "Verify syntax and available binaries.";

    if (error.message.includes('runtime "runsc" not found')) {
      suggestion = "gVisor (runsc) is not installed on the host. Run 'scripts/install-gvisor.sh'.";
    }

    const image = options.image || 'UNKNOWN';
    const timestamp = new Date().toISOString();
    return {
      stdout: '',
      stderr: `Execution Error: ${error.message}`,
      exitCode: 124,
      attestation: {
        receipt: {
          containerId: 'UNKNOWN',
          image,
          stdoutHash: '',
          exitCode: 124,
          timestamp,
        },
        signature: 'ERROR',
        timestamp,
        imageDigest: image,
      },
      suggestions: suggestion
    };
  }
}
