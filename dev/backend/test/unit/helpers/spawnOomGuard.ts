const OOM_BANNER = /<--- Last few GCs --->/;

/**
 * A spawned child that dies from V8 out-of-memory prints the GC banner instead
 * of the assertions under test (O-22). Failing here with an explicit message
 * keeps that failure mode from masquerading as a regex mismatch on the real
 * assertion.
 */
export function assertNotOom(...outputs: Array<string | null | undefined>): void {
  for (const output of outputs) {
    if (output && OOM_BANNER.test(output)) {
      throw new Error(
        `spawned child process crashed with a V8 out-of-memory error (not a behavioural failure):\n${output}`,
      );
    }
  }
}
