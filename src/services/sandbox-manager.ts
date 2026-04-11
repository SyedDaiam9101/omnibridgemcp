import { DockerExecutionOptions, DockerExecutionResult } from '../schemas/docker-schema.js';
import { DockerClient } from './docker-client.js';

/**
 * 10x Refinement: SandboxManager handles high-level container lifecycle 
 * delegating the execution logic to the hardened DockerClient.
 */
export class SandboxManager {
  private dockerClient: DockerClient;

  constructor() {
    this.dockerClient = new DockerClient();
  }

  public async run(options: DockerExecutionOptions): Promise<DockerExecutionResult> {
    return this.dockerClient.executeTask(options);
  }
}