import { helperValue } from "./utils/c";
import { AService } from "./a";

export function bFunction(): number {
  if (helperValue() > 0) {
    return new AService().run();
  }
  return 0;
}
