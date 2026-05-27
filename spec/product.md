# 1. Product Overview

A fully local-first personal finance Progressive Web App (PWA) designed to analyze bank transactions, infer shared group expenses, and compute interpersonal debt balances.

The system runs entirely on the user’s device with no backend or external services.

---

# 2. Technical Constraints

* Framework: Next.js
* Architecture: fully client-side
* Storage: IndexedDB only
* Deployment: installable PWA
* Currency: EUR only (fixed, cents precision)
* Offline-first: full functionality without internet after installation

---

# 3. Core Design Principles

1. **Local-only system**

   * no APIs
   * no server
   * no sync

2. **Deterministic logic where possible**

   * strict entity matching
   * explicit rules for debt

3. **Heuristic-first grouping**

   * system assumes inferred group expenses are correct by default

4. **User correction model (not approval model)**

   * user does NOT confirm inference
   * user can only correct or delete after inference

---

# 4. Data Model

## 4.1 Transaction (bank movement)

Represents a single row from the bank CSV.

Fields:

* id (UUID)
* date (Data mov.)
* valueDate (Data-valor)
* description (nullable)
* location (nullable)
* amount (signed decimal, EUR only, cents precision)
* entityId (FK → Entity)

Semantics:

* amount < 0 → money sent
* amount > 0 → money received

---

## 4.2 Entity (counterparty)

Represents a normalized person or merchant extracted from transactions.

Fields:

* id (UUID)
* bankName (raw extracted identifier)
* name (normalized display name)

Derived fields (computed via queries, NOT stored):

* totalSent = sum(amount < 0 for entity)
* totalReceived = sum(amount > 0 for entity)

---

# 5. Group Expense System (Core Feature)

## 5.1 Definition

A group expense is a **system-inferred shared expense event** consisting of:

* one anchor payment (negative transaction)
* multiple reimbursement transactions (incoming transfers)
* occurring within a maximum ±1 day window

---

## 5.2 Critical rule: participant count

> The user is ALWAYS included in group expenses.

Therefore:

* participantCount = friendCount + 1
* friendCount = number of other participants detected or inferred

---

## 5.3 System behavior (IMPORTANT)

### Automatic inference rule

When heuristic detects a group expense:

* it is immediately created
* it is immediately considered VALID
* no user confirmation is requested

### Default assumption:

> inferred group expenses are correct unless the user edits them

---

## 5.4 User correction model

User may:

* mark a group expense as NOT valid
* delete a group expense
* split a group expense
* merge group expenses
* adjust participants (friendCount only; system handles +1 user inclusion)

Once modified:

* system treats updated version as authoritative

---

## 5.5 GroupExpense entity

Fields:

* id
* anchorTransactionId
* participantTransactionIds
* dateWindow (±1 day)
* totalAmount (absolute value of anchor transaction)
* friendCount
* participantCount = friendCount + 1
* status:

  * inferred (default)
  * modified (after user edits)
  * deleted (if rejected)

---

# 6. Group Expense Detection Algorithm

## 6.1 Time constraint

Only transactions within:

* ±1 day window

---

## 6.2 Heuristic clustering logic

A group expense is created when:

* at least one significant negative transaction exists (anchor)
* followed or surrounded by multiple incoming transfers
* transfers plausibly match reimbursement pattern

OR

* sum of incoming transfers approximates anchor payment amount

---

## 6.3 No confirmation step

Unlike traditional workflows:

* no user approval before creation
* inference is immediately applied

---

## 6.4 Correction loop

After creation:

User may:

* reject incorrect groupings
* edit participant count
* reassign transactions
* merge/split groups

---

# 7. Debt Calculation System (STRICT RULE)

## 7.1 Core rule

Debt is ONLY computed from active group expenses.

Non-group transactions:

* have zero impact on debt

---

## 7.2 Per-group computation

For each group expense:

Let:

* total = anchor transaction absolute value
* participants = friendCount + 1

Then:

* expectedShare = total / participants

For each friend:

* friendBalance = paymentsMade - expectedShare

---

## 7.3 Entity-level aggregation

For each entity:

* netDebt = sum(friendBalance across all group expenses)

Interpretation:

* netDebt > 0 → they owe you
* netDebt < 0 → you owe them

---

## 7.4 Trust model

* inferred group expenses are treated as valid immediately
* user edits override inference
* deleted groups are excluded entirely

---

# 8. CSV Import System

## 8.1 Import behavior

* CSV is uploaded from Home page
* parsed fully on device
* all transactions inserted into IndexedDB
* transactions are always displayed as imported

---

## 8.2 Incremental re-import logic

On re-import:

For each transaction:

* match using strict key:

  * date + amount + description
* if not found → insert
* if exists → ignore

No overwriting.

---

## 8.3 No deduplication in UI layer

Duplicates are prevented only at insertion time (not filtered visually).

---

# 9. IndexedDB Schema (logical)

## transactions

* id (PK)

## entities

* id (PK)

## group_expenses

* id (PK)

## transaction_index (optional performance layer)

* date
* amount
* description

---

# 10. UI Specification

## 10.1 Layout

Mobile-first PWA with bottom navigation:

* Home
* Transactions
* Entities
* Group Expenses

### CSV import is NOT in navbar

---

## 10.2 Home Screen (central dashboard)

### Section A: CSV Import (embedded)

* Upload CSV button
* immediate processing
* automatic group inference
* no confirmation prompts

---

### Section B: Debt Overview

Two lists:

* People who owe you (netDebt > 0)
* People you owe (netDebt < 0)

Each entry shows:

* entity name
* net balance

---

### Section C: Group Expense Summary

* inferred group expenses
* modified group expenses
* deleted group expenses (optional visibility)

---

## 10.3 Transactions Screen

* chronological list
* filters:

  * entity
  * date
  * amount
* shows:

  * raw description
  * normalized name

---

## 10.4 Entities Screen

For each entity:

* name
* totalSent (computed)
* totalReceived (computed)
* linked group expenses

---

## 10.5 Group Expenses Screen

Central correction interface:

Actions:

* reject inferred group expense
* edit participants
* merge/split groups
* reassign transactions

States:

* inferred
* modified
* deleted

---

# 11. Entity Matching Rules (STRICT)

Entity resolution is deterministic:

* exact string match only after normalization:

  * trim whitespace
  * normalize casing

No:

* fuzzy matching
* semantic merging
* probabilistic identity resolution

---

# 12. Non-Goals

* no backend
* no cloud sync
* no multi-device support
* no fuzzy AI entity resolution
* no multi-currency
* no financial forecasting
* no automatic debt outside group expenses

---

# 13. Key System Properties

## Strengths

* fully offline
* deterministic debt model
* simple data flow
* fast local computation

## Weaknesses (explicit tradeoffs)

* heuristic grouping may produce false positives
* correctness depends on user corrections over time
* bank descriptions are not structured enough for perfect inference
