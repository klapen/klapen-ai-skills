import { helperValue } from "./utils/c";
import { bFunction } from "./b";

export class AService {
  run(): number {
    return helperValue() + bFunction();
  }
}
