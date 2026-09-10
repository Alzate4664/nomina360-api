import { validateEnvironment } from './environment.config';

describe('validateEnvironment', () => {
  it('should reject configuration when JWT_SECRET is missing', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'JWT_SECRET is required. Configure it before starting the application.',
    );
  });

  it('should reject the insecure dev_secret value', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        JWT_SECRET: 'dev_secret',
      }),
    ).toThrow('JWT_SECRET cannot use the insecure default value "dev_secret".');
  });

  it('should reject a short JWT_SECRET in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short-secret',
      }),
    ).toThrow('JWT_SECRET must contain at least 32 characters in production.');
  });

  it('should accept and trim a valid JWT_SECRET', () => {
    const result = validateEnvironment({
      NODE_ENV: 'production',
      JWT_SECRET:
        '  this-is-a-valid-production-jwt-secret-with-more-than-32-chars  ',
    });

    expect(result.JWT_SECRET).toBe(
      'this-is-a-valid-production-jwt-secret-with-more-than-32-chars',
    );
  });
});
