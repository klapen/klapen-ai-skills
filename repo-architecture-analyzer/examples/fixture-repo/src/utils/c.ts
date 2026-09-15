export function helperValue(): number {
  return 42;
}

export class Helper {
  private value = 0;

  add(n: number): number {
    this.value += n;
    return this.value;
  }
}
