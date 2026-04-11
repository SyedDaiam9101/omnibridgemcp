import Docker from 'dockerode';
import { AttestationService } from './attestation-service.js';
import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { Writable } from 'stream';
import tar from 'tar-stream';

export class DockerClient {
  private docker: Docker;
  private attestationService: AttestationService;

  constructor() {
    this.docker = new Docker();
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
      return await container.changes();
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
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['tail', '-f', '/dev/null'],
        Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : [],
        NetworkDisabled: true,
        User: '1000:1000',
        Labels: { 'omnibridge-sandbox': 'true' }, // Helps with reaper/ghost cleanup
        HostConfig: {
          Runtime: 'runsc', // Security Moat: gVisor
          AutoRemove: true,
          Memory: 512 * 1024 * 1024,
          NanoCpus: 1000000000,
        },
      });

      await container.start();
      return container.id;
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
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

    try {
      const exec = await container.exec({
        Cmd: options.command,
        WorkingDir: options.workDir,
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
    const attestationData = {
      containerId,
      image: options.image,
      stdoutHash: this.attestationService.signReceipt(stdout),
      exitCode,
      timestamp: new Date().toISOString(),
    };

    return {
      stdout,
      stderr,
      exitCode,
      attestation: {
        receipt: this.attestationService.signReceipt(attestationData),
        timestamp: attestationData.timestamp,
        imageDigest: options.image // V2: Fetch from container.inspect()
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

    return {
      stdout: '',
      stderr: `Execution Error: ${error.message}`,
      exitCode: 124,
      attestation: { receipt: 'ERROR', timestamp: new Date().toISOString(), imageDigest: options.image },
      suggestions: suggestion
    };
  }
}