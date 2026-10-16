import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

type PortablePath = "appData" | "userData" | "sessionData" | "temp" | "crashDumps";
interface PortableApp {
  getPath(name: "exe"): string;
  setPath(name: PortablePath, value: string): void;
  setAppLogsPath(value: string): void;
  commandLine: { appendSwitch(name: string, value: string): void };
}

export function portablePaths(executable: string) {
  const data = join(dirname(executable), "data");
  return {
    data,
    session: join(data, "session"),
    cache: join(data, "cache"),
    temp: join(data, "temp"),
    logs: join(data, "logs"),
    crashes: join(data, "crashes"),
  };
}

/** Must run synchronously before app.ready or the first utility process. */
export function configurePortableStorage(
  app: PortableApp,
  environment: NodeJS.ProcessEnv = process.env,
  changeDirectory: (directory: string) => void = directory => process.chdir(directory),
) {
  const paths = portablePaths(app.getPath("exe"));
  for (const directory of Object.values(paths)) mkdirSync(directory, { recursive: true });
  // Fail clearly on a read-only location; never fall back to the Windows profile.
  const probe = join(paths.data, `.write-check-${process.pid}`);
  const descriptor = openSync(probe, "wx");
  closeSync(descriptor);
  unlinkSync(probe);

  app.setPath("appData", paths.data);
  app.setPath("userData", paths.data);
  app.setPath("sessionData", paths.session);
  app.setPath("temp", paths.temp);
  app.setPath("crashDumps", paths.crashes);
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch("user-data-dir", paths.data);
  app.commandLine.appendSwitch("disk-cache-dir", paths.cache);
  app.commandLine.appendSwitch("log-file", join(paths.logs, "electron.log"));

  // The API SDK uses os.tmpdir() for anonymous tokens and service keys.
  // Child processes inherit these variables before loading the third-party SDK.
  environment.TEMP = environment.TMP = environment.TMPDIR = paths.temp;
  changeDirectory(paths.data);
  return paths;
}
