/**
 * Both bundlers (Turbopack and Next's webpack CSS loader) want plugins as names or paths with an options object,
 * never plugin objects. The OpenUI stylesheet trim lives in src/widgets/openui-stubs/trim-openui.cjs and is listed
 * by path.
 */
import { fileURLToPath } from "node:url";

const trim = fileURLToPath(new URL("./src/widgets/openui-stubs/trim-openui.cjs", import.meta.url));

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    [trim]: {},
  },
};

export default config;
