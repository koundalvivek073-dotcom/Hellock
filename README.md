# 🛡️ Vault: Fault-Tolerant Distributed Object Storage

**Vault** is an AI-first, fault-tolerant distributed object storage system built for high-availability demonstrations. It showcases how modern distributed storage engines (modeled after Ceph, Cassandra, and Google Cloud Storage) handle hardware failures, network partitions, and silent bit rot without downtime or data loss.

Regular users enjoy an effortless, consumer-grade file storage experience (upload, view, and share via Google accounts). A separate, unlinked internal/admin panel (`/admin`) gives hackathon judges direct visibility into the cluster internals, 3D replica state, consensus logs, and live fault injection tools.

---

## 🌟 Key Architecture & Distributed Systems Principles

1. **Dual-Surface Product Experience**:
   - **`/dashboard` (Consumer Experience)**: Clean, polished Dropbox/Linear-style interface with zero distributed-systems jargon. Users see only their files, a glowing drag-and-drop `UploadZone`, and a `ShareModal`.
   - **`/admin` (Internal Demo Panel)**: 3D interactive cluster topology with real-time health indicator lights, animated failover transfer beams, and terminal consensus event logs.
2. **Google OAuth & File Sharing**:
   - Users authenticate with their Google account via NextAuth.js.
   - Files are owned by the uploader's Google account.
   - Owners can grant access to any Google email (`authorizedAccounts`). Shared files appear in the recipient's dashboard labeled with `Shared by [Owner]`.
3. **Triple Replication ($N=3$)**: On upload, files are partitioned and written in parallel to 3 independent storage nodes (`nodeA`, `nodeB`, `nodeC`).
4. **Durability Write Quorum ($W=2$)**: Writes are acknowledged as successful as soon as **2 of 3** nodes confirm physical persistence. The 3rd write completes asynchronously in the background.
5. **Per-File Concurrency Locking**: Serializes concurrent modifications using `async-mutex` per file ID, preventing race conditions or split-brain versions.
6. **Partition Tolerance vs. Hard Failure Detection**:
   - Pings nodes every 10 seconds.
   - **1 missed ping** $\rightarrow$ Marked `SUSPECTED` (pulsing amber) to avoid premature failover during brief network partitions.
   - **3 consecutive missed pings** $\rightarrow$ Marked `CONFIRMED DOWN` (solid red) and triggers auto-recovery.
7. **Standby Failover & Auto-Healing**:
   - Standby Node (`nodeD`) remains idle (white/dim) during normal cluster operation.
   - When a node fails, Vault scans metadata, streams surviving replicas from healthy nodes to `nodeD`, and transitions `nodeD` to active green with an animated data transfer beam.
8. **Cryptographic Integrity & Bit-Rot Scrubbing**:
   - Computes master SHA-256 signatures on ingest.
   - Background scrub re-hashes physical disk blocks. If bytes are altered (simulated bit rot), Vault detects the mismatch and auto-heals the corrupted replica using a surviving healthy node.
9. **Read-Repair & Version Reconciliation**:
   - Each file tracks monotonically increasing versions (`v1`, `v2`, ...).
   - When a recovered node rejoins the cluster with outdated replicas, Vault upgrades it in place without allocating redundant storage.
10. **Zero-Cost 4-Node HTTP Microservice Cluster Architecture**:
    - Physical I/O is routed over **real HTTP REST network sockets** across 4 independent local micro-nodes:
      - **Node A**: `http://127.0.0.1:4001` (Primary Storage 1)
      - **Node B**: `http://127.0.0.1:4002` (Primary Storage 2)
      - **Node C**: `http://127.0.0.1:4003` (Primary Storage 3)
      - **Node D**: `http://127.0.0.1:4004` (Standby Failover Target)
    - **100% Free & Zero Cloud Setup**: Eliminates the need for paid cloud subscriptions, Firebase Blaze plans, or credit card linking.
    - **Authentic Distributed Networking**: Executes actual HTTP POST uploads, GET downloads, DELETE requests, and 10s TCP health pings with real timeout and partition simulation.
    - **Offline-Resilient**: Runs completely offline, immune to hackathon venue Wi-Fi drops.
    - Also includes Firebase multi-cluster configuration slots in `lib/firebase.js` if cloud deployment is ever desired.

