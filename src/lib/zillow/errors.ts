/**
 * Custom error classes for Zillow API
 * Based on Python api/zillow_fetcher.py
 */

export class ZillowAPIError extends Error {
  public readonly statusCode?: number
  public readonly response?: any

  constructor(message: string, statusCode?: number, response?: any) {
    super(message)
    this.name = 'ZillowAPIError'
    this.statusCode = statusCode
    this.response = response

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZillowAPIError)
    }
  }

  /**
   * Extract error message from API response
   * Handles multiple possible error formats
   */
  static extractErrorMessage(response: any): string {
    if (typeof response === 'string') {
      return response
    }

    if (response?.message) {
      return response.message
    }

    if (response?.error) {
      if (typeof response.error === 'string') {
        return response.error
      }
      if (response.error.message) {
        return response.error.message
      }
    }

    if (response?.errors) {
      if (Array.isArray(response.errors)) {
        return response.errors.map((e: any) => e.message || e).join('; ')
      }
      if (typeof response.errors === 'string') {
        return response.errors
      }
    }

    if (response?.detail) {
      return response.detail
    }

    return 'Unknown API error'
  }
}

export class RateLimitError extends ZillowAPIError {
  constructor(message: string = 'Rate limit exceeded', response?: any) {
    super(message, 429, response)
    this.name = 'RateLimitError'
  }
}

export class AuthenticationError extends ZillowAPIError {
  constructor(message: string = 'Authentication failed', response?: any) {
    super(message, 401, response)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends ZillowAPIError {
  constructor(message: string = 'Resource not found', response?: any) {
    super(message, 404, response)
    this.name = 'NotFoundError'
  }
}
