import pkg from './package.json' with { type: 'json' };

type DeviceDescriptorsSource = Record<string, { userAgent: string }>;

const res = await fetch(
  'https://raw.githubusercontent.com/microsoft/playwright/refs/heads/main/packages/playwright-core/src/server/deviceDescriptorsSource.json',
);

if (!res.ok) throw new Error(`Failed to fetch device descriptors: ${res.status}`);
const devices = (await res.json()) as DeviceDescriptorsSource;
const userAgents = Object.values(devices).map((device) => device.userAgent);
if (!userAgents.length) throw new Error('No user agents found in device descriptors');

export function getUserAgents() {
  return userAgents;
}

export function getVersion() {
  return pkg.version;
}
