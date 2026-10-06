import { describe, expect, it } from 'bun:test'
import { parseJsonSchema } from '../frontend/src/api.js'

describe('parseJsonSchema', () => {
  it('accepts object and boolean JSON Schemas', () => {
    expect(parseJsonSchema('{"type":"string"}')).toEqual({ type: 'string' })
    expect(parseJsonSchema('true')).toBe(true)
  })

  it('rejects malformed JSON and non-schema root values', () => {
    expect(() => parseJsonSchema('{')).toThrow('no contiene JSON válido')
    expect(() => parseJsonSchema('"text"')).toThrow('debe ser un objeto o booleano')
  })
})
