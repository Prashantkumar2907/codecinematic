# Animations Directory

This document consolidates all existing animation kinds supported by the Canvas-driven engine and introduces new animation ideas gathered from analyzing video titles across the `coding yt` and `loreharbour-yt` curricula.

## Existing Animations

The system currently supports over 70 distinct animation primitives, including foundational and newly planned structural kinds:

1. **Foundational & Data:** `diagram`, `chart` (lines/pies), `table`, `matrix`, `stat`, `bigtext`, `quote`, `bullets`, `steps`, `numberline`, `venn`, `pyramid`, `balance`, `waveform`.
2. **Code & Terminal:** `code`, `terminal`, `callstack`, `memgrid`, `trace`, `threads`, `bits`, `cipher`, `browserframe`.
3. **Geography & Science:** `geomap`, `globe`, `terrain`, `bodymap`, `molecule`, `orbit`, `layers`, `constellation`, `weather`.
4. **History & Period:** `document`, `newshead`, `timeline`, `annotate`.
5. **Logic & Flow:** `decision`, `statemachine`, `graphwalk`, `pipeline`, `queueflow`, `cycle`, `sankey`, `funnel`, `heatmap`, `mindmap`.
6. **Interactivity & UI:** `quiz`, `flashcard`, `fillblank`, `match`, `beforeafter`, `dialogue`, `storyboard`, `question`, `vocab`.
7. **Math & Physics:** `geometry`, `formula`, `curves`, `probability`, `radar`, `gauge`, `buckets`, `scale`, `tactics`.
8. **3D & Infrastructure:** `iso3d`, `schematic`, `circuit`.
9. **Sports & Competitions:** `race`, `bracket`, `showdown`, `basket`, `pictogram`.
10. **Others:** `tree`, `ledger`, `chain`, `dayclock`, `zoomladder`, `skyline`, `calendar`, `mythfact`.

---

## New Animation Ideas (Derived from Curriculum Titles)

After parsing and analyzing over 10,000 video titles (shorts and longs) covering subjects like CS, System Design, DevOps, Economy, Geography, and Indian History, the following generalized animation primitives have been identified as necessary to explain recurrent concepts effectively:

### 1. `globe3d` (or `planet`)
**Description:** A 3D rotatable globe visualization used to explain planetary-scale phenomena. While the existing `geomap` handles 2D/flat maps and `terrain` handles local topography, a 3D Earth is necessary for visualizing atmospheric winds, global ocean currents, climate zones, and continent-spanning phenomena.
**Justifying Titles:**
* *Subtropical and Polar Jet Streams: The Upper-Air Winds That Decide India's Seasons*
* *Global Pressure Belts Explained: Doldrums, Horse Latitudes and Polar Highs*
* *Why Greenland Is Called 'Green' Despite Being 80% Ice*

### 2. `slidingwindow`
**Description:** An animation showing a movable, resizable frame (a "window") sliding over a sequence of items (like an array, a timeline, or a stream of packets). This is a highly reusable visual primitive for explaining networking flow control, data chunking, and subarray/substring algorithms.
**Justifying Titles:**
* *TCP Flow Control Explained: How the Sliding Window Prevents Overload*
* *The Sliding Window That Controls Your Download Speed*
* *Jump Game II: minimum jumps with greedy window expansion*

### 3. `trendgraph` (or `plotchart`)
**Description:** A specialized macro-economic trend graph, enhancing the existing chart capabilities to visualize and compare diverging datasets over time, such as inflation rates, GDP growth, or index comparisons with multi-axis support and shaded divergence regions.
**Justifying Titles:**
* *Output Gap Explained: Actual GDP Minus Potential GDP*
* *Nominal GDP vs Real GDP: Why the GDP Deflator Changes India's Growth Number*
* *Why WPI and CPI Often Diverge in India*

### 4. `topology` (or `networkmesh`)
**Description:** A visualization tailored specifically to hardware/software network architecture (hubs, switches, nodes, routers) or P2P meshes. This would visually distinguish broadcast domains, packet broadcasting, and distributed cluster nodes (differentiating from abstract `graphwalk`).
**Justifying Titles:**
* *Hub vs Switch: Why One Broadcasts Your Secrets*
* *DaemonSet: the object that runs one Pod per node, always*
* *Chord flashcard: any key found in log(N) hops via finger tables*

