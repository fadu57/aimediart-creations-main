import { register } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import React from "react";

// tsx en Node : runtime JSX classique pour les fichiers src/*.tsx
globalThis.React = React;

const __dirname = dirname(fileURLToPath(import.meta.url));

register(pathToFileURL(join(__dirname, "prerender-asset-loader.mjs")).href);
