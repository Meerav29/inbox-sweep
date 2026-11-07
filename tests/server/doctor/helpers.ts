import type { Probes } from '../../../server/doctor/checks';

/** Every probe passes unless overridden. */
export function fakeProbes(overrides: Partial<Probes> = {}): Probes {
  return {
    nodeVersion: () => '22.12.0',
    depsInstalled: () => true,
    envFile: () => ({ exists: true, ignored: true }),
    typesafe: async () => {},
    anthropic: async () => {},
    gmailProfile: async () => 'me@gmail.com',
    enabledFolderCount: () => 2,
    ...overrides,
  };
}
