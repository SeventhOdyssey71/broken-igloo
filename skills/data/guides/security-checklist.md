# Sui Move Security Checklist

## Object Ownership & Access Control

- [ ] **Capability objects used for access control**: Admin operations require holding an `AdminCap` or similar capability object — never rely on address checks alone
- [ ] **`public` vs `public(package)` visibility correct**: Functions that should only be called internally use `public(package)`, not `public`
- [ ] **Shared object contention considered**: Shared objects accessed by many users create ordering bottlenecks. Use owned objects where possible.
- [ ] **Object ownership verified before modification**: Ensure only the rightful owner can modify or consume owned objects
- [ ] **No unauthorized `transfer::public_transfer`**: Objects without `store` ability use `transfer::transfer` (module-controlled transfers only)

## Coin & Balance Safety

- [ ] **TreasuryCap secured**: TreasuryCap is the minting authority — must be held by a trusted address or multisig, or destroyed if fixed supply
- [ ] **No coin duplication**: Coins should never be copied. The Move type system prevents this, but verify no logic creates coins outside of `coin::mint`
- [ ] **Balance arithmetic checked**: Subtraction underflows are prevented by Move, but verify economic logic (fees, rewards, liquidations) doesn't create imbalances
- [ ] **Coin splitting/merging handled correctly**: When splitting coins, ensure the remainder is returned or stored, not lost

## Move-Specific Patterns

- [ ] **Witness pattern used for one-time initialization**: `init` functions use a witness type to ensure they run exactly once at publish time
- [ ] **Hot potato pattern for flash loans**: Receipt structs with no abilities force same-transaction repayment
- [ ] **No dangling objects**: Every created object is transferred, shared, frozen, or wrapped — never left in limbo
- [ ] **Dynamic fields cleaned up**: Objects with dynamic fields should remove them before deletion (orphaned dynamic fields waste storage)
- [ ] **Events emitted for all state changes**: Off-chain indexers rely on events — missing events create invisible state changes

## Shared Object Safety

- [ ] **Shared object creation is intentional**: Once shared, an object cannot be made owned again. Verify `transfer::share_object` calls are deliberate.
- [ ] **No shared object in hot loops**: Shared objects require consensus ordering. Multiple transactions touching the same shared object serialize, creating bottlenecks.
- [ ] **Shared object access is minimal**: Borrow shared objects for the shortest possible scope. Prefer reading over writing.
- [ ] **Clock usage is correct**: `sui::clock::Clock` is a shared object. Access it via `&Clock` (immutable reference) to avoid contention.

## Input Validation

- [ ] **Gas budget estimated correctly**: Under-budgeted transactions fail and still consume gas. Over-budget is refunded.
- [ ] **Vector/collection bounds checked**: Unbounded loops or vectors can exceed gas limits. Enforce maximum sizes.
- [ ] **String/byte inputs validated**: UTF-8 strings from user input should be validated if used in display or comparison
- [ ] **Object type assertions**: When accepting generic objects, verify they are the expected type using `type_name` if needed

## Upgrade Safety

- [ ] **UpgradeCap custody planned**: Who holds the UpgradeCap? Multisig for production, destroy for immutable protocols.
- [ ] **Struct layout compatibility**: Upgrades cannot change existing struct field types or order. Plan storage layout carefully.
- [ ] **No breaking changes to public functions**: Existing function signatures cannot be changed in compatible upgrades.
- [ ] **New modules can be added**: But existing module names cannot be changed or removed.

## Infrastructure Security

- [ ] **Private keys not in code or environment files committed to git**: Use `.env` (gitignored) or secret management services
- [ ] **RPC endpoint is production-grade**: Don't use public endpoints (`fullnode.mainnet.sui.io`) in production — use Shinami or similar
- [ ] **Transaction signing is server-side for backend ops**: Never expose private keys to the client
- [ ] **Rate limiting on user-facing endpoints**: Prevent abuse of gas-sponsored transactions

## Testing

- [ ] **Unit tests for all Move functions**: `sui move test` passes
- [ ] **Edge cases tested**: Zero amounts, maximum values, empty collections, unauthorized callers
- [ ] **Integration tests on devnet/testnet**: Full transaction flows tested with real on-chain state
- [ ] **Fuzzing considered for complex logic**: Use `sui-fuzzer` for state-machine testing

## Common Vulnerabilities to Check

| Vulnerability | How It Manifests on Sui |
|--------------|------------------------|
| Reentrancy | Not possible in Move (no dynamic dispatch), but check PTB composition for unintended ordering |
| Integer overflow | Move aborts on overflow by default — safe, but verify economic logic |
| Access control bypass | Missing capability checks, `public` instead of `public(package)` |
| Flash loan attacks | Ensure price oracles are manipulation-resistant, use TWAP |
| Front-running | Shared objects are ordered by validators — use commit-reveal for sensitive operations |
| Denial of service | Unbounded loops, excessive dynamic field creation, shared object contention |
