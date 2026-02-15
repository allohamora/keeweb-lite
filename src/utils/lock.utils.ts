export class Lock {
  constructor(private name: string) {}

  public async runInLock<Result>(fn: () => Result | Promise<Result>): Promise<Result> {
    return navigator.locks.request(this.name, async () => fn());
  }
}
