import { register } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import React from "react";

// tsx en Node : runtime JSX classique pour les fichiers src/*.tsx
globalThis.React = React;
// react-router-dom <Link> : évite les warnings useLayoutEffect au prerender SSG
React.useLayoutEffect = React.useEffect;

const __dirname = dirname(fileURLToPath(import.meta.url));

register(pathToFileURL(join(__dirname, "prerender-asset-loader.mjs")).href);
