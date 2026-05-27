# Group Expenses Matching Algorithm

## Objective

Design an algorithm that parses a ledger of bank transactions to automatically group incoming peer-to-peer split payments (the "Inflow Cluster") and tie them back to the original large bill paid by the user (the "Anchor Spending").

All monetary calculations must be executed using safe integer cent math to prevent floating-point precision bugs.

---

## 1. Input Data Models

The algorithm processes an array of `Transaction` objects containing:

* `id` (String)
* `amount` (Number: negative for spendings, positive for incoming transfers)
* `valueDate` (String format, parseable to timestamps)
* `description` (String)

---

## 2. Core Execution Phases

### Phase 1: Filtering & Isolation

* **Exclusion Mapping:** Transactions already associated with an existing active group expense must be filtered out immediately and cannot be reused.
* **Anchor Pool:** Isolate unconsumed spendings where `amount < 0`.
* **Inflow Pool:** Isolate unconsumed incoming transfers where `amount > 0` AND the description string starts with either `"Trf Mbway"` or `"TFI"` (case-insensitive, ignoring leading/trailing whitespaces).

### Phase 2: Chronological Sliding-Window Clustering

Sort the available Inflow Pool chronologically by date. Group items into clusters using a sliding window that strictly enforces three rules:

1. **Value Tolerance:** The values of candidate items in a cluster can differ by at most €0.05 from each other (to handle minor decimal rounding or manual entry variations).
2. **Time Window:** The maximum time span between the absolute earliest and absolute latest payment within a single finalized cluster cannot exceed 7 days (168 hours).
3. **Size Constraint:** A valid cluster must contain $\ge 2$ incoming payments (implying a total group size of 3 or more people splitting the bill, including the user).

*Greedy Selection Rule:* Sort all globally generated valid clusters descending by length (size). Process larger clusters first to maximize group detection efficiency. Once an inbound transaction is assigned to a cluster that matches an anchor, it is locked down and cannot be considered for any subsequent clusters.

### Phase 3: Outflow Anchor Matching

For each finalized cluster, calculate its characteristics:

* `Cluster Total`: Sum of all inbound transactions in the cluster.
* `Parcel`: The average individual transaction amount within the cluster (`Cluster Total / cluster.length`).

Search the Anchor Pool for eligible spending entries that meet both constraints:

1. **Time Proximity:** The spending must have occurred within 7 days of at least one payment in the cluster.
2. **Mathematical Boundary Condition:** Instead of using a simple floor threshold, the absolute anchor spending amount ($A$) must fit precisely within a window that accounts for your missing share plus a tolerance buffer:

$$\text{Cluster Total} + \text{Parcel} < A + 0.05$$



*(In integer cents: `anchorCents > clusterTotalCents + averageParcelCents - 5`)*

#### Tie-Breaking (The Lowest Match Rule)

If multiple spending transactions qualify for the same cluster, the algorithm must choose the **lowest absolute value anchor** that fits the boundary condition. This prevents larger, unrelated bills (e.g., rent, utility bills) from accidentally absorbing smaller group splits.

---

## 3. Custom Forced Overrides (`inferCustomGroup`)

Provide a secondary execution path allowing an interface to force a group inference on a specific `anchorId` with an optional `extraCents` adjustment factor:

* Calculate the adjusted target anchor spending as $A = \text{Anchor Value} + \text{extraCents}$.
* Gather candidate inflows within a 7-day radius of the anchor matching the keyword filters.
* Re-evaluate those candidates using the same sliding-window rules (Size $\ge 2$, Delta $\le €0.05$, Max span $\le 7$ days).
* Map the group *only* if the calculated cluster satisfies the boundary constraint relative to $A$.
* If no clusters qualify, fall back cleanly by creating an empty group expense tracking just the anchor transaction with 0 friends.