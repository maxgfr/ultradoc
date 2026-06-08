import { parseArgs } from "./dist/src/cli.js";

console.log("Test 1: --semantic (no value)");
const result1 = parseArgs(["ask", "--repo", "x", "--q", "y", "--semantic"]);
console.log("  semantic flag present:", result1.bools.has("semantic"));

console.log("\nTest 2: --semantic=true");
const result2 = parseArgs(["ask", "--repo", "x", "--q", "y", "--semantic=true"]);
console.log("  semantic flag present:", result2.bools.has("semantic"));

console.log("\nTest 3: --semantic=false");
const result3 = parseArgs(["ask", "--repo", "x", "--q", "y", "--semantic=false"]);
console.log("  semantic flag present:", result3.bools.has("semantic"));

console.log("\nTest 4: --json=value (should the value be ignored?)");
const result4 = parseArgs(["ask", "--repo", "x", "--q", "y", "--json=ignored"]);
console.log("  json flag present:", result4.bools.has("json"));
console.log("  values obj:", result4.values);
