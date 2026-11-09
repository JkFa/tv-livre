import type Worker from '../src/index.ts';
import type { Env as EnvSala } from '../src/sala.ts';

declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends EnvSala {}
    interface GlobalProps {
      mainModule: typeof import('../src/index.ts');
    }
  }
}
export type { Worker };
