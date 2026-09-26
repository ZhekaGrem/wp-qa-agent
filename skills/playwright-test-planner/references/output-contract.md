# Output contract

## test-plan.md

Markdown document per run. Each test case:

```markdown
### [testId] Test title

- **TestId**: WOO-CHECKOUT-001
- **Area**: public | auth | admin | woocommerce | forms | api
- **Priority**: critical | high | medium | low
- **Preconditions**: logged in as admin / guest / customer; fixtures required
- **Steps**:
  1. Navigate to ...
  2. Click ...
  3. Fill ...
  4. Submit ...
- **Expected**: ...
```

## spec-mapping.json

```json
{
  "runId": "string",
  "timestamp": "ISO-8601",
  "mappings": [
    {
      "testId": "WOO-CHECKOUT-001",
      "specFile": "tests/woocommerce/checkout.spec.ts",
      "testName": "guest completes checkout",
      "priority": "critical",
      "generated": true
    }
  ]
}
```

## Generated .spec.ts

Every test must include testId annotation:

```ts
test(
  'guest completes checkout',
  {
    tag: ['@critical', '@woocommerce'],
    annotation: [
      { type: 'testId', description: 'WOO-CHECKOUT-001' },
    ],
  },
  async ({ page }) => {
    // ...
  }
);
```
