/** @param {string} prefix @returns {string} */
export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

