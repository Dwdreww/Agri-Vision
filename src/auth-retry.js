// Retry transient transport failures only; credential errors return immediately.
export async function retryAuthConnection(operation, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (error?.code !== 'auth/network-request-failed' || attempt === 2) throw error;
      await wait(500 * (attempt + 1));
    }
  }
}
