export default {
  '*': 'prettier --write --ignore-unknown',
  '*.{js,mjs}': 'eslint --max-warnings=0',
  '*.css': 'stylelint --max-warnings=0',
  '*.html': 'html-validate --max-warnings=0',
};