---

## 🚀 Getting Started

### 1. Installation

```bash
cd /Users/deep/.gemini/antigravity/scratch/vault
npm install
```

### 2. Configure Environment (`.env`)

```env
PORT=3000
REPLICATION_FACTOR=3
WRITE_QUORUM=2
HEALTH_CHECK_INTERVAL_SECONDS=10
STANDBY_NODE=nodeD

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=vault_hackathon_demo_secret_2026_xyz

# Google OAuth (Optional for local testing; demo personas work out-of-the-box!)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

> **Hackathon Note:** If `GOOGLE_CLIENT_ID` is left empty, Vault automatically provides **Instant Demo Google Personas** (Alice, Bob, Judge) on the `/login` screen so you can demonstrate multi-account file sharing immediately without internet/OAuth setup!

### 3. 4-Node HTTP Storage Cluster (Zero Cost & Auto-Managed)

When you run `npm run dev`, all 4 storage microservices automatically boot in-process:
- **Node A**: `http://127.0.0.1:4001`
- **Node B**: `http://127.0.0.1:4002`
- **Node C**: `http://127.0.0.1:4003`
- **Node D**: `http://127.0.0.1:4004` (Standby Failover Target)

> **Judge Demo Pro-Tip:** You can also run the 4 storage nodes in a dedicated terminal window using `npm run nodes` to display live server traffic, HTTP status codes, and socket drops in real-time during your presentation!

*(Optional: Cloud Storage configurations remain available in `.env.local` and `lib/firebase.js` if you ever wish to connect external cloud buckets).*

### 4. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎬 5-Minute Hackathon Demo Script

