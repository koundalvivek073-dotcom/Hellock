/**
 * Verifies the storage layer under BOTH transports.
 *
 * Run twice:
 *   node scripts/smoke-storage.mjs                -> HTTP micro-node sockets
 *   HELLOCK_SERVERLESS=true node scripts/smoke-storage.mjs -> in-process
 */
import { runtimeLabel } from '../services/runtime.js';
import { storageRuntimeInfo, pingNode, uploadToNode, readFromNode, listNodeFiles, corruptNodeFile, getNodeUsage, setSimulatedFailure } from '../services/nodeStorageService.js';
import { getMetadata, setFileMetadata, getAllFilesMetadata, updateNodeStatus } from '../services/metadataService.js';
import { metaStoreInfo } from '../services/metadataStore.js';
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' - ' + extra : ''}`);
  if (!ok) failures += 1;
};

const info = storageRuntimeInfo();
const meta = metaStoreInfo();
console.log(`\n=== runtime=${runtimeLabel()} transport=${info.transport} blobStore=${info.blobStore.kind} metaStore=${meta.kind} ===\n`);

const fileId = `smoke-${Date.now()}`;
const payload = Buffer.from('Hellock replication smoke test payload');

// 1. pings
for (const id of ['nodeA', 'nodeB', 'nodeC', 'nodeD']) {
  check(`ping ${id}`, await pingNode(id));
}

// 2. write quorum path: replicate to 3 nodes
const written = [];
for (const id of ['nodeA', 'nodeB', 'nodeC']) {
  try {
    const r = await uploadToNode(id, fileId, payload);
    written.push(id);
    check(`write ${id} (${r.provider})`, r.bytesWritten === payload.length);
  } catch (e) {
    check(`write ${id}`, false, e.message);
  }
}
check('quorum W=2 satisfied', written.length >= 2, `${written.length}/3`);

// 3. read back from every node that has it
for (const id of written) {
  try {
    const data = await readFromNode(id, fileId);
    check(`read ${id}`, data.toString() === payload.toString());
  } catch (e) {
    check(`read ${id}`, false, e.message);
  }
}

// 4. listing + usage (nodeA holds a copy; nodeD is the idle standby)
{
  const files = await listNodeFiles('nodeA');
  const usage = await getNodeUsage('nodeA');
  check('list nodeA contains file', files.includes(fileId), `${files.length} files, ${usage.bytes} bytes`);
  check('usage reports bytes', usage.bytes >= payload.length, `${usage.bytes} bytes`);
  const standby = await getNodeUsage('nodeD');
  check('standby nodeD reports usage', typeof standby.files === 'number' && typeof standby.bytes === 'number', `${standby.files} files`);
}

// 5. metadata durability round-trip
await setFileMetadata(fileId, { filename: 'smoke.txt', size: payload.length, owner: 'smoke@test.local', replicas: { nodeA: { status: 'synced', version: 1 } } });
const fetched = (await getAllFilesMetadata()).find(f => f.fileId === fileId);
check('metadata round-trip', Boolean(fetched) && fetched.filename === 'smoke.txt');
check('metadata survives re-read', (await getMetadata()).files[fileId] !== undefined);

// 6. simulated failure -> node is genuinely unreachable
setSimulatedFailure('nodeA', true);
const failedPing = await pingNode('nodeA');
let writeBlocked = false;
try { await uploadToNode('nodeA', `${fileId}-x`, payload); } catch (e) { writeBlocked = true; }
check('simulated failure blocks ping', failedPing === false);
check('simulated failure blocks write', writeBlocked);
setSimulatedFailure('nodeA', false);
check('recovers after clearing failure', await pingNode('nodeA'));

// 7. bit rot (on a node that holds a copy)
try {
  await corruptNodeFile('nodeA', fileId);
  const bad = await readFromNode('nodeA', fileId);
  check('bit rot alters bytes', bad.toString() !== payload.toString());
} catch (e) {
  check('bit rot', false, e.message);
}

await updateNodeStatus('nodeA', { lastPing: new Date().toISOString() });

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
