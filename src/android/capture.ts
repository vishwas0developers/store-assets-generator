import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface AndroidCaptureOptions {
  deviceId?: string;
  outputDir: string;
}

export class AndroidCaptureBackend {
  /**
   * Run adb command synchronously
   */
  private runAdb(args: string, deviceId?: string): string {
    const prefix = deviceId ? `adb -s ${deviceId} ` : "adb ";
    try {
      return execSync(`${prefix}${args}`, { encoding: "utf-8" }).trim();
    } catch (err) {
      throw new Error(`ADB command failed: adb ${args}. Error: ${(err as Error).message}`);
    }
  }

  async listDevices(): Promise<string[]> {
    try {
      const output = execSync("adb devices", { encoding: "utf-8" });
      return output
        .split("\n")
        .slice(1)
        .map(line => line.trim().split("\t")[0]?.trim())
        .filter((id): id is string => Boolean(id) && id !== "*" && !id.startsWith("*"));
    } catch {
      return [];
    }
  }

  async captureScreen(filename: string, options: AndroidCaptureOptions): Promise<string> {
    const devices = await this.listDevices();
    if (devices.length === 0) {
      throw new Error("No Android devices or emulators found via ADB");
    }

    const deviceId = options.deviceId ?? devices[0];
    const remoteTmpPath = `/data/local/tmp/${filename}`;
    const localPath = path.join(options.outputDir, filename);

    fs.mkdirSync(options.outputDir, { recursive: true });

    // Capture screen on device
    this.runAdb(`shell screencap -p ${remoteTmpPath}`, deviceId);
    
    // Pull file to local output path
    this.runAdb(`pull ${remoteTmpPath} "${localPath}"`, deviceId);
    
    // Clean up remote device temp file
    this.runAdb(`shell rm ${remoteTmpPath}`, deviceId);

    return localPath;
  }

  async launchDeepLink(url: string, deviceId?: string) {
    // Attempt deep linking navigation
    this.runAdb(`shell am start -a android.intent.action.VIEW -d "${url}"`, deviceId);
  }
}
