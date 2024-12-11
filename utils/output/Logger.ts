export class Logger {
  public static log(message: string): void {
    const timestamp: string = new Date().toISOString();
    const logEntry: string = `${timestamp}: ${message}\n`;
    console.log(logEntry);
  }
}
