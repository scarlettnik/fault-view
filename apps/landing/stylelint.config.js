export default {
  extends: ['stylelint-config-standard'],
  defaultSeverity: 'error',
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  reportDescriptionlessDisables: true,
  rules: {
    // Independent components share descendant tag names but do not override each other.
    'no-descending-specificity': null,
    'color-named': 'never',
    'declaration-block-no-duplicate-properties': true,
    'font-weight-notation': 'numeric',
    'max-nesting-depth': 2,
    'selector-max-combinators': 3,
    'selector-max-id': 1,
    'selector-max-universal': 1,
  },
};
