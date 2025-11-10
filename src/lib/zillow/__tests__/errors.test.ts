import { describe, it, expect } from 'vitest'
import {
  ZillowAPIError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
} from '../errors'

describe('ZillowAPIError', () => {
  describe('constructor', () => {
    it('should create error with message', () => {
      const error = new ZillowAPIError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('ZillowAPIError')
      expect(error).toBeInstanceOf(Error)
    })

    it('should store status code and response', () => {
      const response = { detail: 'Error details' }
      const error = new ZillowAPIError('Test error', 500, response)

      expect(error.statusCode).toBe(500)
      expect(error.response).toEqual(response)
    })

    it('should have proper stack trace', () => {
      const error = new ZillowAPIError('Test error')
      expect(error.stack).toBeDefined()
    })
  })

  describe('extractErrorMessage', () => {
    it('should extract from string response', () => {
      const message = ZillowAPIError.extractErrorMessage('Simple error message')
      expect(message).toBe('Simple error message')
    })

    it('should extract from message field', () => {
      const response = { message: 'Error message from field' }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Error message from field')
    })

    it('should extract from error.message field', () => {
      const response = { error: { message: 'Nested error message' } }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Nested error message')
    })

    it('should extract from error string', () => {
      const response = { error: 'Error as string' }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Error as string')
    })

    it('should extract from errors array', () => {
      const response = {
        errors: [{ message: 'Error 1' }, { message: 'Error 2' }],
      }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Error 1; Error 2')
    })

    it('should extract from errors array (objects without message)', () => {
      const response = {
        errors: ['Error 1', 'Error 2'],
      }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Error 1; Error 2')
    })

    it('should extract from errors string', () => {
      const response = { errors: 'Multiple errors occurred' }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Multiple errors occurred')
    })

    it('should extract from detail field', () => {
      const response = { detail: 'Detailed error information' }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Detailed error information')
    })

    it('should return default message for unknown format', () => {
      const response = { unknown: 'field' }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Unknown API error')
    })

    it('should return default message for null/undefined', () => {
      expect(ZillowAPIError.extractErrorMessage(null)).toBe('Unknown API error')
      expect(ZillowAPIError.extractErrorMessage(undefined)).toBe(
        'Unknown API error'
      )
    })

    it('should prioritize message over error', () => {
      const response = {
        message: 'Primary message',
        error: 'Secondary error',
      }
      const message = ZillowAPIError.extractErrorMessage(response)
      expect(message).toBe('Primary message')
    })
  })
})

describe('RateLimitError', () => {
  it('should create rate limit error', () => {
    const error = new RateLimitError()

    expect(error.message).toBe('Rate limit exceeded')
    expect(error.name).toBe('RateLimitError')
    expect(error.statusCode).toBe(429)
    expect(error).toBeInstanceOf(ZillowAPIError)
  })

  it('should accept custom message', () => {
    const error = new RateLimitError('Custom rate limit message')
    expect(error.message).toBe('Custom rate limit message')
  })

  it('should store response data', () => {
    const response = { retryAfter: 60 }
    const error = new RateLimitError('Rate limited', response)
    expect(error.response).toEqual(response)
  })
})

describe('AuthenticationError', () => {
  it('should create authentication error', () => {
    const error = new AuthenticationError()

    expect(error.message).toBe('Authentication failed')
    expect(error.name).toBe('AuthenticationError')
    expect(error.statusCode).toBe(401)
    expect(error).toBeInstanceOf(ZillowAPIError)
  })

  it('should accept custom message', () => {
    const error = new AuthenticationError('Invalid API key')
    expect(error.message).toBe('Invalid API key')
  })
})

describe('NotFoundError', () => {
  it('should create not found error', () => {
    const error = new NotFoundError()

    expect(error.message).toBe('Resource not found')
    expect(error.name).toBe('NotFoundError')
    expect(error.statusCode).toBe(404)
    expect(error).toBeInstanceOf(ZillowAPIError)
  })

  it('should accept custom message', () => {
    const error = new NotFoundError('Property not found')
    expect(error.message).toBe('Property not found')
  })
})