### Part 1: Consumer Experience (`/dashboard`)
1. Open [http://localhost:3000/login](http://localhost:3000/login) and select **Alice** (`alice.hacks@gmail.com`).
2. Notice the clean, distraction-free consumer interface.
3. Drag and drop any file (PDF, image, code) into the **UploadZone**.
4. Watch the circular SVG progress ring fill and confirm persistence.
5. Click the **Share** icon on your file, enter `bob.dev@gmail.com`, and click **Add**.
6. Sign out, log in as **Bob** (`bob.dev@gmail.com`), and verify the file is instantly visible with the badge `Shared by Alice`!

### Part 2: Under-the-Hood Distributed Systems (`/admin`)
1. Navigate to [http://localhost:3000/admin](http://localhost:3000/admin).
2. **3D Topography**: Show the 4 server nodes (Node A, B, C active green; Node D idle white).
3. Click **"Simulate Failure"** on **Node B**:
   - Miss 1: Turns **pulsing AMBER** (`SUSPECTED`). The system absorbs network partitions without false alarm failover!
   - Miss 3: Turns **solid RED** (`CONFIRMED DOWN`).
4. **Auto-Recovery**:
   - Watch the **cyan data transfer beam** shoot from Node A to Standby Node D.
   - Node D illuminates **vibrant GREEN**.
5. **Failover Read**: Click **"Download"** on any file. The file serves instantaneously with SHA-256 validation from healthy nodes.
6. **Bit-Rot Self-Healing**:
   - Click **"Simulate Bit Rot on Node"** to flip raw disk bytes.
   - Click **"Check Integrity"**.
   - Vault logs `[CORRUPTION_DETECTED]` and repairs the damaged block automatically from a surviving replica!

---

## 📂 Project Structure

```
vault/
├── app/
│   ├── layout.jsx                      # Root layout with AuthProvider
│   ├── page.jsx                        # Clean session redirect (/dashboard vs /login)
│   ├── login/page.jsx                  # Google sign-in screen
│   ├── dashboard/page.jsx              # Consumer UI (UploadZone + FileGrid only)
│   ├── admin/page.jsx                  # Internal panel for judges (3D visualization)
│   └── api/
│       ├── auth/[...nextauth]/route.js # NextAuth with Google OAuth + Demo provider
│       ├── files/route.js              # User's accessible files (owned + shared)
│       ├── share/route.js              # Access grant/revoke endpoint
│       ├── upload/route.js             # Quorum upload handler (W=2 of 3)
│       ├── download/[fileId]/route.js  # Failover download & read-repair
│       ├── status/route.js             # Cluster topology telemetry
│       ├── simulate-failure/[nodeId]/route.js # Live demo failover trigger
│       ├── trigger-integrity-check/route.js   # Manual cryptographic scrub
│       ├── simulate-corruption/route.js       # Live bit-rot test endpoint
│       └── events/route.js             # Real-time SSE event stream
├── components/
│   ├── UploadZone.jsx                  # Drag-and-drop animated upload zone
│   ├── FileGrid.jsx                    # Animated cards with owner/share badges
│   ├── ShareModal.jsx                  # Google account sharing modal
│   ├── LoginForm.jsx                   # Google sign-in & persona selector
│   ├── NodeVisualization.jsx           # 3D Three.js / R3F Canvas + 2D Fallback
│   ├── NodeStatusGrid.jsx              # Telemetry cards & failure toggles
│   └── EventLog.jsx                    # Scrolling live terminal event log
├── services/
│   ├── nodeStorageService.js           # Abstracted physical/mock I/O layer
│   ├── metadataService.js              # Transaction-ready single source of truth
│   ├── shareService.js                 # Google account access control
│   ├── authService.js                  # Server session resolution
│   ├── uploadService.js                # Parallel replication & quorum coordination
│   ├── healthCheckService.js           # 10s ping & partition detection
│   ├── recoveryService.js              # Auto-recovery to standby Node D
│   ├── integrityService.js             # Cryptographic scrub & bit-rot repair
│   ├── lockService.js                  # async-mutex per-file write serialization
│   └── eventBus.js                     # In-memory pub/sub & ANSI terminal logs
├── lib/
│   ├── firebase.js                     # 4 isolated Firebase Storage config slots
│   └── hash.js                         # SHA-256 crypto helpers
└── data/
    ├── nodes/                          # Simulated storage node folders
    └── metadata.json                   # Cluster metadata database
```

---

## 🌐 Publishing & Deployment Guide

Because Hellock operates a true multi-node distributed cluster with background health checks (`node-cron`), per-file mutex locking (`async-mutex`), and 4 dedicated HTTP microservices on ports `4001–4004`, where you deploy determines how it functions:

### ✅ Recommended: Persistent Server or Container (100% Works)
Platforms that provide a persistent Node.js environment or Docker container support the 4 micro-nodes, persistent disk volumes, and continuous 10s health check cron jobs:
- **Render** (Free / Starter Web Service): Connect GitHub repo, set Build Command to `npm run build`, Start Command to `npm start`.
- **Railway**: 1-click deploy using the included [`Dockerfile`](file:///Users/deep/.gemini/antigravity/scratch/vault/Dockerfile).
- **Fly.io** or **DigitalOcean App Platform** or **VPS (EC2 / Linode / Hetzner)**.

### ⚠️ Note on Serverless Hosting (Vercel / Netlify)
On pure serverless hosts like Vercel:
- Serverless functions are stateless and ephemeral (they shut down between HTTP requests).
- Vercel blocks opening auxiliary TCP listener ports (`4001–4004`) and wipes the local filesystem on cold starts.
- For Vercel deployments, the cluster would require external cloud-hosted buckets (e.g. Supabase Storage / Cloudflare R2 / AWS S3).

