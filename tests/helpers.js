import assert from "node:assert/strict";
import { run as runMotor, qAngle } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const golden = () => JSON.parse(fs.readFileSync(path.join(here, "../oracle/golden.json"), "utf8"));
export const near = (a,b,t,msg="") => assert.ok(Math.abs(a-b) <= t*Math.max(1,Math.abs(b)), `${msg}: ${a} vs ${b} (tol ${t})`);
export const nearVec = (a,b,t,msg="") => { assert.equal(a.length,b.length,`${msg}: length`); a.forEach((x,i)=>Array.isArray(x) ? nearVec(x,b[i],t,`${msg}[${i}]`) : near(x,b[i],t,`${msg}[${i}]`)); };
export const run = (opts) => runMotor(opts);
export { qAngle };
export const FLIP = -Math.PI/2;
