import {build} from 'esbuild';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(root,'source/private/worker.ts')],outfile:path.join(root,'../pilot-worker.js'),
 bundle:true,format:'iife',platform:'browser',target:'chrome110',legalComments:'external',minify:true,logLevel:'warning'});
await build({entryPoints:[path.join(root,'source/private/engine.ts')],outfile:path.join(root,'source/private/engine-node.mjs'),
 bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'warning'});
await build({entryPoints:[path.join(root,'source/private/upstream/utils/filter.ts')],outfile:path.join(root,'analysis/filter-runtime.mjs'),bundle:true,format:'esm',platform:'node',legalComments:'external',logLevel:'warning'});
console.log('Browser worker, Node test module and standalone replay filter built.');
