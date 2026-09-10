export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const jwtSecret =
    typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';

  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET is required. Configure it before starting the application.',
    );
  }

  if (jwtSecret === 'dev_secret') {
    throw new Error(
      'JWT_SECRET cannot use the insecure default value "dev_secret".',
    );
  }

  if (config.NODE_ENV === 'production' && jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must contain at least 32 characters in production.',
    );
  }

  return {
    ...config,
    JWT_SECRET: jwtSecret,
  };
}
