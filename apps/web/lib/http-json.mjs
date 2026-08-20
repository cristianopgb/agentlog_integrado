/**
 * Reads a JSON HTTP response without confusing an absent body with an object.
 *
 * @param {Response} response
 * @returns {Promise<unknown | null>}
 */
export async function parseHttpJson(response) {
  const text = await response.text();
  if (text.trim() === '') return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Resposta HTTP contém JSON inválido.');
  }
}