### 5. `sysarch` (or `architecture`)
**Description:** A structural diagram animation containing stylized "tiers" to represent client apps, load balancers, application servers, and databases. Essential to illustrate cloud infrastructure concepts like horizontal scaling, fault tolerance, and replication flows in a distinct cloud-native aesthetic.
**Justifying Titles:**
* *Leader-Follower Replication: How Primary-Replica Databases Actually Sync*
* *Interview: Vertical vs Horizontal Scaling — When Each Wins*
* *Amazon's Order Processing and Inventory System: Consistency Under Massive Concurrency*

### 6. `scroll` (or `parchment`)
**Description:** A specialized, stylized document animation designed to present historical texts, constitutional articles, ancient edicts, and classical literature. It provides an immersive, era-appropriate aesthetic with animated unfurling or fading for history and civics.
**Justifying Titles:**
* *Naneghat Inscriptions and Queen Naganika's Record*
* *Article 81: Lok Sabha's Composition, Delimitation and the 84th & 87th Amendments*
* *Varahamihira's Panchasiddhantika and the Birth of Indian Astronomy*

### 7. `tactical_map`
**Description:** An animated strategic map displaying troop formations, flanking maneuvers, and the movement of historical figures or armies using stylized arrows, unit blocks, and terrain contours.
**Justifying Titles:** 
* *1761: The Third Battle of Panipat and the Maratha Catastrophe*
* *1663: The Night Raid That Cost Shaista Khan His Fingers*
* *Assyria's Iron Chariots: The First True Superpower Army*

### 8. `architecture_blueprint`
**Description:** A top-down floorplan or architectural elevation animation that dynamically draws out walls, domes, minarets, or grid city layouts to explain historical structures and building styles.
**Justifying Titles:** 
* *The Grid Roads of Kalibangan and Its Ploughed Fields*
* *Adina Mosque Bengal: Why Brick Replaced Stone in Sultanate Architecture*
* *Akbar's Tomb Sikandra and the Baby Taj*

### 9. `packet_delivery`
**Description:** Visualizes network data packets as literal envelopes or cargo boxes traveling across hops, dropping, retransmitting, or being inspected/modified by proxies and firewalls.
**Justifying Titles:** 
* *How TCP Knows a Packet Got Lost*
* *ARP Has No Authentication — That's How Spoofing Works*
* *The `Upgrade` Header: How HTTP Becomes a WebSocket*

### 10. `server_rack`
**Description:** A physical, hardware-level representation of data center racks with blinking indicator lights, where individual blades can catch fire (crash), scale up, or failover to illustrate infrastructure events.
**Justifying Titles:** 
* *Failure Detectors: The Phi Accrual Algorithm for Probabilistic Failure Detection*
* *The docker network create command that fixes container isolation*
* *How Google runs one globally consistent database across continents*

### 11. `codediff`
**Description:** A specialized, split-screen or inline code view that explicitly animates line additions (green) and deletions (red) between two states of a file. Perfect for explaining refactoring, version control, or bug fixes.
**Justifying Titles:** 
* *Why `git revert` is safer than `git reset` on shared branches*
* *One keyword fixes the `3,3,3` loop bug — `let` vs `var` explained*
* *Rate limiting with `limit_req` in 5 lines*

### 12. `parliament_arc`
**Description:** A semi-circle legislative seating chart that dynamically fills with dots or colors to represent voting majorities, political factions, constitutional amendments, and bills passing.
**Justifying Titles:** 
* *Article 368 Explained: The Three Routes to Amending the Indian Constitution*
* *44th Amendment 1978: Why 'Internal Disturbance' Became 'Armed Rebellion'*
* *Article 124: How Many Judges Can the Supreme Court Have?*

### 13. `domino_cascade`
**Description:** Visualizes cascading failures or compounding cause-and-effect chains using falling dominos, emphasizing how one small event triggers a massive system or economic reaction.
**Justifying Titles:** 
* *Wage-Price Spiral Explained in Under a Minute*
* *Netflix's Chaos Monkey: Engineering Resilience by Deliberately Causing Failure*
* *Why Thrashing Happens and How the OS Recovers From It*

### 14. `jigsaw_puzzle`
**Description:** Animates abstract concepts as interlocking puzzle pieces coming together (or failing to fit), ideal for comparing complementary protocols, architectures, or macroeconomic policies.
**Justifying Titles:** 
* *OIDC vs OAuth: authentication vs authorization*
* *Static vs Dynamic Linking: Why Your Binary Is 20KB or 20MB*
* *Capital Expenditure Multiplier Is Higher Than Revenue Expenditure Multiplier*

