/**
 * Lets the acceptance suite import the app's own modules by their "@/" alias,
 * so the checks run against exactly the code that ships rather than a copy.
 * `next/cache` is stubbed because the config loader wraps its reads in
 * unstable_cache, which needs a Next request context that a plain node run
 * does not have.
 */
import { pathToFileURL } from "node:url";

const ROOT = process.env.PROJECT_ROOT;
const CACHE_STUB = new URL("./next-cache-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "next/cache") return { url: CACHE_STUB, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    return { url: pathToFileURL(`${ROOT}/${specifier.slice(2)}.ts`).href, shortCircuit: true };
  }
  return next(specifier, context);
}
