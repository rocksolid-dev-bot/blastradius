import { join } from "node:path";
import leftPad, { pad, trim } from "left-pad";
import { helper } from "./helper";

export const x = leftPad(pad(trim(helper()), 4)) + join("a", "b");
