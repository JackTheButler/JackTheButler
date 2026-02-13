/**
 * Base Styles — Shadow DOM Reset
 */

export const baseStyles = `
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

a, button, input, select, textarea {
  font-family: inherit;
  font-size: inherit;
}

button {
  cursor: pointer;
  border: none;
  background: none;
}

input, select, textarea {
  outline: none;
}
`;
