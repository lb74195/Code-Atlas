## Summary

- what changed
- why it matters

## Agent OODA

- Observe: what evidence or failing signal triggered this work?
- Orient: what repository rules, module docs, or dependency advisories mattered?
- Decide: what tradeoff did this PR choose?
- Act: what concrete behavior changed?

## Verification

- [ ] `npm test`
- [ ] `node ./src/cli.js analyze ./test/fixtures/sample-app --output ai-output`
- [ ] regenerated docs or graph artifacts if behavior changed

## Reflection

- what was brittle?
- what should become a rule, fixture, or automation next?
