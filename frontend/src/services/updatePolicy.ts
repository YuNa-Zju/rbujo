export function shouldCheckForUpdates(runningInTauri: boolean, production: boolean) {
  return runningInTauri && production;
}
