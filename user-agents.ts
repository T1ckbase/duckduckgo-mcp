type DeviceDescriptorsSource = Record<string, { userAgent: string }>;

const res = await fetch(
  'https://raw.githubusercontent.com/microsoft/playwright/refs/heads/main/packages/playwright-core/src/server/deviceDescriptorsSource.json',
);

if (!res.ok) throw new Error(`Failed to fetch device descriptors: ${res.status}`);
const devices = (await res.json()) as DeviceDescriptorsSource;
const userAgents = Object.values(devices).map((device) => device.userAgent);

export function getUserAgents() {
  return userAgents;
}