### 15. `sheet_music`
**Description:** Animates musical notation, ragas, or rhythmic beats on a musical staff to explain cultural music theory, traditional instruments, and classical dance timings.
**Justifying Titles:** 
* *Sitar vs Sarod: How to Tell Them Apart by Sound and Sight*
* *Mirza Ghalib's Ghazals: Why Urdu's Greatest Poet Still Defines the Form*
* *Why Thumri Is Called the 'Dancing Damsel' of Hindustani Music*

### 16. `canvas_reveal`
**Description:** An art-focused animation that zooms into a canvas, peeling back layers of paint or highlighting specific motifs, color palettes, and brush strokes to decode a painting's history.
**Justifying Titles:** 
* *Why Warli Art Is Always White on Red: The Story Behind the Palette*
* *Thangka Painting Explained: The Buddhist Scroll Art of Ladakh and Sikkim*
* *The Mother Goddess Figurines of Harappa*

### 17. `scalecompare`
**Description:** Overlaps silhouettes of geographical features, empires, or time scales to dramatically contrast their massive differences in magnitude.
**Justifying Titles:** 
* *Victoria Falls vs Niagara Falls: Which Is Actually Bigger?*
* *The Mongol Empire's 4,000 Km of Guarded Trade Roads*
* *If a CPU Cycle Were 1 Second, a Disk Read Would Take Months*

### 18. `fluidflow`
**Description:** Uses animated particle systems to represent the continuous flow of ocean currents, weather fronts, atmospheric winds, or interconnected river basins.
**Justifying Titles:** 
* *Godavari River System: Why It's Called the Dakshin Ganga*
* *Why London's Weather Is Mild Even in Winter (Thank the Gulf Stream)*
* *Radial Drainage Explained: Why Amarkantak Sends Rivers in All Directions*

### 19. `ecosystem_web`
**Description:** An organic, interconnected web animation linking animals, plants, and environmental factors to illustrate food chains, biodiversity, and ecological interdependencies.
**Justifying Titles:** 
* *Plastic Pollution and Microplastics: From Your Kitchen to the Ocean Food Chain*
* *Why Deforestation Disrupts the Local Water Cycle*
* *Dugongs in the Gulf of Mannar: The Sea Cow Under Threat*

### 20. `coin_stack`
**Description:** A physical, tangible metaphor for finance and macroeconomics, showing stacks of coins or bullion being added, taxed, depleted, redistributed, or inflated.
**Justifying Titles:** 
* *Zero-Based Budgeting Requires Justifying Every Expense From Scratch*
* *M3 'Broad Money' Is India's Most-Watched Money Supply Number*
* *The Drain of Wealth: How British Economic Policy Reshaped India*

### 21. `turing_tape`
**Description:** An animation of an infinite tape with a read/write head moving back and forth, perfect for visualizing low-level memory, bit manipulation, state changes, and CPU instructions.
**Justifying Titles:** 
* *How a Single Bit of Memory Is Stored (SR Latch)*
* *Two's Complement Explained: How Computers Represent Negative Numbers*
* *Why `x = x + 1` Is Three CPU Instructions, Not One*

### 22. `dp_table_fill`
**Description:** A 2D matrix specifically designed for Dynamic Programming. It highlights the current cell being computed and draws active dependency arrows from previous cells (e.g., from top and left for LCS, or diagonal for Edit Distance) to visually explain the state transition equation.
**Justifying Titles:** 
* *Longest Common Subsequence: the DP table every diff tool uses*
* *Edit Distance: insert, delete, replace operations in a 2D DP table*
* *0/1 Knapsack Problem: building the classic 2D DP table from scratch*

### 23. `grid_flood`
**Description:** A specialized grid animation for graph traversals on 2D matrices. It highlights cells with expanding color ripples or searching wavefronts (BFS) and snake-like deep dives (DFS), explicitly showing the "visited" state.
**Justifying Titles:** 
* *Number of Islands: turning a grid into a graph problem*
* *Flood Fill: the algorithm behind your paint bucket tool*
* *Pacific Atlantic: DFS from the oceans, not from every cell*

### 24. `recursion_tree`
**Description:** An actively growing and shrinking tree visualization specifically for backtracking and DP. It highlights the current branch being explored, shows "pruned" branches with a distinct visual (like a red cross or fading out), and demonstrates the call stack unwinding as it moves back up to the parent node.
**Justifying Titles:** 
* *N-Queens: the backtracking template for constraint placement problems*
* *Palindrome Partitioning: backtracking over cut positions with palindrome checks*
* *Word Break II: reconstructing every valid segmentation*

