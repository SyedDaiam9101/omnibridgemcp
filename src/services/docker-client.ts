import Docker from 'dockerode';
import { AttestationService } from './attestation-service.js';
import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { Writable } from 'stream';

export class DockerClient {
  private docker: Docker;
  private attestationService: AttestationService;

  constructor() {
    this.docker = new Docker();
    this.attestationService = new AttestationService();
  }

  public async executeTask(options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    let container: Docker.Container | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let stdout = '';
    let stderr = '';
    let exitCode = -1;

    try {
      container = await this.docker.createContainer({
        Image: options.image,
        Cmd: options.command,
        Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : [],
        NetworkDisabled: true,
        User: '1000:1000',
        HostConfig: {
          Runtime: 'runsc', // Keep this! It's our security moat.
          AutoRemove: true,
          Memory: 512 * 1024 * 1024, // 10x Move: Add resource limits
          NanoCpus: 1000000000,      // Limit to 1 CPU
        },
      });

      const stream = await container.attach({ stream: true, stdout: true, stderr: true });

      // 10x Move: Wrap demux in a Promise to ensure we capture EVERY byte
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

        container!.modem.demuxStream(stream, stdoutStream, stderrStream);
        stream.on('end', resolve);
      });

      await container.start();

      // Enforce Timeout logic
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(async () => {
          try { await container?.kill(); } catch (e) { }
          reject(new Error(`Execution timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs);
      });

      // Wait for both completion AND stream end
      const [waitResult] = await Promise.race([
        Promise.all([container.wait(), streamProcessing]),
        timeoutPromise
      ]);

      exitCode = (waitResult as any).StatusCode;

    } catch (error: any) {
      return this.handleError(error, options);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    // 10x Move: Sign an immutable 'Attestation Object'
    const attestationData = {
      image: options.image,
      stdoutHash: this.attestationService.signReceipt(stdout), // Hash large logs
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
        imageDigest: options.image // In V2, pull the real SHA from inspect()
      }
    } as any;
  }

  private handleError(error: any, options: DockerExecutionOptions): DockerExecutionResult {
    let suggestion = "Verify syntax and available binaries.";

    if (error.message.includes('runtime "runsc" not found')) {
      suggestion = "gVisor (runsc) is not installed on the host. Run 'scripts/install-gvisor.sh'.";
    } else if (error.message.includes('timed out')) {
      suggestion = "Command timed out. Try increasing timeoutMs.";
    }

    return {
      stdout: '',
      stderr: `System Error: ${error.message}`,
      exitCode: 124,
      attestation: { receipt: 'ERROR', timestamp: new Date().toISOString(), imageDigest: options.image },
      suggestions: suggestion
    };
  }
}