### 25. `object_heap` (or `ref_graph`)
**Description:** Visualizes variables as name tags pointing with arrows to distinct memory blocks (objects) on a heap. Crucial for explaining reference counting, mutability, shallow vs. deep copy, garbage collection, and variable aliases.
**Justifying Titles:**
* *Python's Object Model: Names, References, and the PyObject Struct*
* *Shallow vs Deep Copy: Aliasing Bugs and the copy Module*
* *The Reference Cycle That Keeps Objects Alive Forever*

### 26. `event_loop`
**Description:** A carousel or merry-go-round representation of a single thread managing multiple paused coroutines. It explicitly visualizes tasks suspending execution (awaiting I/O) and yielding control back to the central loop to maintain concurrency without multi-threading.
**Justifying Titles:**
* *The asyncio Event Loop: How Single-Threaded Concurrency Works*
* *What `await` Actually Suspends*
* *One `time.sleep(1)` Freezes Your Whole Async Server*

### 27. `token_exchange`
**Description:** An animated sequence visualizing the cryptographic exchange between a client, an API gateway, and an authorization server. It illustrates tokens being signed, passed, verified, decoded, and expired using lock-and-key or passport metaphors.
**Justifying Titles:**
* *A JWT Is Just Three Base64 Blobs and a Signature*
* *OAuth2 Is Authorization — OIDC Makes It Authentication*
* *Refresh Token Rotation: Catch Stolen Tokens in the Act*

### 28. `hash_ring` (or `consistent_hash`)
**Description:** A circular distribution ring animation used to explain consistent hashing, distributed sharding, and clustering. It shows how keys map to a 360-degree space and dynamically re-routes data when cluster nodes are added, fail, or are removed.
**Justifying Titles:**
* *Consistent Hashing Algorithm Explained Step by Step With a Hash Ring*
* *Consistent Hashing: Adding One Server Without Reshuffling Everything*
* *Virtual Nodes: Why Cassandra Splits One Node Into 256 Token Ranges*

### 29. `btree_index`
**Description:** A specialized tree visualization tailored for B-Trees and B+Trees, distinct from a generic binary `tree`. It natively handles multi-key nodes, visualizes block fanout, and explicitly connects leaf nodes with horizontal linked-list arrows to animate index-only range scans riding the leaf chain.
**Justifying Titles:**
* *B-Tree vs Binary Tree: The Interview Mix-Up That Costs Offers*
* *Tracing a B-Tree Lookup From Root to Leaf, Step by Step*
* *Range Queries Ride the Leaf Chain: Why BETWEEN Loves B-Trees*

### 30. `lsm_compaction`
**Description:** An animated data-flow structure representing the LSM-tree (Log-Structured Merge) storage engine. It visually separates an active, in-memory tier (Memtable) and multiple on-disk immutable files (SSTables), explicitly animating the flush process and the background compaction that merges overlapping files to remove tombstones.
**Justifying Titles:**
* *The Cassandra Write Path: Commit Log and Memtable Explained*
* *SSTables Explained: How Cassandra Flushes Memtables to Disk*
* *Compaction Strategies in Cassandra: Size-Tiered vs Leveled*

### 31. `vdom_diff` (or `component_tree`)
**Description:** A specialized tree visualization designed to represent the Virtual DOM and component hierarchy. It highlights nodes during render phases, illustrates diffing by showing added (green), removed (red), or updated (yellow) components, and traces state or prop drilling through the hierarchy.
**Justifying Titles:**
* *The Virtual DOM Explained: Why React Diffs Objects Instead of the Real DOM*
* *React Fiber Architecture: The Linked-List Tree Behind Every Render*
* *Lifting State Up and Prop Drilling: The Problem That Led to Context*

### 32. `flamegraph` (or `network_waterfall`)
**Description:** A performance profiling visualization that displays cascading network requests or function execution times as stacked horizontal bars. Crucial for demonstrating request waterfalls, bundle chunk loading, and diagnosing long tasks on the main thread.
**Justifying Titles:**
* *Avoiding Request Waterfalls: Parallel Data Fetching in Server Components*
* *Improving INP: Long Tasks, Input Delay, and Breaking Up Main-Thread Work*
* *Profiling React Performance: Using the DevTools Profiler to Find Wasted Renders*

### 33. `dom_event_flow`
**Description:** Visualizes the browser's Document Object Model (DOM) as nested structural boxes or a hierarchy, explicitly demonstrating how user interactions trigger events that capture down and bubble back up through the elements.
**Justifying Titles:**
* *Event Delegation in React: Why Every Handler Is Attached at the Root*
* *React Portals Explained: Rendering Outside the Parent DOM Hierarchy*
* *Synthetic Events Explained: How React's Event System Wraps the Native DOM*

### 34. `commit_dag`
**Description:** A specialized directed acyclic graph visualization designed for version control histories like Git. It visually differentiates commit objects (nodes), branch pointers (labels), and the HEAD reference, animating operations like merging, rebasing (rewriting history), and detaching HEAD.
**Justifying Titles:**
* *Rebase rewrites history — here's what that means*
* *Fast-forward merge vs 3-way merge — what's the difference?*
* *Branching internals — refs, HEAD, and how `git branch` really works*

### 35. `partitioned_log`
**Description:** An animation of multiple append-only message logs (partitions) operating in parallel. It shows producer messages appending to the tails of specific lanes while multiple consumer read-heads (offsets) independently advance along the records, perfect for illustrating Kafka and event streaming concepts.
**Justifying Titles:**
* *Topics and partitions: how Kafka parallelizes a stream*
* *Offsets: Kafka's bookmark for "what have I read"*
* *Consumer rebalancing: the pause that breaks your SLA*

### 36. `container_sandbox` (or `namespace_isolation`)
**Description:** Visualizes Linux namespaces and cgroups by showing a process originally in the main host environment being placed into a restricted "box". It dynamically restricts what the process can see and limits its footprint, illustrating container isolation.
**Justifying Titles:**
* *Namespaces: the boundary that isn't a security boundary*
* *Why containers in a Pod share localhost but Pods don't*

### 37. `control_loop` (or `reconciliation_loop`)
**Description:** A specialized animation depicting the declarative reconciliation pattern used by Kubernetes and Terraform. It continuously compares a "Desired State" document against a real-time "Actual State" infrastructure map.
**Justifying Titles:**
* *Delete a pod, watch it resurrect: reconciliation in action*
* *CloudFormation drift: when your infra doesn't match your template*

### 38. `telemetry_trace` (or `span_waterfall`)
**Description:** Visualizes a distributed trace as an expanding waterfall graph of spans. It tracks a single user request as it enters an API gateway and branches into parallel and sequential downstream microservice calls and database queries.
**Justifying Titles:**
* *One request, 14 services: how a trace stitches the story*
* *Head vs tail sampling: which traces are worth keeping?*

### 39. `consensus_quorum`
**Description:** A distinct network cluster animation tailored for distributed consensus. It visualizes a node acting as a leader/coordinator broadcasting proposals, waits for follower acknowledgments, and explicitly shows the system reaching a quorum threshold.
**Justifying Titles:**
* *Raft Leader Election: Terms, Votes, and Split-Vote Resolution*
* *Two-Phase Commit Protocol: Prepare, Commit, and Its Blocking Problem*

### 40. `spatial_index` (or `quadtree_map`)
**Description:** A 2D geographical or grid view that dynamically and recursively subdivides into smaller quadrants as data points are added to a specific region. Essential for visualizing how spatial indexes bucket nearby locations.
**Justifying Titles:**
* *Designing a Proximity Service: Geohash, Quadtrees, and Nearby Search Like Yelp*
* *Uber's H3 Geospatial Indexing: Hexagons, Not Squares, for Location Data*

### 41. `vector_space` (or `embedding_space`)
**Description:** A 2D or 3D coordinate system designed specifically to animate data points as vectors. It can draw decision boundaries, group clusters by color, calculate geometric distances, and visualize projections.
**Justifying Titles:**
* *Words as vectors: the idea that built modern NLP*
* *Support Vector Machines and the kernel trick, visualized*

### 42. `neural_network`
**Description:** A specialized graph animation optimized for layered neural networks. It automatically arranges nodes into layers, animates forward passes (activations lighting up), and backward passes (edges changing color for gradients).
**Justifying Titles:**
* *Backpropagation step by step: computing gradients through a network*
* *The transformer block, piece by piece*

### 43. `matrix_convolution` (or `sliding_kernel`)
**Description:** An animation featuring multiple grids where a smaller "kernel" grid slides over a larger "input" grid. It visually highlights the element-wise multiplication and summation process.
**Justifying Titles:**
* *Convolutions are just sliding dot products*
* *Convolutional layers explained: filters, feature maps, and receptive fields*
